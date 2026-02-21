import { assertEquals, assertExists } from "@std/assert";
import {
    ActiveIpsSchema,
    ForensicQuerySchema,
    LdapSearchSchema,
    RegisterSchema,
    UploadSchema,
} from "./schemas.ts";

Deno.test("LdapSearchSchema - accepts valid email", () => {
    const result = LdapSearchSchema.safeParse({ email: "test@example.com" });
    assertEquals(result.success, true);
});

Deno.test("LdapSearchSchema - accepts short search term", () => {
    const result = LdapSearchSchema.safeParse({ email: "abc" });
    assertEquals(result.success, true);
});

Deno.test("LdapSearchSchema - rejects empty email", () => {
    const result = LdapSearchSchema.safeParse({ email: "" });
    assertEquals(result.success, false);
    if (!result.success) {
        assertExists(result.error.issues[0].message);
    }
});

Deno.test("RegisterSchema - accepts valid email", () => {
    const result = RegisterSchema.safeParse({ email: "user@spengergasse.at" });
    assertEquals(result.success, true);
});

Deno.test("RegisterSchema - rejects invalid email", () => {
    const result = RegisterSchema.safeParse({ email: "notanemail" });
    assertEquals(result.success, false);
});

Deno.test("RegisterSchema - rejects email without domain", () => {
    const result = RegisterSchema.safeParse({ email: "user" });
    assertEquals(result.success, false);
});

Deno.test("ActiveIpsSchema - accepts valid IPv4", () => {
    const result = ActiveIpsSchema.safeParse({ ips: ["192.168.1.1"] });
    assertEquals(result.success, true);
});

Deno.test("ActiveIpsSchema - accepts valid IPv6", () => {
    const result = ActiveIpsSchema.safeParse({ ips: ["::1", "2001:db8::1"] });
    assertEquals(result.success, true);
});

Deno.test("ActiveIpsSchema - accepts multiple IPs", () => {
    const result = ActiveIpsSchema.safeParse({
        ips: ["10.0.0.1", "10.0.0.2", "10.0.0.3"],
    });
    assertEquals(result.success, true);
});

Deno.test("ActiveIpsSchema - rejects invalid IP", () => {
    const result = ActiveIpsSchema.safeParse({ ips: ["not.an.ip"] });
    assertEquals(result.success, false);
});

Deno.test("ActiveIpsSchema - rejects empty array", () => {
    const result = ActiveIpsSchema.safeParse({ ips: [] });
    assertEquals(result.success, false);
});

Deno.test("ForensicQuerySchema - accepts valid date only", () => {
    const result = ForensicQuerySchema.safeParse({ startdate: "2025-12-01" });
    assertEquals(result.success, true);
});

Deno.test("ForensicQuerySchema - accepts valid date and time", () => {
    const result = ForensicQuerySchema.safeParse({
        startdate: "2025-12-01",
        starttime: "08:00",
        enddate: "2025-12-01",
        endtime: "12:00",
    });
    assertEquals(result.success, true);
});

Deno.test("ForensicQuerySchema - accepts empty object", () => {
    const result = ForensicQuerySchema.safeParse({});
    assertEquals(result.success, true);
});

Deno.test("ForensicQuerySchema - rejects invalid date format", () => {
    const result = ForensicQuerySchema.safeParse({ startdate: "01-12-2025" });
    assertEquals(result.success, false);
});

Deno.test("ForensicQuerySchema - rejects invalid time format", () => {
    const result = ForensicQuerySchema.safeParse({ starttime: "8:00" });
    assertEquals(result.success, false);
});

Deno.test("ForensicQuerySchema - rejects time without colon", () => {
    const result = ForensicQuerySchema.safeParse({ starttime: "0800" });
    assertEquals(result.success, false);
});

Deno.test("UploadSchema - accepts FormData with file", () => {
    const formData = new FormData();
    const file = new File(["test content"], "test.zip", { type: "application/zip" });
    formData.append("file", file);

    const result = UploadSchema.safeParse(formData);
    assertEquals(result.success, true);
});

Deno.test("UploadSchema - rejects FormData without file", () => {
    const formData = new FormData();

    const result = UploadSchema.safeParse(formData);
    assertEquals(result.success, false);
});
