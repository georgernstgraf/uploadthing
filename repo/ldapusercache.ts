import { UserType } from "../lib/types.ts";
import prisma from "./prismadb.ts";

export type LdapUserCacheRecord = {
    email: string;
    name: string;
    klasse: string | null;
};

export async function registerUser(user: UserType) {
    await prisma.ldapusercache.upsert({
        where: { email: user.email },
        update: {
            name: user.name,
            klasse: user.klasse,
            updatedat: new Date(),
        },
        create: {
            email: user.email,
            name: user.name,
            klasse: user.klasse,
            updatedat: new Date(),
        },
    });
}
export async function registerManyUsers(users: UserType[]) {
    const operations = users.map((user) =>
        prisma.ldapusercache.upsert({
            where: { email: user.email },
            update: {
                name: user.name,
                klasse: user.klasse,
                updatedat: new Date(),
            },
            create: {
                email: user.email,
                name: user.name,
                klasse: user.klasse,
                updatedat: new Date(),
            },
        })
    );
    await prisma.$transaction(operations);
}

export async function getUsersByEmails(
    emails: string[],
): Promise<LdapUserCacheRecord[]> {
    if (emails.length === 0) return [];
    return await prisma.ldapusercache.findMany({
        where: { email: { in: emails } },
        select: { email: true, name: true, klasse: true },
    });
}
