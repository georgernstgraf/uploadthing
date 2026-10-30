/**
 * Gemeinsame Fixtures der E2E-Smoke-Suite (#135).
 *
 * Die Suite läuft gegen einen eigens gestarteten Server mit
 * Wegwerf-Datenbank (siehe `scripts/e2e.sh`). Es gibt **keinen** echten
 * Login: die Anmeldung über die Namenssuche braucht LDAP, das im
 * Testlauf nicht erreichbar ist. Statt des LDAP-Flows setzt die Suite
 * dieselbe Sitzung, die `POST /register` nach erfolgreichem Login
 * setzen würde — ein HMAC-signiertes Cookie mit der E-Mail eines
 * Fixture-Benutzers. Die Benutzer selbst legt `seed.ts` in der
 * Wegwerf-Datenbank an.
 */

export type FixtureUser = {
    email: string;
    name: string;
    klasse: string;
};

/** Schüler der Fixture-Datenbank (Klasse != "LehrendeR"). */
export const STUDENT: FixtureUser = {
    email: "e2e.schueler@example.test",
    name: "Erika Beispiel",
    klasse: "5AHIT",
};

/** Lehrperson der Fixture-Datenbank — nur diese Klasse bekommt Adminrechte. */
export const TEACHER: FixtureUser = {
    email: "e2e.lehrer@example.test",
    name: "Tobias Beispiel",
    klasse: "LehrendeR",
};

/** Name der Unterlage, die `seed.ts` in `UNTERLAGEN_DIR` ablegt. */
export const UNTERLAGEN_FILE = "angabe.md";

function requireEnv(name: string): string {
    const value = Deno.env.get(name);
    if (!value) {
        throw new Error(`${name} muss gesetzt sein (scripts/e2e.sh).`);
    }
    return value;
}

/** Basis-URL des Testservers aus der Umgebung von `scripts/e2e.sh`. */
export function baseUrl(): string {
    const host = Deno.env.get("LISTEN_HOST") || "127.0.0.1";
    return `http://${host}:${requireEnv("LISTEN_PORT")}`;
}

/** Cookie-Name der Sitzung (App-Default `ut_session`). */
export function cookieName(): string {
    return Deno.env.get("COOKIE_NAME") || "ut_session";
}

/**
 * Signiert einen Cookie-Wert wie `middleware/session.ts`:
 * `base64(json).base64(hmac-sha256(base64(json), COOKIE_SECRET))`.
 *
 * Bewusst hier nachgebaut statt aus `middleware/session.ts` importiert:
 * dieses Modul zieht `service/service.ts` und damit die Datenbank nach;
 * der Browser-Testprozess soll aber keine zweite SQLite-Verbindung zur
 * laufenden Instanz öffnen.
 */
export async function sessionCookieValue(email: string): Promise<string> {
    const secret = requireEnv("COOKIE_SECRET");
    const encoded = btoa(JSON.stringify({ email, createdAt: Date.now() }));
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(encoded),
    );
    const encodedSignature = btoa(
        String.fromCharCode(...new Uint8Array(signature)),
    );
    return `${encoded}.${encodedSignature}`;
}
