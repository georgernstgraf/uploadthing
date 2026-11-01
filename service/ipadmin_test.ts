import { assertEquals, assertExists } from "@std/assert";
import { for_ip, for_range } from "./ipadmin.ts";
import * as ipfactRepo from "../repo/ipfact.ts";
import * as cookiepresentsRepo from "../repo/cookiepresents.ts";
import {
    clearForensicsByIp,
    clearForensicsByUserEmail,
    clearScans,
    seedNoAnomaliesScenario,
    seedRegistration,
    seedScan,
    seedSharedIpAnomalyScenario,
    seedSubmission,
    seedUserAnomalyScenario,
    upsertFixtureUser,
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
        seedScan(t1);
        seedScan(t2);
        seedScan(t3);

        const result = await for_range(start, end);
        const found = result.registered.find((entry) => entry.ip === testIp);

        assertExists(found);
        assertEquals(found.missed_count, 0);
    } finally {
        await clearForensicsByIp(testIp);
        await clearForensicsByUserEmail(userEmail);
        clearScans(t1, t2, t3);
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
        seedScan(t1);
        seedScan(t2);
        seedScan(t3);
        seedScan(t4);

        const result = await for_range(start, end);
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
        clearScans(t1, t2, t3, t4);
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
        seedScan(t1);
        seedScan(t2);
        seedScan(t3);
        seedScan(t4);
        seedScan(t5);

        const result = await for_range(start, end);
        const found = result.registered.find((entry) => entry.ip === testIp);

        assertExists(found);
        // testIp first_seen = t3, last_seen = t4
        // scans from first_seen onward: t3, t4, t5 (3 scans)
        // testIp present at: t3, t4 (2 scans)
        // missed: 1 (t5 is after last_seen but now counted as ongoing absence)
        assertEquals(found.missed_count, 1);
        // Verify first_seen and last_seen
        // t3 = 10:02 UTC = 11:02 CET (UTC+1)
        // t4 = 10:03 UTC = 11:03 CET
        assertEquals(found.first_seen.includes("11:02"), true);
        assertEquals(found.last_seen.includes("11:03"), true);
    } finally {
        await clearForensicsByIp(testIp);
        await clearForensicsByIp(otherIp);
        await clearForensicsByUserEmail(userEmail);
        clearScans(t1, t2, t3, t4, t5);
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
        seedScan(t1);
        seedScan(t2);
        seedScan(t3);

        const result = await for_range(start, end);
        const found = result.registered.find((entry) => entry.ip === testIp);

        assertExists(found);
        // testIp present at t1, t2, t3 (all scans in its active period)
        assertEquals(found.missed_count, 0);
    } finally {
        await clearForensicsByIp(testIp);
        await clearForensicsByUserEmail(userEmail);
        clearScans(t1, t2, t3);
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
        seedScan(t1);
        seedScan(t2);

        const result = await for_range(start, end);
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
        clearScans(t1, t2);
    }
});

