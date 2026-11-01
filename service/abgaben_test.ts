import { assertEquals } from "@std/assert";
import { countMissed, examPresence } from "./abgaben.ts";
import * as ipfactRepo from "../repo/ipfact.ts";
import * as abgabenRepo from "../repo/abgaben.ts";
import * as cookiepresentsRepo from "../repo/cookiepresents.ts";
import { db } from "../repo/db.ts";
import {
    clearForensicsByIp,
    clearForensicsByUserEmail,
    clearScans,
    seedScan,
    upsertFixtureUser,
} from "../test/helpers/forensics_fixture.ts";

/**
 * Die Scan-Achse (#163) liegt in `tikscan` und kennt keine IP. Für die
 * Fenster dieser Tests muss sie leer sein, sonst zählen fremde Scans mit.
 * Geleert werden nur die letzten Minuten, nicht die Historie.
 */
function resetScanAxis(since: Date): void {
    db.exec("DELETE FROM ipfact");
    db.prepare("DELETE FROM tikscan WHERE at >= ?").run(since.toISOString());
}

function uniqueIp(prefix: number, suffix: string): string {
    return `10.${prefix}.0.${Number.parseInt(suffix.slice(0, 2), 16) % 200 + 10}`;
}

function at(base: Date, seconds: number): Date {
    return new Date(base.getTime() + seconds * 1000);
}

// ---------------------------------------------------------------------
// Zählkern (rein, ohne Datenbank)
// ---------------------------------------------------------------------

Deno.test("countMissed: lückenlose Anwesenheit zählt nichts", () => {
    const scans = [new Date("2026-11-01T08:00:00Z"), new Date("2026-11-01T08:01:00Z")];
    const seen = new Set(scans.map((scan) => scan.toISOString()));

    assertEquals(countMissed(scans, seen), { missed: 0, dropouts: 0 });
});

Deno.test("countMissed: ein fehlender Scan ist eine Minute und ein Dropout", () => {
    const scans = [
        new Date("2026-11-01T08:00:00Z"),
        new Date("2026-11-01T08:01:00Z"),
        new Date("2026-11-01T08:02:00Z"),
    ];
    const seen = new Set([
        scans[0].toISOString(),
        scans[2].toISOString(),
    ]);

    assertEquals(countMissed(scans, seen), { missed: 1, dropouts: 1 });
});

Deno.test("countMissed: ein Block fehlender Scans ist genau ein Dropout", () => {
    const scans = [
        new Date("2026-11-01T08:00:00Z"),
        new Date("2026-11-01T08:01:00Z"),
        new Date("2026-11-01T08:02:00Z"),
        new Date("2026-11-01T08:03:00Z"),
        new Date("2026-11-01T08:04:00Z"),
    ];
    const seen = new Set([
        scans[0].toISOString(),
        scans[4].toISOString(),
    ]);

    assertEquals(countMissed(scans, seen), { missed: 3, dropouts: 1 });
});

Deno.test("countMissed: zwei getrennte Blöcke sind zwei Dropouts", () => {
    const scans = [
        new Date("2026-11-01T08:00:00Z"),
        new Date("2026-11-01T08:01:00Z"),
        new Date("2026-11-01T08:02:00Z"),
        new Date("2026-11-01T08:03:00Z"),
        new Date("2026-11-01T08:04:00Z"),
        new Date("2026-11-01T08:05:00Z"),
    ];
    const seen = new Set([
        scans[0].toISOString(),
        scans[3].toISOString(),
    ]);

    assertEquals(countMissed(scans, seen), { missed: 4, dropouts: 2 });
});

// ---------------------------------------------------------------------
// Anwesenheitsbild im Examen (Datenbank)
// ---------------------------------------------------------------------

Deno.test("examPresence: ohne Exam-Zustand gibt es nichts zu melden", () => {
    assertEquals(examPresence(999999, "10.0.0.1", null), {
        dropouts: 0,
        missed_minutes: 0,
        ip_change: false,
    });
});

Deno.test("examPresence: durchgehende Anwesenheit ergibt keine Dropouts", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `presence-clean-${suffix}@example.com`;
    const ip = uniqueIp(0, suffix);
    const examStart = at(new Date(), -300);
    const t1 = at(examStart, 30);
    const t2 = at(examStart, 90);
    const t3 = at(examStart, 150);
    resetScanAxis(examStart);

    try {
        const user = await upsertFixtureUser({
            email,
            name: "Presence Clean",
            klasse: "5AHITM",
        });
        await cookiepresentsRepo.create(ip, user.id, t1);
        ipfactRepo.registerSeen(ip, t1);
        ipfactRepo.registerSeen(ip, t2);
        ipfactRepo.registerSeen(ip, t3);
        seedScan(t1);
        seedScan(t2);
        seedScan(t3);

        assertEquals(examPresence(user.id, ip, examStart), {
            dropouts: 0,
            missed_minutes: 0,
            ip_change: false,
        });
    } finally {
        clearForensicsByIp(ip);
        await clearForensicsByUserEmail(email);
        clearScans(t1, t2, t3);
    }
});

