import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import * as hub from "../lib/event_hub.ts";
import * as exam from "./exam.ts";
import { clearExamState, seedExamState } from "../test/helpers/forensics_fixture.ts";
import {
    fakeFirewall,
    TEST_OPNSENSE_CONFIG,
    withOpnsenseConfig,
} from "../test/helpers/opnsense_fixture.ts";

function fakeClock(startIso: string) {
    let currentMs = new Date(startIso).getTime();
    return {
        now: () => new Date(currentMs),
        advance: (seconds: number) => {
            currentMs += seconds * 1000;
        },
    };
}

function toggleCalls(calls: { url: string }[]): string[] {
    return calls
        .filter((call) => call.url.includes("toggleRule") || call.url.endsWith("/apply"))
        .map((call) => call.url.replace("https://firewall.test:8443", ""));
}

Deno.test("start setzt ein laufendes Examen mit voller Restzeit", async () => {
    clearExamState();
    try {
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        await exam.start(3600, clock.now);

        const state = exam.getState();
        assertEquals(state?.status, "running");
        assertEquals(state?.duration_seconds, 3600);
        assertEquals(state?.started_at?.toISOString(), "2026-10-12T08:00:00.000Z");
        assertEquals(state?.paused_seconds, 0);
        assertEquals(state?.extra_seconds, 0);
        assertEquals(await exam.getRemainingSeconds(clock.now), 3600);
    } finally {
        clearExamState();
    }
});

Deno.test("start sperrt die Firewall implizit", async () => {
    clearExamState();
    try {
        const firewall = fakeFirewall({ enabled: false });
        const clock = fakeClock("2026-10-12T08:00:00.000Z");

        await withOpnsenseConfig(TEST_OPNSENSE_CONFIG, async () => {
            const result = await exam.start(3600, clock.now, firewall.runner);

            assertEquals(result.ok, true);
            assertEquals(result.internet_active, false);
        });

        assertEquals(firewall.isEnabled(), true);
        assertEquals(toggleCalls(firewall.calls).length, 2);
        assertEquals(exam.getState()?.status, "running");
    } finally {
        clearExamState();
    }
});

Deno.test("start schreibt examstate auch, wenn die Sperre scheitert", async () => {
    clearExamState();
    try {
        const firewall = fakeFirewall({ enabled: false, applyStatus: 500 });
        const clock = fakeClock("2026-10-12T08:00:00.000Z");

        await withOpnsenseConfig(TEST_OPNSENSE_CONFIG, async () => {
            const result = await exam.start(3600, clock.now, firewall.runner);

            assertEquals(result.ok, false);
            assertEquals(
                result.stderr.startsWith(
                    "Regel wurde umgeschaltet, konnte aber nicht angewendet werden",
                ),
                true,
            );
        });

        assertEquals(exam.getState()?.status, "running");
        assertEquals(await exam.getRemainingSeconds(clock.now), 3600);
    } finally {
        clearExamState();
    }
});

Deno.test("start während laufendem Examen wirft Fehler", async () => {
    clearExamState();
    try {
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        await exam.start(3600, clock.now);

        await assertRejects(
            () => exam.start(1800, clock.now),
            Error,
            "Es läuft bereits ein Examen.",
        );
    } finally {
        clearExamState();
    }
});

Deno.test("start während pausiertem Examen wirft Fehler", async () => {
    clearExamState();
    try {
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        await exam.start(3600, clock.now);
        clock.advance(30);
        exam.pause(clock.now);

        await assertRejects(
            () => exam.start(1800, clock.now),
            Error,
            "Es läuft bereits ein Examen.",
        );
    } finally {
        clearExamState();
    }
});

Deno.test("start mit ungültiger Dauer wirft Fehler", async () => {
    clearExamState();
    try {
        for (const invalid of [0, -10, 1.5]) {
            await assertRejects(
                () => exam.start(invalid),
                Error,
                "Die Prüfungsdauer muss eine ganze Zahl größer als 0 sein.",
            );
        }
        assertEquals(exam.getState(), null);
    } finally {
        clearExamState();
    }
});

Deno.test("pause friert die Restzeit ein", async () => {
    clearExamState();
    try {
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        await exam.start(100, clock.now);
        clock.advance(30);
        exam.pause(clock.now);
        clock.advance(50);

        assertEquals(exam.getState()?.status, "paused");
        assertEquals(await exam.getRemainingSeconds(clock.now), 70);
    } finally {
        clearExamState();
    }
});

Deno.test("pause außerhalb eines laufenden Examens wirft Fehler", () => {
    clearExamState();
    try {
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        assertThrows(
            () => exam.pause(clock.now),
            Error,
            "Es läuft kein Examen, das pausiert werden kann.",
        );
    } finally {
        clearExamState();
    }
});

