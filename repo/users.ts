import { userTypeToDbInput } from "../lib/user_mapper.ts";
import type { UserType } from "../lib/types.ts";
import prisma from "./prismadb.ts";

export type RepoUserRecord = {
    id: number;
    email: string;
    name: string;
    klasse: string | null;
    updatedat: Date;
};

/**
 * Fetch a user by email.
 */
export async function getByEmail(
    email: string,
): Promise<RepoUserRecord | null> {
    const user = await prisma.users.findUnique({
        where: { email },
    });
    return user;
}

/**
 * Fetch a user by id.
 */
export async function getById(id: number): Promise<RepoUserRecord | null> {
    return await prisma.users.findUnique({
        where: { id },
    });
}

/**
 * Create a new user record.
 */
export async function create(user: UserType): Promise<RepoUserRecord> {
    return await prisma.users.create({
        data: userTypeToDbInput(user),
    });
}

/**
 * Update user fields by email.
 */
export async function updateByEmail(
    email: string,
    user: Partial<UserType>,
): Promise<RepoUserRecord> {
    return await prisma.users.update({
        where: { email },
        data: {
            name: user.name,
            klasse: user.klasse ?? null,
            updatedat: new Date(),
        },
    });
}

/**
 * Upsert a user by email.
 */
export async function upsert(user: UserType): Promise<RepoUserRecord> {
    return await prisma.users.upsert({
        where: { email: user.email },
        update: userTypeToDbInput(user),
        create: userTypeToDbInput(user),
    });
}

/**
 * Fetch users by id list.
 */
export async function getByIds(ids: number[]): Promise<RepoUserRecord[]> {
    if (ids.length === 0) return [];
    return await prisma.users.findMany({
        where: { id: { in: ids } },
    });
}

/**
 * Upsert multiple users in a transaction.
 */
export async function upsertMany(users: UserType[]): Promise<RepoUserRecord[]> {
    const operations = users.map((user) =>
        prisma.users.upsert({
            where: { email: user.email },
            update: userTypeToDbInput(user),
            create: userTypeToDbInput(user),
        })
    );
    return await prisma.$transaction(operations);
}

/**
 * Fetch users by email list.
 */
export async function getByEmails(
    emails: string[],
): Promise<RepoUserRecord[]> {
    if (emails.length === 0) return [];
    return await prisma.users.findMany({
        where: { email: { in: emails } },
    });
}
