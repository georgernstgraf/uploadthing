import Handlebars from "handlebars";
import { assertEquals } from "@std/assert";

Handlebars.registerHelper("eq", function <T>(a: T, b: T) {
    return a === b;
});

Handlebars.registerHelper("or", function (a, b) {
    return Boolean(a || b);
});

Handlebars.registerHelper("givenNameInitial", function (name: string) {
    if (!name || typeof name !== "string") return "?";
    const firstSpace = name.indexOf(" ");
    if (firstSpace === -1 || firstSpace >= name.length - 1) {
        return name.charAt(0).toUpperCase();
    }
    return name.charAt(firstSpace + 1).toUpperCase();
});

Handlebars.registerHelper(
    "submissionTooltip",
    function (submissions: { at: string; filename: string }[] = []) {
        if (!Array.isArray(submissions) || submissions.length === 0) {
            return "Keine Abgabe";
        }
        return submissions.map((submission) => {
            return `${submission.at} - ${submission.filename}`;
        }).join("\n");
    },
);

Deno.test("eq helper - returns true for equal values", () => {
    const result = Handlebars.helpers.eq("test", "test");
    assertEquals(result, true);
});

Deno.test("eq helper - returns false for different values", () => {
    const result = Handlebars.helpers.eq("test", "other");
    assertEquals(result, false);
});

Deno.test("eq helper - works with numbers", () => {
    const result = Handlebars.helpers.eq(42, 42);
    assertEquals(result, true);
});

Deno.test("eq helper - works with booleans", () => {
    const result = Handlebars.helpers.eq(true, true);
    assertEquals(result, true);
});

Deno.test("or helper - returns true when first value is truthy", () => {
    const result = Handlebars.helpers.or(true, false);
    assertEquals(result, true);
});

Deno.test("or helper - returns true when second value is truthy", () => {
    const result = Handlebars.helpers.or(0, 2);
    assertEquals(result, true);
});

Deno.test("or helper - returns false when both values are falsy", () => {
    const result = Handlebars.helpers.or(0, "");
    assertEquals(result, false);
});

Deno.test("givenNameInitial - returns first char for single name", () => {
    const result = Handlebars.helpers.givenNameInitial("Max");
    assertEquals(result, "M");
});

Deno.test("givenNameInitial - returns initial after first space", () => {
    const result = Handlebars.helpers.givenNameInitial("Max Mustermann");
    assertEquals(result, "M");
});

Deno.test("givenNameInitial - returns first char when last name missing", () => {
    const result = Handlebars.helpers.givenNameInitial("Max ");
    assertEquals(result, "M");
});

Deno.test("givenNameInitial - returns uppercase", () => {
    const result = Handlebars.helpers.givenNameInitial("max mustermann");
    assertEquals(result, "M");
});

Deno.test("givenNameInitial - handles empty string", () => {
    const result = Handlebars.helpers.givenNameInitial("");
    assertEquals(result, "?");
});

Deno.test("givenNameInitial - handles undefined", () => {
    const result = Handlebars.helpers.givenNameInitial(undefined);
    assertEquals(result, "?");
});

Deno.test("givenNameInitial - handles null", () => {
    const result = Handlebars.helpers.givenNameInitial(null);
    assertEquals(result, "?");
});

Deno.test("givenNameInitial - handles non-string", () => {
    const result = Handlebars.helpers.givenNameInitial(123);
    assertEquals(result, "?");
});

Deno.test("givenNameInitial - handles three part name", () => {
    const result = Handlebars.helpers.givenNameInitial("Max Gustav Mustermann");
    assertEquals(result, "G");
});

Deno.test("givenNameInitial - handles title prefix", () => {
    const result = Handlebars.helpers.givenNameInitial("Dr. Hans Müller");
    assertEquals(result, "H");
});

Deno.test("submissionTooltip - joins submission details", () => {
    const result = Handlebars.helpers.submissionTooltip([
        { at: "2025-12-01 10:00", filename: "essay.pdf" },
        { at: "2025-12-01 10:05", filename: "essay-v2.pdf" },
    ]);

    assertEquals(
        result,
        "2025-12-01 10:00 - essay.pdf\n2025-12-01 10:05 - essay-v2.pdf",
    );
});

Deno.test("submissionTooltip - handles empty submissions", () => {
    const result = Handlebars.helpers.submissionTooltip([]);

    assertEquals(result, "Keine Abgabe");
});
