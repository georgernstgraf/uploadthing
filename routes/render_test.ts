import { assertEquals } from "@std/assert";
import { buildExamHazards, formatDropoutNotice } from "./render.ts";

/**
 * Die Gefahrenliste bestimmt den roten Balken im Examen-Panel (#161).
 * Sie wird hier geprüft, weil `routes/admin.ts` und `routes/api.ts` sich
 * auf dieselbe Berechnung verlassen.
 */

const base = {
    exam_running: true,
    firewall_state: "gesperrt",
    registration_open: false,
    registration_since: "",
};

Deno.test("buildExamHazards: ohne laufendes Examen gibt es keine Gefahr", () => {
    assertEquals(
        buildExamHazards({
            ...base,
            exam_running: false,
            firewall_state: "frei",
            registration_open: true,
            registration_since: "08:05",
        }),
        [],
    );
});

Deno.test("buildExamHazards: gesperrtes Internet und gesperrte Anmeldung ergeben keinen Balken", () => {
    assertEquals(buildExamHazards(base), []);
});

Deno.test("buildExamHazards: Internet frei ist eine Gefahr, unabhängig vom Schalter", () => {
    const hazards = buildExamHazards({ ...base, firewall_state: "frei" });
    assertEquals(hazards.length, 1);
    assertEquals(hazards[0].key, "internet");
    assertEquals(hazards[0].title, "Internet frei");
});

Deno.test("buildExamHazards: freigegebene Anmeldung nennt den Zeitpunkt", () => {
    const hazards = buildExamHazards({
        ...base,
        registration_open: true,
        registration_since: "08:05",
    });
    assertEquals(hazards.length, 1);
    assertEquals(hazards[0].key, "registration");
    assertEquals(
        hazards[0].detail.includes("Seit 08:05"),
        true,
        "Der Balken soll sagen, seit wann die Anmeldung offen ist",
    );
});

Deno.test("buildExamHazards: beide Ursachen stehen nebeneinander", () => {
    const hazards = buildExamHazards({
        ...base,
        firewall_state: "frei",
        registration_open: true,
        registration_since: "",
    });
    assertEquals(hazards.map((hazard) => hazard.key), [
        "internet",
        "registration",
    ]);
    assertEquals(
        hazards[1].detail.includes("Seit"),
        false,
        "Ohne Zeitpunkt darf kein leerer „Seit“-Satz entstehen",
    );
});

/**
 * Das Warnband der Abgabe nennt die WLAN-Minuten und bleibt trotzdem
 * beim „du kannst abgeben" (#166).
 */

Deno.test("formatDropoutNotice: ohne Dropout und ohne IP-Wechsel bleibt es leer", () => {
    assertEquals(
        formatDropoutNotice({
            dropouts: 0,
            missed_minutes: 0,
            ip_change: false,
        }),
        undefined,
    );
});

Deno.test("formatDropoutNotice: Minuten und Dropouts im Plural", () => {
    const notice = formatDropoutNotice({
        dropouts: 2,
        missed_minutes: 4,
        ip_change: false,
    });
    assertEquals(notice?.includes("4 Minuten"), true);
    assertEquals(notice?.includes("2 Dropouts"), true);
    assertEquals(
        notice?.includes("Du kannst trotzdem abgeben"),
        true,
        "Das Band darf keine Sperre andeuten",
    );
});

Deno.test("formatDropoutNotice: Einzahl wird korrekt gebeugt", () => {
    const notice = formatDropoutNotice({
        dropouts: 1,
        missed_minutes: 1,
        ip_change: false,
    });
    assertEquals(notice?.includes("1 Minute "), true);
    assertEquals(notice?.includes("1 Dropout)"), true);
});

Deno.test("formatDropoutNotice: IP-Wechsel allein nennt keinen Dropout", () => {
    const notice = formatDropoutNotice({
        dropouts: 0,
        missed_minutes: 0,
        ip_change: true,
    });
    assertEquals(notice?.includes("IP-Adresse"), true);
    assertEquals(notice?.includes("nicht im WLAN"), false);
    assertEquals(notice?.includes("Du kannst trotzdem abgeben"), true);
});

Deno.test("formatDropoutNotice: beide Ursachen stehen nebeneinander", () => {
    const notice = formatDropoutNotice({
        dropouts: 3,
        missed_minutes: 5,
        ip_change: true,
    });
    assertEquals(notice?.includes("5 Minuten"), true);
    assertEquals(notice?.includes("3 Dropouts"), true);
    assertEquals(notice?.includes("IP-Adresse"), true);
});
