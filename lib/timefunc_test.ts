import { assertEquals, assertMatch } from "@std/assert";
import {
    localAdminIpString,
    localAutoString,
    localDateString,
    localDateTimeString,
    localDayStart,
    localTimeString,
    localTimeStringSeconds,
} from "./timefunc.ts";

Deno.test("localTimeString - formats time correctly", () => {
    const date = new Date("2025-12-01T14:30:00.000Z");
    const result = localTimeString(date);
    assertMatch(result, /^\d{2}:\d{2}$/);
});

Deno.test("localTimeString - formats midnight", () => {
    const date = new Date("2025-12-01T00:00:00.000Z");
    const result = localTimeString(date);
    assertMatch(result, /^\d{2}:\d{2}$/);
});

Deno.test("localTimeString - uses current time when no date provided", () => {
    const result = localTimeString();
    assertMatch(result, /^\d{2}:\d{2}$/);
});

Deno.test("localDateTimeString - formats datetime correctly", () => {
    const date = new Date("2025-12-01T14:30:00.000Z");
    const result = localDateTimeString(date);
    assertMatch(result, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});

Deno.test("localDateTimeString - formats midnight", () => {
    const date = new Date("2025-12-01T00:00:00.000Z");
    const result = localDateTimeString(date);
    assertMatch(result, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});

Deno.test("localDateString - formats date correctly", () => {
    const date = new Date("2025-12-01T14:30:00.000Z");
    const result = localDateString(date);
    assertMatch(result, /^\d{4}-\d{2}-\d{2}$/);
});

Deno.test("localDateString - formats different dates consistently", () => {
    const date1 = new Date("2025-01-15T10:00:00.000Z");
    const date2 = new Date("2025-12-31T23:59:59.000Z");

    const result1 = localDateString(date1);
    const result2 = localDateString(date2);

    assertMatch(result1, /^\d{4}-\d{2}-\d{2}$/);
    assertMatch(result2, /^\d{4}-\d{2}-\d{2}$/);
    assertEquals(result1 !== result2, true);
});

Deno.test("localAutoString - uses time inside cutoff", () => {
    const now = new Date("2025-12-02T12:00:00.000Z").getTime();
    const date = new Date("2025-12-02T03:00:00.000Z");

    const result = localAutoString(date, 12, now);

    assertMatch(result, /^\d{2}:\d{2}$/);
});

Deno.test("localAutoString - uses full datetime outside cutoff", () => {
    const now = new Date("2025-12-02T12:00:00.000Z").getTime();
    const date = new Date("2025-12-01T23:59:00.000Z");

    const result = localAutoString(date, 12, now);

    assertMatch(result, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});

Deno.test("localAdminIpString - uses 15 hour cutoff", () => {
    const now = new Date("2025-12-02T12:00:00.000Z").getTime();
    const recentDate = new Date("2025-12-01T22:00:00.000Z");
    const olderDate = new Date("2025-12-01T20:59:00.000Z");

    const recentResult = localAdminIpString(recentDate, now);
    const olderResult = localAdminIpString(olderDate, now);

    assertMatch(recentResult, /^\d{2}:\d{2}$/);
    assertMatch(olderResult, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});

Deno.test("localDayStart - Mitternacht in Sommerzeit (CEST, UTC+2)", () => {
    // 12:00 UTC ist 14:00 in Wien; der Tag begann um 22:00 UTC am Vortag.
    assertEquals(
        localDayStart(new Date("2026-07-01T12:00:00.000Z")).toISOString(),
        "2026-06-30T22:00:00.000Z",
    );
});

Deno.test("localDayStart - Mitternacht in Winterzeit (CET, UTC+1)", () => {
    assertEquals(
        localDayStart(new Date("2026-12-01T12:00:00.000Z")).toISOString(),
        "2026-11-30T23:00:00.000Z",
    );
});

Deno.test("localDayStart - früher UTC-Morgen gehört schon zum lokalen Tag", () => {
    // 23:00 UTC am 30.06. ist 01:00 am 01.07. in Wien: derselbe Tagesbeginn.
    assertEquals(
        localDayStart(new Date("2026-06-30T23:00:00.000Z")).toISOString(),
        "2026-06-30T22:00:00.000Z",
    );
});

Deno.test("localDayStart - Mitternacht selbst bleibt Mitternacht", () => {
    const midnight = new Date("2026-03-27T23:00:00.000Z");
    assertEquals(localDayStart(midnight).toISOString(), midnight.toISOString());
});

Deno.test("localTimeStringSeconds - format HH:MM:SS in Wiener Zeit", () => {
    // 10:41:07 UTC ist im Winter 11:41:07 in Wien.
    assertEquals(
        localTimeStringSeconds(new Date("2026-12-01T10:41:07.000Z")),
        "11:41:07",
    );
    assertEquals(
        localTimeStringSeconds(new Date("2026-07-01T10:41:07.000Z")),
        "12:41:07",
    );
});
