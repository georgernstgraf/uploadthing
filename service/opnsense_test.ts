import { assertEquals, assertExists } from "@std/assert";
import config from "../lib/config.ts";
import type { OpnsenseConfig } from "../lib/config.ts";
import {
    findRuleRow,
    getRuleEnabled,
    normalizeUuid,
    parseRuleEnabled,
    setRuleEnabled,
} from "./opnsense.ts";
import type { ExamModeRunner } from "./opnsense.ts";

const RULE_UUID = "e3e720e6-27fb-4565-b8cf-3a73cf682b54";
const RULE_UUID_LEGACY = "e3e720e627fb4565b8cf3a73cf682b54";

const TEST_CONFIG: OpnsenseConfig = {
    apiUrl: "https://firewall.test:8443",
    apiKey: "test-key",
    apiSecret: "test-secret",
    ruleUuid: RULE_UUID,
};

type Call = {
    url: string;
    method: string;
    authorization: string | null;
    body: string | null;
};

type RuleRow = {
    uuid: string;
    enabled: "0" | "1";
    "@attributes"?: { uuid: string };
};

function searchResponse(rows: RuleRow[]): string {
    return JSON.stringify({ total: rows.length, rowCount: rows.length, current: 1, rows });
}

/**
 * Baut ein `fetch`-Double, das die Firewall nachbildet: Lesen liefert
 * die übergebenen Regeln, `toggleRule` schaltet die Regel im Speicher
 * um, `apply` wird nur protokolliert.
 */
function fakeFirewall(options: {
    rules: RuleRow[];
    toggleStatus?: number;
    applyStatus?: number;
    searchStatus?: number;
    toggleChangesState?: boolean;
}) {
    const calls: Call[] = [];

    const runner: ExamModeRunner = (url, init) => {
        const method = init?.method ?? "GET";
        const body = typeof init?.body === "string" ? init.body : null;
        const headers = new Headers(init?.headers);
        calls.push({
            url,
            method,
            authorization: headers.get("Authorization"),
            body,
        });

        if (url.endsWith("/api/firewall/filter/searchRule")) {
            const status = options.searchStatus ?? 200;
            return Promise.resolve(
                new Response(searchResponse(options.rules), { status }),
            );
        }

        if (url.includes("/api/firewall/filter/toggleRule/")) {
            const status = options.toggleStatus ?? 200;
            if (status === 200 && options.toggleChangesState !== false) {
                options.rules = options.rules.map((row) => ({
                    ...row,
                    enabled: row.enabled === "1" ? "0" : "1",
                }));
            }
            return Promise.resolve(new Response("{}", { status }));
        }

        if (url.endsWith("/api/firewall/filter/apply")) {
            return Promise.resolve(
                new Response("{}", { status: options.applyStatus ?? 200 }),
            );
        }

        return Promise.resolve(new Response("nicht erwartet", { status: 500 }));
    };

    return { runner, calls };
}

function withOpnsenseConfig<T>(
    opnsense: OpnsenseConfig | null,
    fn: () => Promise<T>,
): Promise<T> {
    const original = config.OPNSENSE;
    config.OPNSENSE = opnsense;
    return fn().finally(() => {
        config.OPNSENSE = original;
    });
}

function activeRule(overrides: Partial<RuleRow> = {}): RuleRow {
    return { uuid: RULE_UUID_LEGACY, enabled: "1", ...overrides };
}

Deno.test("opnsense - ohne konfigurierte API wird nichts aufgerufen", async () => {
    await withOpnsenseConfig(null, async () => {
        let called = false;
        const runner: ExamModeRunner = () => {
            called = true;
            return Promise.resolve(new Response("{}"));
        };

        const state = await getRuleEnabled(runner);
        assertEquals(called, false);
        assertEquals(state.configured, false);
        assertEquals(state.rule_enabled, null);
        assertEquals(
            state.stderr,
            "OPNsense-API ist nicht konfiguriert (OPNSENSE_API_KEY und OPNSENSE_API_SECRET fehlen).",
        );

        const result = await setRuleEnabled(true, runner);
        assertEquals(called, false);
        assertEquals(result.ok, false);
        assertEquals(result.stderr, state.stderr);
    });
});

