import * as repo from "../repo/repo.ts";
import type { RepoExamStateRecord } from "../repo/exam.ts";
import { setInternetActive } from "./admin.ts";
import type { ExamModeResult, ExamModeRunner } from "./admin.ts";

/**
 * Zeitarithmetik (einfachste konsistente Variante mit den vorhandenen
 * Schema-Feldern):
 *
 * - `started_at` bleibt der ursprüngliche Exam-Start (wird nur bei `start()`
 *   gesetzt) und `paused_seconds` akkumuliert echte Pausenzeit.
 * - Der Beginn der aktuellen Pause wird über `updated_at` geankert: `pause()`
 *   ist die einzige Zustandsänderung während einer Pause, `resume()` liest
 *   die Pausendauer als Differenz zu `updated_at` und setzt es neu.
 * - `addExtra()` darf `updated_at` während einer Pause nicht verändern,
 *   sonst würde der Pausenbeginn verschoben.
 * - verbleibende Zeit = duration_seconds + extra_seconds
 *   − ((now − started_at) − paused_seconds); während einer Pause wird
 *   statt `now` der eingefrorene Pausenbeginn (`updated_at`) verwendet.
 */

export type { RepoExamStateRecord } from "../repo/exam.ts";

/**
 * Liest den aktuellen Exam-Zustand ohne Seiteneffekte
 * (null heißt: noch kein Exam zustandslos angelegt).
 */
export function getState(): RepoExamStateRecord | null {
    return repo.exam.get();
}

export function start(
    durationSeconds: number,
    now: () => Date = () => new Date(),
): void {
    if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) {
        throw new Error("Die Prüfungsdauer muss eine ganze Zahl größer als 0 sein.");
    }

    const state = repo.exam.get();
    if (state && (state.status === "running" || state.status === "paused")) {
        throw new Error("Es läuft bereits ein Examen.");
    }

    const startedAt = now();
    repo.exam.upsert({
        status: "running",
        duration_seconds: durationSeconds,
        started_at: startedAt,
        paused_seconds: 0,
        extra_seconds: 0,
        updated_at: startedAt,
    });
}

export function pause(now: () => Date = () => new Date()): void {
    const state = requireState("Es läuft kein Examen, das pausiert werden kann.", "running");

    repo.exam.upsert({
        ...state,
        status: "paused",
        // updated_at dient ab jetzt als Pausenbeginn-Anker.
        updated_at: now(),
    });
}

export function resume(now: () => Date = () => new Date()): void {
    const state = requireState("Das Examen ist nicht pausiert.", "paused");

    const nowDate = now();
    const pauseSeconds = Math.round(
        (nowDate.getTime() - state.updated_at.getTime()) / 1000,
    );
    repo.exam.upsert({
        ...state,
        status: "running",
        paused_seconds: state.paused_seconds + Math.max(0, pauseSeconds),
        updated_at: nowDate,
    });
}

/**
 * Stoppt das Examen vorzeitig und schaltet das Internet wieder frei
 * (Exam Mode Off).
 *
 * Liefert das Firewall-Ergebnis zurück, damit die Route einen
 * fehlgeschlagenen `exammode`-Aufruf (`ok: false`) an der Admin-UI
 * melden kann, ohne den bereits vollzogenen Zustandswechsel
 * rückgängig zu machen.
 */
export async function stop(runner?: ExamModeRunner): Promise<ExamModeResult> {
    const state = requireState(
        "Es läuft kein Examen, das gestoppt werden kann.",
        "running",
        "paused",
    );

    return await finishExam(state, runner);
}

/**
 * Verlängert die Gesamtdauer um `seconds`, auch während das Examen
 * läuft oder pausiert.
 */
export function addExtra(
    seconds: number,
    now: () => Date = () => new Date(),
): void {
    if (!Number.isInteger(seconds) || seconds <= 0) {
        throw new Error("Die Zusatzzeit muss eine ganze Zahl größer als 0 sein.");
    }

    const state = requireState(
        "Es läuft kein Examen, das verlängert werden kann.",
        "running",
        "paused",
    );

    // Während einer Pause bleibt updated_at als Pausenbeginn unverändert.
    const updatedAt = state.status === "paused" ? state.updated_at : now();
    repo.exam.upsert({
        ...state,
        extra_seconds: state.extra_seconds + seconds,
        updated_at: updatedAt,
    });
}

function computeRemainingSeconds(
    state: RepoExamStateRecord,
    nowDate: Date,
): number {
    if (!state.started_at) {
        return 0;
    }

    // Während einer Pause friert die verstrichene Laufzeit beim
    // Pausenbeginn (updated_at) ein.
    const reference = state.status === "paused"
        ? state.updated_at
        : nowDate;
    const elapsedRunSeconds =
        (reference.getTime() - state.started_at.getTime()) / 1000 -
        state.paused_seconds;

    return state.duration_seconds + state.extra_seconds - elapsedRunSeconds;
}

/**
 * Autoritative Restzeit in Sekunden.
 *
 * - null: kein Examen (idle)
 * - 0: Examen gestoppt oder natürlich abgelaufen
 * - natürlicher Ablauf wird wie `stop()` behandelt: Zustand auf stopped
 *   und Internet frei (Exam Mode Off)
 */
export async function getRemainingSeconds(
    now: () => Date = () => new Date(),
    runner?: ExamModeRunner,
): Promise<number | null> {
    const state = repo.exam.get();
    if (!state || state.status === "idle") {
        return null;
    }

    if (state.status === "stopped") {
        return 0;
    }

    const remaining = computeRemainingSeconds(state, now());
    if (remaining <= 0) {
        await finishExam(state, runner);
        return 0;
    }

    return Math.ceil(remaining);
}

async function finishExam(
    state: RepoExamStateRecord,
    runner?: ExamModeRunner,
): Promise<ExamModeResult> {
    repo.exam.upsert({
        ...state,
        status: "stopped",
        updated_at: new Date(),
    });

    // Exam Mode Off: Internet wird wieder freigeschaltet. Der
    // Zustandswechsel bleibt unabhängig vom Firewall-Ergebnis
    // bestehen; ein Fehler wird geloggt und dem Aufrufer gemeldet.
    const result = await setInternetActive(true, runner);
    if (!result.ok) {
        const details = [result.stderr, result.stdout].filter(Boolean).join(" | ");
        console.error(
            `exammode fehlgeschlagen (Exit ${result.code})${details ? `: ${details}` : ""}`,
        );
    }

    return result;
}

function requireState(
    message: string,
    ...allowed: Array<RepoExamStateRecord["status"]>
): RepoExamStateRecord {
    const state = repo.exam.get();
    if (!state || !allowed.includes(state.status)) {
        throw new Error(message);
    }

    return state;
}
