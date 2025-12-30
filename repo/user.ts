import { db } from "./db.ts";
import { UserType } from "../lib/types.ts";

// FIND USER BY IP
const selectbyip_prep = db.prepare(
    "select ip,name,email,klasse from user where ip = ?",
);
export function searchbyip(ip: string) {
    const result = selectbyip_prep.get(ip);
    return result; // undefined or usertype
}
export function searchbyips(ips: string[]): UserType[] {
    if (ips.length === 0) return [];
    const placeholders = ips.map(() => "?").join(",");
    const query =
        `select ip,name,email,klasse from user where ip in (${placeholders})`;
    const prep = db.prepare(query);
    const result = prep.all(...ips) as UserType[];
    return result;
}

// REGISTER USER BY IP
const insert_prep = db.prepare(
    "insert or replace into user (ip,name,email,klasse) values (?,?,?,?)",
);
export function registerip(userData: UserType) {
    insert_prep.run(
        userData.ip,
        userData.name,
        userData.email,
        userData.klasse,
    );
}
