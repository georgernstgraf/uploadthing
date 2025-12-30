import cf from "../lib/config.ts";
import { localTimeString, sleep } from "../lib/timefunc.ts";
import { LdapUserType } from "../lib/types.ts";
import ldap from "ldapjs";

class ServiceClientFactory {
    private lasttry = new Date(0);
    private isConnecting = false;
    private client: ldap.Client | null;
    constructor() {
        this.client = null;
    }
    getClient(): ldap.Client {
        if (!this.client) {
            throw new Error("ServiceClientFactory: client not available");
        }
        return this.client;
    }
    close() {
        if (this.client) {
            try {
                this.client.unbind();
            } catch { // just try
            }
            try {
                this.client.destroy();
            } catch { // just try
            }
            try {
                this.client.removeAllListeners(); // Wichtig: Zombie-Listener entfernen
            } catch { // just try
            }
            this.client = null;
        }
    }
    async makeClient() { // can take very long
        console.log(
            "ServiceClientFactory.makeClient: called ...",
        );
        if (this.isConnecting) {
            console.log(
                "ServiceClientFactory.makeClient: already connecting, simply return",
            );
            return;
        }
        this.isConnecting = true;
        const oldclient = this.client;
        this.client = null; // prevent usage of old client
        while (true) {
            console.log(
                "ServiceClientFactory.makeClient: trying to get new client, entering loop ...",
            );
            const now = new Date();
            const diff = (now.getTime() - this.lasttry.getTime()) /
                1000;
            if (diff < cf.ldap_retry_wait_seconds) {
                console.log(
                    `ServiceClientFactory.makeClient: waiting ${
                        cf.ldap_retry_wait_seconds - diff
                    }s ...`,
                );
                await sleep(cf.ldap_retry_wait_seconds - diff);
            }
            this.lasttry = new Date();
            try {
                if (oldclient) {
                    try {
                        oldclient.unbind();
                    } catch { // just try
                    }
                    try {
                        oldclient.destroy();
                    } catch { // just try
                    }
                    try {
                        oldclient.removeAllListeners(); // Wichtig: Zombie-Listener entfernen
                    } catch { // just try
                    }
                }
                this.client = await getServiceClient(); // can take very long, as ldapjs retries the bind internally
                this.isConnecting = false;
                console.info(
                    `${localTimeString()} ServiceClientFactory.makeClient: got new client, returning from loop.`,
                );
                return; // essentiell
            } catch (e) {
                console.error(
                    `ServiceClientFactory.makeClient: could not get client, retrying in ${cf.ldap_retry_wait_seconds}s ... Error: ${
                        (e as Error).message
                    }`,
                );
                continue; // while loop
            }
        }
    }
}

export const serviceClientFactory = new ServiceClientFactory();
void serviceClientFactory.makeClient();

export async function getUserByEmail(
    email: string,
): Promise<LdapUserType | null> {
    const filter = `(mail=${email})`;
    const results = await searchUsers(filter);
    if (results.length === 0) {
        return null;
    }
    return results[0];
}
export function getUsersMailStartingWith(
    initial: string,
): Promise<LdapUserType[]> {
    const filter = `(mail=${initial}*)`;
    return searchUsers(filter);
}
export function searchUsers(
    filter: string,
): Promise<LdapUserType[]> {
    const attributes = [
        "mail",
        "displayName",
        "physicalDeliveryOfficeName",
    ];
    const options = {
        filter,
        scope: "sub",
        attributes: attributes,
    };
    const searchPromise = new Promise<LdapUserType[]>((resolve, reject) => {
        try {
            serviceClientFactory.getClient().search(
                cf.SEARCH_BASE,
                options,
                (_err: Error, searchResponse: ldap.SearchCallbackResponse) => {
                    const searchStatus = {
                        results: [] as ldap.SearchEntry[],
                        searchRequest: [] as ldap.SearchRequest[],
                        searchReference: [] as ldap.SearchReference[],
                        end: [] as ldap.SearchEnd[],
                    };
                    searchResponse.on(
                        "searchRequest",
                        (req: ldap.SearchRequest) => {
                            searchStatus.searchRequest.push(req);
                        },
                    );
                    searchResponse.on(
                        "searchEntry",
                        (entry: ldap.SearchEntry) => {
                            searchStatus.results.push(entry);
                        },
                    );
                    searchResponse.on(
                        "searchReference",
                        (referral: ldap.SearchReference) => {
                            searchStatus.searchReference.push(referral);
                        },
                    );
                    searchResponse.on("end", (result: ldap.SearchEnd) => {
                        searchStatus.end.push(result);
                        if (result.status != 0) {
                            return reject(
                                new Error(
                                    `LDAP Status ${result.status}, results: ${searchStatus.results.length}`,
                                ),
                            );
                        }
                        return resolve([
                            ...searchStatus.results.map(resultFromResponse),
                        ]);
                    });
                    searchResponse.on("error", (error: Error) => {
                        console.log(
                            "searchResponse.on_error (but probably I've lost the race)",
                            error.message,
                        );
                        // TODO : should we trigger a reconnect here? only, if the error a timeout?
                        return reject(error);
                    });
                },
            );
        } catch (error) {
            console.error(
                "getUsersStartingWith: catching serviceClient search with:",
                (error as Error).message,
            );
            reject(error);
        }
    });
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
        setTimeout(() => {
            reject(
                new Error("LDAP Search Timeout - Server unreachable? dead?"),
            );
        }, cf.ldap_retry_wait_seconds * 1000);
    });
    return Promise.race([searchPromise, timeoutPromise]).catch((err) => {
        if (err.message.includes("Timeout")) {
            console.error("Search timed out. Triggering factory reconnect.");
            void serviceClientFactory.makeClient();
        }
        throw err; // Fehler weiterwerfen an den Aufrufer, habe ja schon lange gewartet
    }) as Promise<
        LdapUserType[]
    >;
}