Deno.test("ipadmin missed_count includes ongoing absence after last appearance", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userEmail = `missed-ongoing-${suffix}@example.com`;
    const testIp = `203.0.120.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const otherIp = `203.0.121.${Number.parseInt(suffix.slice(2, 4), 16) % 100 + 10}`;
    const baseTime = new Date("2026-03-27T10:00:00Z");
    const t1 = new Date(baseTime.getTime());
    const t2 = new Date(baseTime.getTime() + 60000);
    const t3 = new Date(baseTime.getTime() + 120000);
    const t4 = new Date(baseTime.getTime() + 180000);
    const t5 = new Date(baseTime.getTime() + 240000);
    const t6 = new Date(baseTime.getTime() + 300000);
    const start = new Date(baseTime.getTime() - 60000);
    const end = new Date(baseTime.getTime() + 360000);

    try {
        await seedNoAnomaliesScenario({
            ip: testIp,
            email: userEmail,
            name: "Ongoing Absence Test",
            klasse: "5AHITM",
            at: t1,
            withSeen: false,
            withCookiePresent: true,
        });

        // testIp seen only at t1, then absent at t2-t6 (still offline)
        ipfactRepo.registerSeen(testIp, t1);
        // otherIp creates the remaining scan timestamps
        ipfactRepo.registerSeen(otherIp, t2);
        ipfactRepo.registerSeen(otherIp, t3);
        ipfactRepo.registerSeen(otherIp, t4);
        ipfactRepo.registerSeen(otherIp, t5);
        ipfactRepo.registerSeen(otherIp, t6);
        seedScan(t1);
        seedScan(t2);
        seedScan(t3);
        seedScan(t4);
        seedScan(t5);
        seedScan(t6);

        const result = await for_range(start, end);
        const found = result.registered.find((entry) => entry.ip === testIp);

        assertExists(found);
        // testIp first_seen = t1, last_seen = t1
        // scans from first_seen onward: t1, t2, t3, t4, t5, t6
        // testIp present at: t1 (1 scan)
        // missed: 5 (t2, t3, t4, t5, t6)
        assertEquals(found.missed_count, 5);
    } finally {
        await clearForensicsByIp(testIp);
        await clearForensicsByIp(otherIp);
        await clearForensicsByUserEmail(userEmail);
        clearScans(t1, t2, t3, t4, t5, t6);
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

        seedScan(seenAt);

        const result = await for_range(start, end);

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
        clearScans(seenAt);
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

        seedScan(seenAt);

        const result = await for_range(start, end);

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
        clearScans(seenAt);
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

        const result = await for_range(start, end);

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

        seedScan(seenAt);

        const result = await for_range(start, end);

        assertEquals(result.anomalies.by_ip.length, 0);
        assertEquals(result.anomalies.by_user.length, 1);
        assertEquals(result.anomalies.by_user[0].user.email, userEmail);
        assertEquals(result.anomalies.by_user[0].ips, [firstIp, secondIp].sort());
    } finally {
        await clearForensicsByIp(firstIp);
        await clearForensicsByIp(secondIp);
        await clearForensicsByUserEmail(userEmail);
        clearScans(seenAt);
    }
});

Deno.test("ipadmin separates teacher IPs from student IPs", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const teacherEmail = `teacher-split-${suffix}@example.com`;
    const studentEmail = `student-split-${suffix}@example.com`;
    const teacherIp = `203.0.113.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const studentIp = `203.0.114.${Number.parseInt(suffix.slice(2, 4), 16) % 100 + 10}`;
    const seenAt = new Date();
    const start = new Date(seenAt.getTime() - 60_000);
    const end = new Date(seenAt.getTime() + 60_000);

    try {
        await seedNoAnomaliesScenario({
            ip: teacherIp,
            email: teacherEmail,
            name: "Teacher One",
            klasse: "LehrendeR",
            at: seenAt,
            withCookiePresent: true,
        });
        await seedNoAnomaliesScenario({
            ip: studentIp,
            email: studentEmail,
            name: "Student One",
            klasse: "5AHITM",
            at: seenAt,
            withCookiePresent: true,
        });

        seedScan(seenAt);

        const result = await for_range(start, end);

        const inTeacher = result.teacher_ips.find((entry) => entry.ip === teacherIp);
        const inRegistered = result.registered.find((entry) => entry.ip === teacherIp);
        assertEquals(inTeacher !== undefined, true, "teacher IP should be in teacher_ips");
        assertEquals(inRegistered, undefined, "teacher IP should NOT be in registered");

        const inStudentRegistered = result.registered.find((entry) => entry.ip === studentIp);
        const inStudentTeacher = result.teacher_ips.find((entry) => entry.ip === studentIp);
        assertEquals(inStudentRegistered !== undefined, true, "student IP should be in registered");
        assertEquals(inStudentTeacher, undefined, "student IP should NOT be in teacher_ips");
    } finally {
        await clearForensicsByIp(teacherIp);
        await clearForensicsByIp(studentIp);
        await clearForensicsByUserEmail(teacherEmail);
        await clearForensicsByUserEmail(studentEmail);
        clearScans(seenAt);
    }
});

