/**
 * Push-Kanäle für Server-Sent Events (#161).
 *
 * Importrichtung ist bindend: `service/events.ts` darf
 * `service/exam.ts` lesen, `service/exam.ts` aber nie dieses Modul.
 * Änderungen am Examen melden sich deshalb als zustandsloser Tick über
 * `lib/event_hub.ts`; den vollständigen Snapshot baut der Stream beim
 * Senden. Der Admin-Kanal transportiert dagegen die **Komponenten**, die
 * sich geändert haben (#163). Es gibt kein Event-Log — die DB ist die
 * Wahrheit.
 */

import * as hub from "../lib/event_hub.ts";
import {
    ACTIVITY_CHANNEL,
    DROPOUTS_CHANNEL,
    EXAM_CHANNEL,
    UNTERLAGEN_CHANNEL,
} from "../lib/event_hub.ts";
import * as exam from "./exam.ts";
import type { ExamStatus } from "./exam.ts";

// Die Kanalnamen gehören dem Bus (Zyklusfreiheit, siehe
// `lib/event_hub.ts`) und werden hier nur weitergereicht.
export { ACTIVITY_CHANNEL, DROPOUTS_CHANNEL, EXAM_CHANNEL, UNTERLAGEN_CHANNEL };

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

/**
 * Komponentenname auf dem Admin-Kanal (#163).
 *
 * Der Kanal transportiert **was** sich ändert, nicht warum:
 * `cards` = das ganze Forensik-Panel neu rendern (ein Panel-Render
 * erledigt alle Kärtchen), `card-<slug>` = genau dieses eine Kärtchen,
 * `tik` = nur der MikroTik-Streifen. Die Serverzeit läuft als eigener
 * `stand`-Frame, damit der Client nach jedem Batch einen frischen Stand
 * hat.
 */
export type ActivityComponent = "cards" | `card-${string}` | "tik";

/** Gehört der Name zu einem einzelnen Kärtchen? */
export function isCardComponent(
    component: ActivityComponent,
): component is `card-${string}` {
    return component.startsWith("card-");
}

export type ActivityHooks = {
    /** Plant die Auslieferung auf der Nachlaufkante. */
    schedule: (callback: () => void, delayMs: number) => unknown;
    cancel: (handle: unknown) => void;
};

const defaultHooks: ActivityHooks = {
    // Der Timer darf den Prozess nicht am Leben halten.
    schedule: (callback, delayMs) => {
        const handle = setTimeout(callback, delayMs);
        Deno.unrefTimer(handle);
        return handle;
    },
    cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

let hooks: ActivityHooks = defaultHooks;
let pendingComponents = new Set<ActivityComponent>();
let pendingTimer: unknown = null;

/**
 * Meldet eine Admin-relevante Änderung (#163).
 *
 * Serverseitige Koaleszierung: der erste Name eines Fensters startet
 * einen Timer von `ADMIN_PUSH_MIN_MS`; alles, was bis dahin dazukommt,
 * geht als **ein** Batch mit deduplizierten Namen raus (Nachlaufkante,
 * höchstens ein Batch pro Sekunde). `cards` schluckt `card-*` desselben
 * Fensters: ein Panel-Render erledigt alle Kärtchen, die Einzelmeldungen
 * wären danach doppelte Arbeit — in beide Richtungen, denn auch ein
 * bereits vorgemerktes `cards` macht ein späteres `card-*` überflüssig.
 */
export function noteAdminActivity(component: ActivityComponent): void {
    if (component === "cards") {
        for (const pending of [...pendingComponents]) {
            if (isCardComponent(pending)) {
                pendingComponents.delete(pending);
            }
        }
        pendingComponents.add(component);
    } else if (
        // Ein vorgemerktes `cards` rendert das Kärtchen gleich mit; nur
        // `tik` bleibt daneben eigenständig.
        !(isCardComponent(component) && pendingComponents.has("cards"))
    ) {
        pendingComponents.add(component);
    }

    if (pendingTimer !== null) {
        return;
    }

    pendingTimer = hooks.schedule(() => {
        pendingTimer = null;
        const components = [...pendingComponents];
        pendingComponents = new Set();

        if (components.length === 0) {
            return;
        }

        hub.publish(ACTIVITY_CHANNEL, components);
    }, ADMIN_PUSH_MIN_MS);
}

/** Hört auf Exam-Änderungen; die Rückgabe meldet ab. */
export function subscribeExam(listener: () => void): () => void {
    return hub.subscribe<null>(EXAM_CHANNEL, () => listener());
}

/**
 * Meldet, dass sich die Unterlagen (Angaben) geändert haben (#164).
 *
 * Wie beim Exam-Kanal nur ein Tick ohne Payload: der Empfänger holt die
 * Wahrheit selbst (seinen Fragment-Endpunkt `GET /angaben-panel`). Die
 * Aufrufer sind `service/unterlagen.ts` (Upload, Löschen einzeln, Löschen
 * aller) — nicht der HTTP-Router, damit auch ein späterer Aufrufer ohne
 * Umweg über die Admin-Seite meldet.
 */
export function publishUnterlagenChanged(): void {
    hub.publish(UNTERLAGEN_CHANNEL, null);
}

/** Hört auf Unterlagen-Änderungen; die Rückgabe meldet ab. */
export function subscribeUnterlagen(listener: () => void): () => void {
    return hub.subscribe<null>(UNTERLAGEN_CHANNEL, () => listener());
}

/**
 * Meldet einen abgeschlossenen WLAN-Scan (#166).
 *
 * Wie die übrigen Kanäle nur ein Tick ohne Payload: ob der Frame beim
 * Schüler ankommt, entscheidet der Stream anhand des Exam-Zustands
 * (`snapshotExam().open`). Der Aufrufer ist `service/tik.ts`.
 */
export function publishDropoutsChanged(): void {
    hub.publish(DROPOUTS_CHANNEL, null);
}

/** Hört auf abgeschlossene Scans; die Rückgabe meldet ab. */
export function subscribeDropouts(listener: () => void): () => void {
    return hub.subscribe<null>(DROPOUTS_CHANNEL, () => listener());
}

/** Hört auf Admin-Aktivität; die Rückgabe meldet ab. */
export function subscribeActivity(
    listener: (components: string[]) => void,
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
 * Test-Hook: Koaleszierungszustand und offenes Fenster werden verworfen.
 */
export function resetActivity(): void {
    if (pendingTimer !== null) {
        hooks.cancel(pendingTimer);
    }
    pendingTimer = null;
    pendingComponents = new Set();
    hooks = defaultHooks;
}