Deno.test("resume setzt den Countdown ab der eingefrorenen Restzeit fort", async () => {
    clearExamState();
    try {
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        await exam.start(100, clock.now);
        clock.advance(30);
        exam.pause(clock.now);
        clock.advance(50);
        exam.resume(clock.now);
        clock.advance(10);

        assertEquals(exam.getState()?.status, "running");
        assertEquals(await exam.getRemainingSeconds(clock.now), 60);
    } finally {
        clearExamState();
    }
});

Deno.test("resume außerhalb eines pausierten Examens wirft Fehler", async () => {
    clearExamState();
    try {
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        assertThrows(
            () => exam.resume(clock.now),
            Error,
            "Das Examen ist nicht pausiert.",
        );

        await exam.start(100, clock.now);
        assertThrows(
            () => exam.resume(clock.now),
            Error,
            "Das Examen ist nicht pausiert.",
        );
    } finally {
        clearExamState();
    }
});

Deno.test("stop beendet das Examen und gibt das Internet frei", async () => {
    clearExamState();
    try {
        const firewall = fakeFirewall({ enabled: true });
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        await exam.start(100, clock.now, firewall.runner);
        clock.advance(30);

        await withOpnsenseConfig(TEST_OPNSENSE_CONFIG, async () => {
            const result = await exam.stop(firewall.runner);
            assertEquals(result.ok, true);
            assertEquals(result.internet_active, true);
        });

        assertEquals(firewall.isEnabled(), false);
        assertEquals(exam.getState()?.status, "stopped");
        assertEquals(await exam.getRemainingSeconds(clock.now), 0);
    } finally {
        clearExamState();
    }
});

Deno.test("stop außerhalb eines laufenden oder pausierten Examens wirft Fehler", async () => {
    clearExamState();
    try {
        const firewall = fakeFirewall({ enabled: false });

        await assertRejects(
            () => exam.stop(firewall.runner),
            Error,
            "Es läuft kein Examen, das gestoppt werden kann.",
        );
        assertEquals(firewall.calls.length, 0);

        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        await exam.start(100, clock.now);
        await exam.stop(firewall.runner);
        await assertRejects(
            () => exam.stop(firewall.runner),
            Error,
            "Es läuft kein Examen, das gestoppt werden kann.",
        );
    } finally {
        clearExamState();
    }
});

Deno.test("addExtra verlängert ein laufendes Examen", async () => {
    clearExamState();
    try {
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        await exam.start(100, clock.now);
        clock.advance(30);
        exam.addExtra(60, clock.now);

        assertEquals(exam.getState()?.extra_seconds, 60);
        assertEquals(await exam.getRemainingSeconds(clock.now), 130);
    } finally {
        clearExamState();
    }
});

Deno.test("addExtra verlängert ein pausiertes Examen, ohne die Pause zu verschieben", async () => {
    clearExamState();
    try {
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        await exam.start(100, clock.now);
        clock.advance(30);
        exam.pause(clock.now);
        clock.advance(50);
        exam.addExtra(60, clock.now);

        assertEquals(await exam.getRemainingSeconds(clock.now), 130);

        exam.resume(clock.now);
        clock.advance(10);
        assertEquals(await exam.getRemainingSeconds(clock.now), 120);
    } finally {
        clearExamState();
    }
});

Deno.test("addExtra ohne laufendes Examen oder mit ungültiger Zeit wirft Fehler", async () => {
    clearExamState();
    try {
        assertThrows(
            () => exam.addExtra(60),
            Error,
            "Es läuft kein Examen, das verlängert werden kann.",
        );

        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        await exam.start(100, clock.now);
        for (const invalid of [0, -30, 2.5]) {
            assertThrows(
                () => exam.addExtra(invalid, clock.now),
                Error,
                "Die Zusatzzeit muss eine ganze Zahl größer als 0 sein.",
            );
        }
    } finally {
        clearExamState();
    }
});

Deno.test("natürlicher Ablauf stoppt das Examen und gibt das Internet frei", async () => {
    clearExamState();
    try {
        const firewall = fakeFirewall({ enabled: false });
        const clock = fakeClock("2026-10-12T08:00:00.000Z");

        await withOpnsenseConfig(TEST_OPNSENSE_CONFIG, async () => {
            await exam.start(60, clock.now, firewall.runner);
            assertEquals(firewall.isEnabled(), true);

            clock.advance(61);
            assertEquals(
                await exam.getRemainingSeconds(clock.now, firewall.runner),
                0,
            );
            assertEquals(firewall.isEnabled(), false);
            assertEquals(exam.getState()?.status, "stopped");
        });
    } finally {
        clearExamState();
    }
});

