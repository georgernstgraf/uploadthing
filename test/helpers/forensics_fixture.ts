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

export async function seedNoAnomaliesScenario(params: {
    email: string;
    name: string;
    klasse: string;
    at?: Date;
    ip?: string;
    withSeen?: boolean;
    withCookiePresent?: boolean;
}): Promise<{ userId: number; ip: string }> {
    const ip = params.ip ?? LOCAL_TEST_IP;
    clearForensicsByIp(ip);
    await clearForensicsByUserEmail(params.email);

    return await seedRegistration({
        ip,
        email: params.email,
        name: params.name,
        klasse: params.klasse,
        at: params.at ?? new Date(),
        withSeen: params.withSeen,
        withCookiePresent: params.withCookiePresent ?? true,
    });
}

export async function seedUserAnomalyScenario(params: {
    email: string;
    name: string;
    klasse: string;
    firstIp: string;
    secondIp: string;
    at?: Date;
    withCookiePresent?: boolean;
}): Promise<void> {
    const at = params.at ?? new Date();
    clearForensicsByIp(params.firstIp);
    clearForensicsByIp(params.secondIp);
    await clearForensicsByUserEmail(params.email);

    await seedRegistration({
        ip: params.firstIp,
        email: params.email,
        name: params.name,
        klasse: params.klasse,
        at,
        withCookiePresent: params.withCookiePresent,
    });
    await seedRegistration({
        ip: params.secondIp,
        email: params.email,
        name: params.name,
        klasse: params.klasse,
        at,
        withCookiePresent: params.withCookiePresent,
    });
}

export async function seedSharedIpAnomalyScenario(params: {
    sharedIp: string;
    primaryUser: FixtureUserInput;
    secondaryUser: FixtureUserInput;
    secondaryIp?: string;
    at?: Date;
}): Promise<void> {
    const at = params.at ?? new Date();
    const secondaryIp = params.secondaryIp;

    clearForensicsByIp(params.sharedIp);
    if (secondaryIp) {
        clearForensicsByIp(secondaryIp);
    }
    await clearForensicsByUserEmail(params.primaryUser.email);
    await clearForensicsByUserEmail(params.secondaryUser.email);

    await seedRegistration({
        ip: params.sharedIp,
        email: params.primaryUser.email,
        name: params.primaryUser.name,
        klasse: params.primaryUser.klasse,
        at,
        withCookiePresent: true,
    });

    if (secondaryIp) {
        await seedRegistration({
            ip: secondaryIp,
            email: params.primaryUser.email,
            name: params.primaryUser.name,
            klasse: params.primaryUser.klasse,
            at,
            withCookiePresent: true,
        });
    }

    await seedRegistration({
        ip: params.sharedIp,
        email: params.secondaryUser.email,
        name: params.secondaryUser.name,
        klasse: params.secondaryUser.klasse,
        at,
        withSeen: false,
        withCookiePresent: true,
    });
}

export function seedSubmission(params: {
    userId: number;
    ip?: string;
    filename: string;
    at: Date;
}): void {
    abgabenRepo.create(params.userId, params.ip ?? LOCAL_TEST_IP, params.filename, params.at);
}
