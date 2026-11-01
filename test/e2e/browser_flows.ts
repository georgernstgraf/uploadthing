/**
 * Playwright-Smoke-Suite für die examkritischen Browser-Flows (#135).
 *
 * Die Suite deckt die examkritischen Browser-Flows ab, ausschließlich
 * nutzersichtbares Verhalten — keine htmx-Event-Interna. Seit #161
 * gehört der Push-Weg dazu: Das Abgabe-Panel zieht sich über
 * Server-Sent Events selbst nach, ohne Hover und ohne Reload. Damit ist
 * die Suite auch die Abnahme für die htmx-4-Migration (#150).
 * Selektoren: nur stabile `id`s aus den Templates, keine Text- oder
 * CSS-Selektoren.
 *
 * Start über `deno task e2e` (scripts/e2e.sh): dort laufen Fixture-Seed
 * und Testserver. Direkt aufrufbar ist die Datei nicht, sie braucht die
 * Umgebung dieses Skripts.
 */

// Die `page.evaluate`-Callbacks laufen im Browser und brauchen DOM-Typen;
// deno.json setzt keine `lib`-Option für den Server-Code.
/// <reference lib="dom" />

import { assert, assertEquals } from "@std/assert";
import { chromium } from "playwright-core";
import type { Browser, Locator, Page } from "playwright-core";
import { Buffer } from "node:buffer";
import {
    ADMIN_MAC,
    baseUrl,
    cookieName,
    sessionCookieValue,
    STUDENT,
    STUDENT_ALT,
    STUDENT_NEU,
    TEACHER,
    UNTERLAGEN_FILE,
} from "./fixtures.ts";

const BASE_URL = baseUrl();

/** Dateiname für den Erfolgs-Upload (Inhalt wird als ZIP erkannt). */
const UPLOAD_FILENAME = "abgabe-e2e.zip";

/** Minimale ZIP-Signatur (`PK\x03\x04…`) — wie in `test/endpoints_test.ts`. */
const ZIP_BYTES = Uint8Array.from([
    0x50,
    0x4b,
    0x03,
    0x04,
    0x14,
    0x00,
    0x00,
    0x00,
    0x08,
    0x00,
    0xb7,
    0xac,
    0xce,
    0x34,
    0x00,
    0x00,
    0x00,
    0x00,
]);

/** Chromium aus dem System — es wird nichts heruntergeladen. */
function chromeExecutable(): string {
    const configured = Deno.env.get("E2E_CHROME_PATH");
    const candidates = configured
        ? [configured]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
        ];

    for (const candidate of candidates) {
        try {
            Deno.statSync(candidate);
            return candidate;
        } catch {
            // nächster Kandidat
        }
    }

    throw new Error(
        "Kein Chromium gefunden (erwartet z. B. /usr/bin/google-chrome). E2E_CHROME_PATH setzen.",
    );
}

/**
 * Führt einen Test in einem eigenen Browser aus. Ein Browser pro Test
 * kostet ~0,5 s, macht aber Zustand zwischen Tests unmöglich.
 */
async function withBrowser(fn: (browser: Browser) => Promise<void>): Promise<void> {
    const browser = await chromium.launch({
        executablePath: chromeExecutable(),
        headless: Deno.env.get("E2E_HEADED") !== "1",
        args: ["--no-sandbox"],
    });
    try {
        await fn(browser);
    } finally {
        await browser.close();
    }
}

/**
 * Wartet, bis ein Element deaktiviert ist. HTMX setzt `disabled` erst
 * kurz nach dem Absenden — für Nutzer ist das der sichtbare Zustand
 * "Button nicht mehr klickbar", kein HTMX-Internum.
 */
async function waitForDisabled(locator: Locator): Promise<boolean> {
    for (let attempt = 0; attempt < 40; attempt++) {
        if (await locator.isDisabled()) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
}

/** Öffnet eine Seite mit der Sitzung des Fixture-Benutzers. */
async function openPage(browser: Browser, email: string) {
    const context = await browser.newContext({ baseURL: BASE_URL });
    // Kein Login über LDAP: die Sitzung wird direkt gesetzt (seed.ts).
    await context.addCookies([{
        name: cookieName(),
        value: await sessionCookieValue(email),
        url: BASE_URL,
    }]);
    const page = await context.newPage();
    return { context, page };
}

/**
 * Admin-Aktion ohne Browser. Nur für das Setzen des Exam-Zustands vor
 * einem Test — die getesteten Flows selbst laufen im Browser.
 */
async function adminPost(
    path: string,
    fields: Record<string, string> = {},
): Promise<number> {
    const response = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
            "content-type": "application/x-www-form-urlencoded",
            cookie: `${cookieName()}=${await sessionCookieValue(TEACHER.email)}`,
        },
        body: new URLSearchParams(fields).toString(),
    });
    await response.text();
    return response.status;
}

async function stopExam(): Promise<void> {
    const status = await adminPost("/api/exam/stop");
    assert(
        status === 200 || status === 409,
        `Examen stoppen lieferte unerwartet HTTP ${status}`,
    );
}

async function startExam(minutes = 30): Promise<void> {
    await stopExam();
    const status = await adminPost("/api/exam/start", {
        minutes: String(minutes),
    });
    assertEquals(status, 200, "Examen muss für den Flow startbar sein");
}

Deno.test({
    name: "E2E: Countdown tickt nach dem Exam-Start",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        await startExam();
        await withBrowser(async (browser) => {
            const { context, page } = await openPage(browser, STUDENT.email);
            try {
                await page.goto("/");
                await page.waitForSelector("#exam-countdown-badge");

                const first = (await page.textContent("#exam-countdown-badge")) ?? "";
                assert(
                    /Restzeit:\s*\d{2}:\d{2}/.test(first),
                    `Countdown-Anzeige erwartet, war: "${first}"`,
                );

                await page.waitForTimeout(1200);
                const second = (await page.textContent("#exam-countdown-badge")) ?? "";
                assert(
                    second !== first,
                    `Countdown muss ticken, blieb aber bei "${first}"`,
                );
            } finally {
                await context.close();
            }
        });
    },
});

Deno.test({
    name: "E2E: Exam-Start ersetzt den Hinweis ohne Hover durch das Formular (#161)",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        await stopExam();
        await withBrowser(async (browser) => {
            const { context, page } = await openPage(browser, STUDENT.email);
            try {
                await page.goto("/");
                await page.waitForSelector("#abgabe-closed");
                assertEquals(
                    await page.locator("#abgabe-form").count(),
                    0,
                    "Ohne Examen darf kein Abgabe-Formular stehen",
                );
                const hint = (await page.textContent("#abgabe-closed")) ?? "";
                assert(
                    hint.includes("Diese Seite aktualisiert sich von selbst"),
                    `Ehrlicher Hinweis erwartet, war: "${hint}"`,
                );

                // Das Examen startet, während die Seite schon offen ist —
                // ohne Hover und ohne Klick. Der Push (SSE) zieht nach.
                await startExam();
                await page.waitForSelector("#abgabe-form");

                const first = (await page.textContent("#exam-countdown-badge")) ?? "";
                assert(
                    /Restzeit:\s*\d{1,2}:\d{2}/.test(first),
                    `Countdown nach dem Panel-Swap erwartet, war: "${first}"`,
                );
                await page.waitForTimeout(1200);
                const second = (await page.textContent("#exam-countdown-badge")) ?? "";
                assert(
                    second !== first,
                    `Countdown muss nach dem Panel-Swap ticken, blieb bei "${first}"`,
                );
            } finally {
                await stopExam();
                await context.close();
            }
        });
    },
});

