import { db } from "./db.ts";
import { IPHistoryRecord, UserHistoryRecord } from "../lib/types.ts";

/////////////////////////////////////////////////////////////////////
const select_event_stmt = db.prepare(
    `select id, ip, email,
  strftime('%Y-%m-%dT%H:%M:%f', datetime(at, 'localtime')) as at
  from registrations 
  where at 
  between (select strftime('%Y-%m-%dT%H:%M:%fZ',datetime(?, 'utc'))) 
  and (select strftime('%Y-%m-%dT%H:%M:%fZ',datetime(?, 'utc'))) order by at`,
);
// Takes and returns local time strings
export function getHistoryEventsRange(start: string, end: string) {
    return select_event_stmt.all(start, end);
}
/////////////////////////////////////////////////////////////////////
const ip_registrations_prepared = db.prepare(
    `select email as name, at from registrations where  ip = ? order by at desc`,
);
export function getHistoryForIP(ip: string): IPHistoryRecord[] {
    return ip_registrations_prepared.all(ip);
}
/////////////////////////////////////////////////////////////////////
const allEmailFromHistory_prepared = db.prepare(
    `select distinct email from registrations;`,
);
export function allEmailFromHistory(): string[] {
    return allEmailFromHistory_prepared.all().map((r) => r.email);
}
/////////////////////////////////////////////////////////////////////
const registrationsOfEmail_prepared = db.prepare(
    "select ip,at from registrations where email = ? order by at desc;",
);
export function registrationsOfEmail(email: string): UserHistoryRecord[] {
    return registrationsOfEmail_prepared.all(email);
}

export type LatestRegistrationRecord = {
    ip: string;
    email: string;
    at: string;
};

export function latestRegistrationsForIPsInRange(
    ips: string[],
    start: string,
    end: string,
): LatestRegistrationRecord[] {
    if (ips.length === 0) return [];
    const placeholders = ips.map(() => "?").join(",");
    const query = `
        select r.ip, r.email, r.at
        from registrations r
        join (
            select ip, max(at) as max_at
            from registrations
            where ip in (${placeholders})
              and at between
                (select strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc')))
                and (select strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc')))
            group by ip
        ) latest on r.ip = latest.ip and r.at = latest.max_at
    `;
    const stmt = db.prepare(query);
    return stmt.all(...ips, start, end) as LatestRegistrationRecord[];
}
