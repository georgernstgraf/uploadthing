import { db } from "../../repo/db.ts";
import * as abgabenRepo from "../../repo/abgaben.ts";
import * as cookiepresentsRepo from "../../repo/cookiepresents.ts";
import * as ipfactRepo from "../../repo/ipfact.ts";
import * as registrationsRepo from "../../repo/registrations.ts";
import * as usersRepo from "../../repo/users.ts";

export const LOCAL_TEST_IP = "127.0.0.1";

export type FixtureUserInput = {
    email: string;
    name: string;
    klasse: string;
};

export async function upsertFixtureUser(user: FixtureUserInput) {
    return await usersRepo.upsert(user);
}

export function clearForensicsByIp(ip: string): void {
    db.exec(`DELETE FROM abgaben WHERE ip = '${ip}'`);
    db.exec(`DELETE FROM cookiepresents WHERE ip = '${ip}'`);
    db.exec(`DELETE FROM registrations WHERE ip = '${ip}'`);
    db.exec(`DELETE FROM ipfact WHERE ip = '${ip}'`);
}

export async function clearForensicsByUserEmail(email: string): Promise<void> {
    const user = await usersRepo.getByEmail(email);
    if (!user) return;

    db.exec(`DELETE FROM abgaben WHERE userId = ${user.id}`);
    db.exec(`DELETE FROM cookiepresents WHERE userId = ${user.id}`);
    db.exec(`DELETE FROM registrations WHERE userId = ${user.id}`);
    usersRepo.deleteByEmail(email);
}

export function resetLocalhostForensics(): void {
    clearForensicsByIp(LOCAL_TEST_IP);
}

export async function seedRegistration(params: {
    ip?: string;
    email: string;
    name: string;
    klasse: string;
    at: Date;
    withSeen?: boolean;
    withCookiePresent?: boolean;
}): Promise<{ userId: number; ip: string }> {
    const ip = params.ip ?? LOCAL_TEST_IP;
    const user = await upsertFixtureUser({
        email: params.email,
        name: params.name,
        klasse: params.klasse,
    });

    if (params.withSeen ?? true) {
        ipfactRepo.registerSeen(ip, params.at);
    }

    registrationsRepo.create(ip, user.id, params.at);

    if (params.withCookiePresent) {
        await cookiepresentsRepo.create(ip, user.id, params.at);
    }

    return { userId: user.id, ip };
}

export function seedSubmission(params: {
    userId: number;
    ip?: string;
    filename: string;
    at: Date;
}): void {
    abgabenRepo.create(params.userId, params.ip ?? LOCAL_TEST_IP, params.filename, params.at);
}
