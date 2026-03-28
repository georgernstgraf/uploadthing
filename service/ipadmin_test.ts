import { assertEquals, assertExists } from "@std/assert";
import { for_range } from "./ipadmin.ts";
import * as ipfactRepo from "../repo/ipfact.ts";
import {
    clearForensicsByIp,
    clearForensicsByUserEmail,
    seedNoAnomaliesScenario,
    seedRegistration,
    seedSharedIpAnomalyScenario,
    seedUserAnomalyScenario,
} from "../test/helpers/forensics_fixture.ts";

Deno.test("ipadmin missed_count is zero when IP present at all scans", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userEmail = `missed-all-${suffix}@example.com`;
    const testIp = `203.0.113.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const baseTime = new Date("2026-03-27T10:00:00Z");
    const t1 = new Date(baseTime.getTime());
    const t2 = new Date(baseTime.getTime() + 60000);
    const t3 = new Date(baseTime.getTime() + 120000);
    const start = new Date(baseTime.getTime() - 60000);
    const end = new Date(baseTime.getTime() + 180000);

    try {
        await seedNoAnomaliesScenario({
            ip: testIp,
            email: userEmail,
            name: "Missed Zero Test",
            klasse: "5AHITM",
            at: t1,
            withSeen: false,
            withCookiePresent: true,
        });

        // IP present at all scans
        ipfactRepo.registerSeen(testIp, t1);
        ipfactRepo.registerSeen(testIp, t2);
        ipfactRepo.registerSeen(testIp, t3);

        const result = await for_range(start, end, false);
        const found = result.registered.find((entry) => entry.ip === testIp);

        assertExists(found);
        assertEquals(found.missed_count, 0);
    } finally {
        await clearForensicsByIp(testIp);
        await clearForensicsByUserEmail(userEmail);
    }
});

Deno.test("ipadmin missed_count correct when IP absent for some scans", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userEmail = `missed-some-${suffix}@example.com`;
    const testIp = `203.0.114.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const otherIp = `203.0.115.${Number.parseInt(suffix.slice(2, 4), 16) % 100 + 10}`;
    const baseTime = new Date("2026-03-27T10:00:00Z");
    const t1 = new Date(baseTime.getTime());
    const t2 = new Date(baseTime.getTime() + 60000);
    const t3 = new Date(baseTime.getTime() + 120000);
    const t4 = new Date(baseTime.getTime() + 180000);
    const start = new Date(baseTime.getTime() - 60000);
    const end = new Date(baseTime.getTime() + 240000);

    try {
        await seedNoAnomaliesScenario({
            ip: testIp,
            email: userEmail,
            name: "Missed Some Test",
            klasse: "5AHITM",
            at: t1,
            withSeen: false,
            withCookiePresent: true,
        });

        // testIp present at t1, t2, t4 but NOT t3
        ipfactRepo.registerSeen(testIp, t1);
        ipfactRepo.registerSeen(testIp, t2);
        // t3 - testIp absent
        ipfactRepo.registerSeen(otherIp, t3); // other IP to create the scan
        ipfactRepo.registerSeen(testIp, t4);

        const result = await for_range(start, end, false);
        const found = result.registered.find((entry) => entry.ip === testIp);

        assertExists(found);
        // 4 scans total (t1, t2, t3, t4)
        // testIp first seen at t1
        // scans after first: 4 (t1, t2, t3, t4)
        // testIp present at: 3 (t1, t2, t4)
        // missed: 1 (t3)
        assertEquals(found.missed_count, 1);
    } finally {
        await clearForensicsByIp(testIp);
        await clearForensicsByIp(otherIp);
        await clearForensicsByUserEmail(userEmail);
    }
});

