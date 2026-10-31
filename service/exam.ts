import * as repo from "../repo/repo.ts";
import type { ExamStatus, RepoExamStateRecord } from "../repo/exam.ts";
import { durationString } from "../lib/timefunc.ts";
import * as hub from "../lib/event_hub.ts";
import { isExamModeConfigured, setInternetActive } from "./admin.ts";
import type { ExamModeResult } from "./admin.ts";
import type { ExamModeRunner } from "./opnsense.ts";

/**
 * Meldet eine Änderung am Exam-Zustand als zustandslosen Tick (#161).
 *
 * Bewusst direkt auf den Bus statt über `service/events.ts`: dieses Modul
 * darf `service/events.ts` nicht importieren, weil dort das Gegenstück
 * (`snapshotExam()`) dieses Modul liest. Den vollständigen Snapshot baut
 * der Stream beim Senden.
 */
function publishExamChanged(): void {
    hub.publish(hub.EXAM_CHANNEL, null);
}

/**
 * Serialisiert laufende Abschlüsse (#161).
 *
 * Der Watchdog und der lazy Pfad in `getRemainingSeconds()` können im
 * selben Moment feuern. Ohne diesen Riegel würden beide
 * `setInternetActive(true)` rufen (zwei Toggle-Runden gegen die Sense)
 * und zweimal publizieren. Der zweite Aufrufer (`stop()` oder der lazy
 * Pfad) bekommt dasselbe Ergebnis; der Riegel fällt erst, wenn der
 * Abschluss fertig ist.
 */
let finishInFlight: Promise<ExamModeResult> | null = null;

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

export type { RepoExamStateRecord, ExamStatus } from "../repo/exam.ts";

/**
 * Zusammenfassung des Exam-Zustands für UI-Routen (Admin-Panel und
 * Schüler-Upload-Seite).
 */
export type ExamStatusView = {
    status: ExamStatus;
    remaining_seconds: number;
    remaining_label: string;
    /** Serverseitiger Endzeitpunkt als Epoch-Millisekunden (nur bei offener Examenzeit). */
    ends_at_ms: number | null;
    /** true, solange Uploads/Unterlagen erlaubt sind (running oder paused mit Restzeit). */
    open: boolean;
};

/**
 * Anmelde-Freigabe während eines Examens (#161).
 *
 * Während eines Examens ist keine Neuanmeldung als Schüler möglich, damit
 * niemand den Namen wechselt. Der Schalter in der Examen-Steuerung hebt
 * diese Sperre auf, **bis er wieder ausgeschaltet wird** — es gibt keine
 * Frist, weil die richtige Dauer nicht vorhersehbar ist und der Admin die
 * Entscheidung jederzeit zurücknehmen kann.
 *
 * Die Freigabe liegt **nur im Speicherprozess** und wird bei `start()` und
 * am Exam-Ende zurückgesetzt. Ein Neustart setzt sie ebenfalls zurück — und
 * setzt zugleich den Exam-Zustand auf `stopped`, sodass danach ohnehin
 * keine Anmeldesperre mehr greift.
 */
let registrationAllowed = false;
let registrationOpenedAt: Date | null = null;

/** Schaltet die Neuanmeldung für Nicht-Lehrpersonen frei oder sperrt sie. */
export function setStudentRegistrationAllowed(
    allowed: boolean,
    now: () => Date = () => new Date(),
): void {
    registrationAllowed = allowed;
    registrationOpenedAt = allowed ? now() : null;
    publishExamChanged();
}

/** Ist die Anmeldung für Nicht-Lehrpersonen gerade freigegeben? */
export function isStudentRegistrationAllowed(): boolean {
    return registrationAllowed;
}

/** Beginn der Freigabe für „freigegeben seit …"; `null` = gesperrt. */
export function getStudentRegistrationOpenedAt(): Date | null {
    return registrationOpenedAt;
}

/**
 * Setzt die Freigabe auf den Ausgangszustand zurück. Wird von `start()`
 * und am Exam-Ende gerufen; Tests brauchen denselben Weg.
 */
export function resetStudentRegistrationAllowed(): void {
    registrationAllowed = false;
    registrationOpenedAt = null;
}

/**
 * Darf sich eine Nicht-Lehrperson gerade neu anmelden?
 *
 * Außerhalb eines Examens immer; während eines Examens nur, solange die
 * Freigabe eingeschaltet ist. Die Entscheidung fällt erst hier, weil die
 * Klasse eines Menschen erst nach dem LDAP-Lookup bekannt ist.
 */
export async function isStudentRegistrationOpen(
    now: () => Date = () => new Date(),
    runner?: ExamModeRunner,
): Promise<boolean> {
    if (registrationAllowed) {
        return true;
    }

    return !(await isExamWindowOpen(now, runner));
}

