import { db } from "./db.ts";

export type AbgabeRecord = {
    id: number;
    userId: number;
    filename: string;
    at: Date;
};

const create_stmt = db.prepare(
    "INSERT INTO abgaben (userId, filename, at) VALUES (?, ?, ?)",
);

export function create(userId: number, filename: string, at: Date): AbgabeRecord {
    create_stmt.run(userId, filename, at);
    const id = db.lastInsertRowId as number;
    return { id, userId, filename, at };
}

const getByUser_stmt = db.prepare(
    "SELECT id, userId, filename, at FROM abgaben WHERE userId = ? ORDER BY at DESC",
);

export function getByUserId(userId: number): AbgabeRecord[] {
    return getByUser_stmt.all(userId) as AbgabeRecord[];
}

const getByRange_stmt = db.prepare(
    `SELECT id, userId, filename, at FROM abgaben
    WHERE at BETWEEN
    (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc'))) AND
    (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc')))
    ORDER BY at DESC`,
);

export function getByDateRange(start: string, end: string): AbgabeRecord[] {
    return getByRange_stmt.all(start, end) as AbgabeRecord[];
}
