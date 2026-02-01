import { userTypeToDbInput } from "../lib/user_mapper.ts";
import type { UserType } from "../lib/types.ts";
import { db } from "./db.ts";

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
export function getByEmail(email: string): RepoUserRecord | null {
    const stmt = db.prepare(
        "SELECT id, email, name, klasse, updatedat FROM users WHERE email = ?",
    );
    const row = stmt.get(email) as {
        id: number;
        email: string;
        name: string;
        klasse: string | null;
        updatedat: string;
    } | undefined;
    if (!row) return null;
    return {
        ...row,
        updatedat: new Date(row.updatedat),
    };
}

/**
 * Fetch a user by id.
 */
export function getById(id: number): RepoUserRecord | null {
    const stmt = db.prepare(
        "SELECT id, email, name, klasse, updatedat FROM users WHERE id = ?",
    );
    const row = stmt.get(id) as {
        id: number;
        email: string;
        name: string;
        klasse: string | null;
        updatedat: string;
    } | undefined;
    if (!row) return null;
    return {
        ...row,
        updatedat: new Date(row.updatedat),
    };
}

/**
 * Create a new user record.
 */
export function create(user: UserType): RepoUserRecord {
    const insertData = userTypeToDbInput(user);
    const stmt = db.prepare(
        "INSERT INTO users (email, name, klasse, updatedat) VALUES (?, ?, ?, ?)",
    );
    stmt.run(
        insertData.email,
        insertData.name,
        insertData.klasse,
        insertData.updatedat.toISOString(),
    );
    const id = db.lastInsertRowId as number;
    const created = getById(id);
    if (!created) {
        throw new Error("Failed to create user - could not retrieve after insert");
    }
    return created;
}

/**
 * Update user fields by email.
 */
export function updateByEmail(
    email: string,
    user: Partial<UserType>,
): RepoUserRecord {
    const stmt = db.prepare(
        "UPDATE users SET name = ?, klasse = ?, updatedat = ? WHERE email = ?",
    );
    stmt.run(
        user.name,
        user.klasse ?? null,
        new Date().toISOString(),
        email,
    );
    const updated = getByEmail(email);
    if (!updated) {
        throw new Error("Failed to update user - user not found after update");
    }
    return updated;
}

/**
 * Upsert a user by email (insert or update).
 */
export function upsert(user: UserType): RepoUserRecord {
    const insertData = userTypeToDbInput(user);
    const stmt = db.prepare(
        `INSERT INTO users (email, name, klasse, updatedat)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET
         name = excluded.name,
         klasse = excluded.klasse,
         updatedat = excluded.updatedat`,
    );
    stmt.run(
        insertData.email,
        insertData.name,
        insertData.klasse,
        insertData.updatedat.toISOString(),
    );
    const result = getByEmail(user.email);
    if (!result) {
        throw new Error("Failed to upsert user - could not retrieve after operation");
    }
    return result;
}

/**
 * Fetch users by id list.
 */
export function getByIds(ids: number[]): RepoUserRecord[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    const stmt = db.prepare(
        `SELECT id, email, name, klasse, updatedat FROM users WHERE id IN (${placeholders})`,
    );
    const rows = stmt.all(...ids) as {
        id: number;
        email: string;
        name: string;
        klasse: string | null;
        updatedat: string;
    }[];
    return rows.map((row) => ({
        ...row,
        updatedat: new Date(row.updatedat),
    }));
}

/**
 * Upsert multiple users (batch insert with on conflict update).
 */
export function upsertMany(usersData: UserType[]): RepoUserRecord[] {
    if (usersData.length === 0) return [];

    const upsertStmt = db.prepare(
        `INSERT INTO users (email, name, klasse, updatedat)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET
         name = excluded.name,
         klasse = excluded.klasse,
         updatedat = excluded.updatedat`,
    );

    // Use transaction for batch insert
    db.exec("BEGIN");
    try {
        for (const user of usersData) {
            const insertData = userTypeToDbInput(user);
            upsertStmt.run(
                insertData.email,
                insertData.name,
                insertData.klasse,
                insertData.updatedat.toISOString(),
            );
        }
        db.exec("COMMIT");
    } catch (e) {
        db.exec("ROLLBACK");
        throw e;
    }

    // Fetch all updated users by email
    const emails = usersData.map((u) => u.email);
    return getByEmails(emails);
}

/**
 * Fetch users by email list.
 */
export function getByEmails(emails: string[]): RepoUserRecord[] {
    if (emails.length === 0) return [];
    const placeholders = emails.map(() => "?").join(",");
    const stmt = db.prepare(
        `SELECT id, email, name, klasse, updatedat FROM users WHERE email IN (${placeholders})`,
    );
    const rows = stmt.all(...emails) as {
        id: number;
        email: string;
        name: string;
        klasse: string | null;
        updatedat: string;
    }[];
    return rows.map((row) => ({
        ...row,
        updatedat: new Date(row.updatedat),
    }));
}
