import type { UserType } from "../lib/types.ts";
import { db } from "./db.ts";

export type RepoUserRecord = {
    id: number;
    email: string;
    name: string;
    klasse: string | null;
    updatedat: Date;
};

const getUsersByIdsBase = `
    SELECT id, email, name, klasse, updatedat
    FROM users
    WHERE id IN `;

const getByEmailStmt = db.prepare(
    "SELECT id, email, name, klasse, updatedat FROM users WHERE email = ? LIMIT 1",
);
const getByIdStmt = db.prepare(
    "SELECT id, email, name, klasse, updatedat FROM users WHERE id = ? LIMIT 1",
);
const createStmt = db.prepare(
    "INSERT INTO users (email, name, klasse, updatedat) VALUES (?, ?, ?, ?) RETURNING id, email, name, klasse, updatedat",
);
const updateByEmailStmt = db.prepare(
    "UPDATE users SET name = ?, klasse = ?, updatedat = ? WHERE email = ? RETURNING id, email, name, klasse, updatedat",
);
const upsertStmt = db.prepare(
    `INSERT INTO users (email, name, klasse, updatedat)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
         name = excluded.name,
         klasse = excluded.klasse,
         updatedat = excluded.updatedat
     RETURNING id, email, name, klasse, updatedat`,
);
const deleteByEmailStmt = db.prepare("DELETE FROM users WHERE email = ?");

type UserRow = {
    id: number;
    email: string;
    name: string;
    klasse: string | null;
    updatedat: string;
};

function mapUserRow(row: UserRow): RepoUserRecord {
    return {
        ...row,
        updatedat: new Date(row.updatedat),
    };
}

function userToDbValues(user: Partial<UserType>) {
    return {
        name: user.name,
        klasse: user.klasse ?? null,
        updatedat: new Date().toISOString(),
    };
}

/**
 * Fetch a user by email.
 */
export function getByEmail(
    email: string,
): Promise<RepoUserRecord | null> {
    const row = getByEmailStmt.get(email) as UserRow | undefined;
    return Promise.resolve(row ? mapUserRow(row) : null);
}

/**
 * Fetch a user by id.
 */
export function getById(id: number): Promise<RepoUserRecord | null> {
    const row = getByIdStmt.get(id) as UserRow | undefined;
    return Promise.resolve(row ? mapUserRow(row) : null);
}

/**
 * Create a new user record.
 */
export function create(user: UserType): Promise<RepoUserRecord> {
    const values = userToDbValues(user);
    return Promise.resolve(
        mapUserRow(createStmt.get(user.email, values.name, values.klasse, values.updatedat) as UserRow),
    );
}

/**
 * Update user fields by email.
 */
export function updateByEmail(
    email: string,
    user: Partial<UserType>,
): Promise<RepoUserRecord> {
    const values = userToDbValues(user);
    return Promise.resolve(
        mapUserRow(updateByEmailStmt.get(values.name, values.klasse, values.updatedat, email) as UserRow),
    );
}

/**
 * Upsert a user by email.
 */
export function upsert(user: UserType): Promise<RepoUserRecord> {
    const values = userToDbValues(user);
    return Promise.resolve(
        mapUserRow(upsertStmt.get(user.email, values.name, values.klasse, values.updatedat) as UserRow),
    );
}

/**
 * Fetch users by id list.
 */
export function getByIds(ids: number[]): Promise<RepoUserRecord[]> {
    if (ids.length === 0) return Promise.resolve([]);
    const placeholders = ids.map(() => "?").join(", ");
    const stmt = db.prepare(`${getUsersByIdsBase}(${placeholders})`);
    const rows = stmt.all(...ids) as UserRow[];
    return Promise.resolve(rows.map(mapUserRow));
}

/**
 * Upsert multiple users in a transaction.
 */
export function upsertMany(users: UserType[]): Promise<RepoUserRecord[]> {
    return Promise.resolve(db.transaction(() => {
        return users.map((user) => {
            const values = userToDbValues(user);
            return mapUserRow(
                upsertStmt.get(user.email, values.name, values.klasse, values.updatedat) as UserRow,
            );
        });
    })());
}

/**
 * Fetch users by email list.
 */
export function getByEmails(
    emails: string[],
): Promise<RepoUserRecord[]> {
    if (emails.length === 0) return Promise.resolve([]);
    const placeholders = emails.map(() => "?").join(", ");
    const stmt = db.prepare(
        `SELECT id, email, name, klasse, updatedat FROM users WHERE email IN (${placeholders})`,
    );
    const rows = stmt.all(...emails) as UserRow[];
    return Promise.resolve(rows.map(mapUserRow));
}

export function deleteByEmail(email: string): void {
    deleteByEmailStmt.run(email);
}

export function deleteByEmails(emails: string[]): void {
    if (emails.length === 0) return;
    const placeholders = emails.map(() => "?").join(", ");
    const stmt = db.prepare(`DELETE FROM users WHERE email IN (${placeholders})`);
    stmt.run(...emails);
}
