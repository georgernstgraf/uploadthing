import { assertEquals, assertExists } from "@std/assert";
import config from "../lib/config.ts";
import type { TikConfig } from "../lib/config.ts";
import {
    buildRegistrationTableUrl,
    getPanel,
    getStatus,
    parseRegistrationTable,
    pollOnce,
    resetStatus,
} from "./tik.ts";
import type { TikFetcher } from "./tik.ts";

const TEST_TIK: TikConfig = {
    url: "http://tik.test",
    user: "monitoring-rest",
    password: "test-passwort",
};

type FakeCall = {
    url: string;
    authorization: string | null;
};

function jsonResponse(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), { status });
}

/**
 * Baut ein `fetch`-Double. Kein Test spricht den echten Tik an.
 */
function fakeFetch(
    payload: unknown,
    options: { status?: number } = {},
): { fetcher: TikFetcher; calls: FakeCall[] } {
    const calls: FakeCall[] = [];
    const fetcher: TikFetcher = (input, init) => {
        calls.push({
            url: String(input),
            authorization: new Headers(init?.headers).get("Authorization"),
        });
        return Promise.resolve(jsonResponse(payload, options.status ?? 200));
    };
    return { fetcher, calls };
}

function failingFetch(error: unknown): { fetcher: TikFetcher; calls: FakeCall[] } {
    const calls: FakeCall[] = [];
    const fetcher: TikFetcher = (input, init) => {
        calls.push({
            url: String(input),
            authorization: new Headers(init?.headers).get("Authorization"),
        });
        return Promise.reject(error);
    };
    return { fetcher, calls };
}

async function withTikConfig<T>(
    tik: TikConfig | null,
    fn: () => Promise<T>,
): Promise<T> {
    const original = config.TIK;
    config.TIK = tik;
    resetStatus();
    try {
        return await fn();
    } finally {
        config.TIK = original;
        resetStatus();
    }
}

const NOW = new Date("2026-10-30T10:00:00Z");

Deno.test("tik - erfolgreicher Abruf normalisiert IPs und MACs", async () => {
    await withTikConfig(TEST_TIK, async () => {
        const { fetcher, calls } = fakeFetch([
            {
                ".id": "*1",
                interface: "wlan1",
                "last-ip": "192.168.21.116",
                "mac-address": "22:7D:51:2B:02:33",
                uptime: "2h26m44s",
            },
            {
                ".id": "*2",
                interface: "wlan1",
                "last-ip": "192.168.21.10",
                "mac-address": "AA:BB:CC:DD:EE:FF",
                uptime: "1h",
            },
            // Client ohne Lease wird verworfen.
            { ".id": "*3", interface: "wlan1", "last-ip": "" },
        ]);

        let registered: unknown = null;
        let registeredAt: Date | null = null;
        const outcome = await pollOnce({
            fetcher,
            now: () => NOW,
            register: (entries, seen) => {
                registered = entries;
                registeredAt = seen;
            },
        });

        assertEquals(outcome.ok, true);
        if (!outcome.ok) return;
        assertEquals(outcome.entries.length, 2);
        assertEquals(outcome.entries[0], {
            ip: "192.168.21.10",
            mac: "aa:bb:cc:dd:ee:ff",
        });
        assertEquals(outcome.entries[1], {
            ip: "192.168.21.116",
            mac: "22:7d:51:2b:02:33",
        });
        assertEquals(registered, outcome.entries);
        assertEquals(registeredAt, NOW);

        assertEquals(calls.length, 1);
        assertExists(calls[0].authorization?.startsWith("Basic "));
        assertEquals(calls[0].url.includes("registration-table"), true);
        assertEquals(calls[0].url.includes("last-ip"), true);

        const status = getStatus();
        assertEquals(status.last_attempt_at, NOW);
        assertEquals(status.last_success_at, NOW);
        assertEquals(status.last_count, 2);
        assertEquals(status.last_error, null);
        assertEquals(getPanel().state, "ok");
        assertEquals(getPanel().count, 2);
    });
});

Deno.test("tik - leere Tabelle ist kein Fehler", async () => {
    await withTikConfig(TEST_TIK, async () => {
        const { fetcher } = fakeFetch([]);
        let registerCalled = false;

        const outcome = await pollOnce({
            fetcher,
            now: () => NOW,
            register: () => {
                registerCalled = true;
            },
        });

        assertEquals(outcome.ok, true);
        if (outcome.ok) {
            assertEquals(outcome.entries, []);
        }
        assertEquals(registerCalled, true);
        assertEquals(getStatus().last_error, null);
        assertEquals(getPanel().state, "leer");
        assertEquals(getPanel().count, 0);
    });
});

