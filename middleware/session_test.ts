import { assertEquals, assertExists } from "@std/assert";
import { Hono } from "hono";
import config from "../lib/config.ts";
import * as hub from "../lib/event_hub.ts";
import type { Bindings, HonoContextVars } from "../lib/types.ts";
import * as cookiepresentsRepo from "../repo/cookiepresents.ts";
import * as events from "../service/events.ts";
import {
    clearForensicsByIp,
    clearForensicsByUserEmail,
    upsertFixtureUser,
} from "../test/helpers/forensics_fixture.ts";
import {
    decodeSessionData,
    encodeSessionData,
    hmacSign,
    hmacVerify,
    parseSignedCookie,
    remoteIPMiddleware,
    Session,
    sessionMiddleware,
    signCookieValue,
} from "./session.ts";

const TEST_SECRET = "test-secret-key-for-testing";

Deno.test("hmacSign - produces consistent signature", async () => {
    const sig1 = await hmacSign("test-data", TEST_SECRET);
    const sig2 = await hmacSign("test-data", TEST_SECRET);
    assertEquals(sig1, sig2);
});

Deno.test("hmacSign - produces different signatures for different data", async () => {
    const sig1 = await hmacSign("data1", TEST_SECRET);
    const sig2 = await hmacSign("data2", TEST_SECRET);
    assertEquals(sig1 !== sig2, true);
});

Deno.test("hmacSign - produces different signatures for different secrets", async () => {
    const sig1 = await hmacSign("test-data", "secret1");
    const sig2 = await hmacSign("test-data", "secret2");
    assertEquals(sig1 !== sig2, true);
});

Deno.test("hmacVerify - returns true for valid signature", async () => {
    const data = "test-data";
    const signature = await hmacSign(data, TEST_SECRET);
    const result = await hmacVerify(data, signature, TEST_SECRET);
    assertEquals(result, true);
});

Deno.test("hmacVerify - returns false for invalid signature", async () => {
    const data = "test-data";
    const result = await hmacVerify(data, "invalid-signature", TEST_SECRET);
    assertEquals(result, false);
});

Deno.test("hmacVerify - returns false for tampered data", async () => {
    const data = "original-data";
    const signature = await hmacSign(data, TEST_SECRET);
    const result = await hmacVerify("tampered-data", signature, TEST_SECRET);
    assertEquals(result, false);
});

Deno.test("encodeSessionData - encodes to base64", () => {
    const data = { email: "test@example.com", createdAt: 1234567890 };
    const result = encodeSessionData(data);
    assertEquals(typeof result, "string");
    assertEquals(result.length > 0, true);
});

Deno.test("decodeSessionData - decodes correctly", () => {
    const data = { email: "test@example.com", createdAt: 1234567890 };
    const encoded = encodeSessionData(data);
    const result = decodeSessionData(encoded);
    assertEquals(result?.email, "test@example.com");
    assertEquals(result?.createdAt, 1234567890);
});

Deno.test("decodeSessionData - returns null for invalid input", () => {
    const result = decodeSessionData("not-valid-base64!!!");
    assertEquals(result, null);
});

Deno.test("decodeSessionData - returns null for invalid JSON", () => {
    const invalidJson = btoa("not-json");
    const result = decodeSessionData(invalidJson);
    assertEquals(result, null);
});

Deno.test("signCookieValue - creates signed cookie value", async () => {
    const data = { email: "test@example.com", createdAt: 1234567890 };
    const result = await signCookieValue(data, TEST_SECRET);
    assertEquals(result.includes("."), true);
    const parts = result.split(".");
    assertEquals(parts.length, 2);
});

Deno.test("parseSignedCookie - parses valid cookie", async () => {
    const data = { email: "test@example.com", createdAt: 1234567890 };
    const cookie = await signCookieValue(data, TEST_SECRET);
    const result = parseSignedCookie(cookie);

    assertExists(result);
    assertEquals(result?.data.email, "test@example.com");
    assertEquals(result?.data.createdAt, 1234567890);
});

Deno.test("parseSignedCookie - returns null for invalid format", () => {
    const result = parseSignedCookie("no-dot-here");
    assertEquals(result, null);
});

Deno.test("parseSignedCookie - returns null for too many parts", () => {
    const result = parseSignedCookie("part1.part2.part3");
    assertEquals(result, null);
});

Deno.test("parseSignedCookie - returns null for invalid base64", () => {
    const result = parseSignedCookie("!!!invalid.part2");
    assertEquals(result, null);
});

Deno.test("Session class - creates with null data", () => {
    const session = new Session(null, false);
    assertEquals(session.email, undefined);
    assertEquals(session.isLoggedIn(), false);
});

Deno.test("Session class - creates with data", () => {
    const data = { email: "test@example.com", createdAt: Date.now() };
    const session = new Session(data, false);
    assertEquals(session.email, "test@example.com");
    assertEquals(session.createdAt, data.createdAt);
});

