import config from "../lib/config.ts";
import type { TikConfig } from "../lib/config.ts";
import * as repo from "../repo/repo.ts";
import { localAdminIpString } from "../lib/timefunc.ts";

/**
 * Polling der WLAN-Registrierungstabelle des MikroTik (#145).
 *
 * Der Abruf läuft ausschließlich lesend über die REST-API
 * (`GET /rest/interface/wireless/registration-table`). Es gibt keinen
 * Schreibpfad, keinen externen Cronjob und keinen Loopback-HTTP-Umweg:
 * die App holt die Daten selbst und schreibt sie in `ipfact`.
 *
 * `fetch` ist injizierbar, damit Tests weder Tik noch Prüfungsnetz
 * brauchen. Das Intervall ist ebenfalls injizierbar; der Poller lässt
 * sich über `stop()` sauber beenden (abbrechen + laufenden Abruf
 * abwarten).
 */

export type TikFetcher = (
    input: string,
    init?: RequestInit,
) => Promise<Response>;

export type TikEntry = {
    ip: string;
    /** MAC-Adresse in Kleinschreibung, `null` wenn der Tik keine liefert. */
    mac: string | null;
};

export type TikPollOutcome =
    | { ok: true; entries: TikEntry[] }
    | { ok: false; error: string };

export type TikStatus = {
    configured: boolean;
    /** Ende des letzten Abrufversuchs, `null` solange keiner lief. */
    last_attempt_at: Date | null;
    /** Ende des letzten erfolgreichen Abrufs. */
    last_success_at: Date | null;
    /** Anzahl der Clients im letzten erfolgreichen Abruf. */
    last_count: number;
    /** Fehlermeldung des letzten fehlgeschlagenen Abrufs (deutsch). */
    last_error: string | null;
};

export type TikPanelState =
    | "ok"
    | "leer"
    | "fehler"
    | "unbekannt"
    | "nicht-konfiguriert";

export type TikPanel = {
    state: TikPanelState;
    /** Anzeigefertige Zeitpunkte (lokale Zeit), leer wenn unbekannt. */
    last_attempt: string;
    last_success: string;
    count: number;
    error: string;
};

export type RegisterEntries = (entries: TikEntry[], seen: Date) => void;

const REGISTRATION_TABLE_PATH =
    "/rest/interface/wireless/registration-table";
const PROPLIST = "last-ip,mac-address,uptime,interface";
const REQUEST_TIMEOUT_MS = 5000;
export const DEFAULT_POLL_INTERVAL_MS = 60_000;

const defaultFetcher: TikFetcher = (input, init) => fetch(input, init);

const defaultRegister: RegisterEntries = (entries, seen) => {
    repo.ipfact.registerSeenMany(entries, seen);
};

function emptyStatus(): TikStatus {
    return {
        configured: config.TIK !== null,
        last_attempt_at: null,
        last_success_at: null,
        last_count: 0,
        last_error: null,
    };
}

let status: TikStatus = emptyStatus();

/**
 * Setzt den gespeicherten Abrufzustand zurück. Nur für Tests gedacht —
 * der Poller selbst initialisiert ihn beim App-Start.
 */
export function resetStatus(): void {
    status = emptyStatus();
}

export function getStatus(): TikStatus {
    return { ...status, configured: config.TIK !== null };
}

function statusToPanel(value: TikStatus): TikPanel {
    const formatted = (date: Date | null) =>
        date ? localAdminIpString(date) : "";

    let state: TikPanelState;
    if (!value.configured) {
        state = "nicht-konfiguriert";
    } else if (value.last_attempt_at === null) {
        state = "unbekannt";
    } else if (value.last_error !== null) {
        state = "fehler";
    } else if (value.last_count === 0) {
        state = "leer";
    } else {
        state = "ok";
    }

    return {
        state,
        last_attempt: formatted(value.last_attempt_at),
        last_success: formatted(value.last_success_at),
        count: value.last_count,
        error: value.last_error ?? "",
    };
}

/**
 * Anzeigezustand für das Admin-Panel. „Tik nicht erreichbar" und
 * „keine Clients verbunden" sind bewusst verschiedene Zustände: ein
 * stiller Ausfall der IP-Erfassung darf nicht wie ein leeres WLAN
 * aussehen.
 */
export function getPanel(): TikPanel {
    return statusToPanel(getStatus());
}

export function buildRegistrationTableUrl(tik: TikConfig): string {
    const base = tik.url.replace(/\/+$/, "");
    return `${base}${REGISTRATION_TABLE_PATH}?` +
        new URLSearchParams({ ".proplist": PROPLIST }).toString();
}

/**
 * Normalisiert die Antwort des Tik zu einer Liste aus IP und MAC.
 *
 * - Zeilen ohne `last-ip` werden verworfen (Client ohne Lease).
 * - MACs werden getrimmt und kleingeschrieben; fehlt sie, bleibt `null`.
 * - Doppelte IPs (mehrere Interfaces) werden auf den ersten Eintrag
 *   reduziert, damit ein Abruf je IP genau eine Zeile erzeugt.
 */
export function parseRegistrationTable(payload: unknown): TikEntry[] {
    if (!Array.isArray(payload)) {
        throw new Error("unerwartetes Antwortformat");
    }

    const byIp = new Map<string, TikEntry>();
    for (const row of payload) {
        if (!row || typeof row !== "object") {
            continue;
        }

        const fields = row as Record<string, unknown>;
        const lastIp = fields["last-ip"];
        if (typeof lastIp !== "string" || !lastIp.trim()) {
            continue;
        }

        const ip = lastIp.trim();
        const rawMac = fields["mac-address"];
        const mac = typeof rawMac === "string" && rawMac.trim()
            ? rawMac.trim().toLowerCase()
            : null;

        if (!byIp.has(ip)) {
            byIp.set(ip, { ip, mac });
        }
    }

    return [...byIp.values()].sort((a, b) => a.ip.localeCompare(b.ip));
}