Deno.test("ipadmin missed_count counts only between first and last appearance", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userEmail = `missed-between-${suffix}@example.com`;
    const testIp = `203.0.116.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const otherIp = `203.0.117.${Number.parseInt(suffix.slice(2, 4), 16) % 100 + 10}`;
    const baseTime = new Date("2026-03-27T10:00:00Z");
    const t1 = new Date(baseTime.getTime());
    const t2 = new Date(baseTime.getTime() + 60000);
    const t3 = new Date(baseTime.getTime() + 120000);
    const t4 = new Date(baseTime.getTime() + 180000);
    const t5 = new Date(baseTime.getTime() + 240000);
    const start = new Date(baseTime.getTime() - 60000);
    const end = new Date(baseTime.getTime() + 300000);

    try {
        await seedNoAnomaliesScenario({
            ip: testIp,
            email: userEmail,
            name: "Missed Between Test",
            klasse: "5AHITM",
            at: t3,
            withSeen: false,
            withCookiePresent: true,
        });

        // Scans at t1, t2: testIp not yet present (only otherIp)
        ipfactRepo.registerSeen(otherIp, t1);
        ipfactRepo.registerSeen(otherIp, t2);
        // Scans at t3, t4: testIp present
        ipfactRepo.registerSeen(testIp, t3);
        ipfactRepo.registerSeen(testIp, t4);
        ipfactRepo.registerSeen(otherIp, t3);
        ipfactRepo.registerSeen(otherIp, t4);
        // Scan at t5: testIp absent (left early)
        ipfactRepo.registerSeen(otherIp, t5);

        const result = await for_range(start, end, false);
        const found = result.registered.find((entry) => entry.ip === testIp);

        assertExists(found);
        // testIp first_seen = t3, last_seen = t4
        // scans BETWEEN t3 and t4: t3, t4 (2 scans)
        // testIp present at: t3, t4 (2 scans)
        // missed: 0 (t5 is AFTER last_seen, not counted)
        assertEquals(found.missed_count, 0);
        // Verify first_seen and last_seen
        // t3 = 10:02 UTC = 11:02 CET (UTC+1)
        // t4 = 10:03 UTC = 11:03 CET
        assertEquals(found.first_seen.includes("11:02"), true);
        assertEquals(found.last_seen.includes("11:03"), true);
    } finally {
        await clearForensicsByIp(testIp);
        await clearForensicsByIp(otherIp);
        await clearForensicsByUserEmail(userEmail);
    }
});

Deno.test("ipadmin missed_count zero when present throughout active period", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userEmail = `missed-active-${suffix}@example.com`;
    const testIp = `203.0.118.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const _otherIp = `203.0.119.${Number.parseInt(suffix.slice(2, 4), 16) % 100 + 10}`;
    const baseTime = new Date("2026-03-27T10:00:00Z");
    const t1 = new Date(baseTime.getTime());
    const t2 = new Date(baseTime.getTime() + 60000);
    const t3 = new Date(baseTime.getTime() + 120000);
    const start = new Date(baseTime.getTime() - 60000);
    const end = new Date(baseTime.getTime() + 180000);

    try {
        await seedNoAnomaliesScenario({
            ip: testIp,
            email: userEmail,
            name: "Missed Active Test",
            klasse: "5AHITM",
            at: t1,
            withSeen: false,
            withCookiePresent: true,
        });

        // testIp present at all scans
        ipfactRepo.registerSeen(testIp, t1);
        ipfactRepo.registerSeen(testIp, t2);
        ipfactRepo.registerSeen(testIp, t3);

        const result = await for_range(start, end, false);
        const found = result.registered.find((entry) => entry.ip === testIp);

        assertExists(found);
        // testIp present at t1, t2, t3 (all scans in its active period)
        assertEquals(found.missed_count, 0);
    } finally {
        await clearForensicsByIp(testIp);
        await clearForensicsByUserEmail(userEmail);
    }
});

