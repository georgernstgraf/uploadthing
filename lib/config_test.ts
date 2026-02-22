import { assertEquals, assertExists } from "@std/assert";
import config, { isProduction, isDevelopment } from "./config.ts";

Deno.test("config - PERMITTED_FILETYPES is an array", () => {
    assertEquals(Array.isArray(config.PERMITTED_FILETYPES), true);
});

Deno.test("config - MAX_UPLOAD_MB has default value", () => {
    assertEquals(typeof config.MAX_UPLOAD_MB, "number");
    assertEquals(config.MAX_UPLOAD_MB > 0, true);
});

Deno.test("config - ADMIN_IPS is parsed as array", () => {
    assertEquals(Array.isArray(config.ADMIN_IPS), true);
});

Deno.test("config - TODAY_HOURS_CUTOFF has default value", () => {
    assertEquals(typeof config.TODAY_HOURS_CUTOFF, "number");
    assertEquals(config.TODAY_HOURS_CUTOFF, 12);
});

Deno.test("config - COOKIE_MAX_AGE_MS is calculated correctly", () => {
    const expected = 5 * 30 * 24 * 60 * 60 * 1000;
    assertEquals(config.COOKIE_MAX_AGE_MS, expected);
});

Deno.test("config - COOKIE_MAX_AGE_S is calculated correctly", () => {
    const expected = 5 * 30 * 24 * 60 * 60;
    assertEquals(config.COOKIE_MAX_AGE_S, expected);
});

Deno.test("config - SESSION_REFRESH_THRESHOLD_MS is calculated correctly", () => {
    const expected = 7 * 24 * 60 * 60 * 1000;
    assertEquals(config.SESSION_REFRESH_THRESHOLD_MS, expected);
});

Deno.test("config - spg_times is an array of time strings", () => {
    assertEquals(Array.isArray(config.spg_times), true);
    assertEquals(config.spg_times.length > 0, true);
    assertEquals(config.spg_times[0], "08:00");
});

Deno.test("config - DENO_ENV is set", () => {
    assertExists(config.DENO_ENV);
});

Deno.test("config - isProduction boolean is calculated", () => {
    assertEquals(typeof isProduction, "boolean");
});

Deno.test("config - isDevelopment boolean is calculated", () => {
    assertEquals(typeof isDevelopment, "boolean");
});

Deno.test("config - ABGABEN_DIR is set", () => {
    assertExists(config.ABGABEN_DIR);
    assertEquals(config.ABGABEN_DIR.includes("abgaben"), true);
});

Deno.test("config - UNTERLAGEN_DIR is set", () => {
    assertExists(config.UNTERLAGEN_DIR);
    assertEquals(config.UNTERLAGEN_DIR.includes("unterlagen"), true);
});

Deno.test("config - SERVICE_DN is set when env provided", () => {
    const hasEnv = Deno.env.get("SERVICE_DN");
    if (!hasEnv) return; // Skip if env not set
    assertExists(config.SERVICE_DN);
});

Deno.test("config - SERVICE_PW is set when env provided", () => {
    const hasEnv = Deno.env.get("SERVICE_PW");
    if (!hasEnv) return; // Skip if env not set
    assertExists(config.SERVICE_PW);
});

Deno.test("config - SERVICE_URL is set when env provided", () => {
    const hasEnv = Deno.env.get("SERVICE_URL");
    if (!hasEnv) return; // Skip if env not set
    assertExists(config.SERVICE_URL);
});

Deno.test("config - SEARCH_BASE is set when env provided", () => {
    const hasEnv = Deno.env.get("SEARCH_BASE");
    if (!hasEnv) return; // Skip if env not set
    assertExists(config.SEARCH_BASE);
});

Deno.test("config - COOKIE_SECRET is set", () => {
    assertExists(config.COOKIE_SECRET);
});
