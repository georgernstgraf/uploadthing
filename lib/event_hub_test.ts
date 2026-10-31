import { assertEquals } from "@std/assert";
import * as hub from "./event_hub.ts";

Deno.test("publish liefert je Kanal eine monotone Sequenz", () => {
    hub.resetHub();
    try {
        const seen: Array<{ seq: number; payload: string }> = [];
        const unsubscribe = hub.subscribe<string>("exam", (event) => {
            seen.push({ seq: event.seq, payload: event.payload });
        });

        assertEquals(hub.size("exam"), 1);
        assertEquals(hub.currentSeq("exam"), 0);
        assertEquals(hub.publish("exam", "a"), 1);
        assertEquals(hub.publish("exam", "b"), 2);
        // Ein anderer Kanal zählt eigenständig.
        assertEquals(hub.publish("activity", "x"), 1);
        assertEquals(seen, [{ seq: 1, payload: "a" }, { seq: 2, payload: "b" }]);

        unsubscribe();
        assertEquals(hub.size("exam"), 0);
        // Weitermelden ohne Zuhörer ändert die Sequenz weiter.
        assertEquals(hub.publish("exam", "c"), 3);
        assertEquals(seen.length, 2);
    } finally {
        hub.resetHub();
    }
});

Deno.test("Abmelden wirkt sofort, mehrfach und ohne Nebenwirkung", () => {
    hub.resetHub();
    try {
        let calls = 0;
        const unsubscribe = hub.subscribe("exam", () => calls++);
        hub.publish("exam", null);
        assertEquals(calls, 1);

        unsubscribe();
        unsubscribe();
        hub.publish("exam", null);
        assertEquals(calls, 1);
        assertEquals(hub.size("exam"), 0);
    } finally {
        hub.resetHub();
    }
});

Deno.test("Abmelden während publish stört den laufenden Versand nicht", () => {
    hub.resetHub();
    try {
        const calls: string[] = [];
        const unsubscribeSecond = hub.subscribe("exam", () => calls.push("zweiter"));
        hub.subscribe("exam", () => {
            calls.push("erster");
            // Der erste meldet den zweiten während desselben Versands ab.
            unsubscribeSecond();
        });

        hub.publish("exam", null);
        // Der Versand läuft über eine Kopie: der zweite bekommt dieses
        // Ereignis noch, das nächste nicht mehr.
        assertEquals(calls, ["zweiter", "erster"]);
        assertEquals(hub.size("exam"), 1);

        hub.publish("exam", null);
        assertEquals(calls, ["zweiter", "erster", "erster"]);
    } finally {
        hub.resetHub();
    }
});

Deno.test("ein werfender Listener bricht die übrigen nicht ab", () => {
    hub.resetHub();
    const originalError = console.error;
    const logged: unknown[] = [];
    console.error = (...args: unknown[]) => {
        logged.push(args[0]);
    };

    try {
        let secondCalls = 0;
        hub.subscribe("exam", () => {
            throw new Error("kaputt");
        });
        hub.subscribe("exam", () => secondCalls++);

        assertEquals(hub.publish("exam", null), 1);
        assertEquals(secondCalls, 1);
        assertEquals(logged.length, 1);
        assertEquals(
            String(logged[0]).includes('Kanal "exam"'),
            true,
        );
    } finally {
        console.error = originalError;
        hub.resetHub();
    }
});
