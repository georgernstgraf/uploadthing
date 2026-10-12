import { db } from "./db.ts";

export type ExamStatus = "idle" | "running" | "paused" | "stopped";

export type RepoExamStateRecord = {
    status: ExamStatus;
    duration_seconds: number;
    started_at: Date | null;
    paused_seconds: number;
    extra_seconds: number;
    updated_at: Date;
};

const selectStmt = db.prepare(
    `SELECT status, duration_seconds, started_at, paused_seconds, extra_seconds, updated_at
    FROM examstate
    WHERE id = 1`,
);
const countStmt = db.prepare(
    "SELECT COUNT(*) AS count FROM examstate WHERE id = 1",
);
const upsertStmt = db.prepare(
    `INSERT INTO examstate (id, status, duration_seconds, started_at, paused_seconds, extra_seconds, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        duration_seconds = excluded.duration_seconds,
        started_at = excluded.started_at,
        paused_seconds = excluded.paused_seconds,
        extra_seconds = excluded.extra_seconds,
        updated_at = excluded.updated_at`,
);

type ExamStateRow = {
    status: string;
    duration_seconds: number;
    started_at: string | null;
    paused_seconds: number;
    extra_seconds: number;
    updated_at: string;
};

/**
 * Liest die Singleton-Zeile (id = 1) des Exam-Zustands
 * oder null, wenn noch keine Zeile existiert.
 */
export function get(): RepoExamStateRecord | null {
    const row = selectStmt.get() as ExamStateRow | undefined;
    if (!row) {
        return null;
    }

    return {
        status: row.status as ExamStatus,
        duration_seconds: Number(row.duration_seconds),
        started_at: row.started_at ? new Date(row.started_at) : null,
        paused_seconds: Number(row.paused_seconds),
        extra_seconds: Number(row.extra_seconds),
        updated_at: new Date(row.updated_at),
    };
}

export function exists(): boolean {
    const row = countStmt.get() as { count: number };
    return Number(row.count) === 1;
}

/**
 * Schreibt die Singleton-Zeile (id = 1) per Upsert.
 * Timestamps werden als UTC-ISO-Strings persistiert.
 */
export function upsert(state: RepoExamStateRecord): void {
    upsertStmt.run(
        state.status,
        state.duration_seconds,
        state.started_at ? state.started_at.toISOString() : null,
        state.paused_seconds,
        state.extra_seconds,
        state.updated_at.toISOString(),
    );
}
