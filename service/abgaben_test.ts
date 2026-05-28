import { assertEquals } from "@std/assert";
import { canResubmit } from "./abgaben.ts";
import * as ipfactRepo from "../repo/ipfact.ts";
import * as abgabenRepo from "../repo/abgaben.ts";
import { db } from "../repo/db.ts";
import { upsertFixtureUser, clearForensicsByIp, clearForensicsByUserEmail } from "../test/helpers/forensics_fixture.ts";

Deno.test("canResubmit - first submission always allowed", () => {
    const result = canResubmit(999999, "10.0.0.1");
    assertEquals(result, true);
});

Deno.test("canResubmit - student present in all scans since last submission returns true", async () => {
    db.exec("DELETE FROM ipfact");
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `resubmit-present-${suffix}@example.com`;
    const ip = `10.0.0.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const subTime = new Date("2026-05-28T10:00:00Z");
    const t1 = new Date("2026-05-28T10:00:30Z");
    const t2 = new Date("2026-05-28T10:01:00Z");

    try {
        const user = await upsertFixtureUser({ email, name: "Resubmit Present", klasse: "5AHITM" });

        abgabenRepo.create(user.id, ip, "test_v1.zip", subTime);

        ipfactRepo.registerSeen(ip, t1);
        ipfactRepo.registerSeen(ip, t2);

        const result = canResubmit(user.id, ip);
        assertEquals(result, true, "should allow resubmit when IP present in all scans");
    } finally {
        await clearForensicsByIp(ip);
        await clearForensicsByUserEmail(email);
    }
});

Deno.test("canResubmit - student missing from a scan since last submission returns false", async () => {
    db.exec("DELETE FROM ipfact");
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `resubmit-missed-${suffix}@example.com`;
    const ip = `10.0.0.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const otherIp = `10.0.1.${Number.parseInt(suffix.slice(2, 4), 16) % 100 + 10}`;
    const subTime = new Date("2026-05-28T10:00:00Z");
    const t1 = new Date("2026-05-28T10:00:30Z");
    const t2 = new Date("2026-05-28T10:01:00Z");

    try {
        const user = await upsertFixtureUser({ email, name: "Resubmit Missed", klasse: "5AHITM" });

        abgabenRepo.create(user.id, ip, "test_v1.zip", subTime);

        ipfactRepo.registerSeen(ip, t1);
        ipfactRepo.registerSeen(otherIp, t2);

        const result = canResubmit(user.id, ip);
        assertEquals(result, false, "should deny resubmit when IP was absent from a scan");
    } finally {
        await clearForensicsByIp(ip);
        await clearForensicsByIp(otherIp);
        await clearForensicsByUserEmail(email);
    }
});

Deno.test("canResubmit - no scans since last submission returns true", async () => {
    db.exec("DELETE FROM ipfact");
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `resubmit-noscan-${suffix}@example.com`;
    const ip = `10.0.0.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const subTime = new Date("2026-05-28T10:00:00Z");

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
