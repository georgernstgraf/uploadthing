import { db } from "./db.ts";

const registerSeen_stmt = db.prepare(
  "INSERT INTO ipfact (ip, seen) VALUES (?, ?)",
);
export function registerSeen(ip: string, seen: Date) {
  registerSeen_stmt.run(ip, seen);
}

const seenStatsForRange_sql = `SELECT ip, COUNT(*) as count FROM ipfact
    WHERE seen BETWEEN 
    (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc'))) AND
    (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc')))
    GROUP BY ip
    ORDER BY count DESC`;
const seenStatsForRange_stmt = db.prepare(
  seenStatsForRange_sql,
);
export function seenStatsForRange(start: string, end: string) {
  console.log("Executing SQL:", seenStatsForRange_sql);
  console.log("With parameters:", start, end);
  return seenStatsForRange_stmt.all(start, end);
}
export function deleteAll() {
  db.exec("DELETE FROM ipfact");
}
