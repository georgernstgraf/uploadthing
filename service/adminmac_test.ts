import { assertEquals, assertThrows } from "@std/assert";
import config from "../lib/config.ts";
import type { UserType } from "../lib/types.ts";
import { db } from "../repo/db.ts";
import * as ipfactRepo from "../repo/ipfact.ts";
import * as adminmac from "./adminmac.ts";
import { isTeacher } from "./user.ts";

/**
 * Zufällige MAC aus dem lokal administrativen Bereich (`02:00:00:...`),
 * damit kein Test eine echte Freigabe überschreibt.
 */
function testMac(): string {
    const hex = crypto.randomUUID().replace(/-/g, "").slice(0, 6);
    return `02:00:00:${hex.slice(0, 2)}:${hex.slice(2, 4)}:${hex.slice(4, 6)}`;
}

function clearMac(mac: string): void {
    db.exec(`DELETE FROM adminmac WHERE mac = '${mac}'`);
}

Deno.test("adminmac service - add speichert kanonisch mit Kommentar", () => {
    const mac = testMac();
    const upper = mac.toUpperCase().replace(/:/g, "-");

    try {
        const entry = adminmac.add(upper, "  grg-usblan  ");
        assertEquals(entry.mac, mac);
        assertEquals(entry.comment, "grg-usblan");

        const listed = adminmac.list().filter((row) => row.mac === mac);
        assertEquals(listed.length, 1);
        assertEquals(listed[0].comment, "grg-usblan");
    } finally {
        clearMac(mac);
    }
});

Deno.test("adminmac service - add lehnt ungültige MAC-Schreibweisen ab", () => {
    const invalid = "aa:bb:cc:dd:ee";
    assertThrows(
        () => adminmac.add(invalid, "kaputt"),
        Error,
        "Ungültige MAC-Adresse",
    );
});

Deno.test("adminmac service - add verlangt einen Kommentar", () => {
    const mac = testMac();

    try {
        assertThrows(
            () => adminmac.add(mac, "   "),
            Error,
            "Bitte einen Kommentar angeben",
        );
        assertEquals(adminmac.isAllowed(mac), false);
    } finally {
        clearMac(mac);
    }
});

Deno.test("adminmac service - add lehnt doppelte Freigaben ab", () => {
    const mac = testMac();

    try {
        adminmac.add(mac, "erste Freigabe");
        assertThrows(
            () => adminmac.add(mac, "zweite Freigabe"),
            Error,
            "bereits freigegeben",
        );
    } finally {
        clearMac(mac);
    }
});

Deno.test("adminmac service - remove meldet unbekannte MACs", () => {
    const mac = testMac();

    try {
        adminmac.add(mac, "wird wieder entfernt");
        assertEquals(adminmac.remove(mac), true);
        assertEquals(adminmac.isAllowed(mac), false);
        assertEquals(adminmac.remove(mac), false);
        assertEquals(adminmac.remove("keine-mac"), false);
    } finally {
        clearMac(mac);
    }
});

Deno.test("adminmac service - isAllowed erkennt die DB-Freigabe", () => {
    const mac = testMac();

    try {
        assertEquals(adminmac.isAllowed(mac), false);
        adminmac.add(mac, "db-freigabe");
        assertEquals(adminmac.isAllowed(mac), true);
        // Schreibweisen sind für den Vergleich egal.
        assertEquals(adminmac.isAllowed(mac.toUpperCase()), true);
        assertEquals(adminmac.isAllowed(mac.replace(/:/g, "")), true);
    } finally {
        clearMac(mac);
    }
});

Deno.test("adminmac service - isAllowed ohne MAC ist immer false", () => {
    assertEquals(adminmac.isAllowed(null), false);
    assertEquals(adminmac.isAllowed(undefined), false);
    assertEquals(adminmac.isAllowed(""), false);
    assertEquals(adminmac.isAllowed("keine-mac"), false);
});

Deno.test("adminmac service - isAllowed erkennt die Env-Freigabe (ADMIN_MACS)", () => {
    const original = config.ADMIN_MACS;
    const mac = testMac();

    try {
        config.ADMIN_MACS = [mac];
        assertEquals(adminmac.envAllowedMacs(), [mac]);
        assertEquals(adminmac.isAllowed(mac), true);
        assertEquals(adminmac.isAllowed(mac.toUpperCase()), true);
        // Nur die Env-Freigabe: in der Datenbank steht nichts.
        assertEquals(adminmac.list().some((row) => row.mac === mac), false);
    } finally {
        config.ADMIN_MACS = original;
        clearMac(mac);
    }
});

Deno.test("adminmac service - resolveMacForIp liefert die jüngste Sichtung", () => {
    const ip = "10.147.0.1";
    const older = new Date("2026-10-30T07:00:00Z");
    const newer = new Date("2026-10-30T07:30:00Z");

    try {
        ipfactRepo.registerSeen(ip, older, "02:00:00:00:00:aa");
        ipfactRepo.registerSeen(ip, newer, "02:00:00:00:00:bb");

        assertEquals(adminmac.resolveMacForIp(ip), "02:00:00:00:00:bb");
    } finally {
        db.exec(`DELETE FROM ipfact WHERE ip = '${ip}'`);
    }
});

