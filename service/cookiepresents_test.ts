import { assertEquals } from "@std/assert";
import * as cookiepresentsRepo from "../repo/cookiepresents.ts";
import {
    clearForensicsByIp,
    clearForensicsByUserEmail,
    upsertFixtureUser,
} from "../test/helpers/forensics_fixture.ts";
import {
    COOKIE_PRESENT_MIN_INTERVAL_MS,
    recordByEmail,
} from "./cookiepresents.ts";

const RANGE_START = new Date("2026-10-01T00:00:00Z");
const RANGE_END = new Date("2026-11-01T00:00:00Z");

function uniqueIp(): string {
    const suffix = crypto.randomUUID().slice(0, 8);
    const a = Number.parseInt(suffix.slice(0, 2), 16);
    const b = Number.parseInt(suffix.slice(2, 4), 16);
    return `198.18.${a}.${b}`;
}

Deno.test("recordByEmail meldet den ersten Insert als Identitätswechsel", async () => {
    const ip = uniqueIp();
    const email = `presence-first-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const at = new Date("2026-10-31T10:00:00Z");

    try {
        await upsertFixtureUser({ email, name: "Presence First", klasse: "5AHITM" });

        const presence = await recordByEmail(email, ip, () => at);

        // Die erste Identität einer IP ist ebenfalls ein Wechsel.
        assertEquals(presence, { inserted: true, identityChanged: true });
        const rows = cookiepresentsRepo.byIPInRange(ip, RANGE_START, RANGE_END);
        assertEquals(rows.length, 1);
        assertEquals(rows[0].at.toISOString(), at.toISOString());
    } finally {
        await clearForensicsByIp(ip);
        await clearForensicsByUserEmail(email);
    }
});

Deno.test("recordByEmail unterdrückt Wiederholungen innerhalb des Fensters", async () => {
    const ip = uniqueIp();
    const email = `presence-window-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const first = new Date("2026-10-31T10:00:00Z");
    const inside = new Date(first.getTime() + COOKIE_PRESENT_MIN_INTERVAL_MS - 1);

    try {
        await upsertFixtureUser({ email, name: "Presence Window", klasse: "5AHITM" });

        assertEquals(
            await recordByEmail(email, ip, () => first),
            { inserted: true, identityChanged: true },
        );
        // Dedupe: kein Insert, also auch kein Ereignis.
        assertEquals(
            await recordByEmail(email, ip, () => inside),
            { inserted: false, identityChanged: false },
        );

        const rows = cookiepresentsRepo.byIPInRange(ip, RANGE_START, RANGE_END);
        assertEquals(rows.length, 1);
    } finally {
        await clearForensicsByIp(ip);
        await clearForensicsByUserEmail(email);
    }
});

Deno.test("recordByEmail schreibt nach dem Fenster ohne Identitätswechsel", async () => {
    const ip = uniqueIp();
    const email = `presence-after-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const first = new Date("2026-10-31T10:00:00Z");
    const later = new Date(first.getTime() + COOKIE_PRESENT_MIN_INTERVAL_MS + 1);

    try {
        await upsertFixtureUser({ email, name: "Presence After", klasse: "5AHITM" });

        assertEquals(
            await recordByEmail(email, ip, () => first),
            { inserted: true, identityChanged: true },
        );
        // Dieselbe Identität bleibt dieselbe: Anwesenheit, kein Ereignis.
        assertEquals(
            await recordByEmail(email, ip, () => later),
            { inserted: true, identityChanged: false },
        );

        const rows = cookiepresentsRepo.byIPInRange(ip, RANGE_START, RANGE_END);
        assertEquals(rows.length, 2);
    } finally {
        await clearForensicsByIp(ip);
        await clearForensicsByUserEmail(email);
    }
});

Deno.test("recordByEmail prüft die Fenstergrenze exakt", async () => {
    const ip = uniqueIp();
    const email = `presence-boundary-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const first = new Date("2026-10-31T10:00:00Z");
    const exactlyAtBoundary = new Date(
        first.getTime() + COOKIE_PRESENT_MIN_INTERVAL_MS,
    );
    const justAfterBoundary = new Date(
        first.getTime() + COOKIE_PRESENT_MIN_INTERVAL_MS + 1,
    );

    try {
        await upsertFixtureUser({ email, name: "Presence Boundary", klasse: "5AHITM" });

        assertEquals(
            await recordByEmail(email, ip, () => first),
            { inserted: true, identityChanged: true },
        );
        // Fenster ist geschlossen: `at >= since` schließt die alte Zeile ein.
        assertEquals(
            await recordByEmail(email, ip, () => exactlyAtBoundary),
            { inserted: false, identityChanged: false },
        );
        assertEquals(
            await recordByEmail(email, ip, () => justAfterBoundary),
            { inserted: true, identityChanged: false },
        );

        const rows = cookiepresentsRepo.byIPInRange(ip, RANGE_START, RANGE_END);
        assertEquals(rows.length, 2);
        assertEquals(rows[0].at.toISOString(), justAfterBoundary.toISOString());
        assertEquals(rows[1].at.toISOString(), first.toISOString());
    } finally {
        await clearForensicsByIp(ip);
        await clearForensicsByUserEmail(email);
    }
});

