/**
 * Playwright-Smoke-Suite für die examkritischen Browser-Flows (#135).
 *
 * Neun Tests, ausschließlich nutzersichtbares Verhalten — keine
 * htmx-Event-Interna. Damit ist die Suite auch die Abnahme für die
 * htmx-4-Migration (#150). Selektoren: nur stabile `id`s aus den
 * Templates, keine Text- oder CSS-Selektoren.
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
