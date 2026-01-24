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
export function registerSeen(ip: string, seen: Date) {
    registerSeen_stmt.run(ip, seen);
}
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

export function seenStatsForRange(
    start: string,
    end: string,
): ForensicIPCount[] {
    console.log(
        `SEENSTATSFORRANGE called with params START: ${start}, END: ${end}`,
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
export function deleteAll() {
    db.exec("DELETE FROM ipfact");
}
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
