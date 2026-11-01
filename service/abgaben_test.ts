import { assertEquals } from "@std/assert";
import { canResubmit } from "./abgaben.ts";
import * as ipfactRepo from "../repo/ipfact.ts";
import * as abgabenRepo from "../repo/abgaben.ts";
import { db } from "../repo/db.ts";
import {
    clearForensicsByIp,
    clearForensicsByUserEmail,
    clearScans,
    seedScan,
    upsertFixtureUser,
} from "../test/helpers/forensics_fixture.ts";

/**
 * Die Scan-Achse (#163) liegt in `tikscan` und kennt keine IP. Für das
 * Fenster `[Abgabe, jetzt]` dieser Tests muss sie leer sein, sonst zählen
 * fremde Scans mit. Geleert werden nur die letzten Minuten, nicht die
 * Historie.
 */
const SCAN_WINDOW_MS = 120_000;

function resetScanAxis(subTime: Date): void {
    db.exec("DELETE FROM ipfact");
    db.prepare("DELETE FROM tikscan WHERE at >= ?").run(subTime.toISOString());
}

function recentSubmission(): Date {
    return new Date(Date.now() - SCAN_WINDOW_MS);
}

Deno.test("canResubmit - first submission always allowed", () => {
    const result = canResubmit(999999, "10.0.0.1");
    assertEquals(result, true);
});

Deno.test("canResubmit - student present in all scans since last submission returns true", async () => {
    const subTime = recentSubmission();
    resetScanAxis(subTime);
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `resubmit-present-${suffix}@example.com`;
    const ip = `10.0.0.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const t1 = new Date(subTime.getTime() + 30_000);
    const t2 = new Date(subTime.getTime() + 60_000);

    try {
        const user = await upsertFixtureUser({ email, name: "Resubmit Present", klasse: "5AHITM" });

        abgabenRepo.create(user.id, ip, "test_v1.zip", subTime);

        ipfactRepo.registerSeen(ip, t1);
        ipfactRepo.registerSeen(ip, t2);
        seedScan(t1);
        seedScan(t2);

        const result = canResubmit(user.id, ip);
        assertEquals(result, true, "should allow resubmit when IP present in all scans");
    } finally {
        await clearForensicsByIp(ip);
        await clearForensicsByUserEmail(email);
        clearScans(t1, t2);
    }
});

Deno.test("canResubmit - student missing from a scan since last submission returns false", async () => {
    const subTime = recentSubmission();
    resetScanAxis(subTime);
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `resubmit-missed-${suffix}@example.com`;
    const ip = `10.0.0.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const otherIp = `10.0.1.${Number.parseInt(suffix.slice(2, 4), 16) % 100 + 10}`;
    const t1 = new Date(subTime.getTime() + 30_000);
    const t2 = new Date(subTime.getTime() + 60_000);

    try {
        const user = await upsertFixtureUser({ email, name: "Resubmit Missed", klasse: "5AHITM" });

        abgabenRepo.create(user.id, ip, "test_v1.zip", subTime);

        ipfactRepo.registerSeen(ip, t1);
        ipfactRepo.registerSeen(otherIp, t2);
        seedScan(t1);
        seedScan(t2);

        const result = canResubmit(user.id, ip);
        assertEquals(result, false, "should deny resubmit when IP was absent from a scan");
    } finally {
        await clearForensicsByIp(ip);
        await clearForensicsByIp(otherIp);
        await clearForensicsByUserEmail(email);
        clearScans(t1, t2);
    }
});

Deno.test("canResubmit - empty scan since last submission counts as absence", async () => {
    const subTime = recentSubmission();
    resetScanAxis(subTime);
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `resubmit-empty-${suffix}@example.com`;
    const ip = `10.0.0.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const t1 = new Date(subTime.getTime() + 30_000);

    try {
        const user = await upsertFixtureUser({ email, name: "Resubmit Empty", klasse: "5AHITM" });

        abgabenRepo.create(user.id, ip, "test_v1.zip", subTime);

        // Abruf ohne einen einzigen sichtbaren Client: die IP fehlt im Scan.
        seedScan(t1);

        const result = canResubmit(user.id, ip);
        assertEquals(result, false, "should deny resubmit when a scan saw no clients");
    } finally {
        await clearForensicsByIp(ip);
        await clearForensicsByUserEmail(email);
        clearScans(t1);
    }
});

Deno.test("canResubmit - no scans since last submission returns true", async () => {
    const subTime = recentSubmission();
    resetScanAxis(subTime);
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `resubmit-noscan-${suffix}@example.com`;
    const ip = `10.0.0.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;

    try {
        const user = await upsertFixtureUser({ email, name: "Resubmit No Scan", klasse: "5AHITM" });

        abgabenRepo.create(user.id, ip, "test_v1.zip", subTime);

        const result = canResubmit(user.id, ip);
        assertEquals(result, true, "should allow resubmit when no scans exist since submission");
    } finally {
        await clearForensicsByIp(ip);
        await clearForensicsByUserEmail(email);
    }
});
