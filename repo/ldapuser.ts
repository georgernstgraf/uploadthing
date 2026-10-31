import cf from "../lib/config.ts";
import { buildUserSearchFilter, escapeLdapFilterValue } from "../lib/ldap_filter.ts";
import { LdapUserType } from "../lib/types.ts";
import { Client, ResultCodeError } from "ldapts";
import { Buffer } from "node:buffer";

/**
 * Frist für einen Verbindungsschritt im Request-Pfad (#162). Sie gilt je
 * Operation (TCP-Verbindung bzw. Bind), nicht für die ganze Anfrage —
 * ein Login darf nicht minutenlang auf ein Verzeichnis warten, das nicht
 * antwortet.
 */
export const LDAP_REQUEST_TIMEOUT_MS = 5000;

/**
 * Fehler der LDAP-Suche, nach außen typisiert (#162).
 *
 * `LdapServerResponseError` ist eine Antwort des Verzeichnisses
 * (Result-Code, etwa `NO_OBJECT`/0x20): kein Netzausfall, also kein
 * Reconnect und keine Meldung „nicht erreichbar".
 * `LdapTransportError` ist ein Socket-/Verbindungsfehler.
 */
export type LdapSearchError = LdapServerResponseError | LdapTransportError;

export class LdapServerResponseError extends Error {
    readonly kind = "server" as const;
    /** Result-Code wie bei ldapts (z. B. 32 = `NO_OBJECT`). */
    readonly code: number;

    constructor(code: number, message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "LdapServerResponseError";
        this.code = code;
    }
}

export class LdapTransportError extends Error {
    readonly kind = "transport" as const;

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "LdapTransportError";
    }
}

/**
 * Result-Code einer LDAP-Server-Antwort, `null` bei Transportfehlern.
 *
 * Geprüft am installierten `ldapts` 8.1.3: `Client.search()` wirft bei
 * einer Server-Antwort `StatusCodeParser.parse(...)`, also eine Subklasse
 * von `ResultCodeError` mit **numerischem** `code`. Für
 * `problem 2001 (NO_OBJECT)` ist das `NoSuchObjectError` mit
 * `code === 32` (0x20) und der Meldung `… Code: 0x20`. Transportfehler
 * tragen keinen numerischen `code`: Node-Socket-Fehler haben einen
 * String (`"ECONNRESET"`, `"ETIMEDOUT"`), Deno-Fehler gar keinen.
 */
export function ldapResultCode(error: unknown): number | null {
    if (error instanceof ResultCodeError) {
        return error.code;
    }
    const code = (error as { code?: unknown } | null)?.code;
    return typeof code === "number" ? code : null;
}

