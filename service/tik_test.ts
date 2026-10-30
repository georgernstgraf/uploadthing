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
    startPolling,
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

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wartet (begrenzt), bis die Bedingung erfüllt ist. */
async function waitFor(
    predicate: () => boolean,
    label: string,
    timeoutMs = 2000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() > deadline) {
            throw new Error(`Warten auf "${label}" ist abgelaufen.`);
        }
        await sleep(5);
    }
}

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

Deno.test("tik - Poller ruft sofort und danach im Intervall ab", async () => {
    await withTikConfig(TEST_TIK, async () => {
        let calls = 0;
        const fetcher: TikFetcher = () => {
            calls++;
            return Promise.resolve(jsonResponse([]));
        };

        const poller = startPolling({ intervalMs: 10, fetcher });
        assertExists(poller);

        try {
            // Sofortabruf beim Start, ohne auf das Intervall zu warten.
            await waitFor(() => calls >= 1, "Sofortabruf");
            assertEquals(calls >= 1, true);
            // Danach läuft der Abruf weiter.
            await waitFor(() => calls >= 3, "wiederholter Abruf");
        } finally {
            await poller.stop();
        }

        const callsAtStop = calls;
        await sleep(50);
        assertEquals(calls, callsAtStop);
    });
});

Deno.test("tik - stop bricht einen laufenden Abruf ab und schreibt nichts", async () => {
    await withTikConfig(TEST_TIK, async () => {
        let started = false;
        let calls = 0;
        let registered = 0;
        let received: AbortSignal | undefined;

        const fetcher: TikFetcher = (_input, init) => {
            started = true;
            calls++;
            received = init?.signal ?? undefined;
            return new Promise<Response>((_resolve, reject) => {
                received?.addEventListener("abort", () => {
                    reject(new DOMException("abgebrochen", "AbortError"));
                });
            });
        };

        const poller = startPolling({
            intervalMs: 10_000,
            fetcher,
            register: () => {
                registered++;
            },
        });
        assertExists(poller);

        await waitFor(() => started, "laufender Abruf");
        await poller.stop();

        assertEquals(received?.aborted, true);
        assertEquals(registered, 0);
        assertEquals(getStatus().last_count, 0);
        // Nur der eine Abruf, kein zweiter nach dem Abbruch.
        await sleep(50);
        assertEquals(calls, 1);
    });
});

Deno.test("tik - nach stop wird auch eine gelieferte Antwort nicht mehr gespeichert", async () => {
    await withTikConfig(TEST_TIK, async () => {
        let resolveFetch: ((response: Response) => void) | undefined;
        let registered = 0;

        const fetcher: TikFetcher = () =>
            new Promise<Response>((resolve) => {
                resolveFetch = resolve;
            });

        const poller = startPolling({
            intervalMs: 10_000,
            fetcher,
            register: () => {
                registered++;
            },
        });
        assertExists(poller);
        assertExists(resolveFetch);

        const stopping = poller.stop();
        resolveFetch!(
            jsonResponse([
                { "last-ip": "192.168.21.10", "mac-address": "aa:bb:cc:dd:ee:ff" },
            ]),
        );
        await stopping;

        assertEquals(registered, 0);
        assertEquals(getStatus().last_count, 0);
    });
});

Deno.test("tik - Abrufe überlappen nicht", async () => {
    await withTikConfig(TEST_TIK, async () => {
        let calls = 0;
        let active = 0;
        let maxActive = 0;

        const fetcher: TikFetcher = async () => {
            calls++;
            active++;
            maxActive = Math.max(maxActive, active);
            try {
                // Deutlich länger als das Intervall: ohne Überlappungsschutz
                // würden sich die Abrufe stapeln.
                await sleep(25);
                return jsonResponse([]);
            } finally {
                active--;
            }
        };

        const poller = startPolling({ intervalMs: 5, fetcher });
        assertExists(poller);

        try {
            await waitFor(() => calls >= 3, "mehrere Abrufe");
        } finally {
            await poller.stop();
        }

        assertEquals(maxActive, 1);
    });
});

Deno.test("tik - Poller startet ohne Konfiguration nicht", async () => {
    await withTikConfig(null, async () => {
        let called = false;
        const fetcher: TikFetcher = () => {
            called = true;
            return Promise.resolve(jsonResponse([]));
        };

        const poller = startPolling({ intervalMs: 10, fetcher });

        assertEquals(poller, null);
        await sleep(30);
        assertEquals(called, false);
    });
});
