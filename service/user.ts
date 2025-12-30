import * as user from "../repo/user.ts";
import { UserType } from "../lib/lib.ts";

export function ofIPs(ips: string[]): Map<string, string> {
    const result = new Map<string, string>();
    const users = user.searchbyips(ips);
    for (const u of users) {
        result.set(u.ip!, u.name);
    }
    return result;
}
export function getbyip(ip: string): UserType | null {
    const result = user.searchbyip(ip);
    if (!result) return null;
    return result as UserType;
}
export function register(userData: UserType) {
    user.registerip(userData);
}
