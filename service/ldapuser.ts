import * as repo from "../repo/repo.ts";
import { LdapUserType, UserType } from "../lib/types.ts";
import * as users from "./user.ts";

/** Mindestlänge des Suchbegriffs (#146): kürzere Begriffe liefern zu viel. */
export const MIN_SEARCH_LENGTH = 3;

/**
 * Obergrenze für die Trefferliste. `(sn=G*)` trifft mehrere hundert
 * Personen; die Liste bleibt kurz und sagt stattdessen, dass weitere
 * Treffer existieren.
 */
export const MAX_SEARCH_RESULTS = 30;

/** Ein anzeigbarer Treffer der Namenssuche (ohne E-Mail in der Anzeige). */
export type LoginCandidate = {
    email: string;
    /** "Vorname Nachname" — aus givenName und sn, nicht aus displayName. */
    label: string;
    klasse?: string;
};

/**
 * Sucht Personen nach Namensteil oder Kontocode für die Anmeldung.
 * Es wird **nichts** registriert: die lokale Registrierung passiert erst
 * beim Klick auf einen Treffer (`resolveLoginUser`).
 */
export async function searchLoginCandidates(
    term: string,
): Promise<{ users: LoginCandidate[]; has_more: boolean }> {
    const trimmed = term.trim();
    if (trimmed.length < MIN_SEARCH_LENGTH) {
        throw new Error(
            `Bitte mindestens ${MIN_SEARCH_LENGTH} Zeichen eingeben.`,
        );
    }

    const entries = await repo.ldap.searchUsersByTerm(trimmed);
    const candidates = entries
        .map(loginCandidateFromLdap)
        // Personen ohne Mail können sich nicht anmelden (z. B. technische
        // Konten wie `grafikuser`).
        .filter((candidate) => candidate.email.length > 0)
        .sort((a, b) =>
            a.label.localeCompare(b.label, "de", { sensitivity: "base" })
        );

    return {
        users: candidates.slice(0, MAX_SEARCH_RESULTS),
        has_more: candidates.length > MAX_SEARCH_RESULTS,
    };
}

/**
 * Löst eine Anmeldung zu einer Person auf und registriert sie lokal.
 *
 * LDAP ist die Quelle für Name und Klasse — damit eine geänderte Klasse
 * (Schuljahr, Rollenwechsel) nicht auf einem alten lokalen Datensatz
 * hängen bleibt. Ist LDAP nicht erreichbar, darf sich eine bereits
 * bekannte Person weiterhin anmelden (wichtig mitten im Examen).
 */
export async function resolveLoginUser(
    email: string,
): Promise<UserType | null> {
    const normalized = email.trim().toLowerCase();
    if (normalized.length === 0) {
        return null;
    }

    try {
        const fromLdap = await repo.ldap.getUserByEmail(normalized);
        if (fromLdap) {
            const user = userFromLdap(fromLdap);
            await users.registerUser(user);
            // Erneut lokal lesen: die Id wird für die Abgaben gebraucht.
            return await users.getUserByEmail(user.email);
        }
    } catch (e) {
        console.error(
            `LDAP-Lookup beim Login fehlgeschlagen (${normalized}):`,
            (e as Error).message,
        );
    }

    return await users.getUserByEmail(normalized);
}

/**
 * Fetch a user from LDAP by exact email and register locally.
 */
export async function getUserByEmail(
    email: string,
): Promise<UserType | null> {
    const result = await repo.ldap.getUserByEmail(email);
    if (!result) {
        return null;
    }
    const user = userFromLdap(result);
    try {
        await users.registerUser(user);
    } catch (e) {
        console.error("Failed to register user async:", email);
        console.error(e);
        return user;
    }
    return user;
}

/**
 * Convert LDAP user data into the local user shape.
 * Der gespeicherte Name bleibt `displayName` ("Nachname Vorname") — die
 * Anzeige der Suche ist davon getrennt (`displayLabel`).
 */
function userFromLdap(ldapUser: LdapUserType): UserType {
    const klasse = ldapUser.physicalDeliveryOfficeName.trim();
    return {
        email: ldapUser.mail.trim().toLocaleLowerCase(),
        name: ldapUser.displayName.trim() ||
            `${ldapUser.sn} ${ldapUser.givenName}`.trim(),
        klasse: klasse.length > 0 ? klasse : undefined,
    };
}

function loginCandidateFromLdap(ldapUser: LdapUserType): LoginCandidate {
    const klasse = ldapUser.physicalDeliveryOfficeName.trim();
    return {
        email: ldapUser.mail.trim().toLocaleLowerCase(),
        label: displayLabel(ldapUser),
        klasse: klasse.length > 0 ? klasse : undefined,
    };
}

/**
 * "Vorname Nachname" aus `givenName` + `sn`. `displayName` ist invertiert
 * ("Graf Georg") und eignet sich nicht für die Auswahl.
 */
function displayLabel(ldapUser: LdapUserType): string {
    const composed = `${ldapUser.givenName} ${ldapUser.sn}`
        .replace(/\s+/g, " ")
        .trim();
    return composed.length > 0 ? composed : ldapUser.displayName.trim();
}

/**
 * Close LDAP service client resources.
 */
export async function close() {
    // await sleep(1);
    await repo.ldap.serviceClientFactory.close();
}