/**
 * Liest den aktuellen Exam-Zustand ohne Seiteneffekte
 * (null heißt: noch kein Exam zustandslos angelegt).
 */
export function getState(): RepoExamStateRecord | null {
    return repo.exam.get();
}

/**
 * Startet ein Examen und schaltet die Exam-Sperre implizit scharf.
 *
 * Reihenfolge ist bindend: zuerst die Firewall sperren, dann den
 * Exam-Zustand schreiben. Der Zustand wird **immer** geschrieben, auch
 * wenn die Sperre scheitert — sonst zeigt der Admin-Schalter einen
 * Zustand, den die Firewall nicht hat, und der Fehler bliebe unsichtbar.
 * Das Firewall-Ergebnis geht deshalb an die Route zurück.
 */
export async function start(
    durationSeconds: number,
    now: () => Date = () => new Date(),
    runner?: ExamModeRunner,
): Promise<ExamModeResult> {
    if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) {
        throw new Error("Die Prüfungsdauer muss eine ganze Zahl größer als 0 sein.");
    }

    const state = repo.exam.get();
    if (state && (state.status === "running" || state.status === "paused")) {
        throw new Error("Es läuft bereits ein Examen.");
    }

    const startedAt = now();
    const result = await setInternetActive(false, runner);

    // Eine Freigabe aus einem früheren Examen darf nicht in dieses
    // hineinreichen.
    resetStudentRegistrationAllowed();

    repo.exam.upsert({
        status: "running",
        duration_seconds: durationSeconds,
        started_at: startedAt,
        paused_seconds: 0,
        extra_seconds: 0,
        updated_at: startedAt,
    });

    if (!result.ok && isExamModeConfigured()) {
        console.error(
            `Exam-Sperre beim Start nicht bestätigt (HTTP ${result.code}): ${result.stderr}`,
        );
    }

    publishExamChanged();

    return result;
}

export function pause(now: () => Date = () => new Date()): void {
    const state = requireState("Es läuft kein Examen, das pausiert werden kann.", "running");

    repo.exam.upsert({
        ...state,
        status: "paused",
        // updated_at dient ab jetzt als Pausenbeginn-Anker.
        updated_at: now(),
    });
    publishExamChanged();
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
    publishExamChanged();
}

/**
 * Stoppt das Examen vorzeitig und löst die Exam-Sperre
 * (Internet wieder frei).
 *
 * Liefert das Firewall-Ergebnis zurück, damit die Route einen
 * fehlgeschlagenen API-Aufruf (`ok: false`) an der Admin-UI
 * melden kann, ohne den bereits vollzogenen Zustandswechsel
 * rückgängig zu machen.
 */
export async function stop(
    runner?: ExamModeRunner,
    now: () => Date = () => new Date(),
): Promise<ExamModeResult> {
    // Läuft gerade ein Abschluss (Watchdog oder lazy Pfad), ist das
    // Ergebnis schon unterwegs: der Admin bekommt es statt eines 409.
    if (finishInFlight) {
        return await finishInFlight;
    }

    const state = requireState(
        "Es läuft kein Examen, das gestoppt werden kann.",
        "running",
        "paused",
    );

    return await finishExam(state, now, runner);
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
    publishExamChanged();
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
        await finishExam(state, now, runner);
        return 0;
    }

    return Math.ceil(remaining);
}

/**
 * UI-Sicht auf den Exam-Zustand für Admin-Panel und Schüler-Seite.
 *
 * Baut auf der autoritativen Restzeit-Berechnung auf: Ein natürlich
 * abgelaufenes Examen wird dabei wie in `getRemainingSeconds()` auf
 * `stopped` gesetzt und das Internet freigeschaltet. `ends_at_ms` ist
 * nur gesetzt, solange Examenzeit offen ist (running/paused mit
 * positiver Restzeit) — während einer Pause ist es der hypothetische
 * Endzeitpunkt ab Renderzeit, der Client zeigt in der Pause statisch
 * „pausiert" an.
 *
 * `ends_at_ms` wird aus der **exakten** Restzeit gerechnet, nicht aus
 * der aufgerundeten Anzeige: der Client zählt auf diesen Zeitpunkt
 * herunter, und eine um bis zu eine Sekunde zu späte Endzeit wäre ein
 * sichtbarer Sprung direkt nach dem Verbinden (#161).
 */