Deno.test("adminmac service - resolveMacForIp ignoriert Sichtungen ohne MAC", () => {
    const ip = "10.147.0.2";

    try {
        ipfactRepo.registerSeen(ip, new Date("2026-10-30T07:00:00Z"), "02:00:00:00:00:cc");
        ipfactRepo.registerSeen(ip, new Date("2026-10-30T07:30:00Z"), null);

        assertEquals(adminmac.resolveMacForIp(ip), "02:00:00:00:00:cc");
        assertEquals(adminmac.resolveMacForIp("10.147.0.3"), null);
    } finally {
        db.exec(`DELETE FROM ipfact WHERE ip = '${ip}'`);
    }
});

Deno.test("adminmac service - isTeacher hängt allein an der LDAP-Klasse", () => {
    const teacher: UserType = { name: "Lehrperson", email: "l@example.com", klasse: "LehrendeR" };
    const student: UserType = { name: "Schüler", email: "s@example.com", klasse: "5AHITM" };
    const withoutClass: UserType = { name: "Ohne Klasse", email: "o@example.com" };

    assertEquals(isTeacher(teacher), true);
    assertEquals(isTeacher(student), false);
    assertEquals(isTeacher(withoutClass), false);
    assertEquals(isTeacher(null), false);
});

Deno.test("adminmac service - Lehrerperson von freigegebener DB-MAC kommt ohne ADMIN_IPS durch", () => {
    const originalIps = config.ADMIN_IPS;
    const originalMacs = config.ADMIN_MACS;
    const mac = testMac();
    const teacher = { name: "Lehrperson", email: "l@example.com", klasse: "LehrendeR" };
    const student = { name: "Schüler", email: "s@example.com", klasse: "5AHITM" };

    try {
        config.ADMIN_IPS = ["192.168.21.2"];
        config.ADMIN_MACS = [];
        adminmac.add(mac, "lehrer-geraet");

        assertEquals(
            adminmac.teacherRegistrationAllowed({ user: teacher, ip: "10.0.0.5", mac }),
            true,
        );
        // Ohne freigegebene MAC bleibt die IP-Sperre bestehen.
        assertEquals(
            adminmac.teacherRegistrationAllowed({ user: teacher, ip: "10.0.0.5", mac: null }),
            false,
        );
        assertEquals(
            adminmac.teacherRegistrationAllowed({
                user: teacher,
                ip: "10.0.0.5",
                mac: "02:00:00:00:00:fe",
            }),
            false,
        );
        // IP aus ADMIN_IPS kommt weiterhin ohne MAC durch.
        assertEquals(
            adminmac.teacherRegistrationAllowed({
                user: teacher,
                ip: "192.168.21.2",
                mac: null,
            }),
            true,
        );
        // Ein Schüler wird durch dieselbe freigegebene MAC nicht Admin:
        // die Sperre gilt nur für Lehrpersonen, die Admin-Rechte nicht.
        assertEquals(
            adminmac.teacherRegistrationAllowed({ user: student, ip: "10.0.0.5", mac }),
            true,
        );
        assertEquals(isTeacher(student), false);
    } finally {
        config.ADMIN_IPS = originalIps;
        config.ADMIN_MACS = originalMacs;
        clearMac(mac);
    }
});

Deno.test("adminmac service - Lehrerperson von Env-MAC (ADMIN_MACS) kommt durch", () => {
    const originalIps = config.ADMIN_IPS;
    const originalMacs = config.ADMIN_MACS;
    const mac = testMac();
    const teacher = { name: "Lehrperson", email: "l@example.com", klasse: "LehrendeR" };

    try {
        config.ADMIN_IPS = ["192.168.21.2"];
        config.ADMIN_MACS = [mac];

        assertEquals(
            adminmac.teacherRegistrationAllowed({ user: teacher, ip: "10.0.0.5", mac }),
            true,
        );
        assertEquals(adminmac.isAllowed(mac), true);
    } finally {
        config.ADMIN_IPS = originalIps;
        config.ADMIN_MACS = originalMacs;
        clearMac(mac);
    }
});

Deno.test("adminmac service - ohne konfigurierte ADMIN_IPS bleibt die Sperre aus", () => {
    const originalIps = config.ADMIN_IPS;
    const teacher = { name: "Lehrperson", email: "l@example.com", klasse: "LehrendeR" };

    try {
        config.ADMIN_IPS = [];
        assertEquals(
            adminmac.teacherRegistrationAllowed({ user: teacher, ip: "10.0.0.5", mac: null }),
            true,
        );
    } finally {
        config.ADMIN_IPS = originalIps;
    }
});