Deno.test({
    name: "E2E: Exam-Ende ohne Interaktion ersetzt das Formular durch den Hinweis (#161)",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        await startExam();
        await withBrowser(async (browser) => {
            const { context, page } = await openPage(browser, STUDENT.email);
            try {
                await page.goto("/");
                await page.waitForSelector("#abgabe-form");

                // Das Examen endet, während das Formular offen ist. Es
                // gibt weder Klick noch Hover noch Reload.
                await stopExam();
                await page.waitForSelector("#abgabe-closed", { timeout: 10_000 });
                assertEquals(
                    await page.locator("#abgabe-form").count(),
                    0,
                    "Nach dem Exam-Ende darf das Formular nicht stehen bleiben",
                );
                const hint = (await page.textContent("#abgabe-closed")) ?? "";
                assert(
                    hint.includes("Uploads sind nur während des Examens möglich."),
                    `Hinweis erwartet, war: "${hint}"`,
                );

                // Der Wechsel wird erklärt, nicht still vollzogen.
                await page.waitForSelector("#toast-dialog");
                const message = (await page.textContent("#toast-dialog-message")) ?? "";
                assert(
                    message.includes("Das Examen ist beendet"),
                    `Hinweis-Toast erwartet, war: "${message}"`,
                );
                await page.click("#toast-dialog-close");
            } finally {
                await stopExam();
                await context.close();
            }
        });
    },
});

Deno.test({
    name: "E2E: Ohne Push bleibt der Server die Wahrheit (403 ersetzt das Formular)",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        await startExam();
        await withBrowser(async (browser) => {
            const { context, page } = await openPage(browser, STUDENT.email);
            try {
                await page.goto("/");
                await page.waitForSelector("#abgabe-form");

                // Verbindung kappen: ab jetzt kommt kein Push mehr an.
                // Die 403-Antwort des Servers ist die letzte Verteidigung.
                await page.evaluate(() => {
                    const target = window as unknown as {
                        __uploadthingExamEvents?: { close: () => void };
                    };
                    target.__uploadthingExamEvents?.close();
                });

                await stopExam();

                await page.setInputFiles("#abgabe-file-input", {
                    name: UPLOAD_FILENAME,
                    mimeType: "application/zip",
                    buffer: Buffer.from(ZIP_BYTES),
                });
                await page.click("#abgabe-submit");

                await page.waitForSelector("#toast-dialog");
                const message = (await page.textContent("#toast-dialog-message")) ?? "";
                assert(
                    message.includes("Uploads sind nur während des Examens möglich."),
                    `Sperrmeldung im Toast erwartet, war: "${message}"`,
                );

                // Die 403-Antwort holt das Panel neu: der Hinweis steht
                // dort, wo eben noch das Formular war.
                await page.waitForSelector("#abgabe-closed");
                assertEquals(
                    await page.locator("#abgabe-form").count(),
                    0,
                    "Nach dem Exam-Ende darf das Formular nicht stehen bleiben",
                );
            } finally {
                await stopExam();
                await context.close();
            }
        });
    },
});

Deno.test({
    name: "E2E: Upload während des Examens läuft durch (Panel + Toast)",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        await startExam();
        await withBrowser(async (browser) => {
            const { context, page } = await openPage(browser, STUDENT.email);
            try {
                await page.goto("/");
                await page.waitForSelector("#abgabe-form");

                // Sackgassen-Probe: /whoami ist ohne Navigation erreichbar.
                // Der Hero im Kopf muss zurück auf die Startseite führen,
                // sonst kommt ein Schüler im Examen nicht mehr zum
                // Abgabe-Panel.
                await page.click("#user-badge-panel a");
                await page.waitForSelector("#login-form");
                assertEquals(page.url(), `${BASE_URL}/whoami`);

                await page.click("#hero-link");
                await page.waitForSelector("#abgabe-form");
                assertEquals(page.url(), `${BASE_URL}/`);

                await page.setInputFiles("#abgabe-file-input", {
                    name: UPLOAD_FILENAME,
                    mimeType: "application/zip",
                    buffer: Buffer.from(ZIP_BYTES),
                });

                // `hx-post` hängt am <form>, deaktiviert wird der
                // Submit-Button — der Doppelklick-Schutz der Abgabe (#151).
                await page.route("**/upload", async (route) => {
                    await new Promise((resolve) => setTimeout(resolve, 800));
                    await route.continue();
                });

                await page.click("#abgabe-submit");
                assert(
                    await waitForDisabled(page.locator("#abgabe-submit")),
                    "Während des Uploads muss der Abgabe-Button deaktiviert sein",
                );

                await page.waitForSelector("#toast-dialog");
                const message = (await page.textContent("#toast-dialog-message")) ?? "";
                assert(
                    message.includes("Abgabe hochgeladen"),
                    `Erfolgsmeldung erwartet, war: "${message}"`,
                );
                assertEquals(
                    await page.getAttribute("#toast-dialog", "data-toast-type"),
                    "success",
                );

                // Keine Erfolgsseite: das Formular bleibt stehen.
                assertEquals(
                    await page.locator("#abgabe-form").isVisible(),
                    true,
                    "Nach dem Upload muss das Formular stehen bleiben",
                );
                assertEquals(
                    await page.locator("#abgabe-success").count(),
                    0,
                    "Der HTMX-Upload darf keine Erfolgsseite rendern",
                );
                assertEquals(page.url(), `${BASE_URL}/`);

                await page.click("#toast-dialog-close");
                await page.unroute("**/upload");
            } finally {
                await context.close();
            }
        });
    },
});

Deno.test({
    name: "E2E: Unterlagen sind außerhalb des Examens gesperrt (403)",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        await stopExam();
        await withBrowser(async (browser) => {
            const { context, page } = await openPage(browser, STUDENT.email);
            try {
                const response = await page.goto(`/unterlagen/${UNTERLAGEN_FILE}`);
                assertEquals(response?.status(), 403);

                const text = await page.evaluate(() => document.body.innerText);
                assert(
                    text.includes("Unterlagen sind nur während des Examens verfügbar."),
                    `Meldung erwartet, war: "${text}"`,
                );
            } finally {
                await context.close();
            }
        });
    },
});

