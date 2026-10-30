import config from "../lib/config.ts";
import type { OpnsenseConfig } from "../lib/config.ts";

/**
 * HTTP-Client der OPNsense-API.
 *
 * Diese Funktion ist die Naht für Tests: Unit-Tests injizieren ein
 * `fetch`-Double und prüfen damit Sperren und Lesen, ohne die echte
 * Firewall anzufassen.
 */
export type ExamModeRunner = (
    input: string,
    init?: RequestInit,
) => Promise<Response>;

/**
 * Ergebnis eines Firewall-Aufrufs — bewusst dieselbe Form wie das
 * frühere Shell-Ergebnis (`code`/`stdout`/`stderr`/`ok`), damit die
 * Routen unverändert einen Fehler samt Meldung weiterreichen können.
 */
export type OpnsenseRuleResult = {
    ok: boolean;
    /** HTTP-Status des letzten Aufrufs, 0 wenn kein Aufruf möglich war. */
    code: number;
    /** Erfolgsmeldung (deutsch) bzw. Antworttext. */
    stdout: string;
    /** Fehlermeldung (deutsch), leer bei Erfolg. */
    stderr: string;
};

export type OpnsenseRuleState = OpnsenseRuleResult & {
    configured: boolean;
    /** true = Sperrregel ist aktiv (Internet gesperrt), null = unbekannt. */
    rule_enabled: boolean | null;
    /** UUID in der Schreibweise der Firewall (für toggleRule), null = unbekannt. */
    rule_uuid: string | null;
};

const REQUEST_TIMEOUT_MS = 5000;
const SEARCH_ROW_COUNT = 1000;
const MAX_BODY_CHARS = 400;
const NOT_CONFIGURED_MESSAGE =
    "OPNsense-API ist nicht konfiguriert (OPNSENSE_API_KEY und OPNSENSE_API_SECRET fehlen).";

function shorten(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length <= MAX_BODY_CHARS) {
        return trimmed;
    }
    return `${trimmed.slice(0, MAX_BODY_CHARS)} …`;
}

/**
 * Firewall-Aufrufe laufen nacheinander. `toggleRule` ist ein Toggle:
 * zwei gleichzeitige Aufrufe (Doppelklick, Start + Toggle) würden sonst
 * beide denselben Ist-Zustand lesen und zweimal umschalten — die Sperre
 * wäre danach wieder aus.
 */
let operationQueue: Promise<unknown> = Promise.resolve();

function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = operationQueue.then(operation, operation);
    operationQueue = result.then(
        () => undefined,
        () => undefined,
    );
    return result;
}

/**
 * Standard-Transport: normales `fetch` mit TLS-Prüfung.
 *
 * Die Sense präsentiert auf der API-Adresse das GUI-Zertifikat. Deckt
 * es den konfigurierten Host nicht ab (z. B. IP-Adresse vs.
 * Let's-Encrypt-Name), muss der Prozess host-beschränkt starten:
 * `deno run … --unsafely-ignore-certificate-errors=<api-host>`. Die
 * Prüfung wird hier bewusst nicht abgeschaltet — Deno kann das nur
 * prozessweit, nicht pro Request.
 */
const defaultRunner: ExamModeRunner = (input, init) => fetch(input, init);

export function isConfigured(): boolean {
    return config.OPNSENSE !== null;
}

function requireConfig(): OpnsenseConfig {
    const opnsense = config.OPNSENSE;
    if (!opnsense) {
        throw new Error(NOT_CONFIGURED_MESSAGE);
    }
    return opnsense;
}

function authHeader(opnsense: OpnsenseConfig): string {
    return `Basic ${btoa(`${opnsense.apiKey}:${opnsense.apiSecret}`)}`;
}

/**
 * Ein einzelner API-Aufruf gegen die Sense. Netzwerkfehler, Timeouts
 * und Nicht-2xx-Antworten werden zu einem `ok: false` mit deutscher
 * Meldung; der Aufrufer muss nichts weiter abfangen.
 */
