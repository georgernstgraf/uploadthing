import { db } from "./db.ts";

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
    const byIPInRange_stmt = db.prepare(
        `SELECT id, ip, userId, at
        FROM cookiepresents
        WHERE ip = ?
            AND at BETWEEN ? AND ?
        ORDER BY at DESC`,
    );
    const rows = byIPInRange_stmt.all(
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
    const byRange_stmt = db.prepare(
        `SELECT id, ip, userId, at
        FROM cookiepresents
        WHERE at BETWEEN ? AND ?
        ORDER BY ip ASC, at DESC`,
    );
    const rows = byRange_stmt.all(
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
    const create_stmt = db.prepare(
        "INSERT INTO cookiepresents (ip, userId, at) VALUES (?, ?, ?)",
    );
    create_stmt.run(ip, userId, at.toISOString());
}

export function deleteOlderThan(cutoff: Date): number {
    const deleteOlderThan_stmt = db.prepare(
        "DELETE FROM cookiepresents WHERE at < ?",
    );
    deleteOlderThan_stmt.run(cutoff.toISOString());
    return db.changes;
}

export function getLatestUserIdForIP(ip: string): number | null {
    const latestUserIdForIP_stmt = db.prepare(
        `SELECT userId FROM cookiepresents WHERE ip = ? ORDER BY at DESC LIMIT 1`,
    );
    const result = latestUserIdForIP_stmt.get(ip) as { userId: number } | undefined;
    return result?.userId ?? null;
}