Deno.test({
    name: "E2E: Unterlagen-Upload zieht die Angaben-Karte beim Schüler nach (#164)",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        await stopExam();
        const filename = `angaben-e2e-${crypto.randomUUID().slice(0, 8)}.md`;

        await withBrowser(async (browser) => {
            const teacher = await openPage(browser, TEACHER.email);
            const student = await openPage(browser, STUDENT.email);
            try {
                // Schüler-Seite offen: die Angaben-Karte zeigt den
                // gerenderten Stand, die neue Datei fehlt noch.
                await student.page.goto("/");
                await student.page.waitForSelector("#angaben-panel");
                const before =
                    (await student.page.textContent("#angaben-panel")) ?? "";
                assert(
                    !before.includes(filename),
                    "Die neue Unterlage darf vor dem Upload nicht in der Karte stehen",
                );

                // Lehrperson lädt eine Unterlage hoch (Rückfrage bestätigen).
                await teacher.page.goto("/admin/application");
                await teacher.page.waitForSelector("#unterlagen_file");
                const dialogs = trackDialogs(teacher.page, "accept");
                await teacher.page.setInputFiles("#unterlagen_file", {
                    name: filename,
                    mimeType: "text/markdown",
                    buffer: Buffer.from("# Angabe\n", "utf8"),
                });
                await teacher.page.locator(
                    'form[hx-post="/admin/unterlagen"] button[type="submit"]',
                ).click();
                await waitForDialogCount(dialogs.messages, 1);

                // Ohne Reload der Schüler-Seite: der Push holt das
                // Fragment, die Karte trägt den neuen Namen.
                await student.page.waitForFunction((name) => {
                    const list = document.getElementById("angaben-list");
                    return Boolean(list?.textContent?.includes(name));
                }, filename, { timeout: 15_000 });
            } finally {
                const dir = Deno.env.get("UNTERLAGEN_DIR");
                if (dir) {
                    await Deno.remove(`${dir}/${filename}`).catch(() => {});
                }
                await student.context.close();
                await teacher.context.close();
            }
        });
    },
});

Deno.test({
    name: "E2E: 'Seit Exam-Start' übernimmt die Examens-Startzeit (#164)",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        await stopExam();
        await withBrowser(async (browser) => {
            const { context, page } = await openPage(browser, TEACHER.email);
            try {
                // Ohne Examen ist der Knopf sichtbar, aber deaktiviert.
                await page.goto("/admin/students");
                await page.waitForSelector("#admin-exam-start");
                assertEquals(
                    await page.locator("#admin-exam-start").isDisabled(),
                    true,
                    "Ohne Examen darf der Knopf nicht bedienbar sein",
                );

                await startExam();
                await page.reload();
                await page.waitForSelector("#admin-exam-start");
                assertEquals(
                    await page.locator("#admin-exam-start").isDisabled(),
                    false,
                    "Während des Examens muss der Knopf bedienbar sein",
                );

                // Der erwartete Wert kommt serverseitig am Knopf mit — der
                // Browser rechnet keine zweite Zeit.
                const expected =
                    (await page.getAttribute("#admin-exam-start", "data-starttime")) ??
                    "";
                assert(
                    /^\d{2}:\d{2}$/.test(expected),
                    `Examens-Startzeit erwartet, war: "${expected}"`,
                );

                const requested = page.waitForResponse((response) => {
                    const url = new URL(response.url());
                    return url.pathname === "/admin/students" &&
                        url.searchParams.get("starttime") === expected;
                });
                await page.click("#admin-exam-start");
                const response = await requested;
                assertEquals(response.status(), 200);
                await response.finished().catch(() => {});

                // Das Formular trägt jetzt die Examens-Startzeit, und die
                // Adresse ist nachgezogen (hx-push-url).
                await page.waitForFunction((value) => {
                    const input = document.getElementById(
                        "admin-start-time",
                    ) as HTMLInputElement | null;
                    return input?.value === value;
                }, expected);
                assert(
                    new URL(page.url()).searchParams.get("starttime") ===
                        expected,
                    `Startzeit muss in der Adresse stehen, war: ${page.url()}`,
                );
            } finally {
                await stopExam();
                await context.close();
            }
        });
    },
});

Deno.test({
    name: "E2E: Admin-Aktion tauscht das Examen-Panel aus",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        await startExam();
        await withBrowser(async (browser) => {
            const { context, page } = await openPage(browser, TEACHER.email);
            try {
                await page.goto("/admin/application");
                await page.waitForSelector("#exam-pause-button");

                // Markierung am alten Knoten: ist sie nach der Aktion weg,
                // wurde das Panel wirklich ersetzt (outerHTML-Swap).
                await page.evaluate(() => {
                    const panel = document.getElementById("exam-admin-panel");
                    if (panel) {
                        panel.dataset.e2eMarker = "vorher";
                    }
                });

                await page.click("#exam-pause-button");
                await page.waitForSelector("#exam-resume-button");

                assertEquals(
                    await page.evaluate(() =>
                        document.getElementById("exam-admin-panel")?.dataset
                            .e2eMarker ?? null
                    ),
                    null,
                    "Das Panel muss ausgetauscht worden sein",
                );

                const badge = (await page.textContent("#exam-status-badge")) ?? "";
                assert(
                    badge.includes("Examen pausiert"),
                    `Statusanzeige erwartet, war: "${badge}"`,
                );
            } finally {
                await stopExam();
                await context.close();
            }
        });
    },
});

Deno.test({
    name: "E2E: Admin-Panel zieht den Exam-Zustand ohne Klick nach (#161)",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        await startExam();
        await withBrowser(async (browser) => {
            const { context, page } = await openPage(browser, TEACHER.email);
            try {
                await page.goto("/admin/application");
                await page.waitForSelector("#exam-pause-button");

                // Das Examen endet ohne Zutun dieser Seite — etwa weil
                // die Zeit abläuft. Der Push muss das Panel nachziehen.
                await stopExam();

                await page.waitForFunction(() => {
                    const badge = document.getElementById("exam-status-badge");
                    return badge?.textContent?.includes("Examen beendet") ??
                        false;
                }, undefined, { timeout: 10_000 });

                assertEquals(
                    await page.locator("#exam-pause-button").count(),
                    0,
                    "Nach dem Exam-Ende darf der Pause-Knopf nicht stehen bleiben",
                );
                assertEquals(
                    await page.locator("#exam-start-form").count(),
                    1,
                    "Das Panel muss den Start wieder anbieten",
                );
            } finally {
                await stopExam();
                await context.close();
            }
        });
    },
});

