import { db } from "./db.ts";

const registerSeenStmt = db.prepare(
    "INSERT INTO ipfact (ip, seen, mac) VALUES (?, ?, ?)",
);
const deleteOlderThanStmt = db.prepare(
    "DELETE FROM ipfact WHERE seen < ?",
);
const ipsInRangeStmt = db.prepare(
    `SELECT DISTINCT ip FROM ipfact
    WHERE seen BETWEEN
    ? AND ?`,
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
 * List distinct IPs seen within a UTC range.
 */
export function ips_in_range(start: Date, end: Date): string[] {
    return ipsInRangeStmt.all(start.toISOString(), end.toISOString()).map((row) => row.ip);
}

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

const getUniqueScanTimestampsStmt = db.prepare(
    `SELECT DISTINCT seen FROM ipfact
    WHERE seen BETWEEN ? AND ?
    ORDER BY seen ASC`,
);

/**
 * Get all unique scan timestamps within a time range.
 * Each timestamp represents one network scan that recorded active IPs.
 * @param start - Range start (inclusive).
 * @param end - Range end (inclusive).
 * @returns Array of unique scan timestamps in ascending order.
 */
export function getUniqueScanTimestamps(start: Date, end: Date): Date[] {
    const rows = getUniqueScanTimestampsStmt.all(start.toISOString(), end.toISOString()) as {
        seen: string;
    }[];
    return rows.map((row) => new Date(row.seen));
}
