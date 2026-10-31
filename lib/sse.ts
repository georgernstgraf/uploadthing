/**
 * Server-Sent Events ohne `hono/streaming` (#161).
 *
 * **Warum nicht `streamSSE`?** Der Helfer setzt
 * `Transfer-Encoding: chunked` und `Connection: keep-alive`. Der Dienst
 * läuft mit nativem TLS inklusive ALPN `h2`; über HTTP/2 sind beide
 * Header verboten und die Antwort bricht. Deshalb hier ein eigener
 * `Response` mit einem `ReadableStream` und genau zwei Headern.
 *
 * Bewusst ohne Hono-Context: die Funktion nimmt den `Request`, damit sie
 * ohne Router testbar ist (echter `Deno.serve` auf Port 0).
 *
 * Kein `id:`-Feld und keine `Last-Event-ID`-Auswertung: es gibt kein
 * Event-Log. Beim Verbinden schickt der Aufrufer über `onOpen` einen
 * vollständigen Snapshot; nach einem Reconnect gilt dasselbe.
 */

/** Heartbeat-Intervall gegen stille Verbindungen (Proxys, Browser). */
export const HEARTBEAT_MS = 20_000;

export type EventStreamWriter = {
    /**
     * Reiht einen fertigen Frame in die Schreibkette ein. Die Aufrufe
     * sind synchron, die Schreibvorgänge laufen serialisiert — die
     * Reihenfolge bleibt also erhalten. Ein Schreibfehler (Client weg)
     * räumt den Stream auf und wird nicht nach außen geworfen.
     */
    write: (frame: string) => void;
    /** Schließt den Stream; mehrfach aufrufbar. */
    close: () => void;
};

export type EventStreamOptions = {
    /**
     * Wird direkt beim Verbinden gerufen. Hier schreibt der Aufrufer den
     * ersten Frame (den Snapshot) und meldet seine Abos an. Die Rückgabe
     * ist ein Aufräumschritt (Abos abbestellen) und läuft beim Schließen.
     */
    onOpen?: (stream: EventStreamWriter) => (() => void) | void;
    /** Nur für Tests: kürzeres Heartbeat-Intervall. */
    heartbeatMs?: number;
};

/**
 * Baut einen SSE-Frame. `data` ist immer eine Zeile, weil
 * `JSON.stringify` Zeilenumbrüche maskiert.
 */
export function formatEvent(type: string, data: unknown): string {
    return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

const open = new Set<EventStreamWriter>();

/** Anzahl offener Streams — für Tests und Diagnose. */
export function openStreams(): number {
    return open.size;
}

/**
 * Schließt alle offenen Streams. Muss beim Shutdown **vor** dem
 * Auslaufen des HTTP-Servers laufen: ein offener SSE-Request ist sonst
 * ein „in-flight request" und `server.finished` wartet bis zum
 * 10-s-Watchdog. Idempotent; das Schließen wird angestoßen, nicht
 * abgewartet.
 */
export function closeAllStreams(): void {
    for (const stream of [...open]) {
        stream.close();
    }
    open.clear();
}

/**
 * Öffnet einen SSE-Stream für `request` und liefert die Antwort.
 *
 * Header exakt `text/event-stream; charset=utf-8` und `Cache-Control:
 * no-store`. Kein `Connection`, kein `Transfer-Encoding`, kein
 * `Content-Encoding` — was der Server über HTTP/1.1 selbst aushandelt,
 * ist seine Sache.
 */
export function openEventStream(
    request: Request,
    options: EventStreamOptions = {},
): Response {
    const encoder = new TextEncoder();
    let stream: EventStreamWriter | null = null;

    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            stream = createStream(
                controller,
                encoder,
                request,
                options,
            );
        },
        cancel() {
            // Der Client ist weg oder die Verbindung ist zugegangen.
            stream?.close();
        },
    });

    return new Response(body, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-store",
        },
    });
}

function createStream(
    controller: ReadableStreamDefaultController<Uint8Array>,
    encoder: TextEncoder,
    request: Request,
    options: EventStreamOptions,
): EventStreamWriter {
    const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
    let closed = false;
    let teardown: (() => void) | undefined;
    // Schreibkette: jeder Frame hängt sich hinten an, damit die
    // Reihenfolge auch bei asynchronen Erzeugern stimmt.
    let queue: Promise<void> = Promise.resolve();

    const close = (): void => {
        if (closed) {
            return;
        }
        closed = true;
        clearInterval(heartbeat);
        request.signal.removeEventListener("abort", close);
        open.delete(stream);
        if (teardown) {
            try {
                teardown();
            } catch (error) {
                console.error("SSE: Aufräumen ist gescheitert:", error);
            }
            teardown = undefined;
        }
        try {
            controller.close();
        } catch {
            // Schon geschlossen oder abgebrochen — nichts zu tun.
        }
    };

    const write = (frame: string): void => {
        if (closed) {
            return;
        }
        queue = queue
            .then(() => {
                if (closed) {
                    return;
                }
                controller.enqueue(encoder.encode(frame));
            })
            .catch(() => {
                // Client weg: der Stream ist nicht mehr beschreibbar.
                close();
            });
    };

    const stream: EventStreamWriter = { write, close };
    open.add(stream);

    const heartbeat = setInterval(() => write(": ping\n\n"), heartbeatMs);
    Deno.unrefTimer(heartbeat);

    if (request.signal.aborted) {
        close();
        return stream;
    }
    request.signal.addEventListener("abort", close, { once: true });

    try {
        teardown = options.onOpen?.(stream) ?? undefined;
    } catch (error) {
        console.error("SSE: erster Frame ist gescheitert:", error);
        close();
    }

    return stream;
}