Deno.test({
    name: "E2E: Anmelde-Freigabe schaltet den roten Balken (#161)",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        await startExam();
        await withBrowser(async (browser) => {
            const { context, page } = await openPage(browser, TEACHER.email);
            try {
                await page.goto("/admin/application");
                await page.waitForSelector("#exam-registration-card");

                // Gesperrt: Schalter aus, kein Anmelde-Balken.
                assertEquals(
                    await page.isChecked("#registration_open"),
                    false,
                );
                assertEquals(
                    await page.locator("#exam-warning-registration").count(),
                    0,
                    "Ohne Freigabe darf der Balken nicht stehen",
                );

                // Freigeben: der Balken erscheint ohne weitere Bestätigung.
                await page.click("#registration_open");
                await page.waitForSelector("#exam-warning-registration");
                assertEquals(await page.isChecked("#registration_open"), true);
                const badge = (await page.textContent(
                    "#exam-registration-badge",
                )) ?? "";
                assert(
                    badge.includes("Anmeldung freigegeben"),
                    `Badge erwartet, war: "${badge}"`,
                );
                const warning = (await page.textContent("#exam-warning")) ?? "";
                assert(
                    warning.includes("Neuanmeldung freigegeben") &&
                        warning.includes("Seit "),
                    `Warnung mit Zeitpunkt erwartet, war: "${warning}"`,
                );

                // Zurücknehmen: Balken verschwindet, Schalter ist aus.
                await page.click("#registration_open");
                await page.waitForSelector("#exam-warning-registration", {
                    state: "detached",
                });
                assertEquals(await page.isChecked("#registration_open"), false);
            } finally {
                await stopExam();
                await context.close();
            }
        });
    },
});

Deno.test({
    name: "E2E: Fehlerantwort zeigt den globalen Toast",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        await startExam();
        await withBrowser(async (browser) => {
            const { context, page } = await openPage(browser, STUDENT.email);
            try {
                await page.goto("/");
                await page.waitForSelector("#abgabe-form");

                // .md ist während des Examens nicht erlaubt → 415 mit Text.
                await page.setInputFiles("#abgabe-file-input", {
                    name: "notiz.md",
                    mimeType: "text/markdown",
                    buffer: Buffer.from("# Notiz\n", "utf8"),
                });
                await page.click("#abgabe-submit");

                await page.waitForSelector("#toast-dialog");
                const message = (await page.textContent("#toast-dialog-message")) ?? "";
                assert(
                    message.includes("Nur .zip Dateien sind erlaubt."),
                    `Fehlermeldung im Toast erwartet, war: "${message}"`,
                );
                assertEquals(
                    await page.getAttribute("#toast-dialog", "data-toast-type"),
                    "danger",
                );

                // Der Fehler darf das Formular nicht wegswappen.
                assertEquals(await page.locator("#abgabe-form").isVisible(), true);

                await page.click("#toast-dialog-close");
            } finally {
                await context.close();
            }
        });
    },
});

Deno.test({
    name: "E2E: Doppelklick-Schutz deaktiviert den Button während der Anfrage",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        await startExam();
        await withBrowser(async (browser) => {
            const { context, page } = await openPage(browser, TEACHER.email);
            try {
                await page.goto("/admin/application");
                await page.waitForSelector("#exam-pause-button");

                // Antwort künstlich verzögern, damit der Zwischenzustand
                // (Button deaktiviert) beobachtbar ist.
                await page.route("**/api/exam/pause", async (route) => {
                    await new Promise((resolve) => setTimeout(resolve, 1500));
                    await route.continue();
                });

                await page.click("#exam-pause-button");

                // Fall 1: `hx-post` hängt am Button selbst.
                assert(
                    await waitForDisabled(page.locator("#exam-pause-button")),
                    "hx-disabled-elt muss den Button während der Anfrage deaktivieren",
                );

                // Nach dem Swap zeigt das Panel den pausierten Zustand.
                await page.waitForSelector("#exam-resume-button");
                await page.unroute("**/api/exam/pause");

                // Fall 2: `hx-post` hängt am Formular (#exam-extra-form,
                // Zusatzzeit). Dort deaktiviert `this` nur das Formular;
                // geschützt werden muss der Submit-Button.
                const extraSubmit = page.locator("#exam-extra-form")
                    .getByRole("button");

                await page.route("**/api/exam/extra", async (route) => {
                    await new Promise((resolve) => setTimeout(resolve, 1500));
                    await route.continue();
                });

                await page.evaluate(() => {
                    const panel = document.getElementById("exam-admin-panel");
                    if (panel) {
                        panel.dataset.e2eMarker = "vorher";
                    }
                });
                await extraSubmit.click();

                assert(
                    await waitForDisabled(extraSubmit),
                    "hx-disabled-elt am Formular muss dessen Submit-Button deaktivieren",
                );

                // Die Anfrage läuft weiter: das Panel wird ersetzt, die
                // Markierung verschwindet, der Button ist wieder bedienbar.
                await page.waitForFunction(() =>
                    !document.getElementById("exam-admin-panel")?.dataset
                        .e2eMarker
                );
                assertEquals(await page.locator("#exam-extra-form").isVisible(), true);
                await page.unroute("**/api/exam/extra");
            } finally {
                await stopExam();
                await context.close();
            }
        });
    },
});

/**
 * Sammelt die `window.confirm`-Rückfragen einer Seite (#152). Playwright
 * braucht den Listener **vor** dem Klick: solange ein Dialog offen ist,
 * kommt der Klick nicht zurück.
 */
function trackDialogs(
    page: Page,
    initialAction: "accept" | "dismiss",
) {
    const state = {
        action: initialAction,
        messages: [] as string[],
    };

    page.on("dialog", async (dialog) => {
        state.messages.push(dialog.message());
        if (state.action === "accept") {
            await dialog.accept();
        } else {
            await dialog.dismiss();
        }
    });

    return state;
}

/** Wartet, bis die n-te Rückfrage wirklich angekommen ist. */
async function waitForDialogCount(messages: string[], count: number): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (messages.length >= count) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(
        `Rückfrage Nr. ${count} erschien nicht (bisher ${messages.length}).`,
    );
}

Deno.test({
    name: "E2E: Rückfrage vor dem Entfernen einer MAC-Freigabe (#152)",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        await withBrowser(async (browser) => {
            const { context, page } = await openPage(browser, TEACHER.email);
            try {
                await page.goto("/admin/application");
                await page.waitForSelector("#adminmac-allowed-list");

                const dialogs = trackDialogs(page, "dismiss");
                const removeButton = page.locator("#adminmac-allowed-list")
                    .getByRole("button", { name: "Entfernen" });

                // Erster Klick: die Rückfrage erscheint und wird abgelehnt —
                // die Freigabe bleibt unangetastet.
                await removeButton.click();
                await waitForDialogCount(dialogs.messages, 1);
                assert(
                    dialogs.messages[0].includes(
                        `MAC-Adresse ${ADMIN_MAC.mac} wirklich entfernen?`,
                    ),
                    `Rückfrage erwartet, war: "${dialogs.messages[0]}"`,
                );

                const afterCancel = (await page.textContent("#adminmac-allowed-list")) ?? "";
                assert(
                    afterCancel.includes(ADMIN_MAC.mac),
                    "Nach dem Abbrechen darf die MAC-Freigabe nicht entfernt sein",
                );

                // Zweiter Klick: bestätigen — jetzt wird wirklich entfernt.
                dialogs.action = "accept";
                await removeButton.click();
                await waitForDialogCount(dialogs.messages, 2);

                // Leere Liste: das Panel wurde ausgetauscht, der Eintrag ist weg.
                await page.waitForSelector("#adminmac-allowed-list", {
                    state: "detached",
                });
                const text = await page.evaluate(() => document.body.innerText);
                assert(
                    text.includes("Keine MAC-Adresse freigegeben."),
                    `Leerzustand erwartet, war: "${text}"`,
                );
                // Die Erfolgsmeldung nennt die entfernte Freigabe.
                assert(
                    text.includes(`MAC-Freigabe entfernt: ${ADMIN_MAC.mac}`),
                    `Erfolgsmeldung erwartet, war: "${text}"`,
                );
            } finally {
                await context.close();
            }
        });
    },
});