Deno.test("ipadmin missed_count zero for IP never seen", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userEmail = `missed-never-${suffix}@example.com`;
    const testIp = `203.0.118.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const otherIp = `203.0.119.${Number.parseInt(suffix.slice(2, 4), 16) % 100 + 10}`;
    const baseTime = new Date("2026-03-27T10:00:00Z");
    const t1 = new Date(baseTime.getTime());
    const t2 = new Date(baseTime.getTime() + 60000);
    const start = new Date(baseTime.getTime() - 60000);
    const end = new Date(baseTime.getTime() + 120000);

    try {
        await seedNoAnomaliesScenario({
            ip: testIp,
            email: userEmail,
            name: "Missed Never Test",
            klasse: "5AHITM",
            at: t1,
            withSeen: false, // No ipfact record
            withCookiePresent: true,
        });

        // Only otherIp has scans
        ipfactRepo.registerSeen(otherIp, t1);
        ipfactRepo.registerSeen(otherIp, t2);

        const result = await for_range(start, end, false);
        const found = result.registered.find((entry) => entry.ip === testIp);

        assertExists(found);
        // testIp has no seen records, so missed_count = 0 and first/last_seen are empty
        assertEquals(found.missed_count, 0);
        assertEquals(found.first_seen, "");
        assertEquals(found.last_seen, "");
        // range_first_seen and range_last_seen come from otherIp's scans
        // UTC 10:00:00Z = Vienna 11:00 (CET = UTC+1)
        assertEquals(result.range_first_seen.includes("11:00"), true);
        assertEquals(result.range_last_seen.includes("11:01"), true);
    } finally {
        await clearForensicsByIp(testIp);
        await clearForensicsByIp(otherIp);
        await clearForensicsByUserEmail(userEmail);
    }
});

Deno.test("ipadmin classifies IPs by cookie presence and keeps registrations", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userEmail = `cookiepresent-${suffix}@example.com`;
    const knownIp = `203.0.113.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const unknownIp = `198.51.100.${Number.parseInt(suffix.slice(2, 4), 16) % 100 + 10}`;
    const seenAt = new Date();
    const start = new Date(seenAt.getTime() - 60_000);
    const end = new Date(seenAt.getTime() + 60_000);

    try {
        await seedNoAnomaliesScenario({
            ip: knownIp,
            email: userEmail,
            name: "Cookie Present Test",
            klasse: "5AHITM",
            at: seenAt,
            withCookiePresent: true,
        });
        await seedRegistration({
            ip: unknownIp,
            email: userEmail,
            name: "Cookie Present Test",
            klasse: "5AHITM",
            at: seenAt,
        });

        const result = await for_range(start, end, false);

        const known = result.registered.find((entry) => entry.ip === knownIp);
        const unknown = result.unregistered.find((entry) => entry.ip === unknownIp);

        assertExists(known);
        assertExists(unknown);
        assertEquals(known.cookie_presents.length, 1);
        assertEquals(known.report_count, 2);
        assertEquals(known.registrations.length, 1);
        assertEquals(known.cookie_presents[0].user?.email, userEmail);
        assertEquals(unknown.cookie_presents.length, 0);
        assertEquals(unknown.report_count, 1);
        assertEquals(unknown.registrations.length, 1);
        assertEquals(unknown.registrations[0].user?.email, userEmail);
        assertEquals(result.anomalies.by_ip.length, 0);
        assertEquals(result.anomalies.by_user.length, 1);
        assertEquals(result.anomalies.by_user[0].user.email, userEmail);
        assertEquals(result.anomalies.by_user[0].ips, [knownIp, unknownIp].sort());
    } finally {
        await clearForensicsByIp(knownIp);
        await clearForensicsByIp(unknownIp);
        await clearForensicsByUserEmail(userEmail);
    }
});