async function request(
    opnsense: OpnsenseConfig,
    action: string,
    path: string,
    method: "GET" | "POST",
    runner: ExamModeRunner,
    body?: string,
): Promise<OpnsenseRuleResult> {
    const url = `${opnsense.apiUrl}${path}`;
    let response: Response;

    try {
        response = await runner(url, {
            method,
            headers: {
                "Authorization": authHeader(opnsense),
                "Accept": "application/json",
                ...(body ? { "Content-Type": "application/json" } : {}),
            },
            body,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            ok: false,
            code: 0,
            stdout: "",
            stderr: `${action} fehlgeschlagen: OPNsense-API nicht erreichbar (${message}).`,
        };
    }

    let responseBody = "";
    try {
        responseBody = (await response.text()).trim();
    } catch {
        responseBody = "";
    }

    if (!response.ok) {
        const details = responseBody ? `: ${shorten(responseBody)}` : "";
        return {
            ok: false,
            code: response.status,
            stdout: shorten(responseBody),
            stderr: `${action} fehlgeschlagen (HTTP ${response.status})${details}`,
        };
    }

    return { ok: true, code: response.status, stdout: responseBody, stderr: "" };
}

function parseFlag(value: unknown): boolean | null {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "number") {
        return value !== 0;
    }
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "1" || normalized === "true") {
            return true;
        }
        if (normalized === "0" || normalized === "false" || normalized === "") {
            return false;
        }
    }
    return null;
}

/**
 * OPNsense liefert UUIDs je nach Quelle mit oder ohne Bindestriche
 * (config.xml: 32 Hex-Zeichen, modernes Format: 8-4-4-4-12). Für den
 * Vergleich und für `toggleRule` wird vereinheitlicht.
 */
export function normalizeUuid(value: string): string {
    return value.trim().toLowerCase().replace(/[^0-9a-f]/g, "");
}

/**
 * Liest den Regelzustand aus einem Regelobjekt der Firewall-API.
 *
 * OPNsense liefert `enabled` als „1"/„0" (ältere Versionen `disabled`).
 * Fehlt beides, ist die Regel aktiv — das ist die XML-Semantik.
 * `null` heißt: das Objekt enthält keinen verwertbaren Zustand.
 */
export function parseRuleEnabled(rule: unknown): boolean | null {
    if (!rule || typeof rule !== "object") {
        return null;
    }

    const fields = rule as { enabled?: unknown; disabled?: unknown };
    const enabled = parseFlag(fields.enabled);
    if (enabled !== null) {
        return enabled;
    }

    const disabled = parseFlag(fields.disabled);
    if (disabled !== null) {
        return !disabled;
    }

    return true;
}

/**
 * Sucht die Regel in einer `searchRule`-Antwort. Der Vergleich läuft
 * über die normalisierte UUID; zurück kommen
 *
 * - `enabled`: Regelzustand
 * - `uuid`: Schreibweise für `toggleRule`. Bevorzugt wird die
 *   Konfigurations-UUID aus `@attributes` (modernes, gestricheltes
 *   Format), sonst die abgeleitete `uuid` der Zeile.
 */
export function findRuleRow(
    payload: unknown,
    uuid: string,
): { uuid: string; enabled: boolean } | null {
    if (!payload || typeof payload !== "object") {
        return null;
    }

    const rows = (payload as { rows?: unknown }).rows;
    if (!Array.isArray(rows)) {
        return null;
    }

    const wanted = normalizeUuid(uuid);
    for (const row of rows) {
        if (!row || typeof row !== "object") {
            continue;
        }

        const candidate = (row as { uuid?: unknown }).uuid;
        if (typeof candidate !== "string" || normalizeUuid(candidate) !== wanted) {
            continue;
        }

        const enabled = parseRuleEnabled(row);
        if (enabled === null) {
            return null;
        }

        const attributes = (row as { "@attributes"?: { uuid?: unknown } })["@attributes"];
        const configUuid = attributes?.uuid;
        const writeUuid = typeof configUuid === "string" && configUuid.trim()
            ? configUuid
            : candidate;

        return { uuid: writeUuid, enabled };
    }

    return null;
}

/**
 * Zustand der Sperrregel. `rule_enabled: true` bedeutet „Internet ist
 * gesperrt".
 *
 * Gelesen wird über `POST /api/firewall/filter/searchRule`: Auf der
 * Sense (26.7) beantwortet `GET getRule/{uuid}` den Pfad-Parameter
 * nicht und liefert eine leere Liste — `searchRule` ist die
 * verlässliche Quelle für UUID und Zustand.
 */