Deno.test({
    name: "E2E: Rückfrage vor der Datenbankbereinigung (#152)",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        await withBrowser(async (browser) => {
            const { context, page } = await openPage(browser, TEACHER.email);
            try {
                await page.goto("/admin/application");
                await page.waitForSelector("#cleanup-database-form");

                const dialogs = trackDialogs(page, "accept");
                await page.locator("#cleanup-database-form").getByRole("button").click();
                await waitForDialogCount(dialogs.messages, 1);
                assert(
                    dialogs.messages[0].includes("älter als ein Monat"),
                    `Rückfrage erwartet, war: "${dialogs.messages[0]}"`,
                );

                await page.waitForSelector("#cleanup-result");
                const result = (await page.textContent("#cleanup-result")) ?? "";
                assert(
                    result.includes("Datenbank bereinigt."),
                    `Ergebnis der Bereinigung erwartet, war: "${result}"`,
                );
            } finally {
                await context.close();
            }
        });
    },
});

Deno.test({
    name: "E2E: Admin-Seite steht ab xxl dreispaltig, ab lg zweispaltig (#157)",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        await withBrowser(async (browser) => {
            const { context, page } = await openPage(browser, TEACHER.email);
            const groups = [
                "#admin-group-exam",
                "#admin-group-unterlagen",
                "#admin-group-zugang",
            ];

            /** Position der drei Gruppen; `null` heißt "nicht sichtbar". */
            async function columnPositions() {
                const xs: number[] = [];
                const ys: number[] = [];
                for (const selector of groups) {
                    const box = await page.locator(selector).boundingBox();
                    assert(box !== null, `Gruppe ${selector} ist nicht sichtbar`);
                    xs.push(box.x);
                    ys.push(box.y);
                }
                return { xs, ys };
            }

            try {
                // Drei Spalten ab xxl (1400 px): eine Zeile, steigendes x.
                await page.setViewportSize({ width: 1600, height: 900 });
                await page.goto("/admin/application");
                await page.waitForSelector("#admin-group-exam");

                const wide = await columnPositions();
                assert(
                    Math.max(...wide.ys) - Math.min(...wide.ys) <= 2,
                    `Bei 1600 px müssen alle drei Gruppen in einer Zeile stehen, y war ${wide.ys.join(", ")}`,
                );
                assert(
                    wide.xs[0] < wide.xs[1] && wide.xs[1] < wide.xs[2],
                    `Bei 1600 px müssen die Gruppen nebeneinander stehen, x war ${wide.xs.join(", ")}`,
                );

                // Zwei Spalten ab lg (992 px): die dritte Gruppe bricht um.
                await page.setViewportSize({ width: 1000, height: 900 });
                const narrow = await columnPositions();
                assert(
                    Math.abs(narrow.ys[0] - narrow.ys[1]) <= 2,
                    `Bei 1000 px müssen zwei Gruppen nebeneinander stehen, y war ${narrow.ys.join(", ")}`,
                );
                assert(
                    narrow.ys[2] > narrow.ys[0],
                    `Bei 1000 px muss die dritte Gruppe umbrechen, y war ${narrow.ys.join(", ")}`,
                );
            } finally {
                await context.close();
            }
        });
    },
});

Deno.test({
    name:
        "E2E: Kopf klebt nicht an Navigation/Namenskarte, Schalter weicht bei Platzmangel nach oben (#158)",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        /** Geometrie des Kopfes und der ersten Zeile darunter. */
        async function layout(page: Page) {
            return await page.evaluate(() => {
                const rect = (selector: string) => {
                    const el = document.querySelector(selector);
                    return el ? el.getBoundingClientRect() : null;
                };
                const hero = rect("body > header .card");
                const title = rect("body > header h1");
                const toggle = rect("#theme-toggle");
                const nav = rect("#main-nav");
                const badge = rect("#user-badge-panel");
                const content = rect("#app-ip-banner");

                return {
                    hero: hero && {
                        x: hero.x,
                        width: hero.width,
                        bottom: hero.bottom,
                        center: (hero.left + hero.right) / 2,
                    },
                    title: title && {
                        top: title.top,
                        left: title.left,
                        right: title.right,
                        center: (title.left + title.right) / 2,
                    },
                    toggle: toggle && {
                        bottom: toggle.bottom,
                        left: toggle.left,
                    },
                    // Abstand zur ersten Zeile darunter; null, wenn es sie
                    // auf dieser Rolle nicht gibt.
                    gapToNav: nav && hero ? nav.top - hero.bottom : null,
                    gapToBadge: badge && hero ? badge.top - hero.bottom : null,
                    contentX: content?.x ?? null,
                    contentWidth: content?.width ?? null,
                };
            });
        }

        type Layout = Awaited<ReturnType<typeof layout>>;

        /** „Mindestens 8 px Luft" — halbe Pixel Toleranz für Subpixel-Layout. */
        const MIN_GAP = 7.5;

        function assertAirBelow(l: Layout, below: "nav" | "badge") {
            const gap = below === "nav" ? l.gapToNav : l.gapToBadge;
            assert(
                gap !== null && gap >= MIN_GAP,
                `Unter dem Hero muss Luft zur ersten Zeile sein, Abstand war ${gap}px`,
            );
        }

        /** Über dem Hero (umgebrochen) oder daneben — beides erlaubt, Überlappen nicht. */
        function isStacked(l: Layout): boolean {
            assert(l.toggle !== null && l.title !== null, "Kopf ist unvollständig");
            const above = l.toggle!.bottom <= l.title!.top;
            const beside = l.toggle!.left >= l.title!.right - 1;
            assert(
                above || beside,
                `Der Schalter muss über oder neben dem Hero stehen, nicht darin: ${JSON.stringify(l.toggle)} vs. ${JSON.stringify(l.title)}`,
            );
            return above;
        }

        await withBrowser(async (browser) => {
            // Handy-Portrait, Schüler: Hero → Namenskarte, Schalter über dem h1.
            const student = await openPage(browser, STUDENT.email);
            try {
                await student.page.setViewportSize({ width: 390, height: 844 });
                await student.page.goto("/");
                await student.page.waitForSelector("#hero-link");
                const mobile = await layout(student.page);

                assertAirBelow(mobile, "badge");
                assert(
                    isStacked(mobile),
                    `Im Portrait muss der Schalter über dem h1 stehen (Schalter unten ${mobile.toggle?.bottom}, h1 oben ${mobile.title?.top})`,
                );
                assert(
                    Math.abs(mobile.title!.center - mobile.hero!.center) <= 1.5,
                    `Über dem Hero muss der Titel mittig stehen, Versatz war ${
                        mobile.title!.center - mobile.hero!.center
                    }px`,
                );
            } finally {
                await student.context.close();
            }

            // Lehrperson: Navigation als erste Zeile, Umbrechen bei mittleren Breiten.
            const teacher = await openPage(browser, TEACHER.email);
            const page = teacher.page;
            try {
                await page.setViewportSize({ width: 390, height: 844 });
                await page.goto("/");
                await page.waitForSelector("#main-nav");

                const narrow = await layout(page);
                assertAirBelow(narrow, "nav");
                isStacked(narrow);

                // Mittlere Breiten: Umbrechen ist erlaubt, Überlappen nicht.
                for (const width of [500, 620, 768]) {
                    await page.setViewportSize({ width, height: 844 });
                    isStacked(await layout(page));
                }

                await page.setViewportSize({ width: 1280, height: 900 });
                const wide = await layout(page);

                assertAirBelow(wide, "nav");
                assert(
                    !isStacked(wide),
                    "Bei 1280 px muss der Schalter neben dem Hero stehen",
                );
                assert(
                    Math.abs(wide.hero!.x - wide.contentX!) <= 1.5,
                    `Die Hero-Karte muss mit dem Inhalt fluchten, x war ${wide.hero?.x} vs. ${wide.contentX}`,
                );
                assert(
                    Math.abs(wide.hero!.width - wide.contentWidth!) <= 1.5,
                    `Die Hero-Karte muss so breit wie der Inhalt sein, Breite war ${wide.hero?.width} vs. ${wide.contentWidth}`,
                );
            } finally {
                await teacher.context.close();
            }
        });
    },
});

