import { type ForensicIPCount } from "../lib/types.ts";
import { db } from "./db.ts";
/*
Zu den Zeiten:

DATENBANK speichert Zeiten in UTC.

Datetime berücksichtigt die lokale Zeitzone.
Beispiel:
    datetime('2025-12-18' || ' 08:00:00', 'utc')
    2025-12-18 07:00:00
    datetime('2026-08-18' || ' 08:00:00', 'utc')
    2026-08-18 06:00:00
*/
const registerSeen_stmt = db.prepare(
    "INSERT INTO ipfact (ip, seen) VALUES (?, ?)",
);
/**
 * Insert a single IP seen timestamp.
 */
export function registerSeen(ip: string, seen: Date) {
    registerSeen_stmt.run(ip, seen);
}
/**
 * Insert multiple IP seen timestamps in one statement.
 */
export function registerSeenMany(ips: string[], seen: Date) {
    const placeholders = ips.map(() => "(?, ?)").join(", ");
    const sql = `INSERT INTO ipfact (ip, seen) VALUES ${placeholders}`;
    const stmt = db.prepare(sql);
    const params = ips.flatMap((ip) => [ip, seen]);
    return stmt.run(params);
}
const seenStatsForRange_sql =
    `SELECT ip, COUNT(*) as count, max(seen) as lastseen FROM ipfact
    WHERE seen BETWEEN
    (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc'))) AND
    (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc')))
    GROUP BY ip`;
const seenStatsForRange_stmt = db.prepare(
    seenStatsForRange_sql,
);

/**
 * Fetch IP counts and last seen timestamps for a range.
 */
export function seenStatsForRange(
    start: string,
    end: string,
): ForensicIPCount[] {
    console.log(
        `repo.ipfact.seenStatsForRange called with params START: ${start}, END: ${end}`,
    );
    console.log(`start: ${start} -> ${db_strftime_to_utc(start)}`);
    console.log(`end: ${end} -> ${db_strftime_to_utc(end)}`);
    console.log(
        "EXECUTING SQL (strftime will convert to UTC!):",
    );
    console.log(
        seenStatsForRange_sql,
    );
    return seenStatsForRange_stmt.all(start, end);
}
/**
 * Delete all ipfact records.
 */
export function deleteAll() {
    db.exec("DELETE FROM ipfact");
}
/**
 * Convert a local datetime string to UTC using sqlite strftime.
 */
export function db_strftime_to_utc(date: string) {
    const stmt = db.prepare(
        "SELECT strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc')) as formatted;",
    );
    const result = stmt.get(date) as { formatted: string } | undefined;
    if (!result) {
        throw new Error("Failed to format date");
    }
    return result.formatted;
}
/**
 * List distinct IPs seen within a UTC range.
 */
export function ips_in_range(start: Date, end: Date): string[] {
    const stmt = db.prepare(
        `SELECT DISTINCT ip FROM ipfact
        WHERE seen BETWEEN
        (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc'))) AND
        (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc')))`,
    );
    return stmt.all(start.toISOString(), end.toISOString()).map((row) =>
        row.ip
    );
}

/**
 * Fetch IP seen timestamps in descending order within a UTC range.
 */
export function getHistoryForIPInRangeDesc(
    ip: string,
    start: Date,
    end: Date,
): Date[] {
    const stmt = db.prepare(
        `SELECT seen FROM ipfact
        WHERE ip = ? AND seen BETWEEN
        (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc'))) AND
        (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc')))
        ORDER BY seen DESC`,
    );
    const rows = stmt.all(ip, start.toISOString(), end.toISOString()) as {
        seen: string;
    }[];
    return rows.map((row) => new Date(row.seen));
}
