import { db } from "./db.ts";

const registerSeenStmt = db.prepare(
    "INSERT INTO ipfact (ip, seen, mac) VALUES (?, ?, ?)",
);
const deleteOlderThanStmt = db.prepare(
    "DELETE FROM ipfact WHERE seen < ?",
);
const getInRangeStmt = db.prepare(
    `SELECT ip, seen FROM ipfact
    WHERE seen BETWEEN ? AND ?
    ORDER BY seen DESC`,
);
const getHistoryForIPInRangeDescStmt = db.prepare(
    `SELECT seen FROM ipfact
    WHERE ip = ? AND seen BETWEEN
    ? AND ?
    ORDER BY seen DESC`,
);
/*
Zu den Zeiten:

DATENBANK speichert Zeiten in UTC.
*/
/**
 * Ein Gerät, das zum Abrufzeitpunkt im WLAN sichtbar war.
 * `mac` ist nullable, weil ältere Zeilen und Clients ohne lesbare
 * MAC-Adresse gültig bleiben.
 */
export type SeenEntry = {
    ip: string;
    mac?: string | null;
};

/**
 * Insert a single IP seen timestamp.
 */
export function registerSeen(ip: string, seen: Date, mac: string | null = null) {
    registerSeenStmt.run(ip, seen.toISOString(), mac);
}

export function deleteOlderThan(cutoff: Date): number {
    deleteOlderThanStmt.run(cutoff.toISOString());
    return db.changes;
}
/**
 * Insert multiple seen entries in one statement. `null`/leere MACs werden
 * als `NULL` gespeichert.
 */
export function registerSeenMany(entries: SeenEntry[], seen: Date): number {
    if (entries.length === 0) {
        return 0;
    }

    const placeholders = entries.map(() => "(?, ?, ?)").join(", ");
    const sql = `INSERT INTO ipfact (ip, seen, mac) VALUES ${placeholders}`;
    const stmt = db.prepare(sql);
    const iso = seen.toISOString();
    const params = entries.flatMap((entry) => [entry.ip, iso, entry.mac ?? null]);
    stmt.run(params);
    return db.changes;
}
/**
 * List IPs seen within a UTC range, most recent first.
 */
export function getInRange(
    start: Date,
    end: Date,
): { ip: string; seen: Date }[] {
    const rows = getInRangeStmt.all(start.toISOString(), end.toISOString()) as {
        ip: string;
        seen: string;
    }[];
    return rows.map((row) => ({
        ip: row.ip,
        seen: new Date(row.seen),
    }));
}

/**
 * Fetch IP seen timestamps in descending order within a UTC range.
 * @param ip - IP address to query.
 * @param start - Range start (inclusive).
 * @param end - Range end (inclusive).
 * @returns Array of seen timestamps in descending order.
 */
export function getHistoryForIPInRangeDesc(
    ip: string,
    start: Date,
    end: Date,
): Date[] {
    const rows = getHistoryForIPInRangeDescStmt.all(ip, start.toISOString(), end.toISOString()) as {
        seen: string;
    }[];
    return rows.map((row) => new Date(row.seen));
}

const insertScanStmt = db.prepare(
    "INSERT OR IGNORE INTO tikscan (at) VALUES (?)",
);
const scansInRangeStmt = db.prepare(
    `SELECT at FROM tikscan
    WHERE at BETWEEN ? AND ?
    ORDER BY at ASC`,
);
const latestScanStmt = db.prepare(
    `SELECT at FROM tikscan
    WHERE at BETWEEN ? AND ?
    ORDER BY at DESC
    LIMIT 1`,
);
const previousScanStmt = db.prepare(
    `SELECT at FROM tikscan
    WHERE at < ?
    ORDER BY at DESC
    LIMIT 1`,
);
const deleteScansOlderThanStmt = db.prepare(
    "DELETE FROM tikscan WHERE at < ?",
);
const existsAtStmt = db.prepare(
    "SELECT 1 FROM ipfact WHERE ip = ? AND seen = ? LIMIT 1",
);
const existsBeforeStmt = db.prepare(
    `SELECT 1 FROM ipfact
    WHERE ip = ? AND seen >= ? AND seen < ?
    LIMIT 1`,
);
/*
Distinct IPs je Scan (#163): beide Abfragen laufen über den Composite-Index
`ipfact_seen_ip_idx` (seen, ip) — `seen` ist die führende Spalte, `ip`
kommt aus dem Index selbst (Covering Index). `ipsBetween` ist das halboffene
Fenster `[start, end)`; ein Scan gehört damit genau zu einem Fenster.
*/
const ipsAtStmt = db.prepare(
    `SELECT DISTINCT ip FROM ipfact
    WHERE seen = ?
    ORDER BY ip`,
);
const ipsBetweenStmt = db.prepare(
    `SELECT DISTINCT ip FROM ipfact
    WHERE seen >= ? AND seen < ?
    ORDER BY ip`,
);
/*
Jüngste MAC einer IP seit `since` (#147, #153): läuft rückwärts über den
Index `ipfact_ip_seen_key` (ip, seen) und liefert die MAC der jüngsten
Sichtung im Fenster — auch wenn diese Sichtung keine MAC hat. Genau dann
ist das Gerät „unbekannt"; ein Rückfall auf eine ältere Zeile würde nach
einer DHCP-Weitervergabe die MAC des Vorgängergeräts liefern.
Der Request-Pfad ruft nie den Tik; die Daten liegen durch das Polling
(#145) bereits vor.
*/
const latestMacForIpStmt = db.prepare(
    `SELECT mac FROM ipfact
    WHERE ip = ? AND seen >= ?
    ORDER BY seen DESC
    LIMIT 1`,
);

