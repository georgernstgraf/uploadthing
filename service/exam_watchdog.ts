/**
 * Pünktlicher Abschluss eines abgelaufenen Examens (#161).
 *
 * `getRemainingSeconds()` beendet ein abgelaufenes Examen zwar immer noch
 * lazy, aber nur, wenn jemand nachfragt. Ohne Watchdog bliebe die Sperre
 * stehen, wenn während des Examens niemand die Seiten neu lädt — die
 * Schüler sähen ein zu Ende gelaufenes Formular, die Firewall bliebe
 * gesperrt. Der Watchdog stellt auf die Restzeit einen Timer und stößt
 * beim Feuern genau den lazy Pfad an; der erledigt Zustandswechsel,
 * Firewall und Tick.
 *
 * Der Snapshot wird **ohne Seiteneffekt** gelesen
 * (`getStatusViewPassive()`): ein noch nicht aufgeräumtes, abgelaufenes
 * Examen soll den Timer nicht aus dem Tick-Handler heraus neu bauen.
 * Nach jedem Tick wird neu gerechnet — Pause, Fortsetzen und Zusatzzeit
 * ändern die Restzeit, ohne dass der Watchdog sie kennen müsste.
 */

import * as hub from "../lib/event_hub.ts";
import * as exam from "./exam.ts";
import type { ExamModeRunner } from "./opnsense.ts";

/**
 * Zuschlag auf die Restzeit. `remaining_seconds` ist aufgerundet; der
 * Zuschlag fängt Rundung und Timer-Jitter ab, damit der Watchdog nie
 * vor dem tatsächlichen Ablauf feuert (sonst liefe der Abschluss in den
 * `remaining > 0`-Zweig und müsste neu planen).
 */
export const SAFETY_MARGIN_MS = 250;

export type WatchdogScheduler = {
    schedule: (callback: () => void, delayMs: number) => unknown;
    cancel: (handle: unknown) => void;
};

const defaultScheduler: WatchdogScheduler = {
    schedule: (callback, delayMs) => {
        const handle = setTimeout(callback, delayMs);
        // Der Timer darf den Prozess nicht am Leben halten.
        Deno.unrefTimer(handle);
        return handle;
    },
    cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

let scheduler: WatchdogScheduler = defaultScheduler;
let timer: unknown = null;
let unsubscribe: (() => void) | null = null;
let enabled = false;
let currentNow: () => Date = () => new Date();
let currentRunner: ExamModeRunner | undefined;

function clearTimer(): void {
    if (timer !== null) {
        scheduler.cancel(timer);
        timer = null;
    }
}

/**
 * Plant den Abschluss für die aktuelle Restzeit und bleibt am Exam-Kanal
 * dran. Idempotent: jeder Aufruf ersetzt den laufenden Timer.
 *
 * Nur `status === "running"` ist scharf. `paused` entwaffnet (die
 * eingefrorene Restzeit läuft nicht ab), `stopped`/`idle` ebenso. Ein
 * bereits abgelaufenes, aber noch nicht aufgeräumtes Examen hat
 * `remaining_seconds: 0` und feuert nach dem Sicherheitsabstand — das ist
 * der Aufholpfad nach einem verpassten Tick.
 */
export function arm(
    now: () => Date = () => new Date(),
    runner?: ExamModeRunner,
): void {
    currentNow = now;
    currentRunner = runner;
    enabled = true;

    // Ein Abo für die ganze Lebenszeit des Prozesses; der Tick-Handler
    // re-armt mit denselben Argumenten.
    if (!unsubscribe) {
        unsubscribe = hub.subscribe(hub.EXAM_CHANNEL, () => {
            arm(currentNow, currentRunner);
        });
    }

    clearTimer();

    const view = exam.getStatusViewPassive(currentNow);
    if (view.status !== "running") {
        return;
    }

    const delayMs = Math.max(0, view.remaining_seconds) * 1000 +
        SAFETY_MARGIN_MS;
    timer = scheduler.schedule(fire, delayMs);
}

function fire(): void {
    timer = null;

    // Der lazy Pfad beendet das Examen und publiziert dadurch `stopped`.
    // Ist wider Erwarten noch Zeit übrig (Uhren sprung), plant der
    // Aufruf danach neu.
    exam.getRemainingSeconds(currentNow, currentRunner)
        .catch((error) => {
            console.error(
                "Exam-Watchdog: Abschluss ist gescheitert:",
                error,
            );
        })
        .finally(() => {
            // Nach `disarm()` (Shutdown, Testende) nicht wieder scharf
            // werden — sonst greift ein verspäteter Timer in eine bereits
            // geschlossene Datenbank.
            if (!enabled || timer !== null) {
                return;
            }
            try {
                arm(currentNow, currentRunner);
            } catch (error) {
                // Ein werfender Timer-Callback würde den Prozess beenden;
                // ein kaputter Zustand ist kein Grund dafür.
                console.error(
                    "Exam-Watchdog: Neuplanung ist gescheitert:",
                    error,
                );
            }
        });
}

/**
 * Entwaffnet den Watchdog: Timer und Kanal-Abo. Beim Shutdown Pflicht,
 * damit kein Timer mehr in eine geschlossene Datenbank greift; Tests
 * damit keinen Zustand in den nächsten Fall tragen.
 */
export function disarm(): void {
    enabled = false;
    clearTimer();
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }
}

/** Test-Hook: Scheduler ersetzen; ohne Argument wieder die echten Timer. */
export function setWatchdogScheduler(
    next: Partial<WatchdogScheduler> = {},
): void {
    scheduler = { ...defaultScheduler, ...next };
}