async function readRuleState(
    runner: ExamModeRunner,
): Promise<OpnsenseRuleState> {
    if (!isConfigured()) {
        return {
            configured: false,
            rule_enabled: null,
            rule_uuid: null,
            ok: false,
            code: 0,
            stdout: "",
            stderr: NOT_CONFIGURED_MESSAGE,
        };
    }

    const opnsense = requireConfig();
    const result = await request(
        opnsense,
        "Regelzustand lesen",
        "/api/firewall/filter/searchRule",
        "POST",
        runner,
        JSON.stringify({ current: 1, rowCount: SEARCH_ROW_COUNT }),
    );

    if (!result.ok) {
        return {
            ...result,
            configured: true,
            rule_enabled: null,
            rule_uuid: null,
        };
    }

    let payload: unknown;
    try {
        payload = JSON.parse(result.stdout);
    } catch {
        payload = null;
    }

    const row = findRuleRow(payload, opnsense.ruleUuid);
    if (!row) {
        return {
            configured: true,
            rule_enabled: null,
            rule_uuid: null,
            ok: false,
            code: result.code,
            stdout: "Sperrregel nicht in der Regelliste gefunden",
            stderr:
                `Sperrregel ${opnsense.ruleUuid} wurde auf der Firewall nicht gefunden ` +
                "(OPNSENSE_EXAMMODE_RULE_UUID prüfen).",
        };
    }

    return {
        ...result,
        configured: true,
        rule_enabled: row.enabled,
        rule_uuid: row.uuid,
        stdout: row.enabled ? "Sperre aktiv" : "Sperre inaktiv",
    };
}

export function getRuleEnabled(
    runner: ExamModeRunner = defaultRunner,
): Promise<OpnsenseRuleState> {
    return serialize(() => readRuleState(runner));
}

/**
 * Schaltet die Sperrregel auf den gewünschten Zustand.
 *
 * `POST toggleRule` ist ein Toggle, kein Setzen: deshalb wird zuerst
 * der Ist-Zustand gelesen und nur bei Abweichung umgeschaltet. Ein
 * bereits passender Zustand ist ein Erfolg ohne Schreibzugriff (kein
 * `toggleRule`, kein `apply`). Nach dem Umschalten werden die
 * Firewall-Regeln mit `apply` übernommen und der Zustand erneut
 * gelesen — ein Toggle auf eine nicht passende UUID kann sonst
 * unbemerkt ins Leere laufen.
 */
async function writeRuleEnabled(
    enabled: boolean,
    runner: ExamModeRunner,
): Promise<OpnsenseRuleResult> {
    if (!isConfigured()) {
        return {
            ok: false,
            code: 0,
            stdout: "",
            stderr: NOT_CONFIGURED_MESSAGE,
        };
    }

    const opnsense = requireConfig();
    const current = await readRuleState(runner);
    if (!current.ok) {
        return {
            ok: false,
            code: current.code,
            stdout: current.stdout,
            stderr: `Sperre konnte nicht geschaltet werden: ${current.stderr}`,
        };
    }

    if (current.rule_enabled === enabled) {
        return {
            ok: true,
            code: current.code,
            stdout: enabled ? "Sperre ist bereits aktiv" : "Sperre ist bereits inaktiv",
            stderr: "",
        };
    }

    const ruleUuid = current.rule_uuid ?? opnsense.ruleUuid;
    const toggled = await request(
        opnsense,
        "Sperre umschalten",
        `/api/firewall/filter/toggleRule/${ruleUuid}`,
        "POST",
        runner,
    );
    if (!toggled.ok) {
        return toggled;
    }

    const applied = await request(
        opnsense,
        "Firewall-Regeln anwenden",
        "/api/firewall/filter/apply",
        "POST",
        runner,
    );
    if (!applied.ok) {
        return {
            ok: false,
            code: applied.code,
            stdout: applied.stdout,
            stderr:
                `Regel wurde umgeschaltet, konnte aber nicht angewendet werden: ${applied.stderr}`,
        };
    }

    const verified = await readRuleState(runner);
    if (!verified.ok) {
        return {
            ok: false,
            code: verified.code,
            stdout: verified.stdout,
            stderr: `Regel wurde umgeschaltet, der Zustand ist aber nicht bestätigt: ${verified.stderr}`,
        };
    }

    if (verified.rule_enabled !== enabled) {
        return {
            ok: false,
            code: verified.code,
            stdout: verified.stdout,
            stderr:
                "Regel wurde umgeschaltet, der Zustand ist aber unverändert — " +
                "Umschalten nicht bestätigt (OPNSENSE_EXAMMODE_RULE_UUID prüfen).",
        };
    }

    return {
        ok: true,
        code: applied.code,
        stdout: enabled ? "Sperre aktiviert" : "Sperre deaktiviert",
        stderr: "",
    };
}

export function setRuleEnabled(
    enabled: boolean,
    runner: ExamModeRunner = defaultRunner,
): Promise<OpnsenseRuleResult> {
    return serialize(() => writeRuleEnabled(enabled, runner));
}
