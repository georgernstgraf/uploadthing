import { assertEquals, assertExists } from "@std/assert";
import { for_range } from "./ipadmin.ts";
import {
    clearForensicsByIp,
    clearForensicsByUserEmail,
    seedRegistration,
} from "../test/helpers/forensics_fixture.ts";

Deno.test("ipadmin classifies IPs by cookie presence and keeps registrations", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userEmail = `cookiepresent-${suffix}@example.com`;
    const knownIp = `203.0.113.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const unknownIp = `198.51.100.${Number.parseInt(suffix.slice(2, 4), 16) % 100 + 10}`;
    const seenAt = new Date();
    const start = new Date(seenAt.getTime() - 60_000);
    const end = new Date(seenAt.getTime() + 60_000);

    try {
        await seedRegistration({
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
        await seedRegistration({
            ip: sharedIp,
            email: userOneEmail,
            name: "Anomaly One",
            klasse: "5AHITM",
            at: seenAt,
            withCookiePresent: true,
        });
        await seedRegistration({
            ip: secondIp,
            email: userOneEmail,
            name: "Anomaly One",
            klasse: "5AHITM",
            at: seenAt,
            withCookiePresent: true,
        });
        await seedRegistration({
            ip: sharedIp,
            email: userTwoEmail,
            name: "Anomaly Two",
            klasse: "5AHITM",
            at: seenAt,
            withSeen: false,
            withCookiePresent: true,
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
        await seedRegistration({
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
        await seedRegistration({
            ip: firstIp,
            email: userEmail,
            name: "Registration Anomaly",
            klasse: "5AHITM",
            at: seenAt,
        });
        await seedRegistration({
            ip: secondIp,
            email: userEmail,
            name: "Registration Anomaly",
            klasse: "5AHITM",
            at: seenAt,
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
