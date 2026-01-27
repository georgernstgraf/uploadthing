import * as repo from "../repo/repo.ts";
import { type ForensicIPCount } from "../lib/types.ts";
import { localTimeString, localDateTimeString } from "../lib/timefunc.ts";

/**
 * Register a set of IPs as seen at the current time.
 */
export function registerips(ips: string[]): number {
    return repo.ipfact.registerSeenMany(ips, new Date());
}

/**
 * Format last-seen timestamps with a 12h time/day cutoff.
 */
function formatLastSeen(lastSeenDate: Date): string {
    const now = new Date();
    const twelveHoursMs = 12 * 60 * 60 * 1000;
    const timeDiff = now.getTime() - lastSeenDate.getTime();
    
    if (timeDiff > twelveHoursMs) {
        // More than 12 hours ago - show full date using existing converter
        return localDateTimeString(lastSeenDate);
    } else {
        // Less than 12 hours ago - show only time using existing converter
        return localTimeString(lastSeenDate);
    }
}

/**
 * Get IP counts and last-seen display values in a local-time range.
 */
export function ips_with_counts_in_range(
    start_localtime: string,
    end_localtime: string,
): ForensicIPCount[] {
    const r = repo.ipfact.seenStatsForRange(start_localtime, end_localtime);
    r.forEach((e) => {
        const lastSeenDate = new Date(e.lastseen);
        e.lastseen_epoch = lastSeenDate.getTime();
        e.lastseen = formatLastSeen(lastSeenDate);
    });
    return r;
}

/**
 * Split IP count data into registered vs unregistered buckets.
 */
export function split_ips_by_registration_status(
    ip_counts: ForensicIPCount[],
    registered_ips: Set<string>,
): { with_name: ForensicIPCount[]; without_name: ForensicIPCount[] } {
    const with_name: ForensicIPCount[] = [];
    const without_name: ForensicIPCount[] = [];

    // Sort by lastseen ascending (least recently seen first)
    const sorted_ips = [...ip_counts].sort((a, b) => {
        const dateA = new Date(a.lastseen);
        const dateB = new Date(b.lastseen);
        return dateA.getTime() - dateB.getTime();
    });

    for (const ip_data of sorted_ips) {
        if (registered_ips.has(ip_data.ip)) {
            with_name.push(ip_data);
        } else {
            without_name.push(ip_data);
        }
    }

    return { with_name, without_name };
}
