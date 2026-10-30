import { assertEquals, assertExists } from "@std/assert";
import {
    AdminExamModeSchema,
    AdminFileTypesSchema,
    AdminQuerySchema,
    AdminRegistrationWindowSchema,
    LdapSearchSchema,
    RegisterSchema,
    UploadSchema,
} from "./schemas.ts";

Deno.test("LdapSearchSchema - accepts a name with three characters", () => {
    const result = LdapSearchSchema.safeParse({ q: "Gra" });
    assertEquals(result.success, true);
});

Deno.test("LdapSearchSchema - rejects shorter terms with a German message", () => {
    const result = LdapSearchSchema.safeParse({ q: "Gr" });
    assertEquals(result.success, false);
    if (!result.success) {
        assertEquals(
            result.error.issues[0].message,
            "Bitte mindestens 3 Zeichen eingeben.",
        );
    }
});

Deno.test("LdapSearchSchema - rejects an empty term", () => {
    const result = LdapSearchSchema.safeParse({ q: "" });
    assertEquals(result.success, false);
    if (!result.success) {
        assertExists(result.error.issues[0].message);
    }
});

Deno.test("AdminRegistrationWindowSchema - akzeptiert open und close", () => {
    for (const action of ["open", "close"]) {
        const form = new FormData();
        form.append("action", action);
        assertEquals(AdminRegistrationWindowSchema.safeParse(form).success, true);
    }
});

Deno.test("AdminRegistrationWindowSchema - lehnt andere Aktionen ab", () => {
    const form = new FormData();
    form.append("action", "reset");
    const result = AdminRegistrationWindowSchema.safeParse(form);
    assertEquals(result.success, false);
    if (!result.success) {
        assertEquals(
            result.error.issues[0].message,
            "Ungültige Aktion für das Anmeldefenster.",
        );
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

Deno.test("AdminQuerySchema - accepts valid date only", () => {
    const result = AdminQuerySchema.safeParse({ startdate: "2025-12-01" });
    assertEquals(result.success, true);
});

Deno.test("AdminQuerySchema - accepts valid date and time", () => {
    const result = AdminQuerySchema.safeParse({
        startdate: "2025-12-01",
        starttime: "08:00",
        enddate: "2025-12-01",
        endtime: "12:00",
    });
    assertEquals(result.success, true);
});

Deno.test("AdminQuerySchema - accepts empty object", () => {
    const result = AdminQuerySchema.safeParse({});
    assertEquals(result.success, true);
});

Deno.test("AdminQuerySchema - rejects invalid date format", () => {
    const result = AdminQuerySchema.safeParse({ startdate: "01-12-2025" });
    assertEquals(result.success, false);
});

Deno.test("AdminQuerySchema - rejects invalid time format", () => {
    const result = AdminQuerySchema.safeParse({ starttime: "8:00" });
    assertEquals(result.success, false);
});

Deno.test("AdminQuerySchema - rejects time without colon", () => {
    const result = AdminQuerySchema.safeParse({ starttime: "0800" });
    assertEquals(result.success, false);
});

Deno.test("AdminFileTypesSchema - accepts file types input", () => {
    const formData = new FormData();
    formData.set("permitted_filetypes", "zip, pdf");
    const result = AdminFileTypesSchema.safeParse(formData);
    assertEquals(result.success, true);
});

Deno.test("AdminFileTypesSchema - rejects empty file types input", () => {
    const formData = new FormData();
    formData.set("permitted_filetypes", "");
    const result = AdminFileTypesSchema.safeParse(formData);
    assertEquals(result.success, false);
});

Deno.test("AdminExamModeSchema - accepts enabled internet toggle", () => {
    const formData = new FormData();
    formData.set("internet_active", "on");
    const result = AdminExamModeSchema.safeParse(formData);
    assertEquals(result.success, true);
});

Deno.test("AdminExamModeSchema - accepts disabled internet toggle", () => {
    const formData = new FormData();
    const result = AdminExamModeSchema.safeParse(formData);
    assertEquals(result.success, true);
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