Deno.test("opnsense - getRuleEnabled liest Regelzustand und reicht Basic-Auth durch", async () => {
    const { runner, calls } = fakeFirewall({ rules: [activeRule()] });

    await withOpnsenseConfig(TEST_CONFIG, async () => {
        const state = await getRuleEnabled(runner);

        assertEquals(state.ok, true);
        assertEquals(state.configured, true);
        assertEquals(state.rule_enabled, true);
        assertEquals(state.rule_uuid, RULE_UUID_LEGACY);
        assertEquals(state.stdout, "Sperre aktiv");
    });

    assertEquals(calls.length, 1);
    assertEquals(calls[0].url, "https://firewall.test:8443/api/firewall/filter/searchRule");
    assertEquals(calls[0].method, "POST");
    assertEquals(calls[0].authorization, `Basic ${btoa("test-key:test-secret")}`);
    assertExists(calls[0].body);
});

Deno.test("opnsense - getRuleEnabled meldet eine unbekannte Regel als Fehler", async () => {
    const { runner } = fakeFirewall({ rules: [] });

    await withOpnsenseConfig(TEST_CONFIG, async () => {
        const state = await getRuleEnabled(runner);

        assertEquals(state.ok, false);
        assertEquals(state.rule_enabled, null);
        assertEquals(
            state.stderr,
            `Sperrregel ${RULE_UUID} wurde auf der Firewall nicht gefunden (OPNSENSE_EXAMMODE_RULE_UUID prüfen).`,
        );
    });
});

Deno.test("opnsense - getRuleEnabled meldet HTTP- und Netzwerkfehler deutsch", async () => {
    await withOpnsenseConfig(TEST_CONFIG, async () => {
        const httpError = fakeFirewall({ rules: [], searchStatus: 401 });
        const httpState = await getRuleEnabled(httpError.runner);
        assertEquals(httpState.ok, false);
        assertEquals(httpState.code, 401);
        assertEquals(
            httpState.stderr.includes("Regelzustand lesen fehlgeschlagen (HTTP 401)"),
            true,
        );

        const networkState = await getRuleEnabled(() =>
            Promise.reject(new Error("connection refused"))
        );
        assertEquals(networkState.ok, false);
        assertEquals(networkState.code, 0);
        assertEquals(
            networkState.stderr.startsWith(
                "Regelzustand lesen fehlgeschlagen: OPNsense-API nicht erreichbar",
            ),
            true,
        );
    });
});

Deno.test("opnsense - setRuleEnabled sperrt: erst lesen, dann toggle, dann apply", async () => {
    const { runner, calls } = fakeFirewall({ rules: [activeRule({ enabled: "0" })] });

    await withOpnsenseConfig(TEST_CONFIG, async () => {
        const result = await setRuleEnabled(true, runner);

        assertEquals(result.ok, true);
        assertEquals(result.stdout, "Sperre aktiviert");
        assertEquals(result.stderr, "");
    });

    assertEquals(
        calls.map((call) => `${call.method} ${call.url.replace("https://firewall.test:8443", "")}`),
        [
            "POST /api/firewall/filter/searchRule",
            `POST /api/firewall/filter/toggleRule/${RULE_UUID_LEGACY}`,
            "POST /api/firewall/filter/apply",
            "POST /api/firewall/filter/searchRule",
        ],
    );
});

Deno.test("opnsense - setRuleEnabled nutzt die UUID der Firewall, nicht die Konfiguration", async () => {
    const { runner, calls } = fakeFirewall({
        rules: [activeRule({ "@attributes": { uuid: RULE_UUID } })],
    });

    await withOpnsenseConfig(
        { ...TEST_CONFIG, ruleUuid: RULE_UUID.replaceAll("-", "") },
        async () => {
            const result = await setRuleEnabled(false, runner);
            assertEquals(result.ok, true);
        },
    );

    const toggle = calls.find((call) => call.url.includes("toggleRule"));
    assertExists(toggle);
    assertEquals(toggle.url, `https://firewall.test:8443/api/firewall/filter/toggleRule/${RULE_UUID}`);
});

Deno.test("opnsense - setRuleEnabled ist idempotent ohne Schreibzugriff", async () => {
    const { runner, calls } = fakeFirewall({ rules: [activeRule({ enabled: "1" })] });

    await withOpnsenseConfig(TEST_CONFIG, async () => {
        const result = await setRuleEnabled(true, runner);
        assertEquals(result.ok, true);
        assertEquals(result.stdout, "Sperre ist bereits aktiv");
    });

    assertEquals(calls.some((call) => call.url.includes("toggleRule")), false);
    assertEquals(calls.some((call) => call.url.endsWith("/apply")), false);
});

Deno.test("opnsense - setRuleEnabled gibt toggle-Fehler unverändert weiter", async () => {
    const { runner, calls } = fakeFirewall({
        rules: [activeRule({ enabled: "0" })],
        toggleStatus: 403,
    });

    await withOpnsenseConfig(TEST_CONFIG, async () => {
        const result = await setRuleEnabled(true, runner);
        assertEquals(result.ok, false);
        assertEquals(result.code, 403);
        assertEquals(
            result.stderr.includes("Sperre umschalten fehlgeschlagen (HTTP 403)"),
            true,
        );
    });

    assertEquals(calls.some((call) => call.url.endsWith("/apply")), false);
});

