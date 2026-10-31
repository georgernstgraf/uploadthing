import { assert, assertEquals } from "@std/assert";
import config from "../lib/config.ts";
import * as hub from "../lib/event_hub.ts";
import * as examRepo from "../repo/exam.ts";
import {
    clearExamState,
    clearForensicsByIp,
    clearForensicsByUserEmail,
    seedExamState,
    upsertFixtureUser,
} from "../test/helpers/forensics_fixture.ts";
import * as abgaben from "./abgaben.ts";
import * as events from "./events.ts";
import {
    getState,
    resetStudentRegistrationAllowed,
    setStudentRegistrationAllowed,
} from "./exam.ts";
import { pollOnce, resetStatus } from "./tik.ts";

/**
 * Fenster mit injizierbarer Uhr und Scheduler: `flush()` löst genau den
 * Timer aus, den `noteAdminActivity()` auf der Nachlaufkante gestellt
 * hat.
 */
function fakeWindow(startIso: string) {
    let current = new Date(startIso);
    let pending: (() => void) | null = null;
    const delays: number[] = [];

    const hooks: events.ActivityHooks = {
        now: () => current,
        schedule: (callback, delayMs) => {
            delays.push(delayMs);
            pending = callback;
            return delays.length;
        },
        cancel: () => {
            pending = null;
        },
    };

    return {
        hooks,
        delays,
        advance: (ms: number) => {
            current = new Date(current.getTime() + ms);
        },
        flush: () => {
            const callback = pending;
            pending = null;
            if (!callback) {
                throw new Error("kein Fenster offen");
            }
            callback();
        },
    };
}

Deno.test("drei Gründe in einem Fenster ergeben ein dedupliziertes Event", () => {
    hub.resetHub();
    events.resetActivity();
    try {
        const window = fakeWindow("2026-10-31T10:00:00.000Z");
        events.setActivityHooks(window.hooks);

        const batches: string[][] = [];
        const unsubscribe = events.subscribeActivity((reasons) =>
            batches.push(reasons)
        );

        events.noteAdminActivity("submission");
        events.noteAdminActivity("submission");
        events.noteAdminActivity("tik");

        // Nachlaufkante: innerhalb des Fensters geht nichts raus, und es
        // wird nur ein Timer gestellt.
        assertEquals(batches, []);
        assertEquals(window.delays, [events.ADMIN_PUSH_MIN_MS]);
        assertEquals(events.ADMIN_PUSH_MIN_MS, 1000);

        window.advance(events.ADMIN_PUSH_MIN_MS);
        window.flush();

        assertEquals(batches, [["submission", "tik"]]);
        assertEquals(events.snapshotActivity(), {
            seq: 1,
            type: "activity",
            reasons: ["submission", "tik"],
            at: "2026-10-31T10:00:01.000Z",
            server_now_ms: Date.parse("2026-10-31T10:00:01.000Z"),
        });

        unsubscribe();
    } finally {
        events.resetActivity();
        hub.resetHub();
    }
});

Deno.test("nach Ablauf des Fensters beginnt ein neues Event", () => {
    hub.resetHub();
    events.resetActivity();
    try {
        const window = fakeWindow("2026-10-31T10:00:00.000Z");
        events.setActivityHooks(window.hooks);

        const batches: string[][] = [];
        events.subscribeActivity((reasons) => batches.push(reasons));

        events.noteAdminActivity("submission");
        window.advance(events.ADMIN_PUSH_MIN_MS);
        window.flush();
        assertEquals(batches, [["submission"]]);

        events.noteAdminActivity("cookie");
        // Erst der zweite Timer, und erst nach dem Fenster kommt es raus.
        assertEquals(window.delays.length, 2);
        assertEquals(batches.length, 1);

        window.advance(events.ADMIN_PUSH_MIN_MS);
        window.flush();
        assertEquals(batches, [["submission"], ["cookie"]]);
        assertEquals(events.snapshotActivity().seq, 2);
        assertEquals(events.snapshotActivity().reasons, ["cookie"]);
    } finally {
        events.resetActivity();
        hub.resetHub();
    }
});

Deno.test("snapshotExam liefert den Zustand und löst keinen Tick aus", () => {
    hub.resetHub();
    clearExamState();
    resetStudentRegistrationAllowed();
    try {
        seedExamState("running", 3600);
        // Die Freigabe ist eine Zustandsänderung und meldet sich als
        // Tick (#161); der danach gebaute Snapshot darf keinen weiteren
        // auslösen.
        setStudentRegistrationAllowed(true);
        const seqBefore = hub.currentSeq(events.EXAM_CHANNEL);
        assertEquals(seqBefore, 1);

        const before = Date.now();
        const snapshot = events.snapshotExam();
        const after = Date.now();

        assertEquals(snapshot.seq, seqBefore);
        assertEquals(snapshot.type, "exam");
        assertEquals(snapshot.status, "running");
        assertEquals(snapshot.open, true);
        assertEquals(
            snapshot.remaining_seconds > 3500 &&
                snapshot.remaining_seconds <= 3600,
            true,
        );
        assertEquals(
            snapshot.server_now_ms >= before && snapshot.server_now_ms <= after,
            true,
        );
        // Der Endzeitpunkt kommt aus der exakten Restzeit: höchstens die
        // aufgerundete Anzeige, aber nie mehr als eine Sekunde davor.
        assert(snapshot.ends_at_ms !== null);
        assert(snapshot.ends_at_ms! > snapshot.server_now_ms);
        assert(
            snapshot.ends_at_ms! <=
                snapshot.server_now_ms + snapshot.remaining_seconds * 1000,
        );
        assert(
            snapshot.ends_at_ms! >
                snapshot.server_now_ms +
                    (snapshot.remaining_seconds - 1) * 1000,
        );
        assertEquals(snapshot.registration_open, true);
        assertEquals(typeof snapshot.registration_since, "number");
        // Der Snapshot ist ein Lesevorgang: kein Tick, kein Seiteneffekt.
        assertEquals(hub.currentSeq(events.EXAM_CHANNEL), seqBefore);
    } finally {
        resetStudentRegistrationAllowed();
        clearExamState();
        hub.resetHub();
    }
});