export async function getStatusView(
    now: () => Date = () => new Date(),
    runner?: ExamModeRunner,
): Promise<ExamStatusView> {
    // Schließt ein abgelaufenes Examen ab (Seiteneffekt); die exakte
    // Restzeit wird danach frisch gelesen.
    await getRemainingSeconds(now, runner);

    const nowDate = now();
    const state = repo.exam.get();
    if (!state || state.status === "idle" || state.status === "stopped") {
        return buildStatusView(state, nowDate, 0);
    }

    return buildStatusView(
        state,
        nowDate,
        computeRemainingSeconds(state, nowDate),
    );
}

/**
 * Zustandssicht **ohne Seiteneffekt** (#161).
 *
 * Wie `getStatusView()`, aber ein natürlich abgelaufenes Examen wird
 * nicht lazy beendet: der Zustand bleibt `running`, `open` ist `false`
 * und `remaining_seconds` ist `0`. Push-Snapshots dürfen den Abschluss
 * nicht auslösen, sonst würde das Publizieren des Ticks während des
 * Snapshot-Baus wieder einen Snapshot anfordern. Den fälligen Abschluss
 * übernimmt der Watchdog (Phase 4).
 */
export function getStatusViewPassive(
    now: () => Date = () => new Date(),
): ExamStatusView {
    const nowDate = now();
    const state = repo.exam.get();
    if (!state || state.status === "idle" || state.status === "stopped") {
        return buildStatusView(state, nowDate, 0);
    }

    return buildStatusView(
        state,
        nowDate,
        computeRemainingSeconds(state, nowDate),
    );
}

/**
 * Baut die Sicht aus der **exakten** Restzeit; `remaining_seconds` und
 * `remaining_label` bleiben aufgerundet (Anzeige), `ends_at_ms` ist der
 * echte Endzeitpunkt.
 */
function buildStatusView(
    state: RepoExamStateRecord | null,
    nowDate: Date,
    remainingExactSeconds: number,
): ExamStatusView {
    const remainingSeconds = Math.max(0, Math.ceil(remainingExactSeconds));

    return {
        status: state?.status ?? "idle",
        remaining_seconds: remainingSeconds,
        remaining_label: durationString(remainingSeconds),
        ends_at_ms: remainingExactSeconds > 0
            ? nowDate.getTime() + remainingExactSeconds * 1000
            : null,
        open: remainingSeconds > 0,
    };
}

/**
 * Examenzeit-Fenster für Gating-Entscheidungen (Uploads, Unterlagen):
 * offen solange der Exam-State `running` oder `paused` ist und
 * positive Restzeit übrig ist. Eine Pause hält nur den Countdown an —
 * Uploads und Downloads bleiben erlaubt.
 *
 * Nutzt die autoritative Restzeit-Berechnung, dadurch schließt sich
 * das Fenster auch, wenn ein laufendes Examen abgelaufen ist, aber
 * noch niemand den Zustand abgerufen hat.
 */
export async function isExamWindowOpen(
    now: () => Date = () => new Date(),
    runner?: ExamModeRunner,
): Promise<boolean> {
    const remaining = await getRemainingSeconds(now, runner);
    return remaining !== null && remaining > 0;
}

/**
 * Führt den Abschluss genau einmal aus; parallele Aufrufer warten auf
 * dasselbe Ergebnis (siehe `finishInFlight`).
 */
async function finishExam(
    state: RepoExamStateRecord,
    now: () => Date = () => new Date(),
    runner?: ExamModeRunner,
): Promise<ExamModeResult> {
    if (finishInFlight) {
        return await finishInFlight;
    }

    const run = (async (): Promise<ExamModeResult> => {
        // Frisch lesen: zwischen Aufrufer-Snapshot und Abschluss kann
        // eine Zusatzzeit dazugekommen sein.
        const current = repo.exam.get() ?? state;

        // Mit dem Examen endet auch die Anmelde-Freigabe.
        resetStudentRegistrationAllowed();

        repo.exam.upsert({
            ...current,
            status: "stopped",
            updated_at: now(),
        });

        // Exam Mode Off: Internet wird wieder freigeschaltet. Der
        // Zustandswechsel bleibt unabhängig vom Firewall-Ergebnis
        // bestehen; ein Fehler wird geloggt und dem Aufrufer gemeldet.
        try {
            const result = await setInternetActive(true, runner);
            if (!result.ok && isExamModeConfigured()) {
                console.error(
                    `Exam-Sperre konnte nicht gelöst werden (HTTP ${result.code}): ${result.stderr}`,
                );
            }
            return result;
        } finally {
            // Genau ein Tick pro Abschluss — auch wenn die Firewall
            // wirft. Erst hier, damit ein Panel-Refresh den echten
            // Firewall-Zustand liest und nicht den von davor.
            publishExamChanged();
        }
    })();

    finishInFlight = run;
    try {
        return await run;
    } finally {
        finishInFlight = null;
    }
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
