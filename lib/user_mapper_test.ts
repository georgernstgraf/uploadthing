import { assertEquals, assertExists } from "@std/assert";
import { userRecordToUserType, userTypeToDbInput } from "./user_mapper.ts";
import type { UserType } from "./types.ts";

Deno.test("userRecordToUserType - maps complete record", () => {
    const repoRecord = {
        id: 42,
        email: "test@spengergasse.at",
        name: "Max Mustermann",
        klasse: "5AHIF",
        updatedat: new Date(),
    };

    const result = userRecordToUserType(repoRecord);

    assertEquals(result.id, 42);
    assertEquals(result.email, "test@spengergasse.at");
    assertEquals(result.name, "Max Mustermann");
    assertEquals(result.klasse, "5AHIF");
});

Deno.test("userRecordToUserType - handles null klasse", () => {
    const repoRecord = {
        id: 1,
        email: "lehrer@spengergasse.at",
        name: "Herr Lehrer",
        klasse: null,
        updatedat: new Date(),
    };

    const result = userRecordToUserType(repoRecord);

    assertEquals(result.klasse, undefined);
});

Deno.test("userTypeToDbInput - maps complete user type", () => {
    const userType: UserType = {
        id: 1,
        email: "user@spengergasse.at",
        name: "Jane Doe",
        klasse: "4BHIF",
    };

    const result = userTypeToDbInput(userType);

    assertEquals(result.email, "user@spengergasse.at");
    assertEquals(result.name, "Jane Doe");
    assertEquals(result.klasse, "4BHIF");
    assertExists(result.updatedat);
});

Deno.test("userTypeToDbInput - handles undefined klasse", () => {
    const userType: UserType = {
        id: 1,
        email: "user@spengergasse.at",
        name: "Jane Doe",
    };

    const result = userTypeToDbInput(userType);

    assertEquals(result.klasse, null);
});

Deno.test("userTypeToDbInput - sets current timestamp", () => {
    const userType: UserType = {
        id: 1,
        email: "user@spengergasse.at",
        name: "Test User",
    };

    const before = new Date();
    const result = userTypeToDbInput(userType);
    const after = new Date();

    assertEquals(result.updatedat.getTime() >= before.getTime(), true);
    assertEquals(result.updatedat.getTime() <= after.getTime(), true);
});

Deno.test("userRecordToUserType - returns new object (not mutating input)", () => {
    const repoRecord = {
        id: 1,
        email: "test@spengergasse.at",
        name: "Test",
        klasse: "5AHIF",
        updatedat: new Date(),
    };

    const result = userRecordToUserType(repoRecord);

    result.name = "Modified";
    assertEquals(repoRecord.name, "Test");
});

Deno.test("userTypeToDbInput - returns new object (not mutating input)", () => {
    const userType: UserType = {
        id: 1,
        email: "test@spengergasse.at",
        name: "Test",
        klasse: "5AHIF",
    };

    const result = userTypeToDbInput(userType);

    result.name = "Modified";
    assertEquals(userType.name, "Test");
});
