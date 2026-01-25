import { UserType } from "../lib/types.ts";
import prisma from "./prismadb.ts";

export type UserRecord = {
    id: number;
    email: string;
    name: string;
    klasse: string | null;
    updatedat: Date;
};

export async function getByEmail(email: string): Promise<UserRecord | null> {
    const user = await prisma.users.findUnique({
        where: { email },
    });
    return user;
}

export async function getById(id: number): Promise<UserRecord | null> {
    const user = await prisma.users.findUnique({
        where: { id },
    });
    return user;
}

export async function create(user: UserType): Promise<UserRecord> {
    return await prisma.users.create({
        data: {
            email: user.email,
            name: user.name,
            klasse: user.klasse ?? null,
            updatedat: new Date(),
        },
    });
}

export async function updateByEmail(
    email: string,
    user: Partial<UserType>,
): Promise<UserRecord> {
    return await prisma.users.update({
        where: { email },
        data: {
            name: user.name,
            klasse: user.klasse ?? null,
            updatedat: new Date(),
        },
    });
}

export async function upsert(user: UserType): Promise<UserRecord> {
    return await prisma.users.upsert({
        where: { email: user.email },
        update: {
            name: user.name,
            klasse: user.klasse ?? null,
            updatedat: new Date(),
        },
        create: {
            email: user.email,
            name: user.name,
            klasse: user.klasse ?? null,
            updatedat: new Date(),
        },
    });
}

export async function getByIds(ids: number[]): Promise<UserRecord[]> {
    if (ids.length === 0) return [];
    return await prisma.users.findMany({
        where: { id: { in: ids } },
    });
}

export async function upsertMany(users: UserType[]): Promise<UserRecord[]> {
    const operations = users.map((user) =>
        prisma.users.upsert({
            where: { email: user.email },
            update: {
                name: user.name,
                klasse: user.klasse ?? null,
                updatedat: new Date(),
            },
            create: {
                email: user.email,
                name: user.name,
                klasse: user.klasse ?? null,
                updatedat: new Date(),
            },
        })
    );
    return await prisma.$transaction(operations);
}

export async function getByEmails(emails: string[]): Promise<UserRecord[]> {
    if (emails.length === 0) return [];
    return await prisma.users.findMany({
        where: { email: { in: emails } },
    });
}