/** Lokales Datum (`YYYY-MM-DD`) für den Admin-Zeitraum. */
function localIsoDate(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${
        pad(date.getDate())
    }`;
}

/**
 * Wählt die Karte der Forensik (nicht den MikroTik-Streifen — der ist
 * ebenfalls ein `.card` mit `hx-get`) und öffnet das Detail-Modal.
 */
async function openFirstIpDetail(page: Page): Promise<Locator> {
    const card = page.locator(
        '#admin-report-panel .card[hx-get^="/admin/ip-detail"]',
    ).first();
    await card.waitFor({ state: "visible", timeout: 15_000 });
    await card.click();
    await page.waitForSelector("#ip-detail-modal.show");
    return card;
}

/**
 * Öffnet die Forensik mit explizitem Zeitraum und wartet, bis der
 * Admin-Kanal steht (#163).
 *
 * Beweis für die Verbindung ist der `stand`-Frame: er kommt nur über
 * `sse-connect` und wird per `sse-swap` in `#admin-refresh-stand`
 * eingesetzt. Ohne ihn wäre jeder folgende Test ein Test gegen eine tote
 * Verbindung.
 */
async function openAdminForensics(page: Page): Promise<void> {
    const today = localIsoDate(new Date());
    await page.goto(`/admin/students?startdate=${today}&starttime=00:00`);
    await page.waitForSelector("#admin-report-panel");
    await page.waitForFunction(() => {
        const stand = document.getElementById("admin-refresh-stand");
        return /Stand: \d{2}:\d{2}:\d{2}/.test(stand?.textContent ?? "");
    }, undefined, { timeout: 15_000 });
}

/**
 * Zählt die Forensik-Requests einer Seite (#163).
 *
 * Die Suite hat nur eine IP (127.0.0.1) und Identität gilt pro IP —
 * deshalb wird sequenziell gearbeitet und gezählt statt geraten.
 */
function trackForensicsRequests(page: Page) {
    const counts = { students: 0, cards: 0, tik: 0 };
    page.on("request", (request) => {
        if (!request.url().startsWith(BASE_URL)) {
            return;
        }
        const path = new URL(request.url()).pathname;
        if (path === "/admin/students") {
            counts.students += 1;
        } else if (path === "/admin/student-card") {
            counts.cards += 1;
        } else if (path === "/admin/tik-panel") {
            counts.tik += 1;
        }
    });
    return {
        counts,
        reset() {
            counts.students = 0;
            counts.cards = 0;
            counts.tik = 0;
        },
    };
}

/**
 * Lässt den 1-s-Batch des Servers und den daraus folgenden Panel-Request
 * zur Ruhe kommen. Präsenz desselben Users ist danach 30 s lang
 * dedupliziert — genau das Fenster, in dem die Zählungen gelten.
 */
async function settleAdminPush(page: Page): Promise<void> {
    await page.waitForTimeout(2500);
}

/** Das Kärtchen der einzigen Test-IP (127.0.0.1). */
const TEST_IP_CARD = "#student-card-127-0-0-1";

/**
 * Markiert einen Panel-Kindknoten. Ein Panel-Render ersetzt den
 * Kindbaum — die Markierung fehlt danach; ein Kärtchen-Swap lässt sie
 * stehen.
 */
async function markPanelChild(page: Page): Promise<void> {
    await page.evaluate(() => {
        const heading = document.querySelector("#admin-report-panel h2");
        if (heading instanceof HTMLElement) {
            heading.dataset.e2eMarker = "vorher";
        }
    });
}

async function panelChildMarker(page: Page): Promise<string | null> {
    return await page.evaluate(() => {
        const heading = document.querySelector("#admin-report-panel h2");
        return heading instanceof HTMLElement
            ? heading.dataset.e2eMarker ?? null
            : null;
    });
}

/** Markiert das Kärtchen selbst: `outerHTML` ersetzt den Knoten. */
async function markCard(page: Page): Promise<void> {
    await page.evaluate((selector) => {
        const card = document.querySelector(selector);
        if (card instanceof HTMLElement) {
            card.dataset.e2eMarker = "vorher";
        }
    }, TEST_IP_CARD);
}

async function cardMarker(page: Page): Promise<string | null> {
    return await page.evaluate((selector) => {
        const card = document.querySelector(selector);
        return card instanceof HTMLElement
            ? card.dataset.e2eMarker ?? null
            : null;
    }, TEST_IP_CARD);
}

/** Wartet, bis das Kärtchen der Test-IP wirklich ausgetauscht wurde. */
async function waitForCardSwap(page: Page): Promise<void> {
    await page.waitForFunction((selector) => {
        const card = document.querySelector(selector);
        return card !== null &&
            (card as HTMLElement).dataset.e2eMarker === undefined;
    }, TEST_IP_CARD, { timeout: 15_000 });
}

/** Wartet, bis das Kärtchen der Test-IP das Abgabe-Badge trägt. */
async function waitForSubmissionBadge(page: Page): Promise<void> {
    await page.waitForFunction((selector) => {
        const card = document.querySelector(selector);
        if (!card) return false;
        return Array.from(card.querySelectorAll(".badge")).some((badge) =>
            badge.textContent?.trim() === "Abgabe"
        );
    }, TEST_IP_CARD, { timeout: 15_000 });
}

/** Lädt eine gültige Abgabe hoch und quittiert den Erfolgs-Toast. */
async function submitAbgabe(page: Page): Promise<void> {
    await page.setInputFiles("#abgabe-file-input", {
        name: UPLOAD_FILENAME,
        mimeType: "application/zip",
        buffer: Buffer.from(ZIP_BYTES),
    });
    await page.click("#abgabe-submit");
    await page.waitForSelector("#toast-dialog");
    await page.click("#toast-dialog-close");
}

Deno.test({
    name:
        "E2E: Kärtchen hängen an ihren Ereignissen — Dauer-Ping bleibt still (#163)",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        await stopExam();
        await withBrowser(async (browser) => {
            const teacher = await openPage(browser, TEACHER.email);
            const tracker = trackForensicsRequests(teacher.page);
            const student = await openPage(browser, STUDENT.email);
            try {
                await openAdminForensics(teacher.page);

                // Der Schüler wird präsent: dieser eine Identitätswechsel
                // darf das Panel genau einmal holen. Danach ist die
                // Presence desselben Users 30 s lang dedupliziert.
                await student.page.goto("/");
                await student.page.waitForSelector("#abgabe-panel");
                await settleAdminPush(teacher.page);

                // Ruhiges Fenster: nur der Schüler lädt neu. Das ist der
                // Dauer-Ping aus der Zeit vor #163 — er darf nichts kosten.
                tracker.reset();
                for (let round = 0; round < 3; round++) {
                    await student.page.reload();
                    await teacher.page.waitForTimeout(400);
                }
                await teacher.page.waitForTimeout(3500);

                assertEquals(
                    tracker.counts.students,
                    0,
                    "Ein Schüler-Reload darf das Panel nicht neu holen",
                );
                assertEquals(
                    tracker.counts.cards,
                    0,
                    "Ein Schüler-Reload darf kein Kärtchen neu holen",
                );
                // Der Kanal lebt während des ruhigen Fensters weiter: der
                // Stand kommt aus dem `stand`-Frame, nicht aus einem Request.
                const stand =
                    (await teacher.page.textContent("#admin-refresh-stand")) ??
                        "";
                assert(
                    /Stand: \d{2}:\d{2}:\d{2}/.test(stand),
                    `Serverzeit im Kopf erwartet, war: "${stand}"`,
                );
            } finally {
                await student.context.close();
                await teacher.context.close();
            }
        });
    },
});