Deno.test("opnsense - setRuleEnabled meldet fehlgeschlagenes apply", async () => {
    const { runner } = fakeFirewall({
        rules: [activeRule({ enabled: "0" })],
        applyStatus: 500,
    });

    await withOpnsenseConfig(TEST_CONFIG, async () => {
        const result = await setRuleEnabled(true, runner);
        assertEquals(result.ok, false);
        assertEquals(result.code, 500);
        assertEquals(
            result.stderr.startsWith(
                "Regel wurde umgeschaltet, konnte aber nicht angewendet werden",
            ),
            true,
        );
    });
});

Deno.test("opnsense - setRuleEnabled erkennt einen Toggle, der nichts ändert", async () => {
    const { runner } = fakeFirewall({
        rules: [activeRule({ enabled: "0" })],
        toggleChangesState: false,
    });

    await withOpnsenseConfig(TEST_CONFIG, async () => {
        const result = await setRuleEnabled(true, runner);
        assertEquals(result.ok, false);
        assertEquals(
            result.stderr.includes("Umschalten nicht bestätigt"),
            true,
        );
    });
});

Deno.test("opnsense - setRuleEnabled schaltet nicht, wenn der Zustand unbekannt ist", async () => {
    const { runner, calls } = fakeFirewall({ rules: [] });

    await withOpnsenseConfig(TEST_CONFIG, async () => {
        const result = await setRuleEnabled(true, runner);
        assertEquals(result.ok, false);
        assertEquals(
            result.stderr.startsWith("Sperre konnte nicht geschaltet werden:"),
            true,
        );
    });

    assertEquals(calls.some((call) => call.url.includes("toggleRule")), false);
});

Deno.test("opnsense - gleichzeitige Schaltversuche ergeben einen einzigen Toggle", async () => {
    const rules = [activeRule({ enabled: "0" })];
    const { runner, calls } = fakeFirewall({ rules });

    await withOpnsenseConfig(TEST_CONFIG, async () => {
        const [erste, zweite] = await Promise.all([
            setRuleEnabled(true, runner),
            setRuleEnabled(true, runner),
        ]);

        assertEquals(erste.ok, true);
        assertEquals(zweite.ok, true);

        const state = await getRuleEnabled(runner);
        assertEquals(state.rule_enabled, true);
    });

    assertEquals(
        calls.filter((call) => call.url.includes("toggleRule")).length,
        1,
    );
});

Deno.test("opnsense - parseRuleEnabled versteht enabled/disabled und XML-Semantik", () => {
    assertEquals(parseRuleEnabled({ enabled: "1" }), true);
    assertEquals(parseRuleEnabled({ enabled: "0" }), false);
    assertEquals(parseRuleEnabled({ enabled: true }), true);
    assertEquals(parseRuleEnabled({ disabled: "1" }), false);
    assertEquals(parseRuleEnabled({ disabled: false }), true);
    assertEquals(parseRuleEnabled({}), true);
    assertEquals(parseRuleEnabled(null), null);
    assertEquals(parseRuleEnabled({ enabled: "vielleicht" }), true);
});

Deno.test("opnsense - normalizeUuid angleicht beide Schreibweisen", () => {
    assertEquals(normalizeUuid(RULE_UUID), RULE_UUID_LEGACY);
    assertEquals(normalizeUuid(RULE_UUID_LEGACY), RULE_UUID_LEGACY);
    assertEquals(normalizeUuid("  E3E720E6-27FB-4565-B8CF-3A73CF682B54 "), RULE_UUID_LEGACY);
});

Deno.test("opnsense - findRuleRow bevorzugt die Konfigurations-UUID", () => {
    const payload = {
        rows: [
            { uuid: "aaaa", enabled: "1" },
            { uuid: RULE_UUID_LEGACY, enabled: "0", "@attributes": { uuid: RULE_UUID } },
        ],
    };

    assertEquals(findRuleRow(payload, RULE_UUID), {
        uuid: RULE_UUID,
        enabled: false,
    });
    assertEquals(findRuleRow(payload, RULE_UUID.replaceAll("-", "")), {
        uuid: RULE_UUID,
        enabled: false,
    });
    assertEquals(findRuleRow(payload, "ffff"), null);
    assertEquals(findRuleRow(null, RULE_UUID), null);
    assertEquals(findRuleRow({ rows: "keine Liste" }, RULE_UUID), null);
});
