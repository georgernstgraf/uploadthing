import { assertEquals } from "@std/assert";
import { normalizeMac } from "./mac.ts";

Deno.test("mac - normalizeMac kanonisiert Doppelpunkte und Kleinschreibung", () => {
    assertEquals(normalizeMac("AA:BB:CC:DD:EE:FF"), "aa:bb:cc:dd:ee:ff");
    assertEquals(normalizeMac("aa:bb:cc:dd:ee:ff"), "aa:bb:cc:dd:ee:ff");
});

Deno.test("mac - normalizeMac akzeptiert Bindestriche, Punkte und Leerzeichen", () => {
    assertEquals(normalizeMac("aa-bb-cc-dd-ee-ff"), "aa:bb:cc:dd:ee:ff");
    assertEquals(normalizeMac("aabb.ccdd.eeff"), "aa:bb:cc:dd:ee:ff");
    assertEquals(normalizeMac("aa bb cc dd ee ff"), "aa:bb:cc:dd:ee:ff");
    assertEquals(normalizeMac("  aa:bb:cc:dd:ee:ff  "), "aa:bb:cc:dd:ee:ff");
});

Deno.test("mac - normalizeMac akzeptiert die kompakte Schreibweise", () => {
    assertEquals(normalizeMac("aabbccddeeff"), "aa:bb:cc:dd:ee:ff");
    assertEquals(normalizeMac("AABBCCDDEEFF"), "aa:bb:cc:dd:ee:ff");
});

Deno.test("mac - normalizeMac lehnt alles ab, was keine MAC-Adresse ist", () => {
    assertEquals(normalizeMac(""), null);
    assertEquals(normalizeMac("   "), null);
    assertEquals(normalizeMac("aa:bb:cc:dd:ee"), null);
    assertEquals(normalizeMac("aa:bb:cc:dd:ee:ff:00"), null);
    assertEquals(normalizeMac("gg:bb:cc:dd:ee:ff"), null);
    assertEquals(normalizeMac("127.0.0.1"), null);
    assertEquals(normalizeMac("aa:bb:cc:dd:ee:ff/aa"), null);
});