/**
 * MAC-Adresse der jüngsten Sichtung einer IP seit `since` (UTC),
 * `null` wenn die IP im Fenster nicht gesehen wurde oder die jüngste
 * Sichtung keine lesbare MAC hat. Grundlage der MAC-Freigabe im Login
 * (#147); das Fenster wählt der Service.
 */
export function getLatestMacForIP(ip: string, since: Date): string | null {
    const row = latestMacForIpStmt.get(ip, since.toISOString()) as
        | { mac: string | null }
        | undefined;
    return row?.mac ?? null;
}

/**
 * Einen abgeschlossenen Netz-Scan auf der Zeitachse festhalten (#163).
 *
 * Idempotent über den Unique-Index `tikscan_at_key`: derselbe Zeitpunkt
 * erzeugt keinen zweiten Eintrag. Ein leerer Abruf ist ein gültiger Scan.
 */
export function insertScan(at: Date): void {
    insertScanStmt.run(at.toISOString());
}

/**
 * Alle Scans im Zeitraum, aufsteigend. Enthält auch Scans ohne einen
 * einzigen sichtbaren Client.
 */
export function scansInRange(start: Date, end: Date): Date[] {
    const rows = scansInRangeStmt.all(
        start.toISOString(),
        end.toISOString(),
    ) as { at: string }[];
    return rows.map((row) => new Date(row.at));
}

/**
 * Jüngster Scan im Zeitraum (einschließlich Grenzen), `null` wenn keiner
 * vorliegt.
 */
export function latestScan(start: Date, end: Date): Date | null {
    const row = latestScanStmt.get(
        start.toISOString(),
        end.toISOString(),
    ) as { at: string } | undefined;
    return row ? new Date(row.at) : null;
}

/**
 * Nächstälterer Scan vor `before`, unabhängig von einem Fenster.
 */
export function previousScan(before: Date): Date | null {
    const row = previousScanStmt.get(before.toISOString()) as
        | { at: string }
        | undefined;
    return row ? new Date(row.at) : null;
}

/**
 * Wurde die IP in genau diesem Scan gesehen?
 */
export function existsAt(ip: string, scan: Date): boolean {
    return existsAtStmt.get(ip, scan.toISOString()) !== undefined;
}

/**
 * Wurde die IP im Fenster `[since, scan)` gesehen — also vor diesem Scan,
 * aber innerhalb des betrachteten Zeitraums?
 */
export function existsBefore(ip: string, scan: Date, since: Date): boolean {
    return existsBeforeStmt.get(
        ip,
        since.toISOString(),
        scan.toISOString(),
    ) !== undefined;
}

/**
 * Scans vor dem Stichtag löschen (Datenbankbereinigung).
 */
export function deleteScansOlderThan(cutoff: Date): number {
    deleteScansOlderThanStmt.run(cutoff.toISOString());
    return db.changes;
}

/**
 * Alle IPs, die **genau bei diesem Scan** gesehen wurden, distinct und
 * alphabetisch (#163). Grundlage des Scan-Deltas: nur was sich zwischen
 * zwei Scans ändert, wird ein Ereignis.
 */
export function ipsAt(scan: Date): string[] {
    const rows = ipsAtStmt.all(scan.toISOString()) as { ip: string }[];
    return rows.map((row) => row.ip);
}

/**
 * Alle IPs, die im halboffenen Fenster `start <= seen < end` gesehen
 * wurden, distinct und alphabetisch (#163). `end` gehört nicht dazu,
 * damit `ipsBetween(dayStart, scan)` genau die Sichtungen **vor** dem
 * laufenden Scan liefert.
 */
export function ipsBetween(start: Date, end: Date): string[] {
    const rows = ipsBetweenStmt.all(
        start.toISOString(),
        end.toISOString(),
    ) as { ip: string }[];
    return rows.map((row) => row.ip);
}
