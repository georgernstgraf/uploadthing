import config from "../lib/config.ts";
import { normalizeMac } from "../lib/mac.ts";
import * as repo from "../repo/repo.ts";
import type { UserType } from "../lib/types.ts";
import { isTeacher } from "./user.ts";

/**
 * MAC-Allowlist für die Lehrpersonen-Anmeldung (#147).
 *
 * Die Freigabe ist eine **Zusatzbedingung** zur LDAP-Klasse `LehrendeR`:
 * Eine Lehrperson darf sich auch von einer IP anmelden, die nicht in
 * `ADMIN_IPS` steht, wenn die MAC ihres Geräts freigegeben ist. Eine
 * freigegebene MAC macht niemanden zum Admin — wer nicht `LehrendeR` ist,
 * bleibt Schüler, egal von welchem Gerät er kommt.
 *
 * MAC-Spoofing ist trivial. Die Liste ist Komfort („Lehrende von diesem
 * Gerät") und keine Sicherheitsgrenze; siehe `docs/ai/DECISIONS.md`.
 *
 * Quellen der Freigabe:
 * - `adminmac` in der Datenbank, gepflegt unter `/admin/application`,
 * - `ADMIN_MACS` aus der Env als Übergangslösung.
 *
 * Die MAC zu einer IP kommt ausschließlich aus `ipfact` (Polling, #145).
 * Im Request-Pfad wird nie der Tik gefragt: ein nicht erreichbarer Tik
 * darf den Login nicht aufhalten, und ein Request darf keine Wartezeit
 * von bis zu fünf Sekunden erben.
 */

export type AdminMacEntry = {
    mac: string;
    comment: string;
    created_at: Date;
};

/** Alle freigegebenen MACs aus der Datenbank, neueste zuerst. */
export function list(): AdminMacEntry[] {
    return repo.adminmac.list();
}

/** Freigaben aus der Env (`ADMIN_MACS`), kanonisiert und ohne Duplikate. */
export function envAllowedMacs(): string[] {
    return [...config.ADMIN_MACS];
}

/**
 * Legt eine Freigabe an. Ungültige MAC-Schreibweisen und leere Kommentare
 * werden mit deutscher Meldung abgelehnt, doppelte Einträge ebenfalls.
 */
export function add(
    rawMac: string,
    comment: string,
    now: Date = new Date(),
): AdminMacEntry {
    const mac = normalizeMac(rawMac);
    if (!mac) {
        throw new Error(
            `Ungültige MAC-Adresse: "${rawMac.trim()}" (erwartet z. B. aa:bb:cc:dd:ee:ff).`,
        );
    }

    const trimmedComment = comment.trim();
    if (!trimmedComment) {
        throw new Error("Bitte einen Kommentar angeben.");
    }

    if (repo.adminmac.exists(mac)) {
        throw new Error(`Die MAC-Adresse ${mac} ist bereits freigegeben.`);
    }

    repo.adminmac.create(mac, trimmedComment, now);
    return { mac, comment: trimmedComment, created_at: now };
}

/**
 * Entfernt eine Freigabe. `false` heißt: die Schreibweise war ungültig oder
 * die MAC war nicht freigegeben — der Aufrufer meldet das als Fehler.
 */
export function remove(rawMac: string): boolean {
    const mac = normalizeMac(rawMac);
    if (!mac) {
        return false;
    }
    return repo.adminmac.remove(mac);
}

/**
 * Ist die MAC freigegeben — in der Datenbank oder über `ADMIN_MACS`?
 * Ohne MAC (IP nie mit lesbarer MAC gesehen) ist die Antwort `false`.
 */
export function isAllowed(mac: string | null | undefined): boolean {
    const normalized = mac ? normalizeMac(mac) : null;
    if (!normalized) {
        return false;
    }

    return config.ADMIN_MACS.includes(normalized) ||
        repo.adminmac.exists(normalized);
}

/** Jüngste bekannte MAC zu einer IP aus `ipfact` (`null`, wenn unbekannt). */
export function resolveMacForIp(ip: string): string | null {
    return repo.ipfact.getLatestMacForIP(ip);
}

export type TeacherRegistrationCheck = {
    user: UserType | null | undefined;
    ip: string;
    /** MAC zur Request-IP aus `ipfact`; `null` heißt unbekannt. */
    mac: string | null;
};

/**
 * Darf diese Anmeldung als Lehrperson durch?
 *
 * - Nicht-Lehrpersonen sind von dieser Sperre nicht betroffen (`true`) —
 *   sie bekommen dadurch aber keine Admin-Rechte, das entscheidet allein
 *   `isTeacher()`.
 * - Ohne konfigurierte `ADMIN_IPS`-Liste bleibt die Sperre aus (bisheriges
 *   Verhalten).
 * - Sonst genügt eine freigegebene MAC aus Datenbank oder Env.
 */
export function teacherRegistrationAllowed(
    options: TeacherRegistrationCheck,
): boolean {
    if (!isTeacher(options.user)) {
        return true;
    }
    if (config.ADMIN_IPS.length === 0) {
        return true;
    }
    if (config.ADMIN_IPS.includes(options.ip)) {
        return true;
    }
    return isAllowed(options.mac);
}