Deno.test("Session class - login sets data and marks new", () => {
    const session = new Session(null, false);
    session.login("new@example.com");

    assertEquals(session.email, "new@example.com");
    assertEquals(session.isNewSession(), true);
    assertEquals(session.isModified(), true);
    assertEquals(session.isLoggedIn(), true);
});

Deno.test("Session class - refreshTimestamp updates time", () => {
    const originalTime = Date.now() - 10000;
    const data = { email: "test@example.com", createdAt: originalTime };
    const session = new Session(data, false);

    session.refreshTimestamp();

    assertEquals(session.createdAt !== originalTime, true);
    assertEquals(session.isModified(), true);
});

Deno.test("Session class - setData updates and marks modified", () => {
    const data = { email: "test@example.com", createdAt: Date.now() };
    const session = new Session(data, false);

    const newData = { email: "other@example.com", createdAt: Date.now() };
    session.setData(newData);

    assertEquals(session.email, "other@example.com");
    assertEquals(session.isModified(), true);
});

Deno.test("Session class - isNewSession returns correct value", () => {
    const data = { email: "test@example.com", createdAt: Date.now() };
    const newSession = new Session(data, true);
    const existingSession = new Session(data, false);

    assertEquals(newSession.isNewSession(), true);
    assertEquals(existingSession.isNewSession(), false);
});

Deno.test("Session class - getData returns same object reference", () => {
    const data = { email: "test@example.com", createdAt: Date.now() };
    const session = new Session(data, false);

    const retrieved = session.getData();
    assertEquals(retrieved?.email, "test@example.com");

    if (retrieved) {
        retrieved.email = "modified@example.com";
    }
    assertEquals(session.email, "modified@example.com");
});

// ----------------------------------------------------------------------
// Presence-Ereignisse der Session-Middleware (#164)
// ----------------------------------------------------------------------

/**
 * Seit #164 ist **jede neue** Präsenz eines Schülers ein Ereignis: sie kann
 * ein „Unbekannt"-Kärtchen in ein Namenskärtchen verwandeln, auch wenn sich
 * die Identität der IP nicht verschiebt. Die Lehrperson ist ausgenommen —
 * ihr eigener Panel-Request schreibt selbst eine Presence-Zeile, das wäre
 * eine Rückkopplung. Die Zeile, die eine Abgabe schreibt, bleibt still,
 * weil sich die Abgabe über `card-<slug>` selbst meldet (#163).
 */

/** Scheduler-Stub: sammelt Timer und lässt sie von Hand laufen. */
function fakeScheduler() {
    const pending: (() => void)[] = [];
    const delays: number[] = [];

    const hooks: events.ActivityHooks = {
        schedule: (callback, delayMs) => {
            delays.push(delayMs);
            pending.push(callback);
            return pending.length;
        },
        cancel: () => {},
    };

    return {
        hooks,
        delays,
        flush: () => {
            const callback = pending.shift();
            if (!callback) {
                throw new Error("kein Fenster offen");
            }
            callback();
        },
    };
}

/** Eine eigene Test-IP je Test: 127.0.0.1 teilen sich mehrere Testdateien. */
function uniqueIp(): string {
    const suffix = crypto.randomUUID().slice(0, 8);
    const a = Number.parseInt(suffix.slice(0, 2), 16);
    const b = Number.parseInt(suffix.slice(2, 4), 16);
    return `198.18.${a}.${b}`;
}

async function sessionCookie(email: string): Promise<string> {
    const data = { email, createdAt: Date.now() };
    const encoded = encodeSessionData(data);
    const signature = await hmacSign(encoded, config.COOKIE_SECRET);
    return `${config.COOKIE_NAME}=${signCookieValue(data, signature)}`;
}

/**
 * Dieselbe Middleware-Kette wie in `main.ts`, aber ohne Router-Details:
 * `remoteIPMiddleware` liest die Socket-IP aus den Bindings.
 */
function buildApp() {
    const app = new Hono<{ Bindings: Bindings; Variables: HonoContextVars }>();
    app.use("*", sessionMiddleware);
    app.use("*", remoteIPMiddleware);
    app.get("/probe", (c) => c.text("ok"));
    // Nur der Pfad zählt (#164): die Middleware unterscheidet am Pfad,
    // ob eine Presence-Zeile ein Panel-Ereignis auslösen darf.
    app.post("/upload", (c) => c.text("ok"));
    return app;
}

function testEnv(ip: string): Bindings {
    return {
        info: {
            remoteAddr: { transport: "tcp", hostname: ip },
        },
    } as unknown as Bindings;
}

