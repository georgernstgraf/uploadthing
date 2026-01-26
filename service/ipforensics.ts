import * as repo from "../repo/repo.ts";
import * as service from "./service.ts";
import { UserType } from "../lib/types.ts";
import { localAutoString } from "../lib/timefunc.ts";
import config from "../lib/config.ts";

export type IpForensics = {
    ip: string;
    seen_count: number;
    seen_at_desc: string[]; // displayable times
    registrations: { at: string; user: UserType }[]; // sorted desc by at
    is_stale: boolean;
    submissions: Record<string, string>[]; // <datestring, filename>
};

export function for_range(start: Date, end: Date): IpForensics[] {
    const rv: IpForensics[] = [];
    const seen_ips = repo.ipfact.ips_in_range(start, end); // start, end: Date
    for (const ip of seen_ips) {
        const ip_forensics: IpForensics = {
            ip,
            seen_count: 0,
            seen_at_desc: [],
            registrations: [],
            is_stale: false,
            submissions: [],
        };
        const seen_at_desc = repo.ipfact.getHistoryForIPInRangeDesc(
            ip,
            start,
            end,
        );
        ip_forensics.seen_count = seen_at_desc.length;
        ip_forensics.seen_at_desc = seen_at_desc.map((dt) =>
            localAutoString(new Date(dt))
        );
        ip_forensics.registrations = service.registrations.ofIPInRange(
            ip,
            start,
            end,
        );
        if (seen_at_desc.length > 0) {
            ip_forensics.is_stale = seen_at_desc[0].valueOf() < new Date(
                Date.now() - config.forensic_stale_minutes * 60 * 1000,
            ).valueOf();
        }
        ip_forensics.submissions = service.abgaben.getIPSubmissionsInRange(
            ip,
            start,
            end,
        );
        rv.push(ip_forensics);
    }
    return rv.toSorted((a, b) => b.seen_count - a.seen_count);
}