Deno.test("ipadmin sorts student IPs by lastname then firstname", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const ips = [
        "203.0.113.10",
        "203.0.113.11",
        "203.0.113.12",
    ];
    const users = [
        { email: `sort-a-${suffix}@example.com`, name: "Gamma Beta", klasse: "5AHITM" },
        { email: `sort-b-${suffix}@example.com`, name: "Gamma Alpha", klasse: "5AHITM" },
        { email: `sort-c-${suffix}@example.com`, name: "Alpha Delta", klasse: "5AHITM" },
    ];
    const seenAt = new Date();
    const start = new Date(seenAt.getTime() - 60_000);
    const end = new Date(seenAt.getTime() + 60_000);

    // Names in LastName FirstName format:
    // "Gamma Beta":    lastname="Gamma", firstname="Beta"
    // "Gamma Alpha":   lastname="Gamma", firstname="Alpha"
    // "Alpha Delta":   lastname="Alpha", firstname="Delta"
    // Sort by lastname then firstname:
    // "Alpha" < "Gamma" = "Gamma"
    // Within "Gamma": "Alpha" < "Beta"
    // Expected: Alpha Delta, Gamma Alpha, Gamma Beta
    const expectedOrder = ["Alpha Delta", "Gamma Alpha", "Gamma Beta"];

    try {
        for (let i = 0; i < ips.length; i++) {
            await seedNoAnomaliesScenario({
                ip: ips[i],
                email: users[i].email,
                name: users[i].name,
                klasse: users[i].klasse,
                at: seenAt,
                withCookiePresent: true,
            });
        }

        seedScan(seenAt);

        const result = await for_range(start, end);

        assertEquals(result.registered.length, 3);
        const actualOrder = result.registered.map((entry) =>
            entry.cookie_presents[0]?.user?.name ?? ""
        );
        assertEquals(actualOrder, expectedOrder);
    } finally {
        for (const ip of ips) await clearForensicsByIp(ip);
        for (const u of users) await clearForensicsByUserEmail(u.email);
        clearScans(seenAt);
    }
});

Deno.test("ipadmin most recent cookie decides teacher vs student", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const teacherEmail = `recent-teacher-${suffix}@example.com`;
    const studentEmail = `recent-student-${suffix}@example.com`;
    const sharedIp = `203.0.113.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const earlyTime = new Date("2026-03-27T09:00:00Z");
    const lateTime = new Date("2026-03-27T10:00:00Z");
    const start = new Date("2026-03-27T08:00:00Z");
    const end = new Date("2026-03-27T11:00:00Z");

    try {
        // Student cookie at early time
        const studentUser = await upsertFixtureUser({
            email: studentEmail,
            name: "Student Early",
            klasse: "5AHITM",
        });
        cookiepresentsRepo.create(sharedIp, studentUser.id, earlyTime);

        // Teacher cookie at late time (more recent → should decide)
        const teacherUser = await upsertFixtureUser({
            email: teacherEmail,
            name: "Teacher Late",
            klasse: "LehrendeR",
        });
        cookiepresentsRepo.create(sharedIp, teacherUser.id, lateTime);

        const result = await for_range(start, end);

        const inTeacher = result.teacher_ips.find((entry) => entry.ip === sharedIp);
        const inRegistered = result.registered.find((entry) => entry.ip === sharedIp);
        assertEquals(inTeacher !== undefined, true, "shared IP should be in teacher_ips (most recent cookie is teacher)");
        assertEquals(inRegistered, undefined, "shared IP should NOT be in registered");
    } finally {
        await clearForensicsByIp(sharedIp);
        await clearForensicsByUserEmail(teacherEmail);
        await clearForensicsByUserEmail(studentEmail);
    }
});

Deno.test("ipadmin missed_count stops after most recent submission", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userEmail = `missed-submit-${suffix}@example.com`;
    const testIp = `203.0.122.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const otherIp = `203.0.123.${Number.parseInt(suffix.slice(2, 4), 16) % 100 + 10}`;
    const baseTime = new Date("2026-06-01T10:00:00Z");
    const t1 = new Date(baseTime.getTime());          // IP seen
    const t2 = new Date(baseTime.getTime() + 60000);  // IP absent (miss before submission)
    const t3 = new Date(baseTime.getTime() + 120000); // IP seen
    const t4 = new Date(baseTime.getTime() + 150000); // submission time (cutoff)
    const t5 = new Date(baseTime.getTime() + 180000); // IP absent after submission
    const t6 = new Date(baseTime.getTime() + 240000); // IP absent after submission
    const start = new Date(baseTime.getTime() - 60000);
    const end = new Date(baseTime.getTime() + 300000);

    try {
        const { userId } = await seedNoAnomaliesScenario({
            ip: testIp,
            email: userEmail,
            name: "Submission Cutoff Test",
            klasse: "5AHITM",
            at: t1,
            withSeen: false,
            withCookiePresent: true,
        });

        // Scans at t1, t3: testIp present
        ipfactRepo.registerSeen(testIp, t1);
        ipfactRepo.registerSeen(testIp, t3);
        // Scan at t2: testIp absent before submission (should count)
        ipfactRepo.registerSeen(otherIp, t2);
        // Scans at t5, t6: testIp absent after submission (should NOT count)
        ipfactRepo.registerSeen(otherIp, t5);
        ipfactRepo.registerSeen(otherIp, t6);
        seedScan(t1);
        seedScan(t2);
        seedScan(t3);
        seedScan(t5);
        seedScan(t6);

        // Submission at t4 (not a scan, just the cutoff)
        seedSubmission({
            userId,
            ip: testIp,
            filename: "test-submission.md",
            at: t4,
        });

        const result = await for_range(start, end);
        const found = result.registered.find((entry) => entry.ip === testIp);

        assertExists(found);
        // allScans: t1, t2, t3, t5, t6
        // scans from first_seen (t1) up to cutoff (t4): t1, t2, t3
        // IP present at: t1, t3
        // missed: 1 (t2)
        assertEquals(found.missed_count, 1);
        assertEquals(found.has_submission, true);
    } finally {
        await clearForensicsByIp(testIp);
        await clearForensicsByIp(otherIp);
        await clearForensicsByUserEmail(userEmail);
        clearScans(t1, t2, t3, t5, t6);
    }
});

