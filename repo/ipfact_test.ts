import { assertEquals } from "@std/assert";
import * as ipfactRepo from "./ipfact.ts";
import { db } from "./db.ts";

function clearScans(...ats: Date[]): void {
    const stmt = db.prepare("DELETE FROM tikscan WHERE at = ?");
    for (const at of ats) {
        stmt.run(at.toISOString());
    }
}

const SCAN_BASE = new Date("2029-12-30T09:00:00Z");

function scanAt(offsetMs: number): Date {
    return new Date(SCAN_BASE.getTime() + offsetMs);
}

Deno.test("insertScan speichert jeden Scan genau einmal", () => {
    const t1 = scanAt(0);

    try {
        ipfactRepo.insertScan(t1);
        // Zweiter Abruf desselben Zeitpunkts ist kein zweiter Scan.
        ipfactRepo.insertScan(t1);

        assertEquals(
            ipfactRepo.scansInRange(t1, t1).map((d) => d.toISOString()),
            [t1.toISOString()],
        );
    } finally {
        clearScans(t1);
    }
});

Deno.test("scansInRange liefert die Scans aufsteigend und begrenzt", () => {
    const t1 = scanAt(60_000);
    const t2 = scanAt(120_000);
    const t3 = scanAt(180_000);

    try {
        ipfactRepo.insertScan(t3);
        ipfactRepo.insertScan(t1);
        ipfactRepo.insertScan(t2);

        const all = ipfactRepo.scansInRange(scanAt(0), scanAt(240_000));
        assertEquals(all.map((d) => d.toISOString()), [
            t1.toISOString(),
            t2.toISOString(),
            t3.toISOString(),
        ]);

        // Startgrenze schließt t1 aus.
        const later = ipfactRepo.scansInRange(t2, scanAt(240_000));
        assertEquals(later.map((d) => d.toISOString()), [
            t2.toISOString(),
            t3.toISOString(),
        ]);
    } finally {
        clearScans(t1, t2, t3);
    }
});

Deno.test("latestScan liefert den jüngsten Scan im Zeitraum", () => {
    const t1 = scanAt(300_000);
    const t2 = scanAt(360_000);

    try {
        ipfactRepo.insertScan(t1);
        ipfactRepo.insertScan(t2);

        assertEquals(
            ipfactRepo.latestScan(scanAt(0), scanAt(420_000))?.toISOString(),
            t2.toISOString(),
        );
        // Nur t1 liegt im Fenster.
        assertEquals(
            ipfactRepo.latestScan(scanAt(0), scanAt(330_000))?.toISOString(),
            t1.toISOString(),
        );
        // Leeres Fenster.
        assertEquals(ipfactRepo.latestScan(scanAt(0), scanAt(1)), null);
    } finally {
        clearScans(t1, t2);
    }
});

Deno.test("previousScan liefert den nächstälteren Scan", () => {
    const t1 = scanAt(480_000);
    const t2 = scanAt(540_000);

    try {
        ipfactRepo.insertScan(t1);
        ipfactRepo.insertScan(t2);

        assertEquals(
            ipfactRepo.previousScan(t2)?.toISOString(),
            t1.toISOString(),
        );
    } finally {
        clearScans(t1, t2);
    }
});

Deno.test("existsAt prüft genau diesen Scan", () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const testIp = `10.0.20.${Number.parseInt(suffix.slice(0, 2), 16) % 250 + 1}`;
    const t1 = scanAt(600_000);
    const t2 = scanAt(660_000);

    try {
        ipfactRepo.registerSeen(testIp, t1);

        assertEquals(ipfactRepo.existsAt(testIp, t1), true);
        assertEquals(ipfactRepo.existsAt(testIp, t2), false);
        assertEquals(ipfactRepo.existsAt("10.0.99.99", t1), false);
    } finally {
        db.exec(`DELETE FROM ipfact WHERE ip = '${testIp}'`);
    }
});

Deno.test("existsBefore findet Sichtungen nur im Fenster", () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const testIp = `10.0.21.${Number.parseInt(suffix.slice(0, 2), 16) % 250 + 1}`;
    const t1 = scanAt(720_000);
    const t2 = scanAt(780_000);
    const t3 = scanAt(840_000);

    try {
        ipfactRepo.registerSeen(testIp, t1);
        ipfactRepo.registerSeen(testIp, t3);

        // Vor t3 und ab Fensterbeginn gesehen.
        assertEquals(ipfactRepo.existsBefore(testIp, t3, scanAt(0)), true);
        // Erste Sichtung selbst zählt nicht als "vorher".
        assertEquals(ipfactRepo.existsBefore(testIp, t1, scanAt(0)), false);
        // t1 liegt vor dem Fensterbeginn t2.
        assertEquals(ipfactRepo.existsBefore(testIp, t3, t2), false);
    } finally {
        db.exec(`DELETE FROM ipfact WHERE ip = '${testIp}'`);
    }
});

