import { assertEquals } from "@std/assert";
import * as examRepo from "./exam.ts";
import { db } from "./db.ts";
import type { RepoExamStateRecord } from "./exam.ts";

function sampleState(overrides: Partial<RepoExamStateRecord> = {}): RepoExamStateRecord {
    const startedAt = new Date("2026-10-12T08:00:00.000Z");
    return {
        status: "running",
        duration_seconds: 3600,
        started_at: startedAt,
        paused_seconds: 0,
        extra_seconds: 0,
        updated_at: startedAt,
        ...overrides,
    };
}

Deno.test("get liefert null, wenn keine Singleton-Zeile existiert", () => {
    try {
        db.exec("DELETE FROM examstate");
        assertEquals(examRepo.get(), null);
        assertEquals(examRepo.exists(), false);
    } finally {
        db.exec("DELETE FROM examstate");
    }
});

Deno.test("upsert legt die Singleton-Zeile mit id 1 an", () => {
    try {
        db.exec("DELETE FROM examstate");
        examRepo.upsert(sampleState());

        assertEquals(examRepo.exists(), true);
        const state = examRepo.get();
        assertEquals(state, sampleState());

        const idRow = db.prepare("SELECT id FROM examstate").get() as { id: number };
        assertEquals(Number(idRow.id), 1);
    } finally {
        db.exec("DELETE FROM examstate");
    }
});

Deno.test("upsert ersetzt die bestehende Singleton-Zeile, statt eine zweite anzulegen", () => {
    try {
        db.exec("DELETE FROM examstate");
        examRepo.upsert(sampleState());
        examRepo.upsert(sampleState({
            status: "paused",
            paused_seconds: 120,
            updated_at: new Date("2026-10-12T08:05:00.000Z"),
        }));

        const countRow = db.prepare("SELECT COUNT(*) AS count FROM examstate").get() as {
            count: number;
        };
        assertEquals(Number(countRow.count), 1);

        const state = examRepo.get();
        assertEquals(state, sampleState({
            status: "paused",
            paused_seconds: 120,
            updated_at: new Date("2026-10-12T08:05:00.000Z"),
        }));
    } finally {
        db.exec("DELETE FROM examstate");
    }
});

Deno.test("Timestamps werden als UTC-ISO-Strings persistiert", () => {
    try {
        db.exec("DELETE FROM examstate");
        const startedAt = new Date("2026-10-12T09:30:15.500Z");
        examRepo.upsert(sampleState({ started_at: startedAt, updated_at: startedAt }));

        const row = db.prepare(
            "SELECT started_at, updated_at FROM examstate WHERE id = 1",
        ).get() as { started_at: string; updated_at: string };
        assertEquals(row.started_at, startedAt.toISOString());
        assertEquals(row.updated_at, startedAt.toISOString());
    } finally {
        db.exec("DELETE FROM examstate");
    }
});

Deno.test("get persistiert started_at = null für Zustände ohne Start", () => {
    try {
        db.exec("DELETE FROM examstate");
        examRepo.upsert(sampleState({ status: "stopped", started_at: null }));

        const state = examRepo.get();
        assertEquals(state?.started_at, null);
    } finally {
        db.exec("DELETE FROM examstate");
    }
});
