import { assertEquals } from "@std/assert";
import * as hub from "../lib/event_hub.ts";
import * as cookiepresentsRepo from "../repo/cookiepresents.ts";
import * as registrationsRepo from "../repo/registrations.ts";
import {
    clearForensicsByIp,
    clearForensicsByUserEmail,
    upsertFixtureUser,
} from "../test/helpers/forensics_fixture.ts";
import * as events from "./events.ts";
import * as userService from "./user.ts";

/**
 * `register` schreibt mit der echten Uhr, deshalb ein Fenster um jetzt
 * statt fester Testzeitpunkte.
 */
function recentRange(): { start: Date; end: Date } {
    const now = Date.now();
    return {
        start: new Date(now - 60_000),
        end: new Date(now + 60_000),
    };
}

function uniqueIp(): string {
    const suffix = crypto.randomUUID().slice(0, 8);
    const a = Number.parseInt(suffix.slice(0, 2), 16);
    const b = Number.parseInt(suffix.slice(2, 4), 16);
    return `198.18.${a}.${b}`;
}

/** Scheduler-Stub wie in `service/events_test.ts`: das Fenster läuft von Hand. */
function fakeWindow() {
    let pending: (() => void) | null = null;
    const delays: number[] = [];

    const hooks: events.ActivityHooks = {
        schedule: (callback, delayMs) => {
            delays.push(delayMs);
            pending = callback;
            return delays.length;
        },
        cancel: () => {
            pending = null;
        },
    };

    return {
        hooks,
        delays,
        flush: () => {
            const callback = pending;
            pending = null;
            if (!callback) {
                throw new Error("kein Fenster offen");
            }
            callback();
        },
    };
}

Deno.test("register schreibt Registrierung und Präsenz mit demselben Zeitpunkt (#163)", async () => {
    const ip = uniqueIp();
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `register-same-at-${suffix}@example.com`;

    try {
        const fixture = await upsertFixtureUser({
            email,
            name: "Register SameAt",
            klasse: "5AHITM",
        });

        await userService.register(
            { email, name: "Register SameAt", klasse: "5AHITM" },
            ip,
        );

        const { start, end } = recentRange();
        const registrations = registrationsRepo.byIPInRange(ip, start, end);
        const presences = cookiepresentsRepo.byIPInRange(ip, start, end);

        assertEquals(registrations.length, 1);
        assertEquals(presences.length, 1);
        assertEquals(registrations[0].userId, fixture.id);
        assertEquals(presences[0].userId, fixture.id);
        // Die Anmeldung ist zugleich eine Präsenzaussage — mit demselben
        // Zeitpunkt, sonst sortiert die Karte an der Registrierung vorbei.
        assertEquals(
            presences[0].at.toISOString(),
            registrations[0].at.toISOString(),
        );
    } finally {
        clearForensicsByIp(ip);
        await clearForensicsByUserEmail(email);
    }
});

Deno.test("register erzeugt innerhalb des Fensters keine zweite Präsenzzeile (#163)", async () => {
    const ip = uniqueIp();
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `register-dedupe-${suffix}@example.com`;

    try {
        await upsertFixtureUser({
            email,
            name: "Register Dedupe",
            klasse: "5AHITM",
        });
        const userData = { email, name: "Register Dedupe", klasse: "5AHITM" };

        await userService.register(userData, ip);
        await userService.register(userData, ip);

        // Jede Anmeldung bleibt im Audit, die Präsenz bleibt dedupliziert.
        const { start, end } = recentRange();
        assertEquals(registrationsRepo.byIPInRange(ip, start, end).length, 2);
        assertEquals(cookiepresentsRepo.byIPInRange(ip, start, end).length, 1);
    } finally {
        clearForensicsByIp(ip);
        await clearForensicsByUserEmail(email);
    }
});

Deno.test("register meldet den Identitätswechsel einer IP als Karten-Ereignis (#163)", async () => {
    hub.resetHub();
    events.resetActivity();
    const ip = uniqueIp();
    const suffix = crypto.randomUUID().slice(0, 8);
    const emailA = `register-switch-a-${suffix}@example.com`;
    const emailB = `register-switch-b-${suffix}@example.com`;
    const window = fakeWindow();
    events.setActivityHooks(window.hooks);

    const batches: string[][] = [];
    const unsubscribe = events.subscribeActivity((components) =>
        batches.push(components)
    );

    try {
        const userA = await upsertFixtureUser({
            email: emailA,
            name: "Register Switch A",
            klasse: "5AHITM",
        });
        await upsertFixtureUser({
            email: emailB,
            name: "Register Switch B",
            klasse: "5AHITM",
        });

        // Erste Anmeldung dieser IP: neue Identität.
        await userService.register(
            { email: emailA, name: "Register Switch A", klasse: "5AHITM" },
            ip,
        );
        window.flush();
        // Die Registrierung selbst ist nur Präsenz; erst der
        // Identitätswechsel ist ein Karten-Ereignis (#163).
        assertEquals(batches, [["cards"]]);

        // Zweiter User auf derselben IP: Presence-Zeile plus Karten-Ereignis.
        await userService.register(
            { email: emailB, name: "Register Switch B", klasse: "5AHITM" },
            ip,
        );
        assertEquals(
            cookiepresentsRepo.getLatestUserIdForIP(ip) !== userA.id,
            true,
            "Die neueste Identität der IP muss gewechselt haben",
        );
        window.flush();
        assertEquals(batches, [["cards"], ["cards"]]);
    } finally {
        unsubscribe();
        clearForensicsByIp(ip);
        await clearForensicsByUserEmail(emailA);
        await clearForensicsByUserEmail(emailB);
        events.resetActivity();
        hub.resetHub();
    }
});
