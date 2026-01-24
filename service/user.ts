import * as userRepo from "../repo/user.ts";
import { UserType } from "../lib/types.ts";

export function ofIPs(ips: string[]): Map<string, UserType> {
    const result = new Map<string, UserType>();
    const users = userRepo.searchbyips(ips);
    for (const u of users) {
        result.set(u.ip!, u);
    }
    return result;
}
export function getbyip(ip: string): UserType | null {
    const result = userRepo.searchbyip(ip);
    if (!result) return null;
    return result as UserType;
}
export function register(userData: UserType) {
    userRepo.registerip(userData);
}

export function get_registered_ips(ips: string[]): Set<string> {
    const users = userRepo.searchbyips(ips);
    const registered_ips = new Set<string>();
    for (const u of users) {
        if (u.ip) {
            registered_ips.add(u.ip);
        }
    }
    return registered_ips;
}
