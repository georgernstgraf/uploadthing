import { db } from "./db.ts";
import { IPHistoryRecord } from "../lib/types.ts";

const select_event_stmt = db.prepare(
    `select id, ip, email,
  strftime('%Y-%m-%dT%H:%M:%f', datetime(at, 'localtime')) as at
  from history 
  where at 
  between (select strftime('%Y-%m-%dT%H:%M:%fZ',datetime(?, 'utc'))) 
  and (select strftime('%Y-%m-%dT%H:%M:%fZ',datetime(?, 'utc'))) order by at`,
);

// Takes and returns local time strings
export function getHistoryEventsRange(start: string, end: string) {
    return select_event_stmt.all(start, end);
}

const ip_history_prepared = db.prepare(
    `select a.ip, b.name, a.at from history a join user b on a.email = b.email where a.ip = ? order by a.at desc;`,
);

export function getHistoryForIP(ip: string): IPHistoryRecord[] {
    return ip_history_prepared.all(ip);
}
