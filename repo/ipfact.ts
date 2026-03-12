import { db } from "./db.ts";
/*
Zu den Zeiten:

DATENBANK speichert Zeiten in UTC.
*/
/**
 * Insert a single IP seen timestamp.
 */
export function registerSeen(ip: string, seen: Date) {
    const registerSeen_stmt = db.prepare(
        "INSERT INTO ipfact (ip, seen) VALUES (?, ?)",
    );
    registerSeen_stmt.run(ip, seen.toISOString());
}

export function deleteOlderThan(cutoff: Date): number {
    const deleteOlderThan_stmt = db.prepare(
        "DELETE FROM ipfact WHERE seen < ?",
    );
    deleteOlderThan_stmt.run(cutoff.toISOString());
    return db.changes;
}
/**
 * Insert multiple IP seen timestamps in one statement.
 */
export function registerSeenMany(ips: string[], seen: Date) {
    const placeholders = ips.map(() => "(?, ?)").join(", ");
    const sql = `INSERT INTO ipfact (ip, seen) VALUES ${placeholders}`;
    const stmt = db.prepare(sql);
    const params = ips.flatMap((ip) => [ip, seen.toISOString()]);
    return stmt.run(params);
}
/**
 * List distinct IPs seen within a UTC range.
 */
export function ips_in_range(start: Date, end: Date): string[] {
    const stmt = db.prepare(
        `SELECT DISTINCT ip FROM ipfact
        WHERE seen BETWEEN
        ? AND ?`,
    );
    return stmt.all(start.toISOString(), end.toISOString()).map((row) => row.ip);
}

export function getInRange(
    start: Date,
    end: Date,
): { ip: string; seen: Date }[] {
    const stmt = db.prepare(
        `SELECT ip, seen FROM ipfact
        WHERE seen BETWEEN ? AND ?
        ORDER BY ip ASC, seen DESC`,
    );
    const rows = stmt.all(start.toISOString(), end.toISOString()) as {
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
    const stmt = db.prepare(
        `SELECT seen FROM ipfact
        WHERE ip = ? AND seen BETWEEN
        ? AND ?
        ORDER BY seen DESC`,
    );
    const rows = stmt.all(ip, start.toISOString(), end.toISOString()) as {
        seen: string;
    }[];
    return rows.map((row) => new Date(row.seen));
}
