import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import config from "../lib/config.ts";
import * as exam from "./exam.ts";
import { clearExamState } from "../test/helpers/forensics_fixture.ts";
import type { ExamModeRunner } from "./admin.ts";

function fakeClock(startIso: string) {
    let currentMs = new Date(startIso).getTime();
    return {
        now: () => new Date(currentMs),
        advance: (seconds: number) => {
            currentMs += seconds * 1000;
        },
    };
}

function internetFreeRunner(capturedArgs: string[]): ExamModeRunner {
    return (_command: string, args: string[]) => {
        capturedArgs.push(...args);
        return Promise.resolve({ code: 0, stdout: "internet enabled", stderr: "" });
    };
}

Deno.test("start setzt ein laufendes Examen mit voller Restzeit", async () => {
    clearExamState();
    try {
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        exam.start(3600, clock.now);

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

Deno.test("start während laufendem Examen wirft Fehler", () => {
    clearExamState();
    try {
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        exam.start(3600, clock.now);

        assertThrows(
            () => exam.start(1800, clock.now),
            Error,
            "Es läuft bereits ein Examen.",
        );
    } finally {
        clearExamState();
    }
});

Deno.test("start während pausiertem Examen wirft Fehler", () => {
    clearExamState();
    try {
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        exam.start(3600, clock.now);
        clock.advance(30);
        exam.pause(clock.now);

        assertThrows(
            () => exam.start(1800, clock.now),
            Error,
            "Es läuft bereits ein Examen.",
        );
    } finally {
        clearExamState();
    }
});

Deno.test("start mit ungültiger Dauer wirft Fehler", () => {
    clearExamState();
    try {
        for (const invalid of [0, -10, 1.5]) {
            assertThrows(
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
        exam.start(100, clock.now);
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
        exam.start(100, clock.now);
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

Deno.test("resume außerhalb eines pausierten Examens wirft Fehler", () => {
    clearExamState();
    try {
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        assertThrows(
            () => exam.resume(clock.now),
            Error,
            "Das Examen ist nicht pausiert.",
        );

        exam.start(100, clock.now);
        assertThrows(
            () => exam.resume(clock.now),
            Error,
            "Das Examen ist nicht pausiert.",
        );
    } finally {
        clearExamState();
    }
});

Deno.test("stop beendet das Examen und schaltet das Internet frei", async () => {
    clearExamState();
    const originalCommand = config.EXAMMODE_COMMAND;
    const originalInternetState = config.INTERNET_ACTIVE;
    try {
        config.EXAMMODE_COMMAND = "exammode";
        config.INTERNET_ACTIVE = false;

        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        exam.start(100, clock.now);
        clock.advance(30);

        const capturedArgs: string[] = [];
        await exam.stop(internetFreeRunner(capturedArgs));

        assertEquals(capturedArgs, ["stop"]);
        assertEquals(exam.getState()?.status, "stopped");
        assertEquals(config.INTERNET_ACTIVE, true);
        assertEquals(await exam.getRemainingSeconds(clock.now), 0);
    } finally {
        config.EXAMMODE_COMMAND = originalCommand;
        config.INTERNET_ACTIVE = originalInternetState;
        clearExamState();
    }
});

Deno.test("stop außerhalb eines laufenden oder pausierten Examens wirft Fehler", async () => {
    clearExamState();
    const originalCommand = config.EXAMMODE_COMMAND;
    const originalInternetState = config.INTERNET_ACTIVE;
    try {
        config.EXAMMODE_COMMAND = "exammode";
        config.INTERNET_ACTIVE = false;

        const capturedArgs: string[] = [];
        assertRejects(
            () => exam.stop(internetFreeRunner(capturedArgs)),
            Error,
            "Es läuft kein Examen, das gestoppt werden kann.",
        );
        assertEquals(capturedArgs, []);

        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        exam.start(100, clock.now);
        await exam.stop(internetFreeRunner(capturedArgs));
        assertRejects(
            () => exam.stop(internetFreeRunner(capturedArgs)),
            Error,
            "Es läuft kein Examen, das gestoppt werden kann.",
        );
    } finally {
        config.EXAMMODE_COMMAND = originalCommand;
        config.INTERNET_ACTIVE = originalInternetState;
        clearExamState();
    }
});

Deno.test("addExtra verlängert ein laufendes Examen", async () => {
    clearExamState();
    try {
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        exam.start(100, clock.now);
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
        exam.start(100, clock.now);
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

Deno.test("addExtra ohne laufendes Examen oder mit ungültiger Zeit wirft Fehler", () => {
    clearExamState();
    try {
        assertThrows(
            () => exam.addExtra(60),
            Error,
            "Es läuft kein Examen, das verlängert werden kann.",
        );

        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        exam.start(100, clock.now);
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

Deno.test("natürlicher Ablauf stoppt das Examen und schaltet das Internet frei", async () => {
    clearExamState();
    const originalCommand = config.EXAMMODE_COMMAND;
    const originalInternetState = config.INTERNET_ACTIVE;
    try {
        config.EXAMMODE_COMMAND = "exammode";
        config.INTERNET_ACTIVE = false;

        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        exam.start(60, clock.now);
        clock.advance(61);

        const capturedArgs: string[] = [];
        assertEquals(
            await exam.getRemainingSeconds(clock.now, internetFreeRunner(capturedArgs)),
            0,
        );
        assertEquals(capturedArgs, ["stop"]);
        assertEquals(exam.getState()?.status, "stopped");
        assertEquals(config.INTERNET_ACTIVE, true);
    } finally {
        config.EXAMMODE_COMMAND = originalCommand;
        config.INTERNET_ACTIVE = originalInternetState;
        clearExamState();
    }
});

Deno.test("Restzeit läuft sekundengenau ab", async () => {
    clearExamState();
    const originalCommand = config.EXAMMODE_COMMAND;
    const originalInternetState = config.INTERNET_ACTIVE;
    try {
        config.EXAMMODE_COMMAND = "exammode";
        config.INTERNET_ACTIVE = false;

        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        exam.start(60, clock.now);
        clock.advance(59);
        assertEquals(await exam.getRemainingSeconds(clock.now), 1);

        clock.advance(1);
        const capturedArgs: string[] = [];
        assertEquals(
            await exam.getRemainingSeconds(clock.now, internetFreeRunner(capturedArgs)),
            0,
        );
        assertEquals(exam.getState()?.status, "stopped");
    } finally {
        config.EXAMMODE_COMMAND = originalCommand;
        config.INTERNET_ACTIVE = originalInternetState;
        clearExamState();
    }
});

Deno.test("Pausen zählen mehrfach korrekt zusammen", async () => {
    clearExamState();
    try {
        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        exam.start(120, clock.now);
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
    const originalCommand = config.EXAMMODE_COMMAND;
    const originalInternetState = config.INTERNET_ACTIVE;
    try {
        config.EXAMMODE_COMMAND = "exammode";
        config.INTERNET_ACTIVE = false;

        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        exam.start(60, clock.now);
        await exam.stop(internetFreeRunner([]));

        const secondClock = fakeClock("2026-10-12T09:00:00.000Z");
        exam.start(45, secondClock.now);
        assertEquals(exam.getState()?.status, "running");
        assertEquals(exam.getState()?.duration_seconds, 45);
        assertEquals(exam.getState()?.extra_seconds, 0);
        assertEquals(exam.getState()?.paused_seconds, 0);
        assertEquals(await exam.getRemainingSeconds(secondClock.now), 45);
    } finally {
        config.EXAMMODE_COMMAND = originalCommand;
        config.INTERNET_ACTIVE = originalInternetState;
        clearExamState();
    }
});

Deno.test("getRemainingSeconds liefert null ohne Examen und 0 nach Stopp", async () => {
    clearExamState();
    const originalCommand = config.EXAMMODE_COMMAND;
    const originalInternetState = config.INTERNET_ACTIVE;
    try {
        config.EXAMMODE_COMMAND = "exammode";
        config.INTERNET_ACTIVE = false;

        assertEquals(await exam.getRemainingSeconds(), null);

        const clock = fakeClock("2026-10-12T08:00:00.000Z");
        exam.start(60, clock.now);
        await exam.stop(internetFreeRunner([]));
        assertEquals(await exam.getRemainingSeconds(clock.now), 0);
    } finally {
        config.EXAMMODE_COMMAND = originalCommand;
        config.INTERNET_ACTIVE = originalInternetState;
        clearExamState();
    }
});