Deno.test("deleteScansOlderThan löscht nur ältere Scans", () => {
    const oldScan = new Date("2019-06-01T10:00:00.000Z");
    const freshScan = scanAt(900_000);

    try {
        ipfactRepo.insertScan(oldScan);
        ipfactRepo.insertScan(freshScan);

        const deleted = ipfactRepo.deleteScansOlderThan(
            new Date("2020-01-01T00:00:00.000Z"),
        );

        assertEquals(deleted >= 1, true);
        assertEquals(
            ipfactRepo.scansInRange(oldScan, oldScan),
            [],
        );
        assertEquals(
            ipfactRepo.scansInRange(freshScan, freshScan).length,
            1,
        );
    } finally {
        clearScans(oldScan, freshScan);
    }
});

Deno.test("registerSeenMany speichert die MAC je Sichtung", () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const testIp1 = `10.0.8.${Number.parseInt(suffix.slice(0, 2), 16) % 250 + 1}`;
    const testIp2 = `10.0.9.${Number.parseInt(suffix.slice(2, 4), 16) % 250 + 1}`;
    const seen = new Date("2026-04-01T10:00:00Z");

    try {
        const inserted = ipfactRepo.registerSeenMany([
            { ip: testIp1, mac: "aa:bb:cc:dd:ee:01" },
            { ip: testIp2, mac: null },
        ], seen);
        assertEquals(inserted, 2);

        const rows = db.prepare(
            "SELECT ip, mac FROM ipfact WHERE seen = ? ORDER BY ip",
        ).all(seen.toISOString()) as { ip: string; mac: string | null }[];

        assertEquals(rows, [
            { ip: testIp1, mac: "aa:bb:cc:dd:ee:01" },
            { ip: testIp2, mac: null },
        ]);
    } finally {
        db.exec(`DELETE FROM ipfact WHERE ip IN ('${testIp1}', '${testIp2}')`);
    }
});

Deno.test("registerSeen speichert die MAC einer einzelnen Sichtung", () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const testIp = `10.0.10.${Number.parseInt(suffix.slice(0, 2), 16) % 250 + 1}`;
    const seen = new Date("2026-04-01T11:00:00Z");

    try {
        ipfactRepo.registerSeen(testIp, seen, "aa:bb:cc:dd:ee:02");

        const row = db.prepare(
            "SELECT mac FROM ipfact WHERE ip = ? AND seen = ?",
        ).get(testIp, seen.toISOString()) as { mac: string | null } | undefined;

        assertEquals(row?.mac, "aa:bb:cc:dd:ee:02");
    } finally {
        db.exec(`DELETE FROM ipfact WHERE ip = '${testIp}'`);
    }
});

Deno.test("ipsAt liefert die IPs genau eines Scans, distinct", () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const ipA = `10.0.30.${Number.parseInt(suffix.slice(0, 2), 16) % 250 + 1}`;
    const ipB = `10.0.31.${Number.parseInt(suffix.slice(2, 4), 16) % 250 + 1}`;
    const at = scanAt(960_000);
    const later = scanAt(1_020_000);

    try {
        // ipA ist nur in diesem Scan sichtbar, ipB zusätzlich später —
        // jede IP steht genau einmal in der Liste.
        ipfactRepo.registerSeen(ipA, at);
        ipfactRepo.registerSeen(ipB, at);
        ipfactRepo.registerSeen(ipB, later);

        assertEquals(ipfactRepo.ipsAt(at), [ipA, ipB].sort());
        assertEquals(ipfactRepo.ipsAt(later), [ipB]);
        assertEquals(ipfactRepo.ipsAt(scanAt(1_080_000)), []);
    } finally {
        db.exec(`DELETE FROM ipfact WHERE ip IN ('${ipA}', '${ipB}')`);
    }
});

Deno.test("ipsBetween arbeitet halboffen: start zählt, end nicht", () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const ipA = `10.0.32.${Number.parseInt(suffix.slice(0, 2), 16) % 250 + 1}`;
    const ipB = `10.0.33.${Number.parseInt(suffix.slice(2, 4), 16) % 250 + 1}`;
    const start = scanAt(1_140_000);
    const end = scanAt(1_260_000);

    try {
        // ipA genau an der Startgrenze (zählt), ipB genau an der
        // Endgrenze (zählt nicht mehr zu diesem Fenster).
        ipfactRepo.registerSeen(ipA, start);
        ipfactRepo.registerSeen(ipB, end);

        assertEquals(ipfactRepo.ipsBetween(start, end), [ipA]);
        assertEquals(ipfactRepo.ipsBetween(start, new Date(end.getTime() + 1)), [
            ipA,
            ipB,
        ]);
        assertEquals(ipfactRepo.ipsBetween(end, end), []);
    } finally {
        db.exec(`DELETE FROM ipfact WHERE ip IN ('${ipA}', '${ipB}')`);
    }
});
