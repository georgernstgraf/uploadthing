import { assertEquals, assertExists } from "@std/assert";
import {
    decodeSessionData,
    encodeSessionData,
    hmacSign,
    hmacVerify,
    parseSignedCookie,
    Session,
    signCookieValue,
} from "./session.ts";

const TEST_SECRET = "test-secret-key-for-testing";

Deno.test("hmacSign - produces consistent signature", async () => {
    const sig1 = await hmacSign("test-data", TEST_SECRET);
    const sig2 = await hmacSign("test-data", TEST_SECRET);
    assertEquals(sig1, sig2);
});

Deno.test("hmacSign - produces different signatures for different data", async () => {
    const sig1 = await hmacSign("data1", TEST_SECRET);
    const sig2 = await hmacSign("data2", TEST_SECRET);
    assertEquals(sig1 !== sig2, true);
});

Deno.test("hmacSign - produces different signatures for different secrets", async () => {
    const sig1 = await hmacSign("test-data", "secret1");
    const sig2 = await hmacSign("test-data", "secret2");
    assertEquals(sig1 !== sig2, true);
});

Deno.test("hmacVerify - returns true for valid signature", async () => {
    const data = "test-data";
    const signature = await hmacSign(data, TEST_SECRET);
    const result = await hmacVerify(data, signature, TEST_SECRET);
    assertEquals(result, true);
});

Deno.test("hmacVerify - returns false for invalid signature", async () => {
    const data = "test-data";
    const result = await hmacVerify(data, "invalid-signature", TEST_SECRET);
    assertEquals(result, false);
});

Deno.test("hmacVerify - returns false for tampered data", async () => {
    const data = "original-data";
    const signature = await hmacSign(data, TEST_SECRET);
    const result = await hmacVerify("tampered-data", signature, TEST_SECRET);
    assertEquals(result, false);
});

Deno.test("encodeSessionData - encodes to base64", () => {
    const data = { email: "test@example.com", createdAt: 1234567890 };
    const result = encodeSessionData(data);
    assertEquals(typeof result, "string");
    assertEquals(result.length > 0, true);
});

Deno.test("decodeSessionData - decodes correctly", () => {
    const data = { email: "test@example.com", createdAt: 1234567890 };
    const encoded = encodeSessionData(data);
    const result = decodeSessionData(encoded);
    assertEquals(result?.email, "test@example.com");
    assertEquals(result?.createdAt, 1234567890);
});

Deno.test("decodeSessionData - returns null for invalid input", () => {
    const result = decodeSessionData("not-valid-base64!!!");
    assertEquals(result, null);
});

Deno.test("decodeSessionData - returns null for invalid JSON", () => {
    const invalidJson = btoa("not-json");
    const result = decodeSessionData(invalidJson);
    assertEquals(result, null);
});

Deno.test("signCookieValue - creates signed cookie value", async () => {
    const data = { email: "test@example.com", createdAt: 1234567890 };
    const result = await signCookieValue(data, TEST_SECRET);
    assertEquals(result.includes("."), true);
    const parts = result.split(".");
    assertEquals(parts.length, 2);
});

Deno.test("parseSignedCookie - parses valid cookie", async () => {
    const data = { email: "test@example.com", createdAt: 1234567890 };
    const cookie = await signCookieValue(data, TEST_SECRET);
    const result = parseSignedCookie(cookie);

    assertExists(result);
    assertEquals(result?.data.email, "test@example.com");
    assertEquals(result?.data.createdAt, 1234567890);
});

Deno.test("parseSignedCookie - returns null for invalid format", () => {
    const result = parseSignedCookie("no-dot-here");
    assertEquals(result, null);
});

Deno.test("parseSignedCookie - returns null for too many parts", () => {
    const result = parseSignedCookie("part1.part2.part3");
    assertEquals(result, null);
});

Deno.test("parseSignedCookie - returns null for invalid base64", () => {
    const result = parseSignedCookie("!!!invalid.part2");
    assertEquals(result, null);
});

Deno.test("Session class - creates with null data", () => {
    const session = new Session(null, false);
    assertEquals(session.email, undefined);
    assertEquals(session.isLoggedIn(), false);
});

Deno.test("Session class - creates with data", () => {
    const data = { email: "test@example.com", createdAt: Date.now() };
    const session = new Session(data, false);
    assertEquals(session.email, "test@example.com");
    assertEquals(session.createdAt, data.createdAt);
});

Deno.test("Session class - login sets data and marks new", () => {
    const session = new Session(null, false);
    session.login("new@example.com");

    assertEquals(session.email, "new@example.com");
    assertEquals(session.isNewSession(), true);
    assertEquals(session.isModified(), true);
    assertEquals(session.isLoggedIn(), true);
});

Deno.test("Session class - logout marks for deletion", () => {
    const data = { email: "test@example.com", createdAt: Date.now() };
    const session = new Session(data, false);
    session.logout();

    assertEquals(session.isLoggedIn(), false);
    assertEquals(session.needsDelete(), true);
    assertEquals(session.getData(), null);
});

Deno.test("Session class - refreshTimestamp updates time", () => {
    const originalTime = Date.now() - 10000;
    const data = { email: "test@example.com", createdAt: originalTime };
    const session = new Session(data, false);

    session.refreshTimestamp();

    assertEquals(session.createdAt !== originalTime, true);
    assertEquals(session.isModified(), true);
});

Deno.test("Session class - setData updates and marks modified", () => {
    const data = { email: "test@example.com", createdAt: Date.now() };
    const session = new Session(data, false);

    const newData = { email: "other@example.com", createdAt: Date.now() };
    session.setData(newData);

    assertEquals(session.email, "other@example.com");
    assertEquals(session.isModified(), true);
});

Deno.test("Session class - isNewSession returns correct value", () => {
    const data = { email: "test@example.com", createdAt: Date.now() };
    const newSession = new Session(data, true);
    const existingSession = new Session(data, false);

    assertEquals(newSession.isNewSession(), true);
    assertEquals(existingSession.isNewSession(), false);
});

Deno.test("Session class - getData returns same object reference", () => {
    const data = { email: "test@example.com", createdAt: Date.now() };
    const session = new Session(data, false);

    const retrieved = session.getData();
    assertEquals(retrieved?.email, "test@example.com");

    if (retrieved) {
        retrieved.email = "modified@example.com";
    }
    assertEquals(session.email, "modified@example.com");
});