/*
Scan-Achse und stale (#163): `is_stale` bezieht sich auf den letzten Scan
des betrachteten Zeitraums, nicht auf die Wanduhr. `missed_count` zählt
Scans aus `tikscan` — auch leere.
*/
const STALE_BASE = new Date("2026-04-15T08:00:00Z");

function staleAt(minute: number, seconds = 0): Date {
    return new Date(STALE_BASE.getTime() + minute * 60_000 + seconds * 1000);
}

Deno.test("ipadmin is_stale false, wenn die IP im letzten Scan sichtbar ist", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userEmail = `stale-present-${suffix}@example.com`;
    const testIp = `203.0.130.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const t1 = staleAt(1);
    const t2 = staleAt(2);
    const start = staleAt(0);
    const end = staleAt(3);

    try {
        await seedNoAnomaliesScenario({
            ip: testIp,
            email: userEmail,
            name: "Stale Present",
            klasse: "5AHITM",
            at: t1,
            withSeen: false,
            withCookiePresent: true,
        });

        ipfactRepo.registerSeen(testIp, t1);
        ipfactRepo.registerSeen(testIp, t2);
        seedScan(t1);
        seedScan(t2);

        const result = await for_range(start, end);
        const found = result.registered.find((entry) => entry.ip === testIp);

        assertExists(found);
        assertEquals(found.is_stale, false);
        assertEquals(found.missed_count, 0);
    } finally {
        await clearForensicsByIp(testIp);
        await clearForensicsByUserEmail(userEmail);
        clearScans(t1, t2);
    }
});

Deno.test("ipadmin is_stale true, wenn die IP im letzten Scan fehlt", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userEmail = `stale-gone-${suffix}@example.com`;
    const testIp = `203.0.131.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const t1 = staleAt(11);
    const t2 = staleAt(12);
    const t3 = staleAt(13);
    const start = staleAt(10);
    const end = staleAt(14);

    try {
        await seedNoAnomaliesScenario({
            ip: testIp,
            email: userEmail,
            name: "Stale Gone",
            klasse: "5AHITM",
            at: t1,
            withSeen: false,
            withCookiePresent: true,
        });

        // Vorher gesehen, im letzten Scan des Zeitraums nicht mehr.
        ipfactRepo.registerSeen(testIp, t1);
        seedScan(t1);
        seedScan(t2);
        seedScan(t3);

        const result = await for_range(start, end);
        const found = result.registered.find((entry) => entry.ip === testIp);

        assertExists(found);
        assertEquals(found.is_stale, true);
        assertEquals(found.missed_count, 2);
    } finally {
        await clearForensicsByIp(testIp);
        await clearForensicsByUserEmail(userEmail);
        clearScans(t1, t2, t3);
    }
});