Deno.test({
    name: "E2E: Der MikroTik-Streifen überlebt seinen eigenen Frame (#163)",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        await stopExam();
        await withBrowser(async (browser) => {
            const teacher = await openPage(browser, TEACHER.email);
            try {
                await openAdminForensics(teacher.page);

                // TIK_* ist im E2E-Lauf leer; der Streifen sagt genau das.
                const requested = teacher.page.waitForResponse((response) =>
                    new URL(response.url()).pathname === "/admin/tik-panel"
                );
                await teacher.page.evaluate(() => {
                    const htmx = (window as unknown as {
                        htmx: {
                            trigger: (elt: Element | null, name: string) => void;
                        };
                    }).htmx;
                    htmx.trigger(
                        document.getElementById("admin-tik-panel"),
                        "sse:tik",
                    );
                });
                const response = await requested;
                await response.finished().catch(() => {});

                // Nur der Browser zeigt den Fehler: das Fragment erbte
                // `hx-select` vom Panel, der Selektor traf in seiner
                // eigenen Antwort nichts und der `outerHTML`-Swap löschte
                // den Streifen. Geprüft wird deshalb das Ergebnis, nicht
                // der Request.
                await teacher.page.waitForTimeout(500);
                const text = await teacher.page.evaluate(() => {
                    const panel = document.getElementById("admin-tik-panel");
                    return panel ? panel.textContent?.trim() ?? "" : null;
                });
                assert(
                    text !== null,
                    "Der MikroTik-Streifen ist nach seinem eigenen Frame verschwunden",
                );
                assert(
                    text!.includes("MikroTik nicht konfiguriert"),
                    `Streifen-Inhalt erwartet, war: ${JSON.stringify(text)}`,
                );
            } finally {
                await teacher.context.close();
            }
        });
    },
});

Deno.test({
    name: "E2E: Eine Abgabe tauscht genau ein Kärtchen, nicht das Panel (#163)",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        await stopExam();
        await withBrowser(async (browser) => {
            const teacher = await openPage(browser, TEACHER.email);
            const tracker = trackForensicsRequests(teacher.page);
            const student = await openPage(browser, STUDENT.email);
            try {
                await openAdminForensics(teacher.page);
                await startExam();
                await student.page.goto("/");
                await student.page.waitForSelector("#abgabe-form");
                await settleAdminPush(teacher.page);

                await markPanelChild(teacher.page);
                await markCard(teacher.page);
                tracker.reset();

                await submitAbgabe(student.page);
                await waitForCardSwap(teacher.page);
                await waitForSubmissionBadge(teacher.page);

                assertEquals(
                    tracker.counts.cards,
                    1,
                    "Die Abgabe muss genau ein Kärtchen neu holen",
                );
                assertEquals(
                    tracker.counts.students,
                    0,
                    "Die Abgabe darf das Panel nicht neu holen",
                );
                assertEquals(
                    await panelChildMarker(teacher.page),
                    "vorher",
                    "Das Panel darf bei einer Abgabe stehen bleiben",
                );
            } finally {
                await stopExam();
                await student.context.close();
                await teacher.context.close();
            }
        });
    },
});

Deno.test({
    name: "E2E: Identitätswechsel rendert das Panel genau einmal (#163)",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        await stopExam();
        await withBrowser(async (browser) => {
            const teacher = await openPage(browser, TEACHER.email);
            const tracker = trackForensicsRequests(teacher.page);
            try {
                await openAdminForensics(teacher.page);
                await settleAdminPush(teacher.page);
                await markPanelChild(teacher.page);
                tracker.reset();

                // Ein zweiter Schüler meldet sich auf derselben IP an
                // (127.0.0.1 — mehr gibt die Suite nicht her).
                const other = await openPage(browser, STUDENT_ALT.email);
                try {
                    await other.page.goto("/");
                    await teacher.page.waitForFunction((selector) => {
                        const card = document.querySelector(selector);
                        return Boolean(
                            card?.textContent?.includes("Selin Altmann"),
                        );
                    }, TEST_IP_CARD, { timeout: 15_000 });

                    // Gruppe und Name des Kärtchens stammen aus dem neuen
                    // Render, nicht aus einem alten Stand.
                    assertEquals(
                        await teacher.page.getAttribute(
                            TEST_IP_CARD,
                            "data-tone",
                        ),
                        "schueler",
                    );
                } finally {
                    await other.context.close();
                }

                assertEquals(
                    tracker.counts.students,
                    1,
                    "Ein Identitätswechsel muss das Panel genau einmal holen",
                );
                assertEquals(
                    tracker.counts.cards,
                    0,
                    "Ein Identitätswechsel braucht kein Kärtchen-Fragment",
                );
                assertEquals(
                    await panelChildMarker(teacher.page),
                    null,
                    "Der Panel-Render muss den Kindbaum ersetzt haben",
                );
            } finally {
                await teacher.context.close();
            }
        });
    },
});