/** Fehler der LDAP-Suche typisieren; bereits typisierte bleiben unverändert. */
export function toLdapSearchError(error: unknown): LdapSearchError {
    if (
        error instanceof LdapServerResponseError ||
        error instanceof LdapTransportError
    ) {
        return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const code = ldapResultCode(error);
    if (code !== null) {
        return new LdapServerResponseError(code, message, { cause: error });
    }
    return new LdapTransportError(message, { cause: error });
}

/**
 * Führt `attempt` aus und erlaubt bei einem **Transportfehler** genau
 * einen Neuversuch (#162); `reconnect` baut dafür den Client neu auf und
 * muss selbst begrenzt sein.
 *
 * Eine Server-Antwort wird sofort weitergereicht: sie ist keine Störung
 * der Verbindung, ein Reconnect würde nur die nächste Anfrage grundlos
 * verlangsamen und den Fehler verschleiern.
 */
export async function retryOnceOnTransportError<T>(
    attempt: () => Promise<T>,
    reconnect: () => Promise<void>,
): Promise<T> {
    try {
        return await attempt();
    } catch (error) {
        const failure = toLdapSearchError(error);
        if (failure.kind === "server") {
            throw failure;
        }

        console.error(
            `LDAP-Transportfehler (${failure.message}), genau ein Neuversuch ...`,
        );
        try {
            await reconnect();
        } catch (reconnectError) {
            throw toLdapSearchError(reconnectError);
        }

        try {
            return await attempt();
        } catch (retryError) {
            throw toLdapSearchError(retryError);
        }
    }
}

/**
 * Verbindungsverwaltung des Service-Accounts.
 *
 * Es gibt keine Endlosschleife mehr (#162): jeder Aufruf ist **ein**
 * Versuch mit Frist. Läuft bereits ein Aufbau, warten weitere Aufrufer
 * auf denselben Versuch, statt einen zweiten zu starten.
 */
class ServiceClientFactory {
    private client: Client | null;
    private connecting: Promise<Client> | null = null;

    constructor() {
        this.client = null;
    }

    /** Der verbundene Client, `null` solange keiner bereitsteht. */
    tryGetClient(): Client | null {
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
     * Ein Verbindungsversuch mit Frist. Ein vorhandener Client wird
     * verworfen, weil er nach einem Transportfehler nicht mehr nutzbar
     * ist.
     */
    connect(timeoutMs: number = LDAP_REQUEST_TIMEOUT_MS): Promise<Client> {
        if (!this.connecting) {
            this.connecting = this.openClient(timeoutMs).finally(() => {
                this.connecting = null;
            });
        }
        return this.connecting;
    }

    private async openClient(timeoutMs: number): Promise<Client> {
        const oldClient = this.client;
        this.client = null;

        if (oldClient) {
            // Auf einem kaputten Socket wartet `unbind()` nur bis zum
            // Timeout — es darf den Request nicht aufhalten.
            void oldClient.unbind().catch(() => {
                // ignore
            });
        }

        try {
            const client = await getServiceClient(timeoutMs);
            this.client = client;
            return client;
        } catch (error) {
            throw toLdapSearchError(error);
        }
    }
}

export const serviceClientFactory = new ServiceClientFactory();

async function getOrCreateClient(): Promise<Client> {
    return serviceClientFactory.tryGetClient() ??
        await serviceClientFactory.connect(LDAP_REQUEST_TIMEOUT_MS);
}

/**
 * Fetch an LDAP user by exact email.
 */
export async function getUserByEmail(email: string): Promise<LdapUserType | null> {
    const filter = `(mail=${escapeLdapFilterValue(email)})`;
    const results = await searchUsers(filter);
    if (results.length === 0) {
        return null;
    }
    return results[0];
}

/**
 * Search LDAP for users whose given name, surname, mail or account name
 * starts with `term` (#146). Callers must validate the minimum length.
 */
export function searchUsersByTerm(term: string): Promise<LdapUserType[]> {
    return searchUsers(buildUserSearchFilter(term));
}

/**
 * Execute an LDAP search with a raw filter string.
 *
 * Server-Antworten (Result-Code) werden unverändert typisiert
 * weitergereicht; nur Transportfehler bekommen genau einen begrenzten
 * Neuversuch (#162).
 */
export async function searchUsers(filter: string): Promise<LdapUserType[]> {
    const attributes = [
        "mail",
        "displayName",
        "givenName",
        "sn",
        "sAMAccountName",
        "physicalDeliveryOfficeName",
    ];
    const options = {
        filter,
        scope: "sub" as const,
        attributes: attributes,
    };

    return await retryOnceOnTransportError(
        async () => {
            const client = await getOrCreateClient();
            const results = await client.search(cf.SEARCH_BASE, options);
            return results.searchEntries.map(resultFromEntry);
        },
        async () => {
            // Neuer Client mit Frist; der alte wird dabei verworfen.
            await serviceClientFactory.connect(LDAP_REQUEST_TIMEOUT_MS);
        },
    );
}

/**
 * Create a bound LDAP client instance.
 */
async function getServiceClient(timeoutMs: number): Promise<Client> {
    const client = new Client({
        url: cf.SERVICE_URL,
        timeout: timeoutMs,
        connectTimeout: timeoutMs,
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
        givenName: getVal("givenName"),
        sn: getVal("sn"),
        mail: getVal("mail"),
        sAMAccountName: getVal("sAMAccountName"),
        physicalDeliveryOfficeName: getVal("physicalDeliveryOfficeName"),
    };
}