Deno.test("examPresence: fehlende Scans werden zu Minuten und Dropouts", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `presence-gap-${suffix}@example.com`;
    const ip = uniqueIp(1, suffix);
    const examStart = at(new Date(), -300);
    const t1 = at(examStart, 30);
    const t2 = at(examStart, 90); // fehlt
    const t3 = at(examStart, 150);
    const t4 = at(examStart, 210); // fehlt
    const t5 = at(examStart, 270); // fehlt
    resetScanAxis(examStart);

    try {
        const user = await upsertFixtureUser({
            email,
            name: "Presence Gap",
            klasse: "5AHITM",
        });
        ipfactRepo.registerSeen(ip, t1);
        ipfactRepo.registerSeen(ip, t3);
        for (const scan of [t1, t2, t3, t4, t5]) {
            seedScan(scan);
        }

        assertEquals(examPresence(user.id, ip, examStart), {
            dropouts: 2,
            missed_minutes: 3,
            ip_change: false,
        });
    } finally {
        clearForensicsByIp(ip);
        await clearForensicsByUserEmail(email);
        clearScans(t1, t2, t3, t4, t5);
    }
});

Deno.test("examPresence: Scans vor der ersten Sichtung zählen nicht", async () => {
    // Spätankömmling: zwei Scans vor dem ersten Erscheinen sind kein
    // Dropout, auch wenn die IP dort naturgemäß fehlt.
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `presence-late-${suffix}@example.com`;
    const ip = uniqueIp(2, suffix);
    const examStart = at(new Date(), -300);
    const t1 = at(examStart, 30);
    const t2 = at(examStart, 90);
    const t3 = at(examStart, 150);
    const t4 = at(examStart, 210);
    resetScanAxis(examStart);

    try {
        const user = await upsertFixtureUser({
            email,
            name: "Presence Late",
            klasse: "5AHITM",
        });
        ipfactRepo.registerSeen(ip, t3);
        for (const scan of [t1, t2, t3, t4]) {
            seedScan(scan);
        }

        assertEquals(examPresence(user.id, ip, examStart), {
            dropouts: 1,
            missed_minutes: 1,
            ip_change: false,
        });
    } finally {
        clearForensicsByIp(ip);
        await clearForensicsByUserEmail(email);
        clearScans(t1, t2, t3, t4);
    }
});

Deno.test("examPresence: Rückkehr mit neuer IP markiert den Wechsel und zählt weiter", async () => {
    // Weg auf IP A, zurück auf IP B: die Lücke liegt auf der Achse von A,
    // die Abgabe kommt von B. Beides muss sichtbar sein.
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `presence-ipchange-${suffix}@example.com`;
    const ipA = uniqueIp(3, suffix);
    const ipB = uniqueIp(4, suffix);
    const examStart = at(new Date(), -300);
    const t1 = at(examStart, 30);
    const t2 = at(examStart, 90);
    const t3 = at(examStart, 150); // fehlt auf A, noch nicht auf B
    const t4 = at(examStart, 210);
    resetScanAxis(examStart);

    try {
        const user = await upsertFixtureUser({
            email,
            name: "Presence Change",
            klasse: "5AHITM",
        });
        await cookiepresentsRepo.create(ipA, user.id, t1);
        await cookiepresentsRepo.create(ipB, user.id, t4);
        ipfactRepo.registerSeen(ipA, t1);
        ipfactRepo.registerSeen(ipA, t2);
        ipfactRepo.registerSeen(ipB, t4);
        for (const scan of [t1, t2, t3, t4]) {
            seedScan(scan);
        }

        assertEquals(examPresence(user.id, ipB, examStart), {
            dropouts: 1,
            missed_minutes: 1,
            ip_change: true,
        });
    } finally {
        clearForensicsByIp(ipA);
        clearForensicsByIp(ipB);
        await clearForensicsByUserEmail(email);
        clearScans(t1, t2, t3, t4);
    }
});

Deno.test("examPresence: ohne Scan-Daten bleibt der IP-Wechsel sichtbar", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `presence-noscan-${suffix}@example.com`;
    const ipA = uniqueIp(5, suffix);
    const ipB = uniqueIp(6, suffix);
    const examStart = at(new Date(), -120);
    resetScanAxis(examStart);

    try {
        const user = await upsertFixtureUser({
            email,
            name: "Presence No Scan",
            klasse: "5AHITM",
        });
        abgabenRepo.create(user.id, ipA, "vorher.zip", at(examStart, 10));

        assertEquals(examPresence(user.id, ipB, examStart), {
            dropouts: 0,
            missed_minutes: 0,
            ip_change: true,
        });
    } finally {
        clearForensicsByIp(ipA);
        clearForensicsByIp(ipB);
        await clearForensicsByUserEmail(email);
    }
});
