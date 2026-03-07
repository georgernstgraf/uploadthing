import { assertEquals, assertExists } from "@std/assert";
import { db } from "../repo/db.ts";
import prisma from "../repo/prismadb.ts";
import * as cookiepresentsRepo from "../repo/cookiepresents.ts";
import * as ipfactRepo from "../repo/ipfact.ts";
import * as registrationsRepo from "../repo/registrations.ts";
import * as usersRepo from "../repo/users.ts";
import { for_range } from "./ipadmin.ts";

Deno.test("ipadmin classifies IPs by cookie presence and keeps registrations", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userEmail = `cookiepresent-${suffix}@example.com`;
    const knownIp = `203.0.113.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const unknownIp = `198.51.100.${Number.parseInt(suffix.slice(2, 4), 16) % 100 + 10}`;
    const seenAt = new Date();
    const start = new Date(seenAt.getTime() - 60_000);
    const end = new Date(seenAt.getTime() + 60_000);

    try {
        const user = await usersRepo.upsert({
            email: userEmail,
            name: "Cookie Present Test",
            klasse: "5AHITM",
        });

        ipfactRepo.registerSeen(knownIp, seenAt);
        ipfactRepo.registerSeen(unknownIp, seenAt);
        registrationsRepo.create(knownIp, user.id, seenAt);
        registrationsRepo.create(unknownIp, user.id, seenAt);
        await cookiepresentsRepo.create(knownIp, user.id, seenAt);

        const result = await for_range(start, end, false);

        const known = result.registered.find((entry) => entry.ip === knownIp);
        const unknown = result.unregistered.find((entry) => entry.ip === unknownIp);

        assertExists(known);
        assertExists(unknown);
        assertEquals(known.cookie_presents.length, 1);
        assertEquals(known.registrations.length, 1);
        assertEquals(known.cookie_presents[0].user?.email, userEmail);
        assertEquals(unknown.cookie_presents.length, 0);
        assertEquals(unknown.registrations.length, 1);
        assertEquals(unknown.registrations[0].user?.email, userEmail);
    } finally {
        db.exec(`DELETE FROM cookiepresents WHERE ip IN ('${knownIp}', '${unknownIp}')`);
        db.exec(`DELETE FROM registrations WHERE ip IN ('${knownIp}', '${unknownIp}')`);
        db.exec(`DELETE FROM ipfact WHERE ip IN ('${knownIp}', '${unknownIp}')`);
        await prisma.users.deleteMany({
            where: { email: userEmail },
        });
    }
});
