import { assertEquals } from "@std/assert";
import * as hub from "../lib/event_hub.ts";
import * as exam from "./exam.ts";
import * as watchdog from "./exam_watchdog.ts";
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

/**
 * Scheduler-Attrappe: merkt sich Verzögerungen und den offenen Timer.
 * `fire()` löst genau den zuletzt geplanten Timer aus.
 */
function fakeScheduler() {
    let pending: (() => void) | null = null;
    const delays: number[] = [];
    let cancellations = 0;

    return {
        scheduler: {
            schedule: (callback: () => void, delayMs: number) => {
                delays.push(delayMs);
                pending = callback;
                return delays.length;
            },
            cancel: () => {
                cancellations += 1;
                pending = null;
            },
        },
        delays,
        cancellations: () => cancellations,
        pending: () => pending,
        fire: () => {
            const callback = pending;
            pending = null;
            if (!callback) {
                throw new Error("kein Timer geplant");
            }
            callback();
        },
    };
}

/** Sauberer Ausgangszustand: kein Timer, kein Abo, kein Exam-State. */
function reset(): void {
    watchdog.disarm();
    watchdog.setWatchdogScheduler();
    hub.resetHub();
    exam.resetStudentRegistrationAllowed();
    clearExamState();
}

Deno.test("arm plant die Restzeit plus Sicherheitsabstand", async () => {
    reset();
    const clock = fakeClock("2026-10-12T08:00:00.000Z");
    const fake = fakeScheduler();
    watchdog.setWatchdogScheduler(fake.scheduler);

    try {
        await exam.start(100, clock.now);
        clock.advance(30);

        watchdog.arm(clock.now);

        assertEquals(fake.delays, [70_000 + watchdog.SAFETY_MARGIN_MS]);
        assertEquals(fake.pending() !== null, true);
    } finally {
        reset();
    }
});

Deno.test("arm bleibt ohne Examen unscharf, die Pause entwaffnet über den Tick", async () => {
    reset();
    const clock = fakeClock("2026-10-12T08:00:00.000Z");
    const fake = fakeScheduler();
    watchdog.setWatchdogScheduler(fake.scheduler);

    try {
        // idle: kein Examen, kein Timer.
        watchdog.arm(clock.now);
        assertEquals(fake.delays, []);
        assertEquals(fake.pending(), null);

        // Der Start meldet sich als Tick; der Watchdog wird dadurch scharf.
        await exam.start(100, clock.now);
        assertEquals(fake.delays.length, 1);
        assertEquals(fake.pending() !== null, true);

        // Die Pause entwaffnet ihn über denselben Tick.
        exam.pause(clock.now);
        assertEquals(fake.pending(), null);
        assertEquals(fake.delays.length, 1);
    } finally {
        reset();
    }
});

Deno.test("Pause entwaffnet den Watchdog, Fortsetzen re-armt ihn", async () => {
    reset();
    const clock = fakeClock("2026-10-12T08:00:00.000Z");
    const fake = fakeScheduler();
    watchdog.setWatchdogScheduler(fake.scheduler);

    try {
        await exam.start(100, clock.now);
        clock.advance(30);
        watchdog.arm(clock.now);
        assertEquals(fake.pending() !== null, true);

        exam.pause(clock.now);
        assertEquals(fake.pending(), null);
        assertEquals(fake.delays.length, 1);
        assertEquals(fake.cancellations() > 0, true);

        // Die Pause läuft nicht ab: eine Stunde später kommt kein Timer.
        clock.advance(3600);
        await new Promise((resolve) => setTimeout(resolve, 0));
        assertEquals(fake.pending(), null);

        exam.resume(clock.now);
        assertEquals(fake.delays.length, 2);
        assertEquals(fake.delays[1], 70_000 + watchdog.SAFETY_MARGIN_MS);
    } finally {
        reset();
    }
});

Deno.test("Stopp entwaffnet den Watchdog", async () => {
    reset();
    const clock = fakeClock("2026-10-12T08:00:00.000Z");
    const fake = fakeScheduler();
    watchdog.setWatchdogScheduler(fake.scheduler);

    try {
        await exam.start(100, clock.now);
        watchdog.arm(clock.now);
        assertEquals(fake.pending() !== null, true);

        await exam.stop(undefined, clock.now);

        assertEquals(exam.getState()?.status, "stopped");
        assertEquals(fake.pending(), null);
        assertEquals(fake.delays.length, 1);
    } finally {
        reset();
    }
});

Deno.test("Feuern beendet das Examen und publiziert genau einmal", async () => {
    reset();
    const firewall = fakeFirewall({ enabled: false });
    const clock = fakeClock("2026-10-12T08:00:00.000Z");
    const fake = fakeScheduler();
    watchdog.setWatchdogScheduler(fake.scheduler);

    try {
        await withOpnsenseConfig(TEST_OPNSENSE_CONFIG, async () => {
            await exam.start(60, clock.now, firewall.runner);
            assertEquals(firewall.isEnabled(), true);

            // Aufgelaufen, aber noch niemand hat nachgefragt: der passive
            // Blick sagt "running" mit 0 Sekunden Restzeit.
            clock.advance(61);
            assertEquals(exam.getStatusViewPassive(clock.now).remaining_seconds, 0);

            let ticks = 0;
            const firstTick = new Promise<void>((resolve) => {
                hub.subscribe(hub.EXAM_CHANNEL, () => {
                    ticks += 1;
                    resolve();
                });
            });

            watchdog.arm(clock.now, firewall.runner);
            assertEquals(fake.delays, [watchdog.SAFETY_MARGIN_MS]);

            fake.fire();
            await firstTick;

            assertEquals(ticks, 1);
            assertEquals(exam.getState()?.status, "stopped");
            assertEquals(firewall.isEnabled(), false);
            // Kein zweiter Timer: der Abschluss ist erledigt.
            assertEquals(fake.pending(), null);
        });
    } finally {
        reset();
    }
});
