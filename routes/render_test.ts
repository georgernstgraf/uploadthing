import { assertEquals } from "@std/assert";
import { buildExamHazards } from "./render.ts";

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
