import { userTypeToDbInput } from "../lib/user_mapper.ts";
import type { UserType } from "../lib/types.ts";
import { eq, inArray } from "drizzle-orm";
import { drizzleDb } from "./drizzle.ts";
import { users as usersTable } from "./schema.ts";

export type RepoUserRecord = {
    id: number;
    email: string;
    name: string;
    klasse: string | null;
    updatedat: Date;
};

type RepoUserRow = typeof usersTable.$inferSelect;
type DrizzleTx = Parameters<typeof drizzleDb.transaction>[0] extends (
    tx: infer Tx,
) => Promise<unknown> ? Tx
    : never;

function mapUserRow(row: RepoUserRow): RepoUserRecord {
    return {
        ...row,
        updatedat: row.updatedat,
    };
}

/**
 * Fetch a user by email.
 */
export async function getByEmail(
    email: string,
): Promise<RepoUserRecord | null> {
    const rows = await drizzleDb
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email));
    const user = rows[0];
    return user ? mapUserRow(user) : null;
}

/**
 * Fetch a user by id.
 */
export async function getById(id: number): Promise<RepoUserRecord | null> {
    const rows = await drizzleDb
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, id));
    const user = rows[0];
    return user ? mapUserRow(user) : null;
}

/**
 * Create a new user record.
 */
export async function create(user: UserType): Promise<RepoUserRecord> {
    const [created] = await drizzleDb
        .insert(usersTable)
        .values(userTypeToDbInput(user))
        .returning();
    return mapUserRow(created);
}

/**
 * Update user fields by email.
 */
export async function updateByEmail(
    email: string,
    user: Partial<UserType>,
): Promise<RepoUserRecord> {
    const [updated] = await drizzleDb
        .update(usersTable)
        .set({
            name: user.name,
            klasse: user.klasse ?? null,
            updatedat: new Date(),
        })
        .where(eq(usersTable.email, email))
        .returning();
    return mapUserRow(updated);
}

/**
 * Upsert a user by email.
 */
export async function upsert(user: UserType): Promise<RepoUserRecord> {
    const data = userTypeToDbInput(user);
    const [record] = await drizzleDb
        .insert(usersTable)
        .values(data)
        .onConflictDoUpdate({
            target: usersTable.email,
            set: data,
        })
        .returning();
    return mapUserRow(record);
}

/**
 * Fetch users by id list.
 */
export async function getByIds(ids: number[]): Promise<RepoUserRecord[]> {
    if (ids.length === 0) return [];
    const rows = await drizzleDb
        .select()
        .from(usersTable)
        .where(inArray(usersTable.id, ids));
    return rows.map(mapUserRow);
}

/**
 * Upsert multiple users in a transaction.
 */
export async function upsertMany(userList: UserType[]): Promise<RepoUserRecord[]> {
    return await drizzleDb.transaction(async (tx: DrizzleTx) => {
        const results: RepoUserRecord[] = [];
        for (const user of userList) {
            const data = userTypeToDbInput(user);
            const [record] = await tx
                .insert(usersTable)
                .values(data)
                .onConflictDoUpdate({
                    target: usersTable.email,
                    set: data,
                })
                .returning();
            results.push(mapUserRow(record));
        }
        return results;
    });
}

/**
 * Fetch users by email list.
 */
export async function getByEmails(
    emails: string[],
): Promise<RepoUserRecord[]> {
    if (emails.length === 0) return [];
    const rows = await drizzleDb
        .select()
        .from(usersTable)
        .where(inArray(usersTable.email, emails));
    return rows.map(mapUserRow);
}