Deno.test("snapshotExam beendet ein abgelaufenes Examen nicht selbst", () => {
    hub.resetHub();
    clearExamState();
    try {
        examRepo.upsert({
            status: "running",
            duration_seconds: 60,
            started_at: new Date(Date.now() - 3_600_000),
            paused_seconds: 0,
            extra_seconds: 0,
            updated_at: new Date(),
        });

        const snapshot = events.snapshotExam();

        assertEquals(snapshot.status, "running");
        assertEquals(snapshot.open, false);
        assertEquals(snapshot.remaining_seconds, 0);
        assertEquals(snapshot.ends_at_ms, null);
        // Kein lazy Abschluss, also auch kein Tick während des Baus.
        assertEquals(getState()?.status, "running");
        assertEquals(hub.currentSeq(events.EXAM_CHANNEL), 0);
    } finally {
        clearExamState();
        hub.resetHub();
    }
});

Deno.test("recordSubmission meldet 'submission' am Admin-Kanal (#161)", async () => {
    hub.resetHub();
    events.resetActivity();
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `activity-submission-${suffix}@example.com`;
    const ip = `10.98.${Number.parseInt(suffix.slice(0, 2), 16) % 200}.7`;

    try {
        const window = fakeWindow("2026-10-31T10:00:00.000Z");
        events.setActivityHooks(window.hooks);

        const batches: string[][] = [];
        events.subscribeActivity((reasons) => batches.push(reasons));

        const user = await upsertFixtureUser({
            email,
            name: "Activity Abgabe",
            klasse: "5AHITM",
        });

        const record = abgaben.recordSubmission(user.id, ip, "abgabe.zip");
        assertEquals(record.filename, "abgabe.zip");
        // Die Schreiboperation selbst ist still; erst die Nachlaufkante
        // fasst sie zu einem Event zusammen.
        assertEquals(batches, []);

        window.flush();
        assertEquals(batches, [["submission"]]);
    } finally {
        clearForensicsByIp(ip);
        await clearForensicsByUserEmail(email);
        events.resetActivity();
        hub.resetHub();
    }
});

Deno.test("jeder Tik-Poll meldet 'tik' — Erfolg und Ausfall (#161)", async () => {
    hub.resetHub();
    events.resetActivity();
    const originalTik = config.TIK;
    config.TIK = { url: "http://tik.test", user: "tik", password: "test" };
    resetStatus();

    try {
        const window = fakeWindow("2026-10-31T10:00:00.000Z");
        events.setActivityHooks(window.hooks);

        const batches: string[][] = [];
        events.subscribeActivity((reasons) => batches.push(reasons));

        const success = await pollOnce({
            fetcher: () => Promise.resolve(new Response("[]")),
            register: () => {},
            now: () => new Date("2026-10-31T10:00:00.000Z"),
        });
        assertEquals(success.ok, true);

        const failure = await pollOnce({
            fetcher: () => Promise.reject(new Error("Tik nicht erreichbar")),
            now: () => new Date("2026-10-31T10:00:30.000Z"),
        });
        assertEquals(failure.ok, false);

        // Beide Polls liegen im selben Fenster: ein Event, ein Grund.
        assertEquals(batches, []);
        window.flush();
        assertEquals(batches, [["tik"]]);

        // Der nächste Ausfall nach dem Fenster ist ein eigenes Ereignis.
        await pollOnce({
            fetcher: () => Promise.resolve(new Response("[]", { status: 500 })),
            now: () => new Date("2026-10-31T10:00:31.000Z"),
        });
        assertEquals(batches.length, 1);
        window.flush();
        assertEquals(batches, [["tik"], ["tik"]]);
    } finally {
        config.TIK = originalTik;
        resetStatus();
        events.resetActivity();
        hub.resetHub();
    }
});

Deno.test("publishExamChanged schickt einen Tick ohne Payload", () => {
    hub.resetHub();
    try {
        let ticks = 0;
        const payloads: unknown[] = [];
        const unsubscribe = events.subscribeExam(() => ticks++);
        const unsubscribeHub = hub.subscribe(events.EXAM_CHANNEL, (event) =>
            payloads.push(event.payload)
        );

        events.publishExamChanged();
        events.publishExamChanged();

        assertEquals(ticks, 2);
        assertEquals(payloads, [null, null]);
        assertEquals(events.snapshotExam().seq, 2);

        unsubscribe();
        unsubscribeHub();
        events.publishExamChanged();
        assertEquals(ticks, 2);
    } finally {
        hub.resetHub();
    }
});
