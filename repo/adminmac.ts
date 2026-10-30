import { db } from "./db.ts";

/**
 * Persistenz der MAC-Allowlist (#147).
 *
 * Gespeichert wird ausschließlich die kanonische Schreibweise
 * (`aa:bb:cc:dd:ee:ff`) — die Normalisierung passiert im Service
 * (`lib/mac.ts`), hier wird nur gelesen und geschrieben.
 */
const listStmt = db.prepare(
    `SELECT mac, comment, created_at
    FROM adminmac
    ORDER BY created_at DESC, mac ASC`,
);
const getStmt = db.prepare(
    "SELECT mac, comment, created_at FROM adminmac WHERE mac = ? LIMIT 1",
);
const createStmt = db.prepare(
    "INSERT INTO adminmac (mac, comment, created_at) VALUES (?, ?, ?)",
);
const deleteStmt = db.prepare("DELETE FROM adminmac WHERE mac = ?");
const existsStmt = db.prepare(
    "SELECT 1 AS present FROM adminmac WHERE mac = ? LIMIT 1",
);

export type RepoAdminMacRecord = {
    mac: string;
    comment: string;
    created_at: Date;
};

type AdminMacRow = {
    mac: string;
    comment: string;
    created_at: string;
};

function mapAdminMacRow(row: AdminMacRow): RepoAdminMacRecord {
    return {
        mac: row.mac,
        comment: row.comment,
        created_at: new Date(row.created_at),
    };
}

/** Alle freigegebenen MACs, neueste zuerst. */
export function list(): RepoAdminMacRecord[] {
    const rows = listStmt.all() as AdminMacRow[];
    return rows.map(mapAdminMacRow);
}

export function get(mac: string): RepoAdminMacRecord | null {
    const row = getStmt.get(mac) as AdminMacRow | undefined;
    return row ? mapAdminMacRow(row) : null;
}

export function exists(mac: string): boolean {
    return existsStmt.get(mac) !== undefined;
}

/**
 * Legt eine Freigabe an. Die MAC muss bereits kanonisch sein und darf noch
 * nicht existieren — beides prüft der Service.
 */
export function create(mac: string, comment: string, createdAt: Date): void {
    createStmt.run(mac, comment, createdAt.toISOString());
}

/** Entfernt eine Freigabe; `true`, wenn tatsächlich eine Zeile gelöscht wurde. */
export function remove(mac: string): boolean {
    deleteStmt.run(mac);
    return db.changes > 0;
}