Deno.test("Restzeit läuft sekundengenau ab", async () => {
    clearExamState();
    try {
        const firewall = fakeFirewall({ enabled: true });
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        await exam.start(60, clock.now, firewall.runner);
        clock.advance(59);
        assertEquals(await exam.getRemainingSeconds(clock.now), 1);

        clock.advance(1);
        assertEquals(
            await exam.getRemainingSeconds(clock.now, firewall.runner),
            0,
        );
        assertEquals(exam.getState()?.status, "stopped");
    } finally {
        clearExamState();
    }
});

Deno.test("Pausen zählen mehrfach korrekt zusammen", async () => {
    clearExamState();
    try {
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        await exam.start(120, clock.now);
        clock.advance(30);
        exam.pause(clock.now);
        clock.advance(20);
        exam.resume(clock.now);
        clock.advance(25);
        exam.pause(clock.now);
        clock.advance(10);
        exam.resume(clock.now);
        clock.advance(30);

        assertEquals(await exam.getRemainingSeconds(clock.now), 35);
    } finally {
        clearExamState();
    }
});

Deno.test("start nach gestopptem Examen beginnt ein neues Examen", async () => {
    clearExamState();
    try {
        const firewall = fakeFirewall({ enabled: true });
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        await exam.start(60, clock.now, firewall.runner);
        await exam.stop(firewall.runner);

        const secondClock = fakeClock("2026-10-12T09:00:00.000Z");
        await exam.start(45, secondClock.now, firewall.runner);
        assertEquals(exam.getState()?.status, "running");
        assertEquals(exam.getState()?.duration_seconds, 45);
        assertEquals(exam.getState()?.extra_seconds, 0);
        assertEquals(exam.getState()?.paused_seconds, 0);
        assertEquals(await exam.getRemainingSeconds(secondClock.now), 45);
    } finally {
        clearExamState();
    }
});

Deno.test("getRemainingSeconds liefert null ohne Examen und 0 nach Stopp", async () => {
    clearExamState();
    try {
        assertEquals(await exam.getRemainingSeconds(), null);

        const firewall = fakeFirewall({ enabled: true });
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        await exam.start(60, clock.now, firewall.runner);
        await exam.stop(firewall.runner);
        assertEquals(await exam.getRemainingSeconds(clock.now), 0);
    } finally {
        clearExamState();
    }
});

Deno.test("Anmelde-Freigabe: außerhalb des Examens ist die Neuanmeldung offen", async () => {
    clearExamState();
    exam.resetStudentRegistrationAllowed();
    try {
        assertEquals(await exam.isStudentRegistrationOpen(), true);
        assertEquals(exam.isStudentRegistrationAllowed(), false);
    } finally {
        clearExamState();
        exam.resetStudentRegistrationAllowed();
    }
});

Deno.test("Anmelde-Freigabe: im Examen gesperrt, der Schalter öffnet ohne Frist", async () => {
    clearExamState();
    exam.resetStudentRegistrationAllowed();
    try {
        seedExamState("running");

        assertEquals(await exam.isStudentRegistrationOpen(), false);
        assertEquals(exam.getStudentRegistrationOpenedAt(), null);

        const clock = fakeClock("2026-10-12T08:05:00.000Z");
        exam.setStudentRegistrationAllowed(true, clock.now);

        assertEquals(exam.isStudentRegistrationAllowed(), true);
        assertEquals(
            exam.getStudentRegistrationOpenedAt()?.toISOString(),
            clock.now().toISOString(),
        );
        assertEquals(await exam.isStudentRegistrationOpen(), true);

        // Keine Frist: eine Stunde später ist die Freigabe unverändert.
        clock.advance(3600);
        assertEquals(exam.isStudentRegistrationAllowed(), true);
        assertEquals(
            exam.getStudentRegistrationOpenedAt()?.toISOString(),
            "2026-10-12T08:05:00.000Z",
        );

        exam.setStudentRegistrationAllowed(false);
        assertEquals(await exam.isStudentRegistrationOpen(), false);
        assertEquals(exam.getStudentRegistrationOpenedAt(), null);
    } finally {
        clearExamState();
        exam.resetStudentRegistrationAllowed();
    }
});

Deno.test("Anmelde-Freigabe: die Pause berührt sie nicht", async () => {
    clearExamState();
    exam.resetStudentRegistrationAllowed();
    try {
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        await exam.start(60, clock.now);
        exam.setStudentRegistrationAllowed(true, clock.now);

        exam.pause(clock.now);

        // Pause friert nur den Countdown ein (#161): Internet und
        // Anmeldung bleiben, wie sie eingestellt waren.
        assertEquals(exam.getState()?.status, "paused");
        assertEquals(exam.isStudentRegistrationAllowed(), true);
        assertEquals(await exam.isStudentRegistrationOpen(clock.now), true);
    } finally {
        clearExamState();
        exam.resetStudentRegistrationAllowed();
    }
});

