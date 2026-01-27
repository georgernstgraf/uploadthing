import * as repo from "../repo/repo.ts";
import * as service from "./service.ts";
import { UserType } from "../lib/types.ts";
import { localAutoString } from "../lib/timefunc.ts";
import config from "../lib/config.ts";

export type ServiceIpForensics = {
    ip: string;
    seen_count: number;
    seen_at_desc: string[]; // displayable times
    registrations: { at: string; user: UserType | null }[]; // sorted desc by at
    is_stale: boolean;
    submissions: { at: string; filename: string }[];
    has_submission: boolean;
};

/**
 * Aggregate forensic data for all IPs seen in a time range.
 */
export async function for_range(
    start: Date,
    end: Date,
    calculate_stale: boolean,
): Promise<{
    registered: ServiceIpForensics[];
    unregistered: ServiceIpForensics[];
}> {
    const rv: ServiceIpForensics[] = [];
    const seen_ips = repo.ipfact.ips_in_range(start, end); // start, end: Date
    for (const ip of seen_ips) {
        const ip_forensics: ServiceIpForensics = {
            ip,
            seen_count: 0,
            seen_at_desc: [],
            registrations: [],
            is_stale: false,
            submissions: [],
            has_submission: false,
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
        ip_forensics.registrations = await service.registrations.byIPInRange(
            ip,
            start,
            end,
        );
        if (calculate_stale && seen_at_desc.length > 0) {
            ip_forensics.is_stale = seen_at_desc[0].valueOf() < new Date(
                Date.now() - config.forensic_stale_minutes * 60 * 1000,
            ).valueOf();
        }
        ip_forensics.submissions = service.abgaben.getIPSubmissionsInRange(
            ip,
            start,
            end,
        );
        ip_forensics.has_submission = ip_forensics.submissions.length > 0;
        rv.push(ip_forensics);
    }
    rv.sort((a, b) => {
        const left = a.seen_at_desc[0] ?? "";
        const right = b.seen_at_desc[0] ?? "";
        return right.localeCompare(left);
    });
    const registered = rv.filter((ipf) => ipf.registrations.length > 0);
    const unregistered = rv.filter((ipf) => ipf.registrations.length === 0);
    return { registered, unregistered };
}