Deno.test("ipadmin is_stale false, wenn die IP im letzten Scan wieder da ist", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userEmail = `stale-back-${suffix}@example.com`;
    const testIp = `203.0.132.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const t1 = staleAt(21);
    const t2 = staleAt(22);
    const t3 = staleAt(23);
    const start = staleAt(20);
    const end = staleAt(24);

    try {
        await seedNoAnomaliesScenario({
            ip: testIp,
            email: userEmail,
            name: "Stale Back",
            klasse: "5AHITM",
            at: t1,
            withSeen: false,
            withCookiePresent: true,
        });

        ipfactRepo.registerSeen(testIp, t1);
        ipfactRepo.registerSeen(testIp, t3);
        seedScan(t1);
        seedScan(t2);
        seedScan(t3);

        const result = await for_range(start, end);
        const found = result.registered.find((entry) => entry.ip === testIp);

        assertExists(found);
        assertEquals(found.is_stale, false);
        assertEquals(found.missed_count, 1);
    } finally {
        await clearForensicsByIp(testIp);
        await clearForensicsByUserEmail(userEmail);
        clearScans(t1, t2, t3);
    }
});

Deno.test("ipadmin is_stale false, wenn die erste Sichtung im letzten Scan liegt", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userEmail = `stale-first-${suffix}@example.com`;
    const testIp = `203.0.133.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const t1 = staleAt(31);
    const t2 = staleAt(32);
    const start = staleAt(30);
    const end = staleAt(33);

    try {
        await seedNoAnomaliesScenario({
            ip: testIp,
            email: userEmail,
            name: "Stale First Scan",
            klasse: "5AHITM",
            at: t1,
            withSeen: false,
            withCookiePresent: true,
        });

        // Erste Sichtung ist genau der letzte Scan — niemand war vorher da.
        ipfactRepo.registerSeen(testIp, t2);
        seedScan(t1);
        seedScan(t2);

        const result = await for_range(start, end);
        const found = result.registered.find((entry) => entry.ip === testIp);

        assertExists(found);
        assertEquals(found.is_stale, false);
    } finally {
        await clearForensicsByIp(testIp);
        await clearForensicsByUserEmail(userEmail);
        clearScans(t1, t2);
    }
});

Deno.test("ipadmin leerer Scan macht früher gesehene IPs stale und zählt als Fehlzeit", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userEmail = `stale-empty-${suffix}@example.com`;
    const testIp = `203.0.134.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const t1 = staleAt(41);
    const t2 = staleAt(42);
    const start = staleAt(40);
    const end = staleAt(43);

    try {
        await seedNoAnomaliesScenario({
            ip: testIp,
            email: userEmail,
            name: "Stale Empty Scan",
            klasse: "5AHITM",
            at: t1,
            withSeen: false,
            withCookiePresent: true,
        });

        ipfactRepo.registerSeen(testIp, t1);
        seedScan(t1);
        // Leerer Abruf: kein Client sichtbar, aber ein Scan.
        seedScan(t2);

        const result = await for_range(start, end);
        const found = result.registered.find((entry) => entry.ip === testIp);

        assertExists(found);
        assertEquals(found.is_stale, true);
        assertEquals(found.missed_count, 1);
    } finally {
        await clearForensicsByIp(testIp);
        await clearForensicsByUserEmail(userEmail);
        clearScans(t1, t2);
    }
});

Deno.test("ipadmin is_stale false, wenn die Abgabe vor dem letzten Scan liegt", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userEmail = `stale-submitted-${suffix}@example.com`;
    const testIp = `203.0.135.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const t1 = staleAt(51);
    const submissionAt = staleAt(51, 30);
    const t2 = staleAt(52);
    const start = staleAt(50);
    const end = staleAt(53);

    try {
        const { userId } = await seedNoAnomaliesScenario({
            ip: testIp,
            email: userEmail,
            name: "Stale Submitted",
            klasse: "5AHITM",
            at: t1,
            withSeen: false,
            withCookiePresent: true,
        });

        ipfactRepo.registerSeen(testIp, t1);
        seedScan(t1);
        seedScan(t2);
        // Wer abgegeben hat und dann geht, ist fertig, nicht fehlend.
        seedSubmission({
            userId,
            ip: testIp,
            filename: `stale-${suffix}.md`,
            at: submissionAt,
        });

        const result = await for_range(start, end);
        const found = result.registered.find((entry) => entry.ip === testIp);

        assertExists(found);
        assertEquals(found.is_stale, false);
        assertEquals(found.missed_count, 0);
        assertEquals(found.has_submission, true);
    } finally {
        await clearForensicsByIp(testIp);
        await clearForensicsByUserEmail(userEmail);
        clearScans(t1, t2);
    }
});