Deno.test({
    name: "E2E: Klick auf ein Kärtchen öffnet das Detail ohne Karten-Swap (#163)",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        await stopExam();
        await withBrowser(async (browser) => {
            const teacher = await openPage(browser, TEACHER.email);
            const tracker = trackForensicsRequests(teacher.page);
            try {
                await openAdminForensics(teacher.page);
                await settleAdminPush(teacher.page);
                tracker.reset();

                await openFirstIpDetail(teacher.page);
                // Das Modal zeigt den geladenen Inhalt, nicht den Spinner.
                await teacher.page.waitForFunction(() => {
                    const content = document.getElementById(
                        "ip-detail-modal-content",
                    );
                    return Boolean(
                        content && !content.querySelector(".spinner-border"),
                    );
                }, undefined, { timeout: 15_000 });
                await teacher.page.waitForTimeout(1500);

                assertEquals(
                    tracker.counts.cards,
                    0,
                    "Ein Klick darf kein Kärtchen neu holen",
                );
                assertEquals(
                    tracker.counts.students,
                    0,
                    "Ein Klick darf das Panel nicht neu holen",
                );
            } finally {
                await teacher.context.close();
            }
        });
    },
});

Deno.test({
    name: "E2E: Offenes Detail friert nur das Panel ein, nicht das Kärtchen (#163)",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        await stopExam();
        await withBrowser(async (browser) => {
            const teacher = await openPage(browser, TEACHER.email);
            const tracker = trackForensicsRequests(teacher.page);
            const student = await openPage(browser, STUDENT.email);
            const other = await openPage(browser, STUDENT_NEU.email);
            try {
                await openAdminForensics(teacher.page);
                await startExam();
                await student.page.goto("/");
                await student.page.waitForSelector("#abgabe-form");
                await settleAdminPush(teacher.page);

                await openFirstIpDetail(teacher.page);
                await markPanelChild(teacher.page);
                await markCard(teacher.page);
                tracker.reset();

                // Panel-Ereignis: der Identitätswechsel darf das Panel
                // nicht unter dem offenen Detail wegziehen — er zählt.
                await other.page.goto("/");
                await teacher.page.waitForSelector(
                    "#admin-refresh-pending:not(.d-none)",
                    { timeout: 15_000 },
                );
                assertEquals(
                    await panelChildMarker(teacher.page),
                    "vorher",
                    "Bei offenem Detail darf das Panel nicht getauscht werden",
                );
                assertEquals(
                    tracker.counts.students,
                    0,
                    "Bei offenem Detail darf kein Panel-Request laufen",
                );

                // Karten-Ereignis: die Abgabe tauscht trotzdem ihr Kärtchen.
                await submitAbgabe(student.page);
                await waitForCardSwap(teacher.page);
                await waitForSubmissionBadge(teacher.page);
                assertEquals(
                    tracker.counts.cards,
                    1,
                    "Die Abgabe muss ihr Kärtchen auch bei offenem Detail holen",
                );
                assertEquals(
                    await panelChildMarker(teacher.page),
                    "vorher",
                    "Das Panel bleibt bei offenem Detail stehen",
                );

                // Schließen: der Nachlauf holt das Panel, der Zähler geht.
                await teacher.page.click("#ip-detail-modal .btn-close");
                await teacher.page.waitForSelector("#ip-detail-modal.show", {
                    state: "detached",
                });
                await teacher.page.waitForFunction(() => {
                    const badge = document.getElementById(
                        "admin-refresh-pending",
                    );
                    return badge?.classList.contains("d-none") ?? false;
                }, undefined, { timeout: 15_000 });
                assertEquals(
                    await panelChildMarker(teacher.page),
                    null,
                    "Der Nachlauf muss das Panel nach dem Schließen holen",
                );
                assertEquals(
                    await cardMarker(teacher.page),
                    null,
                    "Der Panel-Render bringt ein frisches Kärtchen mit",
                );
                await waitForSubmissionBadge(teacher.page);
            } finally {
                await stopExam();
                await other.context.close();
                await student.context.close();
                await teacher.context.close();
            }
        });
    },
});

Deno.test({
    name: "E2E: Exam-Stream verbindet sich nach dem HTMX-Login (#163)",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        await stopExam();
        await withBrowser(async (browser) => {
            // Ohne Sitzung: kein Abgabe-Panel, kein Exam-Kanal.
            const context = await browser.newContext({ baseURL: BASE_URL });
            const page = await context.newPage();
            try {
                await page.goto("/");
                await page.waitForSelector("#login-form");
                assertEquals(
                    await page.locator("[data-exam-events]").count(),
                    0,
                    "Ohne Sitzung darf kein Kanal-Attribut im DOM stehen",
                );
                assertEquals(
                    await page.evaluate(() =>
                        typeof (window as unknown as Record<string, unknown>)
                            .__uploadthingExamEvents
                    ),
                    "undefined",
                    "Ohne Sitzung darf kein Exam-Stream verbunden sein",
                );

                // Anmeldung wie der Klick auf einen Suchtreffer: POST
                // /register, htmx tauscht `#app-main`. LDAP ist im
                // Testlauf nicht erreichbar, der Server fällt auf den
                // lokalen Fixture-User zurück.
                await page.evaluate(async (email) => {
                    const htmx = (window as unknown as {
                        htmx: {
                            ajax: (
                                method: string,
                                url: string,
                                options: Record<string, unknown>,
                            ) => Promise<unknown>;
                        };
                    }).htmx;
                    await htmx.ajax("POST", "/register", {
                        target: "#app-main",
                        swap: "outerHTML",
                        values: { email },
                    });
                }, STUDENT.email);

                await page.waitForSelector("[data-exam-events]");
                await page.waitForFunction(() => {
                    const source = (window as unknown as {
                        __uploadthingExamEvents?: EventSource;
                    }).__uploadthingExamEvents;
                    return source?.readyState === EventSource.OPEN;
                }, undefined, { timeout: 15_000 });

                // Der Kanal trägt: der Exam-Start erreicht die Seite ohne
                // Reload, und der Countdown tickt.
                await startExam();
                await page.waitForSelector("#exam-countdown-badge");
                const first =
                    (await page.textContent("#exam-countdown-badge")) ?? "";
                assert(
                    /Restzeit:\s*\d{1,2}:\d{2}/.test(first),
                    `Countdown nach dem Login erwartet, war: "${first}"`,
                );
                await page.waitForTimeout(1200);
                const second =
                    (await page.textContent("#exam-countdown-badge")) ?? "";
                assert(
                    second !== first,
                    `Countdown muss nach dem Login ticken, blieb bei "${first}"`,
                );
            } finally {
                await stopExam();
                await context.close();
            }
        });
    },
});
