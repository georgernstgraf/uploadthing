import { db } from "./db.ts";

const byIPInRangeStmt = db.prepare(
    `SELECT id, ip, userId, at
    FROM cookiepresents
    WHERE ip = ?
        AND at BETWEEN ? AND ?
    ORDER BY at DESC`,
);
const byRangeStmt = db.prepare(
    `SELECT id, ip, userId, at
    FROM cookiepresents
    WHERE at BETWEEN ? AND ?`,
);
const createStmt = db.prepare(
    "INSERT INTO cookiepresents (ip, userId, at) VALUES (?, ?, ?)",
);
const deleteOlderThanStmt = db.prepare(
    "DELETE FROM cookiepresents WHERE at < ?",
);
const latestUserIdForIPStmt = db.prepare(
    `SELECT userId FROM cookiepresents WHERE ip = ? ORDER BY at DESC LIMIT 1`,
);

export type RepoCookiePresentRecord = {
    id: number;
    ip: string;
    userId: number;
    at: Date;
};

export function byIPInRange(
    ip: string,
    start: Date,
    end: Date,
): RepoCookiePresentRecord[] {
    const rows = byIPInRangeStmt.all(
        ip,
        start.toISOString(),
        end.toISOString(),
    ) as { id: number; ip: string; userId: number; at: string }[];
    return rows.map((row) => ({
        id: row.id,
        ip: row.ip,
        userId: row.userId,
        at: new Date(row.at),
    }));
}

export function byRange(
    start: Date,
    end: Date,
): RepoCookiePresentRecord[] {
    const rows = byRangeStmt.all(
        start.toISOString(),
        end.toISOString(),
    ) as { id: number; ip: string; userId: number; at: string }[];
    return rows.map((row) => ({
        id: row.id,
        ip: row.ip,
        userId: row.userId,
        at: new Date(row.at),
    }));
}

export function create(ip: string, userId: number, at: Date): void {
    createStmt.run(ip, userId, at.toISOString());
}

export function deleteOlderThan(cutoff: Date): number {
    deleteOlderThanStmt.run(cutoff.toISOString());
    return db.changes;
}

export function getLatestUserIdForIP(ip: string): number | null {
    const result = latestUserIdForIPStmt.get(ip) as { userId: number } | undefined;
    return result?.userId ?? null;
}
