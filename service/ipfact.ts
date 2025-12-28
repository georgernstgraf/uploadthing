import * as repo from "../repo/repo.ts";

export function registerips(ips: string[]): number {
  return repo.ipfact.registerSeenMany(ips, new Date());
}

export function ips_with_counts_in_range(
  start_localtime: string,
  end_localtime: string,
) {
  return repo.ipfact.seenStatsForRange(start_localtime, end_localtime);
}
