import { db } from "./db.ts";
import { IPHistoryRecord, UserHistoryRecord } from "../lib/types.ts";

/////////////////////////////////////////////////////////////////////
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
/////////////////////////////////////////////////////////////////////
const ip_history_prepared = db.prepare(
    `select email as name, at from history where  ip = ? order by at desc`,
);
export function getHistoryForIP(ip: string): IPHistoryRecord[] {
    return ip_history_prepared.all(ip);
}
/////////////////////////////////////////////////////////////////////
const allEmailFromHistory_prepared = db.prepare(
    `select distinct email from history;`,
);
export function allEmailFromHistory(): string[] {
    return allEmailFromHistory_prepared.all().map((r) => r.email);
}
/////////////////////////////////////////////////////////////////////
const historyOfEmail_prepared = db.prepare(
    "select ip,at from history where email = ? order by at desc;",
);
export function historyOfEmail(email: string): UserHistoryRecord[] {
    return historyOfEmail_prepared.all(email);
}
