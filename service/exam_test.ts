import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import * as exam from "./exam.ts";
import { clearExamState } from "../test/helpers/forensics_fixture.ts";
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