Deno.test("recordByEmail meldet einen anderen User auf derselben IP als Wechsel", async () => {
    const ip = uniqueIp();
    const emailA = `presence-switch-a-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const emailB = `presence-switch-b-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const first = new Date("2026-10-31T10:00:00Z");
    const second = new Date(first.getTime() + COOKIE_PRESENT_MIN_INTERVAL_MS + 1);

    try {
        const userA = await upsertFixtureUser({
            email: emailA,
            name: "Presence Switch A",
            klasse: "5AHITM",
        });
        const userB = await upsertFixtureUser({
            email: emailB,
            name: "Presence Switch B",
            klasse: "5AHITM",
        });

        assertEquals(
            await recordByEmail(emailA, ip, () => first),
            { inserted: true, identityChanged: true },
        );
        assertEquals(
            await cookiepresentsRepo.getLatestUserIdForIP(ip),
            userA.id,
        );

        // Anderer User, dieselbe IP: neue Zeile und neue Identität.
        assertEquals(
            await recordByEmail(emailB, ip, () => second),
            { inserted: true, identityChanged: true },
        );
        assertEquals(
            await cookiepresentsRepo.getLatestUserIdForIP(ip),
            userB.id,
        );

        assertEquals(
            cookiepresentsRepo.byIPInRange(ip, RANGE_START, RANGE_END).length,
            2,
        );
    } finally {
        await clearForensicsByIp(ip);
        await clearForensicsByUserEmail(emailA);
        await clearForensicsByUserEmail(emailB);
    }
});

Deno.test("recordByEmail trennt nach IP und User", async () => {
    const ipA = uniqueIp();
    const ipB = uniqueIp();
    const emailA = `presence-pair-a-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const emailB = `presence-pair-b-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const at = new Date("2026-10-31T10:00:00Z");

    try {
        await upsertFixtureUser({ email: emailA, name: "Presence Pair A", klasse: "5AHITM" });
        await upsertFixtureUser({ email: emailB, name: "Presence Pair B", klasse: "5AHITM" });

        // Dieselbe IP, anderer User: eigener Eintrag und neue Identität.
        assertEquals(
            await recordByEmail(emailA, ipA, () => at),
            { inserted: true, identityChanged: true },
        );
        assertEquals(
            await recordByEmail(emailB, ipA, () => at),
            { inserted: true, identityChanged: true },
        );
        // Derselbe User, andere IP: der erste Eintrag dieser IP.
        assertEquals(
            await recordByEmail(emailA, ipB, () => at),
            { inserted: true, identityChanged: true },
        );

        assertEquals(
            cookiepresentsRepo.byIPInRange(ipA, RANGE_START, RANGE_END).length,
            2,
        );
        assertEquals(
            cookiepresentsRepo.byIPInRange(ipB, RANGE_START, RANGE_END).length,
            1,
        );
    } finally {
        await clearForensicsByIp(ipA);
        await clearForensicsByIp(ipB);
        await clearForensicsByUserEmail(emailA);
        await clearForensicsByUserEmail(emailB);
    }
});

Deno.test("recordByEmail meldet für unbekannte User nichts und schreibt nicht", async () => {
    const ip = uniqueIp();
    const email = `presence-unknown-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const at = new Date("2026-10-31T10:00:00Z");

    try {
        assertEquals(
            await recordByEmail(email, ip, () => at),
            { inserted: false, identityChanged: false },
        );
        assertEquals(
            cookiepresentsRepo.byIPInRange(ip, RANGE_START, RANGE_END).length,
            0,
        );
    } finally {
        await clearForensicsByIp(ip);
        await clearForensicsByUserEmail(email);
    }
});
