/**
 * Push-Kanäle für Server-Sent Events (#161).
 *
 * Importrichtung ist bindend: `service/events.ts` darf
 * `service/exam.ts` lesen, `service/exam.ts` aber nie dieses Modul.
 * Änderungen am Examen melden sich deshalb als zustandsloser Tick über
 * `lib/event_hub.ts`; den vollständigen Snapshot baut der Stream beim
 * Senden. Es gibt kein Event-Log — die DB ist die Wahrheit.
 */

import * as hub from "../lib/event_hub.ts";
import { ACTIVITY_CHANNEL, EXAM_CHANNEL } from "../lib/event_hub.ts";
import * as exam from "./exam.ts";
import type { ExamStatus } from "./exam.ts";

// Die Kanalnamen gehören dem Bus (Zyklusfreiheit, siehe
// `lib/event_hub.ts`) und werden hier nur weitergereicht.
export { ACTIVITY_CHANNEL, EXAM_CHANNEL };

/**
 * Mindestabstand zwischen zwei Admin-Events. Bewusst keine
 * Env-Variable: die Koaleszierung ist eine Eigenschaft des Kanals, kein
 * Betriebsparameter.
 */
export const ADMIN_PUSH_MIN_MS = 1000;

/**
 * Meldet, dass sich am Exam-Zustand etwas geändert hat.
 *
 * Nur ein Tick, kein Payload — der Empfänger baut den Snapshot beim
 * Senden. Synchron; der Aufrufer kann das in jedem Zustandswechsel
 * mitgeben, ohne auf irgendetwas zu warten.
 */
export function publishExamChanged(): void {
    hub.publish(EXAM_CHANNEL, null);
}

export type ExamSnapshot = {
    /** Stand des Ticks, auf dem dieser Snapshot entstanden ist. */
    seq: number;
    type: "exam";
    status: ExamStatus;
    open: boolean;
    remaining_seconds: number;
    ends_at_ms: number | null;
    server_now_ms: number;
    registration_open: boolean;
    registration_since: number | null;
};

/**
 * Vollständiger Zustand für einen Exam-Frame.
 *
 * Baut auf `getStatusViewPassive()` auf: kein lazy Abschluss, keine
 * Nebenwirkung. Ein abgelaufenes, aber noch nicht aufgeräumtes Examen
 * erscheint als `status: "running"` mit `open: false`; der Watchdog
 * setzt es kurz darauf auf `stopped`.
 */
export function snapshotExam(
    now: () => Date = () => new Date(),
): ExamSnapshot {
    const at = now();
    const view = exam.getStatusViewPassive(() => at);
    const openedAt = exam.getStudentRegistrationOpenedAt();

    return {
        seq: hub.currentSeq(EXAM_CHANNEL),
        type: "exam",
        status: view.status,
        open: view.open,
        remaining_seconds: view.remaining_seconds,
        ends_at_ms: view.ends_at_ms,
        server_now_ms: at.getTime(),
        registration_open: exam.isStudentRegistrationAllowed(),
        registration_since: openedAt ? openedAt.getTime() : null,
    };
}

export type ActivitySnapshot = {
    seq: number;
    type: "activity";
    /** Gründe des zuletzt ausgelieferten Fensters, dedupliziert. */
    reasons: string[];
    /** Auslieferungszeitpunkt des Fensters (ISO). */
    at: string;
    server_now_ms: number;
};

export type ActivityHooks = {
    /** Uhr für `at` und `server_now_ms`. */
    now: () => Date;
    /** Plant die Auslieferung auf der Nachlaufkante. */
    schedule: (callback: () => void, delayMs: number) => unknown;
    cancel: (handle: unknown) => void;
};

const defaultHooks: ActivityHooks = {
    now: () => new Date(),
    // Der Timer darf den Prozess nicht am Leben halten.
    schedule: (callback, delayMs) => {
        const handle = setTimeout(callback, delayMs);
        Deno.unrefTimer(handle);
        return handle;
    },
    cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

let hooks: ActivityHooks = defaultHooks;
let pendingReasons = new Set<string>();
let pendingTimer: unknown = null;
let lastBatch: { reasons: string[]; at: string } | null = null;

/**
 * Meldet eine Admin-relevante Änderung (z. B. `submission`, `tik`).
 *
 * Serverseitige Koaleszierung: der erste Grund eines Fensters startet
 * einen Timer von `ADMIN_PUSH_MIN_MS`; alles, was bis dahin dazukommt,
 * geht als **ein** Event mit deduplizierten Gründen raus (Nachlaufkante,
 * höchstens ein Event pro Sekunde). Mehrere Gründe desselben Fensters
 * werden nur einmal gezählt.
 */
export function noteAdminActivity(reason: string): void {
    pendingReasons.add(reason);
    if (pendingTimer !== null) {
        return;
    }

    pendingTimer = hooks.schedule(() => {
        pendingTimer = null;
        const reasons = [...pendingReasons];
        pendingReasons = new Set();

        if (reasons.length === 0) {
            return;
        }

        lastBatch = { reasons, at: hooks.now().toISOString() };
        hub.publish(ACTIVITY_CHANNEL, reasons);
    }, ADMIN_PUSH_MIN_MS);
}

/** Zustand für einen Activity-Frame; ohne Fenster sind die Gründe leer. */
export function snapshotActivity(
    now: () => Date = () => hooks.now(),
): ActivitySnapshot {
    const at = now();

    return {
        seq: hub.currentSeq(ACTIVITY_CHANNEL),
        type: "activity",
        reasons: lastBatch ? [...lastBatch.reasons] : [],
        at: lastBatch?.at ?? at.toISOString(),
        server_now_ms: at.getTime(),
    };
}

/** Hört auf Exam-Änderungen; die Rückgabe meldet ab. */
export function subscribeExam(listener: () => void): () => void {
    return hub.subscribe<null>(EXAM_CHANNEL, () => listener());
}

/** Hört auf Admin-Aktivität; die Rückgabe meldet ab. */
export function subscribeActivity(
    listener: (reasons: string[]) => void,
): () => void {
    return hub.subscribe<string[]>(ACTIVITY_CHANNEL, (event) =>
        listener(event.payload));
}

/**
 * Test-Hook: Uhr und Scheduler ersetzen. Ohne Argument wieder die
 * echten (`setTimeout`, `Deno.unrefTimer`).
 */
export function setActivityHooks(next: Partial<ActivityHooks> = {}): void {
    hooks = { ...defaultHooks, ...next };
}

/**
 * Test-Hook: Koaleszierungszustand, offenes Fenster und der zuletzt
 * ausgelieferte Batch werden verworfen.
 */
export function resetActivity(): void {
    if (pendingTimer !== null) {
        hooks.cancel(pendingTimer);
    }
    pendingTimer = null;
    pendingReasons = new Set();
    lastBatch = null;
    hooks = defaultHooks;
}