function isTimeoutError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "TimeoutError";
}

function errorMessage(error: unknown): string {
    if (isTimeoutError(error)) {
        return `Zeitüberschreitung nach ${REQUEST_TIMEOUT_MS / 1000} Sekunden`;
    }
    return error instanceof Error ? error.message : String(error);
}

/**
 * Ein einzelner Abruf inklusive Normalisierung, Persistenz und
 * Zustandsbuchung. Netzwerkfehler, Timeouts, HTTP-Fehler und kaputte
 * Antworten werden zu `ok: false` mit deutscher Meldung; es fliegt
 * keine Exception nach außen.
 */
export async function pollOnce(
    options: {
        fetcher?: TikFetcher;
        signal?: AbortSignal;
        now?: () => Date;
        register?: RegisterEntries;
    } = {},
): Promise<TikPollOutcome> {
    const tik = config.TIK;
    if (!tik) {
        return {
            ok: false,
            error:
                "MikroTik ist nicht konfiguriert (TIK_URL, TIK_USER und TIK_PASSWORD fehlen).",
        };
    }

    const fetcher = options.fetcher ?? defaultFetcher;
    const register = options.register ?? defaultRegister;
    const now = options.now ?? (() => new Date());
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout;

    const finish = (outcome: TikPollOutcome): TikPollOutcome => {
        const at = now();
        status.last_attempt_at = at;
        if (options.signal?.aborted) {
            // Nach `stop()` schreibt auch ein bereits gelieferter Abruf
            // nichts mehr: er gehört zu einem abgebrochenen Lauf.
            status.last_error = "Abruf abgebrochen.";
            return { ok: false, error: "Abruf abgebrochen." };
        }
        if (outcome.ok) {
            try {
                register(outcome.entries, at);
            } catch (error) {
                const message = error instanceof Error
                    ? error.message
                    : String(error);
                const failure = `Speichern in ipfact fehlgeschlagen: ${message}`;
                status.last_error = failure;
                return { ok: false, error: failure };
            }
            status.last_success_at = at;
            status.last_count = outcome.entries.length;
            status.last_error = null;
        } else {
            status.last_error = outcome.error;
        }
        return outcome;
    };

    let response: Response;
    try {
        response = await fetcher(buildRegistrationTableUrl(tik), {
            method: "GET",
            headers: {
                "Authorization": `Basic ${btoa(`${tik.user}:${tik.password}`)}`,
                "Accept": "application/json",
            },
            signal,
        });
    } catch (error) {
        if (options.signal?.aborted) {
            return finish({ ok: false, error: "Abruf abgebrochen." });
        }
        return finish({
            ok: false,
            error: `MikroTik nicht erreichbar: ${errorMessage(error)}`,
        });
    }

    let body: string;
    try {
        body = await response.text();
    } catch (error) {
        return finish({
            ok: false,
            error: `MikroTik nicht erreichbar: ${errorMessage(error)}`,
        });
    }

    if (!response.ok) {
        return finish({
            ok: false,
            error: `MikroTik antwortet mit HTTP ${response.status}.`,
        });
    }

    let payload: unknown;
    try {
        payload = JSON.parse(body);
    } catch {
        return finish({
            ok: false,
            error: "MikroTik liefert keine gültige JSON-Antwort.",
        });
    }

    try {
        return finish({ ok: true, entries: parseRegistrationTable(payload) });
    } catch {
        return finish({
            ok: false,
            error: "MikroTik liefert ein unerwartetes Antwortformat.",
        });
    }
}

export type TikPoller = {
    /** Stoppt den Loop, bricht einen laufenden Abruf ab und wartet ihn ab. */
    stop: () => Promise<void>;
};

/**
 * Startet das Polling: Sofortabruf beim Start, danach alle `intervalMs`
 * (Standard 60 s). Ohne konfigurierten Tik wird nichts gestartet.
 * Überlappende Abrufe sind ausgeschlossen; `stop()` ist idempotent.
 */
export function startPolling(
    options: {
        intervalMs?: number;
        fetcher?: TikFetcher;
        register?: RegisterEntries;
    } = {},
): TikPoller | null {
    if (!config.TIK) {
        console.log(
            "MikroTik-Polling nicht konfiguriert (TIK_URL, TIK_USER und TIK_PASSWORD fehlen)",
        );
        return null;
    }

    const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const controller = new AbortController();
    let stopped = false;
    let running: Promise<void> | null = null;

    const tick = async (): Promise<void> => {
        const outcome = await pollOnce({
            fetcher: options.fetcher,
            register: options.register,
            signal: controller.signal,
        });

        if (stopped) {
            return;
        }

        if (outcome.ok) {
            console.log(`MikroTik-Abruf: ${outcome.entries.length} aktive Clients.`);
        } else {
            console.error(`MikroTik-Abruf fehlgeschlagen: ${outcome.error}`);
        }
    };

    const run = () => {
        if (stopped || running) {
            return;
        }

        running = tick()
            .catch((error) => {
                console.error(
                    `MikroTik-Abruf fehlgeschlagen: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            })
            .finally(() => {
                running = null;
            });
    };

    // Sofortabruf beim Start.
    run();
    const timer = setInterval(run, intervalMs);

    return {
        stop: async () => {
            if (stopped) {
                return;
            }
            stopped = true;
            clearInterval(timer);
            controller.abort();
            if (running) {
                await running;
            }
        },
    };
}
