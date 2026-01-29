import cf from "../lib/config.ts";
import { localTimeString, sleep_seconds } from "../lib/timefunc.ts";
import { LdapUserType } from "../lib/types.ts";
import { Client } from "ldapts";
import { Buffer } from "node:buffer";

class ServiceClientFactory {
    private lasttry = new Date(0);
    private isConnecting = false;
    private client: Client | null;

    constructor() {
        this.client = null;
    }

    /**
     * Return the connected LDAP client instance.
     */
    getClient(): Client {
        if (!this.client) {
            throw new Error("ServiceClientFactory: client not available");
        }
        return this.client;
    }

    /**
     * Close and cleanup LDAP client resources.
     */
    async close() {
        if (this.client) {
            try {
                await this.client.unbind();
            } catch {
                // ignore
            }
            this.client = null;
        }
    }

    /**
     * Create or recreate the LDAP client with retry logic.
     */
    async makeClient() { // can take very long
        console.log("ServiceClientFactory.makeClient: called ...");
        if (this.isConnecting) {
            console.log("ServiceClientFactory.makeClient: already connecting, simply return");
            return;
        }
        this.isConnecting = true;
        const oldclient = this.client;
        this.client = null; // prevent usage of old client

        while (true) {
            console.log("ServiceClientFactory.makeClient: trying to get new client, entering loop ...");
            const now = new Date();
            const diff = (now.getTime() - this.lasttry.getTime()) / 1000;
            if (diff < cf.ldap_retry_wait_seconds) {
                console.log(`ServiceClientFactory.makeClient: waiting ${cf.ldap_retry_wait_seconds - diff}s ...`);
                await sleep_seconds(cf.ldap_retry_wait_seconds - diff);
            }
            this.lasttry = new Date();

            try {
                if (oldclient) {
                    try {
                        await oldclient.unbind();
                    } catch {
                        // ignore
                    }
                }

                this.client = await getServiceClient();
                this.isConnecting = false;
                console.info(`${localTimeString()} ServiceClientFactory.makeClient: got new client, returning from loop.`);
                return;
            } catch (e) {
                console.error(
                    `ServiceClientFactory.makeClient: could not get client, retrying in ${cf.ldap_retry_wait_seconds}s ... Error: ${(e as Error).message}`
                );
                continue; // while loop
            }
        }
    }
}

export const serviceClientFactory = new ServiceClientFactory();
void serviceClientFactory.makeClient();

/**
 * Fetch an LDAP user by exact email.
 */
export async function getUserByEmail(email: string): Promise<LdapUserType | null> {
    const filter = `(mail=${email})`;
    const results = await searchUsers(filter);
    if (results.length === 0) {
        return null;
    }
    return results[0];
}

/**
 * Search LDAP for users with email starting with a prefix.
 */
export function getUsersMailStartingWith(initial: string): Promise<LdapUserType[]> {
    const filter = `(mail=${initial}*)`;
    return searchUsers(filter);
}

/**
 * Execute an LDAP search with a raw filter string.
 */
export async function searchUsers(filter: string): Promise<LdapUserType[]> {
    const attributes = ["mail", "displayName", "physicalDeliveryOfficeName"];
    const options = {
        filter,
        scope: "sub" as const,
        attributes: attributes,
    };

    try {
        const client = serviceClientFactory.getClient();
        const results = await client.search(cf.SEARCH_BASE, options);
        return results.searchEntries.map(resultFromEntry);
    } catch (e) {
        // Handle disconnection or timeout
        console.error("searchUsers error:", (e as Error).message);
        // Trigger reconnect in background
        void serviceClientFactory.makeClient();
        throw e;
    }
}

/**
 * Create a bound LDAP client instance.
 */
async function getServiceClient(): Promise<Client> {
    const client = new Client({
        url: cf.SERVICE_URL,
        timeout: 7000, // 7 seconds connect timeout
        connectTimeout: 7000,
    });

    console.log(`INFO created serviceClient (url: ${cf.SERVICE_URL})`);
    
    // Bind
    await client.bind(cf.SERVICE_DN, cf.SERVICE_PW);
    console.log("bindCB: Binding has completed successfully.");
    
    return client;
}

/**
 * Convert raw LDAP entry to LdapUserType.
 */
// deno-lint-ignore no-explicit-any
function resultFromEntry(entry: any): LdapUserType {
    // entry.keys is accessible, but values are often buffers or strings.
    // ldapts returns values as string | string[] | Buffer | Buffer[]
    
    const getVal = (key: string): string => {
        const val = entry[key];
        if (Buffer.isBuffer(val)) return val.toString("utf-8");
        if (typeof val === "string") return val;
        if (Array.isArray(val)) {
             const first = val[0];
             if (Buffer.isBuffer(first)) return first.toString("utf-8");
             if (typeof first === "string") return first;
        }
        return "";
    };

    return {
        displayName: getVal("displayName"),
        mail: getVal("mail"),
        physicalDeliveryOfficeName: getVal("physicalDeliveryOfficeName"),
    };
}