Deno.test("ipadmin nutzt im historischen Zeitraum dessen letzten Scan", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userEmail = `stale-history-${suffix}@example.com`;
    const testIp = `203.0.136.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const t1 = staleAt(61);
    const t2 = staleAt(62);
    const t3 = staleAt(63);
    const t4 = staleAt(64);
    const start = staleAt(60);

    try {
        await seedNoAnomaliesScenario({
            ip: testIp,
            email: userEmail,
            name: "Stale History",
            klasse: "5AHITM",
            at: t1,
            withSeen: false,
            withCookiePresent: true,
        });

        ipfactRepo.registerSeen(testIp, t1);
        ipfactRepo.registerSeen(testIp, t2);
        seedScan(t1);
        seedScan(t2);
        seedScan(t3);
        seedScan(t4);

        // Bis t2 war die IP da: letzter Scan dieses Fensters ist t2.
        const early = await for_range(start, t2);
        const earlyFound = early.registered.find((entry) => entry.ip === testIp);
        assertExists(earlyFound);
        assertEquals(earlyFound.is_stale, false);

        // Dasselbe Fenster bis t4: letzter Scan ist t4, die IP fehlt dort.
        const late = await for_range(start, t4);
        const lateFound = late.registered.find((entry) => entry.ip === testIp);
        assertExists(lateFound);
        assertEquals(lateFound.is_stale, true);
    } finally {
        await clearForensicsByIp(testIp);
        await clearForensicsByUserEmail(userEmail);
        clearScans(t1, t2, t3, t4);
    }
});

Deno.test("ipadmin for_ip liefert denselben Eintrag wie for_range", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userEmail = `for-ip-same-${suffix}@example.com`;
    const testIp = `203.0.137.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const t1 = staleAt(71);
    const t2 = staleAt(72);
    const t3 = staleAt(73);
    const start = staleAt(70);
    const end = staleAt(74);

    try {
        const { userId } = await seedNoAnomaliesScenario({
            ip: testIp,
            email: userEmail,
            name: "For Ip Same",
            klasse: "5AHITM",
            at: t1,
            withSeen: false,
            withCookiePresent: true,
        });

        ipfactRepo.registerSeen(testIp, t1);
        ipfactRepo.registerSeen(testIp, t3);
        seedScan(t1);
        seedScan(t2);
        seedScan(t3);
        seedSubmission({
            userId,
            ip: testIp,
            filename: `for-ip-${suffix}.md`,
            at: t3,
        });

        const result = await for_range(start, end);
        const fromRange = result.registered.find((entry) => entry.ip === testIp);
        assertExists(fromRange);

        const direct = await for_ip(testIp, start, end);
        assertEquals(direct, fromRange);
        assertEquals(direct?.is_stale, false);
        assertEquals(direct?.missed_count, 1);
    } finally {
        await clearForensicsByIp(testIp);
        await clearForensicsByUserEmail(userEmail);
        clearScans(t1, t2, t3);
    }
});

Deno.test("ipadmin for_ip liefert null für eine im Zeitraum unbekannte IP", async () => {
    const unknownIp = `198.18.${
        Number.parseInt(crypto.randomUUID().slice(0, 2), 16) % 200 + 1
    }.${
        Number.parseInt(crypto.randomUUID().slice(2, 4), 16) % 200 + 1
    }`;

    const result = await for_ip(unknownIp, staleAt(80), staleAt(81));
    assertEquals(result, null);
});