function getServiceClient(): Promise<ldap.Client> {
    // Promise resolves after successful bind
    // Promise rejects on bind error
    return new Promise((resolve, reject) => {
        let pending = true;
        const ldapClient = ldap.createClient({
            url: cf.SERVICE_URL,
            reconnect: true,
            idleTimeout: 1000 * 60 * 15, // 15 minutes
            connectTimeout: 7000, // 10 seconds
        });
        console.log(
            `INFO created serviceClient (url: ${cf.SERVICE_URL}, idleTimeout: ${
                1000 * 60 * 15
            })`,
        );
        ldapClient.on("connect", () => {
            console.log("ldap client_on_connect: now start binding ...");
            ldapClient.bind(cf.SERVICE_DN, cf.SERVICE_PW, bindCB);
        });
        ldapClient.on("reconnect", () => {
            console.log("ldap client_on_reconnect: binding ...");
            ldapClient.bind(cf.SERVICE_DN, cf.SERVICE_PW, bindCB);
        });
        ldapClient.on("error", (err: Error) => {
            console.error("ldap client_on_error", err);
            void serviceClientFactory.makeClient();
        });
        ldapClient.on("close", () => {
            console.log("ldap INFO client_on_close");
        });
        ldapClient.on("timeout", () => {
            console.log("ldap client_on_timeout");
        });
        ldapClient.on("end", () => {
            console.log("ldap client_on_end");
        });
        ldapClient.on("idle", () => {
            console.log("ldap client_on_idle: binding ...");
            ldapClient.bind(cf.SERVICE_DN, cf.SERVICE_PW, bindCB);
        });
        ldapClient.on("destroy", () => {
            console.log("ldap client_on_destroy");
        });
        ldapClient.on("unbind", () => {
            console.log("ldap client_on_unbind");
        });
        // Nested Function, need to resolve/reject the outer Promise
        function bindCB(err: Error | null) {
            let msg = "";
            if (!err) {
                console.log("bindCB: Binding has completed successfully.");
            } else {
                msg = `LDAP bind error: ${err.message}`;
                console.error(err);
                console.log(`above: ${msg}`);
            }
            if (pending) {
                pending = false; // never resolve/reject more than once
                if (err) {
                    return reject(err);
                }
                return resolve(ldapClient);
            } else { // not pending, only return
                if (err) {
                    console.error(
                        "bindCB: not pending (promise resolved), error:",
                        err,
                    );
                    console.info(
                        "bindCB: calling serviceClientFactory.makeClient ...",
                    );
                    void serviceClientFactory.makeClient();
                    return;
                }
                console.info("bindCB: called, not pending, simply returning.");
                return;
            }
        }
    });
}

function resultFromResponse(response: ldap.Response): LdapUserType {
    const result: Record<string, string> = {};
    response.pojo.attributes.forEach((attr: ldap.Attribute) => {
        result[attr.type] = attr.values.join(", ");
    });
    return {
        displayName: result.displayName,
        mail: result.mail,
        physicalDeliveryOfficeName: result.physicalDeliveryOfficeName,
    };
}
