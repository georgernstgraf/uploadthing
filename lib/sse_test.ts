import { assertEquals, assertStringIncludes } from "@std/assert";
import {
    closeAllStreams,
    type EventStreamWriter,
    formatEvent,
    openEventStream,
    openStreams,
} from "./sse.ts";

/**
 * Echter Server auf Port 0: die Header und das Ende des Streams lassen
 * sich nur über die Leitung prüfen, nicht an einem selbstgebauten
 * `Response`.
 */
function startServer(handler: (request: Request) => Response) {
    const abort = new AbortController();
    const server = Deno.serve(
        {
            hostname: "127.0.0.1",
            port: 0,
            signal: abort.signal,
            onListen: () => {},
        },
        handler,
    );

    return {
        server,
        abort,
        url: `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}/events`,
    };
}

Deno.test("openEventStream setzt nur Content-Type und Cache-Control", () => {
    // Direkt am Response geprüft: `Transfer-Encoding` und `Connection`
    // sind über HTTP/2 verboten, also setzt sie dieses Modul nie selbst.
    // Was der Server über HTTP/1.1 selbst aushandelt, ist seine Sache.
    const response = openEventStream(new Request("http://127.0.0.1/events"), {
        onOpen: (stream) => stream.close(),
    });

    assertEquals(
        [...response.headers.keys()].sort(),
        ["cache-control", "content-type"],
    );
    assertEquals(
        response.headers.get("content-type"),
        "text/event-stream; charset=utf-8",
    );
    assertEquals(response.headers.get("cache-control"), "no-store");
    assertEquals(openStreams(), 0);
});

Deno.test("openEventStream liefert die SSE-Header und den ersten Frame", async () => {
    const { server, abort, url } = startServer((request) =>
        openEventStream(request, {
            heartbeatMs: 60_000,
            onOpen: (stream) => {
                stream.write(formatEvent("exam", { seq: 1 }));
                stream.write(formatEvent("exam", { seq: 2 }));
            },
        })
    );

    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
        const response = await fetch(url);
        assertEquals(response.status, 200);
        assertEquals(
            response.headers.get("content-type"),
            "text/event-stream; charset=utf-8",
        );
        assertEquals(response.headers.get("cache-control"), "no-store");
        // Kein `Connection: keep-alive` (über HTTP/2 verboten).
        assertEquals(response.headers.get("connection"), null);
        assertEquals(openStreams(), 1);

        const body = response.body;
        if (!body) {
            throw new Error("Antwort ohne Body");
        }
        reader = body.getReader();
        const decoder = new TextDecoder();
        let text = "";
        while (!text.includes('"seq":2')) {
            const { value, done } = await reader.read();
            if (done) {
                break;
            }
            text += decoder.decode(value, { stream: true });
        }

        assertEquals(
            text,
            formatEvent("exam", { seq: 1 }) + formatEvent("exam", { seq: 2 }),
        );
        // Kein Event-Log, also kein `id:`-Feld.
        assertEquals(text.includes("id:"), false);
    } finally {
        closeAllStreams();
        abort.abort();
        await server.finished;
        await reader?.cancel().catch(() => {});
    }
});

Deno.test("closeAllStreams beendet den Reader, finished löst sofort auf", async () => {
    // Shutdown-Fall aus #161: ohne `closeAllStreams()` bleibt der offene
    // Stream ein in-flight Request, `server.finished` hängt bis zum
    // 10-s-Watchdog, und der Restart dauert wieder 20 s.
    let writer: EventStreamWriter | undefined;
    const { server, abort, url } = startServer((request) =>
        openEventStream(request, {
            heartbeatMs: 60_000,
            onOpen: (stream) => {
                writer = stream;
                stream.write(formatEvent("activity", { seq: 1 }));
            },
        })
    );

    const finished = server.finished;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
        const response = await fetch(url);
        const body = response.body;
        if (!body) {
            throw new Error("Antwort ohne Body");
        }
        reader = body.getReader();

        const first = await reader.read();
        assertEquals(first.done, false);
        assertStringIncludes(new TextDecoder().decode(first.value), "event: activity");
        assertEquals(openStreams(), 1);

        const started = performance.now();
        closeAllStreams();
        assertEquals(openStreams(), 0);

        // Der Reader sieht ein sauberes Ende, keine Ausnahme.
        const end = await reader.read();
        assertEquals(end.done, true);

        // Ein Schreibversuch nach dem Schließen ist folgenlos.
        writer?.write(formatEvent("activity", { seq: 2 }));

        abort.abort();
        await finished;
        assertEquals(performance.now() - started < 2000, true);
    } finally {
        closeAllStreams();
        abort.abort();
        await finished.catch(() => {});
        await reader?.cancel().catch(() => {});
    }
});
