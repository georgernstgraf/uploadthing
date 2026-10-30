import { assertEquals, assertThrows } from "@std/assert";
import * as adminmacRepo from "./adminmac.ts";
import { db } from "./db.ts";

/**
 * Jeder Test arbeitet mit einer zufälligen MAC aus dem lokal
 * administrativen Bereich (`02:00:00:...`), damit keine echte Freigabe in
 * der Entwicklungsdatenbank überschrieben wird.
 */
function testMac(): string {
    const hex = crypto.randomUUID().replace(/-/g, "").slice(0, 6);
    return `02:00:00:${hex.slice(0, 2)}:${hex.slice(2, 4)}:${hex.slice(4, 6)}`;
}

Deno.test("adminmac repo - create und list liefern die Freigabe", () => {
    const mac = testMac();
    const createdAt = new Date("2026-10-30T08:00:00Z");

    try {
        adminmacRepo.create(mac, "repo-test", createdAt);

        assertEquals(adminmacRepo.exists(mac), true);
        const entry = adminmacRepo.get(mac);
        assertEquals(entry?.mac, mac);
        assertEquals(entry?.comment, "repo-test");
        assertEquals(entry?.created_at.toISOString(), createdAt.toISOString());

        const listed = adminmacRepo.list().filter((row) => row.mac === mac);
        assertEquals(listed.length, 1);
    } finally {
        db.exec(`DELETE FROM adminmac WHERE mac = '${mac}'`);
    }
});

Deno.test("adminmac repo - remove löscht genau eine Zeile", () => {
    const mac = testMac();

    try {
        adminmacRepo.create(mac, "remove-test", new Date());

        assertEquals(adminmacRepo.remove(mac), true);
        assertEquals(adminmacRepo.exists(mac), false);
        // Zweites Entfernen ist kein Fehler, meldet aber keine Änderung.
        assertEquals(adminmacRepo.remove(mac), false);
    } finally {
        db.exec(`DELETE FROM adminmac WHERE mac = '${mac}'`);
    }
});

Deno.test("adminmac repo - doppelte MAC wird von der Datenbank abgelehnt", () => {
    const mac = testMac();

    try {
        adminmacRepo.create(mac, "erste Freigabe", new Date());
        assertThrows(() => adminmacRepo.create(mac, "zweite Freigabe", new Date()));
    } finally {
        db.exec(`DELETE FROM adminmac WHERE mac = '${mac}'`);
    }
});
