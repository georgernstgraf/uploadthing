import { assertEquals, assertStringIncludes } from "@std/assert";
import { createShutdown } from "./shutdown.ts";

/** Sammelt Aufrufe in Reihenfolge, inklusive Exit-Code. */
function recorder() {
    const calls: string[] = [];
    const steps = {
        stopBackgroundWork: () => {
            calls.push("stopBackgroundWork");
            return Promise.resolve();
        },
        drainServer: () => {
            calls.push("drainServer");
            return Promise.resolve();
        },
        closeDatabase: () => {
            calls.push("closeDatabase");
        },
        exit: (code: number) => {
            calls.push(`exit:${code}`);
        },
    };
    return { calls, steps };
}

Deno.test("shutdown - Reihenfolge: Polling, Drain, SQLite, Exit 0", async () => {
    const { calls, steps } = recorder();
    const shutdown = createShutdown(steps, { log: () => {}, logError: () => {} });

    await shutdown("SIGTERM");

    assertEquals(calls, [
        "stopBackgroundWork",
        "drainServer",
        "closeDatabase",
        "exit:0",
    ]);
});

Deno.test("shutdown - zweites Signal beendet sofort mit Code 1", async () => {
    const { calls, steps } = recorder();
    const messages: string[] = [];
    const shutdown = createShutdown(steps, {
        log: () => {},
        logError: (message) => messages.push(message),
    });

    await shutdown("SIGTERM");
    await shutdown("SIGTERM");

    // Die Schritte laufen nicht erneut, nur der zweite Exit.
    assertEquals(calls, [
        "stopBackgroundWork",
        "drainServer",
        "closeDatabase",
        "exit:0",
        "exit:1",
    ]);
    assertStringIncludes(messages[0], "erneut empfangen");
});

Deno.test("shutdown - hängender Drain wird vom Watchdog beendet", async () => {
    const exited = Promise.withResolvers<number>();
    const messages: string[] = [];
    let drained = false;

    const shutdown = createShutdown({
        stopBackgroundWork: () => Promise.resolve(),
        drainServer: () => new Promise<void>(() => {}), // hängt absichtlich
        closeDatabase: () => {
            drained = true;
        },
        exit: (code) => exited.resolve(code),
    }, {
        graceMs: 10,
        log: () => {},
        logError: (message) => messages.push(message),
    });

    void shutdown("SIGTERM");

    // Der Watchdog ist bewusst unref'd (er soll den Prozess nicht am
    // Leben halten); im Test hält ein eigener Timer die Schleife offen,
    // bis `exit` aufgerufen wurde.
    const keepAlive = setInterval(() => {}, 1);
    const code = await exited.promise;
    clearInterval(keepAlive);

    assertEquals(code, 1);
    // SQLite bleibt offen, weil der Server nicht ausgelaufen ist.
    assertEquals(drained, false);
    assertStringIncludes(messages[0], "Shutdown hängt");
});

Deno.test("shutdown - fehlschlagender Schritt blockiert die übrigen nicht", async () => {
    const { calls, steps } = recorder();
    const messages: string[] = [];
    const shutdown = createShutdown({
        ...steps,
        stopBackgroundWork: () => Promise.reject(new Error("Tik weg")),
    }, {
        log: () => {},
        logError: (message, detail) => messages.push(`${message} ${detail}`),
    });

    await shutdown("SIGTERM");

    assertEquals(calls, ["drainServer", "closeDatabase", "exit:0"]);
    assertStringIncludes(messages[0], "Tik weg");
});

Deno.test("shutdown - Fehler beim SQLite-Schließen verhindert den Exit nicht", async () => {
    const { calls, steps } = recorder();
    const messages: string[] = [];
    const shutdown = createShutdown({
        ...steps,
        closeDatabase: () => {
            throw new Error("Handle kaputt");
        },
    }, {
        log: () => {},
        logError: (message, detail) => messages.push(`${message} ${detail}`),
    });

    await shutdown("SIGTERM");

    assertEquals(calls, ["stopBackgroundWork", "drainServer", "exit:0"]);
    assertStringIncludes(messages[0], "Handle kaputt");
});