Deno.test("Anmelde-Freigabe: ein neues Examen und das Exam-Ende schließen sie", async () => {
    clearExamState();
    exam.resetStudentRegistrationAllowed();
    try {
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        await exam.start(60, clock.now);
        exam.setStudentRegistrationAllowed(true, clock.now);
        assertEquals(exam.isStudentRegistrationAllowed(), true);

        await exam.stop();

        assertEquals(exam.isStudentRegistrationAllowed(), false);
        assertEquals(await exam.isStudentRegistrationOpen(clock.now), true);
    } finally {
        clearExamState();
        exam.resetStudentRegistrationAllowed();
    }
});

Deno.test("getStatusViewPassive lässt ein abgelaufenes Examen unangetastet", async () => {
    clearExamState();
    try {
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        await exam.start(60, clock.now);
        clock.advance(61);

        const passive = exam.getStatusViewPassive(clock.now);
        assertEquals(passive.status, "running");
        assertEquals(passive.remaining_seconds, 0);
        assertEquals(passive.open, false);
        assertEquals(passive.ends_at_ms, null);
        // Kein lazy Abschluss: der Zustand bleibt stehen.
        assertEquals(exam.getState()?.status, "running");

        // getStatusView() schließt weiterhin beim Abruf ab.
        const view = await exam.getStatusView(clock.now);
        assertEquals(view.status, "stopped");
        assertEquals(view.open, false);
        assertEquals(exam.getState()?.status, "stopped");
    } finally {
        clearExamState();
    }
});

Deno.test("zwei parallele Abschlüsse ergeben einen Firewall-Zyklus und einen Tick", async () => {
    clearExamState();
    hub.resetHub();
    try {
        const firewall = fakeFirewall({ enabled: false });
        const clock = fakeClock("2026-10-12T08:00:00.000Z");

        await withOpnsenseConfig(TEST_OPNSENSE_CONFIG, async () => {
            await exam.start(60, clock.now, firewall.runner);
            assertEquals(firewall.isEnabled(), true);
            const callsAfterStart = toggleCalls(firewall.calls).length;
            clock.advance(61);

            let ticks = 0;
            const unsubscribe = hub.subscribe(hub.EXAM_CHANNEL, () => {
                ticks += 1;
            });

            // Watchdog (lazy Pfad) und Admin-Stopp im selben Moment: der
            // zweite Aufrufer bekommt das Ergebnis des laufenden
            // Abschlusses, statt die Firewall ein zweites Mal zu runden.
            const [remaining, result, secondRemaining] = await Promise.all([
                exam.getRemainingSeconds(clock.now, firewall.runner),
                exam.stop(firewall.runner, clock.now),
                exam.getRemainingSeconds(clock.now, firewall.runner),
            ]);
            unsubscribe();

            assertEquals(remaining, 0);
            assertEquals(secondRemaining, 0);
            assertEquals(result.ok, true);
            // Genau ein Freigabe-Zyklus (toggle + apply), nicht zwei.
            assertEquals(toggleCalls(firewall.calls).length - callsAfterStart, 2);
            assertEquals(ticks, 1);
            assertEquals(exam.getState()?.status, "stopped");
            assertEquals(firewall.isEnabled(), false);
        });
    } finally {
        hub.resetHub();
        clearExamState();
    }
});

Deno.test("jede Zustandsänderung publiziert genau einen Tick", async () => {
    clearExamState();
    hub.resetHub();
    exam.resetStudentRegistrationAllowed();
    try {
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        const seq = () => hub.currentSeq(hub.EXAM_CHANNEL);

        assertEquals(seq(), 0);
        await exam.start(600, clock.now);
        assertEquals(seq(), 1);

        clock.advance(10);
        exam.pause(clock.now);
        assertEquals(seq(), 2);

        clock.advance(5);
        exam.resume(clock.now);
        assertEquals(seq(), 3);

        exam.addExtra(60, clock.now);
        assertEquals(seq(), 4);

        exam.setStudentRegistrationAllowed(true, clock.now);
        assertEquals(seq(), 5);
        exam.setStudentRegistrationAllowed(false, clock.now);
        assertEquals(seq(), 6);

        await exam.stop(undefined, clock.now);
        assertEquals(seq(), 7);
    } finally {
        exam.resetStudentRegistrationAllowed();
        hub.resetHub();
        clearExamState();
    }
});
