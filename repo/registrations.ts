import { db } from "./db.ts";

export type RegistrationRecord = {
    id: number;
    ip: string;
    userId: number;
    at: Date;
};

const select_event_stmt = db.prepare(
    `select id, ip, userId,
  strftime('%Y-%m-%dT%H:%M:%f', datetime(at, 'localtime')) as at
  from registrations 
  where at 
  between (select strftime('%Y-%m-%dT%H:%M:%fZ',datetime(?, 'utc'))) 
  and (select strftime('%Y-%m-%dT%H:%M:%fZ',datetime(?, 'utc'))) order by at`,
);

export function getHistoryEventsRange(start: string, end: string): RegistrationRecord[] {
    return select_event_stmt.all(start, end) as RegistrationRecord[];
}

const registrationsByIP_prepared = db.prepare(
    `select userId, at from registrations where ip = ? order by at desc`,
);

export function getRegistrationsByIP(ip: string): RegistrationRecord[] {
    return registrationsByIP_prepared.all(ip) as RegistrationRecord[];
}

export type LatestRegistrationRecord = {
    ip: string;
    userId: number;
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
        select r.ip, r.userId, r.at
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

const latestRegistrationForIP_stmt = db.prepare(
    `select userId from registrations where ip = ? order by at desc limit 1`,
);

export function getLatestRegistrationForIP(ip: string): number | null {
    const result = latestRegistrationForIP_stmt.get(ip) as { userId: number } | undefined;
    return result?.userId ?? null;
}

const create_stmt = db.prepare(
    "INSERT INTO registrations (ip, userId, at) VALUES (?, ?, ?)",
);

export function create(ip: string, userId: number, at: Date): void {
    create_stmt.run(ip, userId, at);
}
