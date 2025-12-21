import { db } from "./db.ts";

const select_event_stmt = db.prepare(
  `select * from history 
  where at 
  between (select strftime('%Y-%m-%dT%H:%M:%fZ',datetime(?, 'utc'))) 
  and (select strftime('%Y-%m-%dT%H:%M:%fZ',datetime(?, 'utc'))) order by at`,
);

export function selectHistoryRange(start: string, end: string) {
  return select_event_stmt.all(start, end);
}

export { db };
