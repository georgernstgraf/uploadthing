import * as repo from "../repo/repo.ts";

export function registerips(ips: string[]): number {
    return repo.ipfact.registerSeenMany(ips, new Date());
}