Deno.test("Schüler-Präsenz publiziert auch ohne Identitätswechsel (#164)", async () => {
    hub.resetHub();
    events.resetActivity();
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `session-cookie-student-${suffix}@example.com`;
    const ip = uniqueIp();
    const scheduler = fakeScheduler();
    events.setActivityHooks(scheduler.hooks);

    const batches: string[][] = [];
    const unsubscribe = events.subscribeActivity((reasons) =>
        batches.push(reasons)
    );

    try {
        const user = await upsertFixtureUser({
            email,
            name: "Presence Schüler",
            klasse: "5AHITM",
        });
        // Vorzustand außerhalb des 30-s-Dedups: der Aufruf schreibt eine
        // echte Zeile, ohne die neueste Identität der IP zu verschieben —
        // genau der Fall Sophia aus #164.
        cookiepresentsRepo.create(ip, user.id, new Date(Date.now() - 60_000));

        const cookie = await sessionCookie(email);
        const app = buildApp();

        const first = await app.request(
            "/probe",
            { headers: { Cookie: cookie } },
            testEnv(ip),
        );
        assertEquals(first.status, 200);
        assertEquals(
            cookiepresentsRepo.getLatestUserIdForIP(ip),
            user.id,
            "Die Identität der IP bleibt dieselbe",
        );
        assertEquals(scheduler.delays.length, 1);

        scheduler.flush();
        assertEquals(batches, [["cards"]]);

        // Innerhalb von 30 s dedupliziert `recordByEmail`: kein zweiter
        // Insert, also auch kein zweites Ereignis.
        const second = await app.request(
            "/probe",
            { headers: { Cookie: cookie } },
            testEnv(ip),
        );
        assertEquals(second.status, 200);
        assertEquals(scheduler.delays.length, 1);
        assertEquals(batches, [["cards"]]);
    } finally {
        unsubscribe();
        clearForensicsByIp(ip);
        await clearForensicsByUserEmail(email);
        events.resetActivity();
        hub.resetHub();
    }
});

Deno.test("Lehrpersonen-Präsenz schreibt, publiziert aber nie (#164)", async () => {
    hub.resetHub();
    events.resetActivity();
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `session-cookie-teacher-${suffix}@example.com`;
    const ip = uniqueIp();
    const scheduler = fakeScheduler();
    events.setActivityHooks(scheduler.hooks);

    const batches: string[][] = [];
    const unsubscribe = events.subscribeActivity((reasons) =>
        batches.push(reasons)
    );

    try {
        const user = await upsertFixtureUser({
            email,
            name: "Presence Lehrperson",
            klasse: "LehrendeR",
        });
        // Auch ein Insert außerhalb des Dedup-Fensters bleibt still: die
        // eigene Präsenz ist nie eine Zeile des Panels, und jeder
        // Panel-Request schreibt selbst eine — sonst rendert das Panel
        // sich im 30-s-Takt selbst neu.
        cookiepresentsRepo.create(ip, user.id, new Date(Date.now() - 60_000));

        const cookie = await sessionCookie(email);
        const app = buildApp();

        const first = await app.request(
            "/probe",
            { headers: { Cookie: cookie } },
            testEnv(ip),
        );
        assertEquals(first.status, 200);
        assertEquals(
            cookiepresentsRepo.byIPInRange(
                ip,
                new Date(Date.now() - 120_000),
                new Date(Date.now() + 60_000),
            ).length,
            2,
            "Auch Lehrpersonen werden als Presence erfasst",
        );
        assertEquals(scheduler.delays.length, 0);
        assertEquals(batches, []);
    } finally {
        unsubscribe();
        clearForensicsByIp(ip);
        await clearForensicsByUserEmail(email);
        events.resetActivity();
        hub.resetHub();
    }
});

Deno.test("POST /upload schreibt Präsenz, publiziert aber kein Panel-Ereignis (#164)", async () => {
    hub.resetHub();
    events.resetActivity();
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `session-cookie-upload-${suffix}@example.com`;
    const ip = uniqueIp();
    const scheduler = fakeScheduler();
    events.setActivityHooks(scheduler.hooks);

    const batches: string[][] = [];
    const unsubscribe = events.subscribeActivity((reasons) =>
        batches.push(reasons)
    );

    try {
        const user = await upsertFixtureUser({
            email,
            name: "Presence Upload",
            klasse: "5AHITM",
        });
        cookiepresentsRepo.create(ip, user.id, new Date(Date.now() - 60_000));

        const cookie = await sessionCookie(email);
        const app = buildApp();

        const res = await app.request(
            "/upload",
            { method: "POST", headers: { Cookie: cookie } },
            testEnv(ip),
        );
        assertEquals(res.status, 200);
        assertEquals(
            cookiepresentsRepo.byIPInRange(
                ip,
                new Date(Date.now() - 120_000),
                new Date(Date.now() + 60_000),
            ).length,
            2,
            "Die Presence-Zeile der Abgabe wird geschrieben",
        );
        // Die Abgabe meldet sich selbst über `card-<slug>`; ein
        // zusätzliches `cards` würde „Eine Abgabe, ein Kärtchen" brechen.
        assertEquals(scheduler.delays.length, 0);
        assertEquals(batches, []);
    } finally {
        unsubscribe();
        clearForensicsByIp(ip);
        await clearForensicsByUserEmail(email);
        events.resetActivity();
        hub.resetHub();
    }
});