Deno.test("tik - HTTP-Fehler wird als Fehlerzustand gemeldet", async () => {
    await withTikConfig(TEST_TIK, async () => {
        const { fetcher } = fakeFetch({ error: "Unauthorized" }, { status: 401 });
        let registerCalled = false;

        const outcome = await pollOnce({
            fetcher,
            now: () => NOW,
            register: () => {
                registerCalled = true;
            },
        });

        assertEquals(outcome.ok, false);
        if (!outcome.ok) {
            assertEquals(outcome.error.includes("HTTP 401"), true);
        }
        assertEquals(registerCalled, false);
        assertEquals(getPanel().state, "fehler");
        assertEquals(getStatus().last_error !== null, true);
        assertEquals(getStatus().last_success_at, null);
    });
});

Deno.test("tik - Timeout wird als nicht erreichbar gemeldet", async () => {
    await withTikConfig(TEST_TIK, async () => {
        const { fetcher } = failingFetch(
            new DOMException("The signal timed out.", "TimeoutError"),
        );

        const outcome = await pollOnce({ fetcher, now: () => NOW });

        assertEquals(outcome.ok, false);
        if (!outcome.ok) {
            assertEquals(outcome.error.includes("nicht erreichbar"), true);
            assertEquals(outcome.error.includes("Zeitüberschreitung"), true);
        }
        assertEquals(getPanel().state, "fehler");
    });
});

Deno.test("tik - Netzwerkfehler wird als nicht erreichbar gemeldet", async () => {
    await withTikConfig(TEST_TIK, async () => {
        const { fetcher } = failingFetch(new TypeError("connection refused"));

        const outcome = await pollOnce({ fetcher, now: () => NOW });

        assertEquals(outcome.ok, false);
        if (!outcome.ok) {
            assertEquals(outcome.error.includes("nicht erreichbar"), true);
            assertEquals(outcome.error.includes("connection refused"), true);
        }
    });
});

Deno.test("tik - kaputte Antwort ist ein Fehler, kein Leerlauf", async () => {
    await withTikConfig(TEST_TIK, async () => {
        const { fetcher } = fakeFetch({ nicht: "eine Liste" });

        const outcome = await pollOnce({ fetcher, now: () => NOW });

        assertEquals(outcome.ok, false);
        if (!outcome.ok) {
            assertEquals(outcome.error.includes("Antwortformat"), true);
        }
        assertEquals(getPanel().state, "fehler");
    });
});

Deno.test("tik - Fehlerzustand nennt den letzten erfolgreichen Abruf", async () => {
    await withTikConfig(TEST_TIK, async () => {
        const success = fakeFetch([
            {
                "last-ip": "192.168.21.116",
                "mac-address": "22:7D:51:2B:02:33",
            },
        ]);
        await pollOnce({ fetcher: success.fetcher, now: () => NOW });

        const failure = fakeFetch({}, { status: 500 });
        await pollOnce({ fetcher: failure.fetcher, now: () => NOW });

        const panel = getPanel();
        assertEquals(panel.state, "fehler");
        assertExists(panel.last_success);
        assertExists(panel.last_attempt);
        assertEquals(panel.error.includes("HTTP 500"), true);
    });
});

Deno.test("tik - ohne Konfiguration wird nichts abgerufen", async () => {
    await withTikConfig(null, async () => {
        let called = false;
        const fetcher: TikFetcher = () => {
            called = true;
            return Promise.resolve(jsonResponse([]));
        };

        const outcome = await pollOnce({ fetcher });

        assertEquals(called, false);
        assertEquals(outcome.ok, false);
        assertEquals(getPanel().state, "nicht-konfiguriert");
        assertEquals(getStatus().last_attempt_at, null);
    });
});

Deno.test("tik - Registrierungstabelle wird normalisiert", () => {
    assertEquals(
        parseRegistrationTable([
            { "last-ip": " 192.168.21.116 ", "mac-address": "aa:bb" },
            { "last-ip": "192.168.21.116", "mac-address": "cc:dd" },
            { "last-ip": "192.168.21.117" },
            { foo: "bar" },
        ]),
        [
            { ip: "192.168.21.116", mac: "aa:bb" },
            { ip: "192.168.21.117", mac: null },
        ],
    );
});

Deno.test("tik - URL enthält Proplist für IP und MAC", () => {
    const url = buildRegistrationTableUrl({
        url: "http://tik.internal/",
        user: "u",
        password: "p",
    });
    assertEquals(url.startsWith("http://tik.internal/rest/interface/wireless/registration-table?"), true);
    assertEquals(url.includes("last-ip"), true);
    assertEquals(url.includes("mac-address"), true);
});
