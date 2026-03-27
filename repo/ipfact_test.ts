import { assertEquals } from "@std/assert";
import * as ipfactRepo from "./ipfact.ts";
import { db } from "./db.ts";

Deno.test("getUniqueScanTimestamps returns empty array for empty range", () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const testIp = `10.0.0.${Number.parseInt(suffix.slice(0, 2), 16) % 250 + 1}`;
    const now = new Date();
    const start = new Date(now.getTime() + 100000);
    const end = new Date(now.getTime() + 200000);

    try {
        // No records in this range
        const result = ipfactRepo.getUniqueScanTimestamps(start, end);
        assertEquals(result, []);
    } finally {
        db.exec(`DELETE FROM ipfact WHERE ip = '${testIp}'`);
    }
});

Deno.test("getUniqueScanTimestamps returns unique timestamps only", () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const testIp1 = `10.0.1.${Number.parseInt(suffix.slice(0, 2), 16) % 250 + 1}`;
    const testIp2 = `10.0.2.${Number.parseInt(suffix.slice(2, 4), 16) % 250 + 1}`;
    const baseTime = new Date("2026-03-27T10:00:00Z");
    const scanTime = new Date(baseTime);
    const start = new Date(baseTime.getTime() - 60000);
    const end = new Date(baseTime.getTime() + 60000);

    try {
        // Register both IPs at the same timestamp (same scan)
        ipfactRepo.registerSeen(testIp1, scanTime);
        ipfactRepo.registerSeen(testIp2, scanTime);

        const result = ipfactRepo.getUniqueScanTimestamps(start, end);

        // Should return only one unique timestamp
        assertEquals(result.length, 1);
        assertEquals(result[0].toISOString(), scanTime.toISOString());
    } finally {
        db.exec(`DELETE FROM ipfact WHERE ip IN ('${testIp1}', '${testIp2}')`);
    }
});

Deno.test("getUniqueScanTimestamps sorts timestamps ascending", () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const testIp = `10.0.3.${Number.parseInt(suffix.slice(0, 2), 16) % 250 + 1}`;
    const baseTime = new Date("2026-03-27T10:00:00Z");
    const t1 = new Date(baseTime.getTime() + 60000);
    const t2 = new Date(baseTime.getTime() + 120000);
    const t3 = new Date(baseTime.getTime() + 180000);
    const start = new Date(baseTime);
    const end = new Date(baseTime.getTime() + 240000);

    try {
        // Register scans out of order (t3, t1, t2)
        ipfactRepo.registerSeen(testIp, t3);
        ipfactRepo.registerSeen(testIp, t1);
        ipfactRepo.registerSeen(testIp, t2);

        const result = ipfactRepo.getUniqueScanTimestamps(start, end);

        assertEquals(result.length, 3);
        // Should be in ascending order
        assertEquals(result[0].toISOString(), t1.toISOString());
        assertEquals(result[1].toISOString(), t2.toISOString());
        assertEquals(result[2].toISOString(), t3.toISOString());
    } finally {
        db.exec(`DELETE FROM ipfact WHERE ip = '${testIp}'`);
    }
});

Deno.test("getUniqueScanTimestamps honors start boundary", () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const testIp = `10.0.4.${Number.parseInt(suffix.slice(0, 2), 16) % 250 + 1}`;
    const baseTime = new Date("2026-03-27T10:00:00Z");
    const t1 = new Date(baseTime.getTime() - 60000); // before start
    const t2 = new Date(baseTime.getTime() + 60000); // after start
    const start = new Date(baseTime);
    const end = new Date(baseTime.getTime() + 120000);

    try {
        ipfactRepo.registerSeen(testIp, t1);
        ipfactRepo.registerSeen(testIp, t2);

        const result = ipfactRepo.getUniqueScanTimestamps(start, end);

        assertEquals(result.length, 1);
        assertEquals(result[0].toISOString(), t2.toISOString());
    } finally {
        db.exec(`DELETE FROM ipfact WHERE ip = '${testIp}'`);
    }
});

Deno.test("getUniqueScanTimestamps honors end boundary", () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const testIp = `10.0.5.${Number.parseInt(suffix.slice(0, 2), 16) % 250 + 1}`;
    const baseTime = new Date("2026-03-27T10:00:00Z");
    const t1 = new Date(baseTime.getTime() + 60000); // within range
    const t2 = new Date(baseTime.getTime() + 180000); // after end
    const start = new Date(baseTime);
    const end = new Date(baseTime.getTime() + 120000);

    try {
        ipfactRepo.registerSeen(testIp, t1);
        ipfactRepo.registerSeen(testIp, t2);

        const result = ipfactRepo.getUniqueScanTimestamps(start, end);

        assertEquals(result.length, 1);
        assertEquals(result[0].toISOString(), t1.toISOString());
    } finally {
        db.exec(`DELETE FROM ipfact WHERE ip = '${testIp}'`);
    }
});

Deno.test("getUniqueScanTimestamps returns multiple distinct timestamps from different IPs", () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const testIp1 = `10.0.6.${Number.parseInt(suffix.slice(0, 2), 16) % 250 + 1}`;
    const testIp2 = `10.0.7.${Number.parseInt(suffix.slice(2, 4), 16) % 250 + 1}`;
    const baseTime = new Date("2026-03-27T11:00:00Z");
    const t1 = new Date(baseTime);
    const t2 = new Date(baseTime.getTime() + 60000);
    const start = new Date(baseTime.getTime() - 60000);
    const end = new Date(baseTime.getTime() + 120000);

    try {
        // IP1 at t1, IP2 at t2
        ipfactRepo.registerSeen(testIp1, t1);
        ipfactRepo.registerSeen(testIp2, t2);

        const result = ipfactRepo.getUniqueScanTimestamps(start, end);

        assertEquals(result.length, 2);
    } finally {
        db.exec(`DELETE FROM ipfact WHERE ip IN ('${testIp1}', '${testIp2}')`);
    }
});