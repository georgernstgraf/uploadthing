import { assertEquals } from "@std/assert";
import { ipSlug } from "./slug.ts";

Deno.test("ipSlug ersetzt Punkte durch Bindestriche", () => {
    assertEquals(ipSlug("192.168.21.5"), "192-168-21-5");
    assertEquals(ipSlug("127.0.0.1"), "127-0-0-1");
    assertEquals(ipSlug("10.98.200.7"), "10-98-200-7");
});

Deno.test("ipSlug lässt eine Adresse ohne Punkte unverändert", () => {
    assertEquals(ipSlug("localhost"), "localhost");
    assertEquals(ipSlug(""), "");
});