Deno.test("ipadmin detects IP-based and user-based anomalies", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userOneEmail = `anomaly-one-${suffix}@example.com`;
    const userTwoEmail = `anomaly-two-${suffix}@example.com`;
    const sharedIp = `203.0.113.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const secondIp = `198.51.100.${Number.parseInt(suffix.slice(2, 4), 16) % 100 + 10}`;
    const seenAt = new Date();
    const start = new Date(seenAt.getTime() - 60_000);
    const end = new Date(seenAt.getTime() + 60_000);

    try {
        await seedSharedIpAnomalyScenario({
            sharedIp,
            secondaryIp: secondIp,
            at: seenAt,
            primaryUser: {
                email: userOneEmail,
                name: "Anomaly One",
                klasse: "5AHITM",
            },
            secondaryUser: {
                email: userTwoEmail,
                name: "Anomaly Two",
                klasse: "5AHITM",
            },
        });

        const result = await for_range(start, end, false);

        assertEquals(result.anomalies.by_ip.length, 1);
        assertEquals(result.anomalies.by_ip[0].ip, sharedIp);
        assertEquals(result.anomalies.by_ip[0].users.map((user) => user.email), [
            userOneEmail,
            userTwoEmail,
        ]);

        assertEquals(result.anomalies.by_user.length, 1);
        assertEquals(result.anomalies.by_user[0].user.email, userOneEmail);
        assertEquals(result.anomalies.by_user[0].ips, [sharedIp, secondIp].sort());
    } finally {
        await clearForensicsByIp(sharedIp);
        await clearForensicsByIp(secondIp);
        await clearForensicsByUserEmail(userOneEmail);
        await clearForensicsByUserEmail(userTwoEmail);
    }
});

Deno.test("ipadmin includes cookie-only IPs as known reported addresses", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userEmail = `cookie-only-${suffix}@example.com`;
    const cookieOnlyIp = `203.0.113.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const seenAt = new Date();
    const start = new Date(seenAt.getTime() - 60_000);
    const end = new Date(seenAt.getTime() + 60_000);

    try {
        await seedNoAnomaliesScenario({
            ip: cookieOnlyIp,
            email: userEmail,
            name: "Cookie Only Test",
            klasse: "5AHITM",
            at: seenAt,
            withSeen: false,
            withCookiePresent: true,
        });

        const result = await for_range(start, end, false);

        const known = result.registered.find((entry) => entry.ip === cookieOnlyIp);

        assertExists(known);
        assertEquals(result.unregistered.find((entry) => entry.ip === cookieOnlyIp), undefined);
        assertEquals(known.cookie_presents.length, 1);
        assertEquals(known.cookie_presents[0].user?.email, userEmail);
        assertEquals(known.seen_count, 0);
        assertEquals(known.report_count, 1);
        assertEquals(known.seen_at_desc.length, 0);
    } finally {
        await clearForensicsByIp(cookieOnlyIp);
        await clearForensicsByUserEmail(userEmail);
    }
});

Deno.test("ipadmin detects user anomalies from registrations without cookie presence", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userEmail = `registration-anomaly-${suffix}@example.com`;
    const firstIp = `203.0.113.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const secondIp = `198.51.100.${Number.parseInt(suffix.slice(2, 4), 16) % 100 + 10}`;
    const seenAt = new Date();
    const start = new Date(seenAt.getTime() - 60_000);
    const end = new Date(seenAt.getTime() + 60_000);

    try {
        await seedUserAnomalyScenario({
            email: userEmail,
            name: "Registration Anomaly",
            klasse: "5AHITM",
            at: seenAt,
            firstIp,
            secondIp,
        });

        const result = await for_range(start, end, false);

        assertEquals(result.anomalies.by_ip.length, 0);
        assertEquals(result.anomalies.by_user.length, 1);
        assertEquals(result.anomalies.by_user[0].user.email, userEmail);
        assertEquals(result.anomalies.by_user[0].ips, [firstIp, secondIp].sort());
    } finally {
        await clearForensicsByIp(firstIp);
        await clearForensicsByIp(secondIp);
        await clearForensicsByUserEmail(userEmail);
    }
});
