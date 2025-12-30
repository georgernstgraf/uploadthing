import * as repo from "../repo/repo.ts";
import { type ForensicIPCount } from "../lib/types.ts";

export function registerips(ips: string[]): number {
    return repo.ipfact.registerSeenMany(ips, new Date());
}

export function ips_with_counts_in_range(
    start_localtime: string,
    end_localtime: string,
): ForensicIPCount[] {
    const r = repo.ipfact.seenStatsForRange(start_localtime, end_localtime);
    r.forEach((e) =>
        e.lastseen = new Date(e.lastseen).toLocaleString("de-DE", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        })
    );
    return r;
}
