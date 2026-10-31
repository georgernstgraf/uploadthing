import { assertEquals, assertExists, assert, assertRejects } from "@std/assert";
import { createHash } from "node:crypto";
import endpoints from "./endpoints.json" with { type: "json" };
import config from "../lib/config.ts";
import * as service from "../service/service.ts";
import { db } from "../repo/db.ts";
import * as ipfactRepo from "../repo/ipfact.ts";
import * as registrationsRepo from "../repo/registrations.ts";
import * as usersRepo from "../repo/users.ts";
import { dateString, timeString } from "../lib/timefunc.ts";
import {
    LOCAL_TEST_IP,
    clearExamState,
    clearForensicsByIp,
    clearForensicsByUserEmail,
    seedExamState,
    seedNoAnomaliesScenario,
    upsertFixtureUser,
} from "./helpers/forensics_fixture.ts";

const BASE_URL = Deno.env.get("TEST_BASE_URL") || endpoints.baseUrl;

function computeMd5(data: Uint8Array): string {
    return createHash("md5").update(data).digest("hex");
}

interface Endpoint {
    method: "GET" | "POST";
    path: string;
    description: string;
    data?: Record<string, unknown>;
    expectedOutput?: { type: string };
}

const uploadZipBytes = Uint8Array.from([
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

Deno.test("GET / - Home page", async () => {
    const res = await fetch(`${BASE_URL}/`);
    assertEquals(res.status, 200);
    const text = await res.text();
    assertExists(text);
    assertEquals(res.headers.get("content-type")?.includes("text/html"), true);
});

Deno.test("GET / - Security-Header", async () => {
    const res = await fetch(`${BASE_URL}/`);
    assertEquals(res.status, 200);
    // Verhindert das „Not secure"-Badge bei gültigem Zertifikat, siehe
    // middleware/security_headers.ts.
    assertEquals(
        res.headers.get("content-security-policy"),
        "upgrade-insecure-requests",
    );
});

Deno.test("GET /admin/logs - Admin logs", async () => {
    const res = await fetch(`${BASE_URL}/admin/logs`);
    // Route wurde entfernt: für Anonyme liefert die requireAdmin-Middleware
    // 403, für Admins bleibt ein unregistrierter Pfad 404.
    assertEquals([200, 403, 404].includes(res.status), true);
    const text = await res.text();
    assertExists(text);
});

Deno.test("GET /ldap?q=Graf - Namenssuche ab drei Zeichen (#146)", async () => {
    // Unter drei Zeichen: Hinweis statt Trefferliste.
    const shortRes = await fetch(`${BASE_URL}/ldap?q=Gr`);
    assertEquals(shortRes.status, 200);
    const shortHtml = await shortRes.text();
    assertEquals(shortHtml.includes("Bitte mindestens 3 Zeichen eingeben."), true);
    assertEquals(shortHtml.includes('hx-post="/register"'), false);

    const res = await fetch(`${BASE_URL}/ldap?q=Graf`);
    assertEquals(res.status, 200);
    const html = await res.text();
    assertExists(html);

    // Anzeige aus givenName + sn — displayName wäre invertiert ("Graf Georg").
    assertEquals(html.includes("Georg Graf · LehrendeR"), true);
    assertEquals(html.includes("Petra Graf · LehrendeR"), true);
    assertEquals(html.includes("Graf Georg"), false);

    const labels = [...html.matchAll(/<span class="fw-semibold">([^<]*)<\/span>/g)]
        .map((match) => match[1]);
    assert(labels.length > 0, "Die Suche muss Treffer liefern");
    for (const label of labels) {
        assertEquals(
            label.includes("@"),
            false,
            `Die Anzeige darf keine E-Mail enthalten: ${label}`,
        );
        assertEquals(label.includes(" "), true, `Anzeige „Vorname Nachname“: ${label}`);
    }
});

Deno.test("Namenssuche legt keine Benutzer an (#146)", async () => {
    const search = async (term: string) => {
        const html = await (await fetch(`${BASE_URL}/ldap?q=${term}`)).text();
        return [...html.matchAll(/hx-vals='\{"email": "([^"]+)"\}'/g)]
            .map((match) => match[1]);
    };

    // Eine Person suchen, die lokal noch unbekannt ist — sonst wäre der
    // Test wertlos, ohne dafür echte Datensätze zu löschen.
    const findUnknown = async (): Promise<{ term: string; email: string } | null> => {
        for (const term of ["Graf", "Gra", "Haim", "Gruber", "Schm"]) {
            for (const email of await search(term)) {
                if (!(await usersRepo.getByEmail(email))) {
                    return { term, email };
                }
            }
        }
        return null;
    };

    const candidate = await findUnknown();
    assertExists(
        candidate,
        "Mindestens eine Person der Trefferliste muss lokal noch unbekannt sein",
    );

    await search(candidate.term);

    assertEquals(
        await usersRepo.getByEmail(candidate.email),
        null,
        `${candidate.email} darf durch die Suche nicht angelegt werden`,
    );
});

Deno.test("POST /register - Register User to own IP", async () => {
    const testEmail = "grafg@spengergasse.at";
    const res = await fetch(`${BASE_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `email=${encodeURIComponent(testEmail)}`,
    });
    await res.text(); // consume body to avoid resource leak
    assertEquals(res.status, 200);
});

Deno.test("Startseite: Angaben, Doku und Anmeldung auf einer Seite (#146)", async () => {
    const res = await fetch(`${BASE_URL}/`);
    assertEquals(res.status, 200);
    const html = await res.text();

    // Linke Spalte: Angaben immer vollständig, Doku in eigenem Scrollbereich.
    assertEquals(html.includes('id="angaben-list"'), true);
    assertEquals(html.includes('id="doku-list"'), true);
    assertEquals(html.includes("https://getbootstrap.com/"), true);
    assertEquals(html.includes("https://developer.mozilla.org/"), true);
    assertEquals(html.includes("https://www.w3schools.com/"), true);
    // Angaben werden nicht abgeschnitten.
    assertEquals(html.includes("text-truncate"), false);

    // Rechte Spalte: die Anmeldung, kein eigener Upload-Link.
    assertEquals(html.includes('id="abgabe-panel"'), true);
    assertEquals(html.includes('id="login-form"'), true);
    assertEquals(html.includes('id="ldap-results"'), true);
    assertEquals(html.includes('href="/upload"'), false);

    // Anonyme sehen keine Navigation, nur die Anmeldung.
    assertEquals(html.includes('id="main-nav"'), false);
    assertEquals(html.includes("Abmelden"), false);

    // Der Hero ist der globale Heimweg — auch ohne Navigation.
    assert(
        /<a id="hero-link"[^>]*href="\/"/.test(html),
        "Der Hero muss ein Link auf / sein",
    );
});

Deno.test("Aus /whoami führt der Hero zurück zur Startseite (#146)", async () => {
    const res = await fetch(`${BASE_URL}/whoami`);
    assertEquals(res.status, 200);
    const html = await res.text();

    // Die Seite selbst ist die Anmeldung ...
    assertEquals(html.includes('id="login-form"'), true);
    // ... und der Hero im Kopf ist der Weg zurück auf die Startseite.
    // Schüler haben keine Navigation, während des Examens ist das die
    // einzige Möglichkeit, wieder zum Abgabe-Panel zu kommen.
    assert(
        /<a id="hero-link"[^>]*href="\/"/.test(html),
        "Der Hero muss auf /whoami ein Link auf / sein",
    );
});

Deno.test("Schüler sieht Angaben und Abgabe ohne Navigation (#146)", async () => {
    clearExamState();
    const suffix = crypto.randomUUID().slice(0, 8);
    const studentEmail = `start-page-${suffix}@example.com`;
    await upsertFixtureUser({
        email: studentEmail,
        name: "Start Page Student",
        klasse: "5AHITM",
    });

    try {
        const cookie = await registerAndGetCookie(studentEmail);
        seedExamState("running");

        const res = await fetch(`${BASE_URL}/`, {
            headers: { Cookie: cookie },
        });
        assertEquals(res.status, 200);
        const html = await res.text();

        // Formular statt Maske, ohne Seitenwechsel und ohne Navigation.
        assertEquals(html.includes('id="abgabe-form"'), true);
        assertEquals(html.includes('id="exam-countdown"'), true);
        assertEquals(html.includes('id="login-form"'), false);
        assertEquals(html.includes('id="main-nav"'), false);
        assertEquals(html.includes('href="/admin/students"'), false);
        // Kein Abmelden mehr (#141): die Identität wechselt nur über die
        // Karte „Angemeldet als …" (/whoami), die Sitzung bleibt bestehen.
        assertEquals(html.includes("Abmelden"), false);
        assertEquals(html.includes('id="user-badge-panel"'), true);
        assertEquals(html.includes('href="/whoami"'), true);
        assertEquals(html.includes("Deine Abgabe"), true);
        assertEquals(html.includes("Abgabe hochladen"), true);
        // Angaben bleiben auch nach der Anmeldung sichtbar.
        assertEquals(html.includes('id="angaben-list"'), true);
        // Ohne Navigation ist der Hero der einzige Heimweg.
        assert(
            /<a id="hero-link"[^>]*href="\/"/.test(html),
            "Der Hero muss auch im Examen ein Link auf / sein",
        );
    } finally {
        clearExamState();
        await clearForensicsByUserEmail(studentEmail);
    }
});

Deno.test("GET /abgabe-panel liefert das Panel je nach Exam-Zustand (#160)", async () => {
    clearExamState();
    const suffix = crypto.randomUUID().slice(0, 8);
    const studentEmail = `abgabe-panel-${suffix}@example.com`;
    await upsertFixtureUser({
        email: studentEmail,
        name: "Panel Check Student",
        klasse: "5AHITM",
    });

    try {
        const cookie = await registerAndGetCookie(studentEmail);

        // Geschlossen: Hinweis statt Formular — und die Karte prüft selbst
        // nach, damit das Formular ohne Reload erscheint.
        const closedRes = await fetch(`${BASE_URL}/abgabe-panel`, {
            headers: { Cookie: cookie },
        });
        assertEquals(closedRes.status, 200);
        const closedHtml = await closedRes.text();
        assertEquals(closedHtml.includes('id="abgabe-form"'), false);
        assertEquals(closedHtml.includes('id="abgabe-closed"'), true);
        assertEquals(closedHtml.includes('hx-get="/abgabe-panel"'), true);
        assertEquals(closedHtml.includes('hx-target="#abgabe-panel"'), true);
        assertEquals(
            closedHtml.includes('hx-trigger="mouseenter throttle:3s, click"'),
            true,
        );

        // Offen: dasselbe Fragment ist das Formular, ohne Trigger.
        seedExamState("running");
        const openRes = await fetch(`${BASE_URL}/abgabe-panel`, {
            headers: { Cookie: cookie },
        });
        assertEquals(openRes.status, 200);
        const openHtml = await openRes.text();
        assertEquals(openHtml.includes('id="abgabe-form"'), true);
        assertEquals(openHtml.includes('id="exam-countdown"'), true);
        assertEquals(openHtml.includes('id="abgabe-closed"'), false);
        assertEquals(openHtml.includes('hx-get="/abgabe-panel"'), false);
    } finally {
        clearExamState();
        await clearForensicsByUserEmail(studentEmail);
    }
});

Deno.test("static/toast.js baut den Dialog ohne innerHTML (#152)", async () => {
    const res = await fetch(`${BASE_URL}/static/toast.js`);
    assertEquals(res.status, 200);
    const source = await res.text();

    // Servermeldungen und schülerkontrollierte Dateinamen dürfen nie als
    // HTML interpretiert werden — Aufbau ausschließlich über DOM-APIs.
    assertEquals(source.includes("innerHTML"), false);
    assertEquals(source.includes("textContent"), true);
});

Deno.test("GET /upload leitet auf die Startseite (#146)", async () => {
    const res = await fetch(`${BASE_URL}/upload`, { redirect: "manual" });
    assertEquals([301, 302, 303, 307, 308].includes(res.status), true);
    assertEquals(res.headers.get("location"), "/");
    await res.text(); // consume body to avoid resource leak
});

Deno.test("Anmeldesperre: keine Neuanmeldung als Schüler im Examen, Lehrperson ausgenommen (#146)", async () => {
    clearExamState();
    const suffix = crypto.randomUUID().slice(0, 8);
    const studentEmail = `login-lock-${suffix}@example.com`;
    const teacherEmail = "grafg@spengergasse.at";
    await upsertFixtureUser({
        email: studentEmail,
        name: "Lock Student",
        klasse: "5AHITM",
    });

    const register = (email: string) =>
        fetch(`${BASE_URL}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `email=${encodeURIComponent(email)}`,
        });

    const registrationWindow = (cookie: string, action: "open" | "close") =>
        fetch(`${BASE_URL}/api/exam/registration-window`, {
            method: "POST",
            headers: {
                "Cookie": cookie,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: `action=${action}`,
        });

    let adminCookie = "";
    try {
        adminCookie = await registerAndGetCookie(teacherEmail);
        seedExamState("running");

        // Schüler: abgelehnt, Meldung in der rechten Spalte, keine Sitzung.
        const blocked = await register(studentEmail);
        const blockedHtml = await blocked.text();
        assertEquals(blocked.status, 200);
        assertEquals(
            blockedHtml.includes("Während der Prüfung ist keine Neuanmeldung möglich."),
            true,
        );
        assertEquals(blockedHtml.includes('id="login-form"'), true);
        assertEquals(blocked.headers.get("set-cookie"), null);

        // Lehrperson kommt weiterhin hinein (Sessionverlust des Lehrers).
        const teacher = await register(teacherEmail);
        const teacherHtml = await teacher.text();
        assertEquals(teacher.status, 200);
        assertExists(teacher.headers.get("set-cookie"));
        assertEquals(teacherHtml.includes('id="abgabe-panel"'), true);

        // Notausgang: fünf Minuten Anmeldefenster.
        const openRes = await registrationWindow(adminCookie, "open");
        const openHtml = await openRes.text();
        assertEquals(openRes.status, 200);
        assertEquals(openHtml.includes("Anmeldefenster ist offen"), true);

        const allowed = await register(studentEmail);
        await allowed.text();
        assertEquals(allowed.status, 200);
        assertExists(allowed.headers.get("set-cookie"));

        // Fenster wieder zu: erneute Anmeldung ist gesperrt.
        const closeRes = await registrationWindow(adminCookie, "close");
        const closeHtml = await closeRes.text();
        assertEquals(closeRes.status, 200);
        assertEquals(closeHtml.includes("Anmeldefenster ist offen"), false);

        const blockedAgain = await register(studentEmail);
        const blockedAgainHtml = await blockedAgain.text();
        assertEquals(
            blockedAgainHtml.includes("Während der Prüfung ist keine Neuanmeldung möglich."),
            true,
        );
        assertEquals(blockedAgain.headers.get("set-cookie"), null);
    } finally {
        if (adminCookie) {
            await (await registrationWindow(adminCookie, "close")).text();
        }
        clearExamState();
        await clearForensicsByUserEmail(studentEmail);
    }
});

Deno.test("Anmeldesperre erreicht auch angemeldete Schüler (#152)", async () => {
    clearExamState();
    const suffix = crypto.randomUUID().slice(0, 8);
    const studentEmail = `relogin-lock-${suffix}@example.com`;
    const otherEmail = `relogin-lock-other-${suffix}@example.com`;
    await upsertFixtureUser({
        email: studentEmail,
        name: "Relogin Lock Student",
        klasse: "5AHITM",
    });
    await upsertFixtureUser({
        email: otherEmail,
        name: "Relogin Other Student",
        klasse: "5AHITM",
    });

    try {
        // Angemeldet vor dem Examen — die Sitzung bleibt bestehen.
        const cookie = await registerAndGetCookie(studentEmail);
        seedExamState("running");

        // Namenswechsel im Examen: abgelehnt, aber der Schüler sieht das
        // Abgabe-Panel (nicht die Anmeldung) und dort die Sperrmeldung.
        const blocked = await fetch(`${BASE_URL}/register`, {
            method: "POST",
            headers: {
                "Cookie": cookie,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: `email=${encodeURIComponent(otherEmail)}`,
        });
        const blockedHtml = await blocked.text();

        assertEquals(blocked.status, 200);
        assertEquals(
            blockedHtml.includes("Während der Prüfung ist keine Neuanmeldung möglich."),
            true,
        );
        assertEquals(blockedHtml.includes('id="login-error"'), true);
        // Die rechte Spalte bleibt das Abgabe-Panel, nicht die Anmeldung.
        assertEquals(blockedHtml.includes('id="abgabe-panel"'), true);
        assertEquals(blockedHtml.includes('id="login-form"'), false);
        // Kein Wechsel: die bestehende Sitzung bleibt, keine neue wird gesetzt.
        assertEquals(blocked.headers.get("set-cookie"), null);
    } finally {
        clearExamState();
        await clearForensicsByUserEmail(studentEmail);
        await clearForensicsByUserEmail(otherEmail);
    }
});

Deno.test("GET /unterlagen - Unterlagen directory", async () => {
    const res = await fetch(`${BASE_URL}/unterlagen`);
    // May return 200 or 404 depending on directory contents
    assertExists(res.status);
    await res.text(); // consume body
});

Deno.test("Admin navigation and live file type updates", async () => {
    const originalTypes = [...config.PERMITTED_FILETYPES];
    const originalThemeKey = service.admin.getCurrentThemeKey();
    const testEmail = "grafg@spengergasse.at";

    const anonymousRes = await fetch(`${BASE_URL}/whoami`);
    const anonymousHtml = await anonymousRes.text();
    assertEquals(anonymousHtml.includes('href="/admin/students"'), false);
    assertEquals(anonymousHtml.includes('href="/admin/application"'), false);

    const registerRes = await fetch(`${BASE_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `email=${encodeURIComponent(testEmail)}`,
    });
    await registerRes.text();
    const cookie = registerRes.headers.get("set-cookie");
    assertExists(cookie);

    const homeRes = await fetch(`${BASE_URL}/`, {
        headers: { "Cookie": cookie },
    });
    const homeHtml = await homeRes.text();
    assertEquals(homeHtml.includes(">Schüler<"), true);
    assertEquals(homeHtml.includes(">Admin<"), true);
    assertEquals(homeHtml.includes('href="/admin/students"'), true);
    assertEquals(homeHtml.includes('href="/admin/application"'), true);
    assertEquals(homeHtml.includes(">Dateitypen<"), false);

    const settingsRes = await fetch(`${BASE_URL}/admin/application`, {
        headers: { "Cookie": cookie },
    });
    const settingsHtml = await settingsRes.text();
    assertEquals(settingsRes.status, 200);
    assertEquals(settingsHtml.includes("Erlaubte Dateitypen"), true);
    assertEquals(settingsHtml.includes("Dokumentationsserver-Firewall-Regel"), true);
    // Ohne OPNsense-Credentials ist die Firewall-Steuerung deaktiviert.
    assertEquals(settingsHtml.includes("Nicht konfiguriert"), true);
    assertEquals(settingsHtml.includes("exam-firewall-modal-data"), true);
    assertEquals(settingsHtml.includes("Abgaben &amp; Datenbank herunterladen (TAR.GZ)"), true);
    assertEquals(settingsHtml.includes("Abgaben-Verzeichnis leeren"), true);
    // Admin-Dashboard (#157): drei thematische Gruppen, je Gruppe eigene Karten.
    for (const group of ["exam", "unterlagen", "zugang"]) {
        assertEquals(
            settingsHtml.includes(`id="admin-group-${group}"`),
            true,
            `Gruppe ${group} fehlt`,
        );
    }
    for (
        const card of [
            "abgaben",
            "unterlagen",
            "filetypes",
            "adminmac",
            "theme",
            "cleanup",
        ]
    ) {
        assertEquals(
            settingsHtml.includes(`id="admin-card-${card}"`),
            true,
            `Karte ${card} fehlt`,
        );
    }
    assertEquals(settingsHtml.includes('id="exam-admin-panel"'), true);
    assertEquals(settingsHtml.includes(">Anwenden<"), true);
    assertEquals(settingsHtml.includes(">Alien<"), true);
    assertEquals(settingsHtml.includes(">Crocus<"), true);

    const availableThemes = service.admin.listAvailableThemes();
    const alternateTheme = availableThemes.find((theme) => theme.key !== originalThemeKey) ?? availableThemes[0];
    assertExists(alternateTheme);

    const themeRes = await fetch(`${BASE_URL}/admin/theme`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": cookie,
        },
        body: `theme=${encodeURIComponent(alternateTheme.key)}`,
    });
    const themeHtml = await themeRes.text();
    assertEquals(themeRes.status, 200);
    assertEquals(themeHtml.includes(`Theme aktiviert: ${alternateTheme.label}`), true);

    const adminRes = await fetch(`${BASE_URL}/admin/students`, {
        headers: { "Cookie": cookie },
    });
    const adminHtml = await adminRes.text();
    assertEquals(adminRes.status, 200);
    assertEquals(adminHtml.includes("Abgaben &amp; Datenbank herunterladen (TAR.GZ)"), false);
    assertEquals(adminHtml.includes("Abgaben-Verzeichnis leeren"), false);
    // Der Zeitfilter ist eine Zeile (#157); die Feldnamen sind der
    // Vertrag mit `hx-include` in admin-report.hbs.
    assertEquals(adminHtml.includes('id="admin-time-filter"'), true);
    for (const field of ["startdate", "starttime", "enddate", "endtime"]) {
        assertEquals(
            adminHtml.includes(`name="${field}"`),
            true,
            `Zeitfilter-Feld ${field} fehlt`,
        );
    }
    // Tik-Polling-Panel (#145): im Testlauf ohne TIK_* klar als nicht
    // konfiguriert erkennbar, nicht als leeres WLAN.
    assertEquals(adminHtml.includes("MikroTik nicht konfiguriert"), true);

    // Die Firewall-Steuerung läuft ausschließlich über die OPNsense-API.
    // Ohne Credentials bleibt sie deaktiviert: POST muss mit einer deutschen
    // Meldung und non-2xx antworten, GET liefert das Panel im Zustand
    // „nicht konfiguriert".
    const toggleRes = await fetch(`${BASE_URL}/api/exammode`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": cookie,
        },
        body: "internet_active=on",
    });
    const toggleHtml = await toggleRes.text();
    assertEquals(toggleRes.status, 400);
    assertEquals(
        toggleHtml,
        "Die Exam-Sperre ist nicht konfiguriert (OPNSENSE_API_KEY und OPNSENSE_API_SECRET fehlen).",
    );

    // Der „Erneut sperren"-Knopf im Modal postet ohne Feld (leerer Body);
    // das muss die Validierung passieren und an der Konfiguration scheitern.
    const lockRes = await fetch(`${BASE_URL}/api/exammode`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": cookie,
        },
        body: "",
    });
    const lockHtml = await lockRes.text();
    assertEquals(lockRes.status, 400);
    assertEquals(
        lockHtml,
        "Die Exam-Sperre ist nicht konfiguriert (OPNSENSE_API_KEY und OPNSENSE_API_SECRET fehlen).",
    );

    const examModeRes = await fetch(`${BASE_URL}/api/exammode`, {
        headers: { "Cookie": cookie },
    });
    const examModeHtml = await examModeRes.text();
    assertEquals(examModeRes.status, 200);
    assertEquals(examModeHtml.includes("Nicht konfiguriert"), true);
    assertEquals(examModeHtml.includes('data-show="false"'), true);

    const updateRes = await fetch(`${BASE_URL}/admin/application`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": cookie,
        },
        body: "permitted_filetypes=.zip,%20pdf",
    });
    const updateHtml = await updateRes.text();
    assertEquals(updateRes.status, 200);
    assertEquals(updateHtml.includes(".pdf"), true);
    // Die Erfolgsmeldung steht über dem Raster (#157): nach dem Swap
    // scrollt die Seite nach oben, unten wäre sie ungesehen.
    assert(
        updateHtml.indexOf("Erlaubte Dateitypen aktualisiert") <
            updateHtml.indexOf('id="admin-groups"'),
        "Die Erfolgsmeldung muss über dem Admin-Raster stehen",
    );

    // Abgabe-Seite nur mit laufendem Examen vollständig prüfbar (#146:
    // Formular liegt auf der Startseite).
    seedExamState("running");

    const uploadRes = await fetch(`${BASE_URL}/`, {
        headers: { "Cookie": cookie },
    });
    const uploadHtml = await uploadRes.text();
    assertEquals(uploadHtml.includes(".pdf"), true);

    const restoreRes = await fetch(`${BASE_URL}/admin/application`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": cookie,
        },
        body: `permitted_filetypes=${encodeURIComponent(originalTypes.join(", "))}`,
    });
    await restoreRes.text();
    assertEquals(restoreRes.status, 200);

    if (originalThemeKey) {
        service.admin.applyTheme(originalThemeKey);
    }

    clearExamState();
});

// Dynamic test runner for all endpoints from JSON
Deno.test("All endpoints from endpoints.json respond", async (t) => {
    const testEmail = "grafg@spengergasse.at";
    const registerRes = await fetch(`${BASE_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `email=${encodeURIComponent(testEmail)}`,
    });
    await registerRes.text();
    const cookie = registerRes.headers.get("set-cookie");

    const isProtected = (path: string) =>
        path.startsWith("/admin/") || path === "/api/exammode" || path === "/unterlagen";

    const mayReturn404: Record<string, true> = {
        "/admin/logs": true,        // route was removed, always 404
    };

    for (const endpoint of endpoints.endpoints as Endpoint[]) {
        await t.step(
            `${endpoint.method} ${endpoint.path} - ${endpoint.description}`,
            async () => {
                const url = `${BASE_URL}${endpoint.path}`;
                const options: RequestInit = { method: endpoint.method };
                const headers: Record<string, string> = {};

                if (cookie) {
                    headers["Cookie"] = cookie;
                }

                if (endpoint.method === "POST" && endpoint.data) {
                    headers["Content-Type"] = "application/json";
                    options.body = JSON.stringify(endpoint.data);
                }

                if (Object.keys(headers).length > 0) {
                    options.headers = headers;
                }

                const res = await fetch(url, options);
                if (isProtected(endpoint.path)) {
                    if (mayReturn404[endpoint.path]) {
                        assertEquals([200, 404].includes(res.status), true);
                    } else {
                        assertEquals(res.status, 200);
                    }
                } else {
                    assertExists(res.status);
                }
                await res.text(); // consume body to avoid resource leak
            },
        );
    }
});

Deno.test("POST /upload - Authenticated upload with MD5 verification", async () => {
    const testEmail = "grafg@spengergasse.at";
    const originalTypes = [...config.PERMITTED_FILETYPES];
    let cookie: string | null = null;

    try {
        // Clear prior submissions to avoid canResubmit rejections
        db.exec(`DELETE FROM abgaben WHERE userId = (SELECT id FROM users WHERE email = '${testEmail}')`);

        // Uploads sind nur während Examenzeit erlaubt
        seedExamState("running");

        const registerRes = await fetch(`${BASE_URL}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `email=${encodeURIComponent(testEmail)}`,
        });
        await registerRes.text(); // consume body
        cookie = registerRes.headers.get("set-cookie");
        assertExists(cookie);

        const setTypesRes = await fetch(`${BASE_URL}/admin/application`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": cookie!,
            },
            body: "permitted_filetypes=zip,%20md",
        });
        await setTypesRes.text();
        assertEquals(setTypesRes.status, 200);

        const formData = new FormData();
        const file = new Blob([uploadZipBytes], { type: "application/zip" });
        formData.append("file", file, "test_md5.zip");

        const uploadRes = await fetch(`${BASE_URL}/upload`, {
            method: "POST",
            headers: { "Cookie": cookie! },
            body: formData,
        });
        assertEquals(uploadRes.status, 200);

        const html = await uploadRes.text();
        const md5Match = html.match(/<span class="font-monospace[^>]*>([a-f0-9]+)<\/span>/);
        assertExists(md5Match);
        const responseMd5 = md5Match[1];

        const filenameMatch = html.match(/<span class="fw-bold text-break[^"]*">([^<]+)<\/span>/);
        assertExists(filenameMatch);
        const filename = filenameMatch[1];

        const filePath = `${config.ABGABEN_DIR}/${filename}`;
        const fileContent = await Deno.readFile(filePath);
        const computedMd5 = computeMd5(fileContent);

        assertEquals(responseMd5, computedMd5);

        await Deno.remove(filePath);
    } finally {
        clearExamState();
        if (cookie) {
            const restoreRes = await fetch(`${BASE_URL}/admin/application`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Cookie": cookie,
                },
                body: `permitted_filetypes=${encodeURIComponent(originalTypes.join(", "))}`,
            });
            await restoreRes.text();
        } else {
            config.PERMITTED_FILETYPES = originalTypes;
        }
    }
});

Deno.test("POST /upload - rejects zip with non-zip content", async () => {
    const testEmail = "grafg@spengergasse.at";
    const originalTypes = [...config.PERMITTED_FILETYPES];
    let cookie: string | null = null;

    try {
        db.exec(`DELETE FROM abgaben WHERE userId = (SELECT id FROM users WHERE email = '${testEmail}')`);

        // Uploads sind nur während Examenzeit erlaubt
        seedExamState("running");

        const registerRes = await fetch(`${BASE_URL}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `email=${encodeURIComponent(testEmail)}`,
        });
        await registerRes.text();
        cookie = registerRes.headers.get("set-cookie");
        assertExists(cookie);

        const setTypesRes = await fetch(`${BASE_URL}/admin/application`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": cookie,
            },
            body: "permitted_filetypes=zip,%20md",
        });
        await setTypesRes.text();
        assertEquals(setTypesRes.status, 200);

        const formData = new FormData();
        const file = new Blob(["not really a zip"], { type: "application/zip" });
        formData.append("file", file, "fake.zip");

        const uploadRes = await fetch(`${BASE_URL}/upload`, {
            method: "POST",
            headers: { "Cookie": cookie! },
            body: formData,
        });

        assertEquals(uploadRes.status, 415);
        const html = await uploadRes.text();
        assertEquals(html.includes("Der Dateiinhalt konnte nicht als .zip erkannt werden."), true);
    } finally {
        clearExamState();
        if (cookie) {
            const restoreRes = await fetch(`${BASE_URL}/admin/application`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Cookie": cookie,
                },
                body: `permitted_filetypes=${encodeURIComponent(originalTypes.join(", "))}`,
            });
            await restoreRes.text();
        } else {
            config.PERMITTED_FILETYPES = originalTypes;
        }
    }
});

Deno.test("POST /upload - multipart .md with empty MIME type (Chrome-style)", async () => {
    const testEmail = "grafg@spengergasse.at";
    const originalTypes = [...config.PERMITTED_FILETYPES];
    let cookie: string | null = null;

    try {
        db.exec(`DELETE FROM abgaben WHERE userId = (SELECT id FROM users WHERE email = '${testEmail}')`);

        // Uploads sind nur während Examenzeit erlaubt
        seedExamState("running");

        const registerRes = await fetch(`${BASE_URL}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `email=${encodeURIComponent(testEmail)}`,
        });
        await registerRes.text();
        cookie = registerRes.headers.get("set-cookie");
        assertExists(cookie);

        const setTypesRes = await fetch(`${BASE_URL}/admin/application`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": cookie!,
            },
            body: "permitted_filetypes=md",
        });
        await setTypesRes.text();
        assertEquals(setTypesRes.status, 200);

        // Chrome often sends file.type = "" for .md files
        const formData = new FormData();
        const file = new Blob(["# Test Markdown\n\nThis is a test."], { type: "" });
        formData.append("file", file, "test.md");

        const uploadRes = await fetch(`${BASE_URL}/upload`, {
            method: "POST",
            headers: { "Cookie": cookie! },
            body: formData,
        });

        assertEquals(uploadRes.status, 200, "Upload with empty MIME type should succeed");
        const html = await uploadRes.text();
        assertEquals(html.includes("test.md") || html.includes("Erfolgreich"), true);

        // Cleanup
        const files = Deno.readDir(config.ABGABEN_DIR);
        for await (const f of files) {
            if (f.name.includes("test.md")) {
                await Deno.remove(`${config.ABGABEN_DIR}/${f.name}`);
            }
        }
    } finally {
        clearExamState();
        if (cookie) {
            const restoreRes = await fetch(`${BASE_URL}/admin/application`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Cookie": cookie,
                },
                body: `permitted_filetypes=${encodeURIComponent(originalTypes.join(", "))}`,
            });
            await restoreRes.text();
        } else {
            config.PERMITTED_FILETYPES = originalTypes;
        }
    }
});

Deno.test("POST /upload - multipart .md with text/plain MIME type", async () => {
    const testEmail = "grafg@spengergasse.at";
    const originalTypes = [...config.PERMITTED_FILETYPES];
    let cookie: string | null = null;

    try {
        db.exec(`DELETE FROM abgaben WHERE userId = (SELECT id FROM users WHERE email = '${testEmail}')`);

        // Uploads sind nur während Examenzeit erlaubt
        seedExamState("running");

        const registerRes = await fetch(`${BASE_URL}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `email=${encodeURIComponent(testEmail)}`,
        });
        await registerRes.text();
        cookie = registerRes.headers.get("set-cookie");
        assertExists(cookie);

        const setTypesRes = await fetch(`${BASE_URL}/admin/application`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": cookie!,
            },
            body: "permitted_filetypes=md",
        });
        await setTypesRes.text();
        assertEquals(setTypesRes.status, 200);

        // Some browsers send text/plain for .md files
        const formData = new FormData();
        const file = new Blob(["# Another Test\n\nMore content."], { type: "text/plain" });
        formData.append("file", file, "another.md");

        const uploadRes = await fetch(`${BASE_URL}/upload`, {
            method: "POST",
            headers: { "Cookie": cookie! },
            body: formData,
        });

        assertEquals(uploadRes.status, 200, "Upload with text/plain MIME type should succeed");
        const html = await uploadRes.text();
        assertEquals(html.includes("another.md") || html.includes("Erfolgreich"), true);

        // Cleanup
        const files = Deno.readDir(config.ABGABEN_DIR);
        for await (const f of files) {
            if (f.name.includes("another.md")) {
                await Deno.remove(`${config.ABGABEN_DIR}/${f.name}`);
            }
        }
    } finally {
        clearExamState();
        if (cookie) {
            const restoreRes = await fetch(`${BASE_URL}/admin/application`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Cookie": cookie,
                },
                body: `permitted_filetypes=${encodeURIComponent(originalTypes.join(", "))}`,
            });
            await restoreRes.text();
        } else {
            config.PERMITTED_FILETYPES = originalTypes;
        }
    }
});

Deno.test("GET /admin/students shows no anomalies empty state", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const adminEmail = `empty-admin-${suffix}@example.com`;

    try {
        await seedNoAnomaliesScenario({
            ip: LOCAL_TEST_IP,
            email: adminEmail,
            name: "Empty State Admin",
            klasse: "LehrendeR",
            at: new Date(),
            withCookiePresent: true,
        });

        const registerRes = await fetch(`${BASE_URL}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `email=${encodeURIComponent(adminEmail)}`,
        });
        await registerRes.text();
        const cookie = registerRes.headers.get("set-cookie");
        assertExists(cookie);

        const res = await fetch(`${BASE_URL}/admin/students`, {
            headers: { "Cookie": cookie },
        });
        const html = await res.text();

        assertEquals(res.status, 200);
        assertEquals(html.includes("Es gibt keine Anomalien."), true);
        assertEquals(html.includes("No anomalies detected."), false);
    } finally {
        await clearForensicsByIp(LOCAL_TEST_IP);
        await clearForensicsByUserEmail(adminEmail);
    }
});

Deno.test("GET /admin/students shows user anomalies without shared-IP anomalies", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const userEmail = `students-anomaly-${suffix}@example.com`;
    const firstIp = `203.0.113.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const secondIp = `198.51.100.${Number.parseInt(suffix.slice(2, 4), 16) % 100 + 10}`;
    const seenAt = new Date();
    // Ohne Zeitangabe rastet die Seite die Startzeit auf eine Schulstunde
    // aus `spg_times` ein — vor der ersten Stunde (also abends/nachts) liegt
    // das Fenster dann in der Zukunft und die eben geschriebenen Zeilen
    // fallen heraus. Der Zeitraum wird deshalb explizit mitgegeben.
    const rangeStart = new Date(seenAt.getTime() - 5 * 60_000);
    const rangeEnd = new Date(seenAt.getTime() + 5 * 60_000);
    const rangeQuery = new URLSearchParams({
        startdate: dateString(rangeStart.toISOString()),
        starttime: timeString(rangeStart.toISOString()),
        enddate: dateString(rangeEnd.toISOString()),
        endtime: timeString(rangeEnd.toISOString()),
    }).toString();

    try {
        const adminRegisterRes = await fetch(`${BASE_URL}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `email=${encodeURIComponent("grafg@spengergasse.at")}`,
        });
        await adminRegisterRes.text();
        const cookie = adminRegisterRes.headers.get("set-cookie");
        assertExists(cookie);

        const user = await usersRepo.upsert({
            email: userEmail,
            name: "Students Anomaly",
            klasse: "5AHITM",
        });

        ipfactRepo.registerSeen(firstIp, seenAt);
        ipfactRepo.registerSeen(secondIp, seenAt);
        registrationsRepo.create(firstIp, user.id, seenAt);
        registrationsRepo.create(secondIp, user.id, seenAt);

        const res = await fetch(`${BASE_URL}/admin/students?${rangeQuery}`, {
            headers: { "Cookie": cookie },
        });
        const html = await res.text();

        assertEquals(res.status, 200);
        assertEquals(html.includes("Es gibt keine Anomalien."), false);
        assertEquals(html.includes("Nach Benutzer"), true);
        assertEquals(html.includes("Students Anomaly"), true);
        assertEquals(html.includes(firstIp), true);
        assertEquals(html.includes(secondIp), true);
    } finally {
        db.exec(`DELETE FROM registrations WHERE ip IN ('${firstIp}', '${secondIp}')`);
        db.exec(`DELETE FROM ipfact WHERE ip IN ('${firstIp}', '${secondIp}')`);
        usersRepo.deleteByEmail(userEmail);
    }
});

Deno.test("Admin: MAC-Freigabe anlegen, ablehnen, entfernen (#147)", async () => {
    const suffix = crypto.randomUUID().slice(0, 6);
    const mac = `02:00:01:${suffix.slice(0, 2)}:${suffix.slice(2, 4)}:${suffix.slice(4, 6)}`;
    const comment = `htmx-test-${suffix}`;
    const cookie = await registerAndGetCookie("grafg@spengergasse.at");

    const postMac = (path: string, body: string) =>
        fetch(`${BASE_URL}${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": cookie,
            },
            body,
        });

    try {
        // Anlegen: die MAC erscheint kanonisch samt Kommentar in der Liste.
        const addRes = await postMac(
            "/admin/adminmac",
            `mac=${encodeURIComponent(mac.toUpperCase())}&comment=${
                encodeURIComponent(comment)
            }`,
        );
        const addHtml = await addRes.text();
        assertEquals(addRes.status, 200);
        assertEquals(addHtml.includes(`MAC-Adresse freigegeben: ${mac}`), true);
        assertEquals(addHtml.includes(comment), true);
        assertEquals(addHtml.includes("Admin-Freigabe per MAC"), true);

        // Doppelte Freigabe: Fehler als reiner Text für den Toast (#152).
        const duplicateRes = await postMac(
            "/admin/adminmac",
            `mac=${encodeURIComponent(mac)}&comment=${encodeURIComponent(comment)}`,
        );
        const duplicateHtml = await duplicateRes.text();
        assertEquals(duplicateRes.status, 400);
        assertEquals(
            duplicateHtml.includes(`Die MAC-Adresse ${mac} ist bereits freigegeben.`),
            true,
        );
        assertEquals(duplicateHtml.includes("<html"), false);
        assertEquals(duplicateHtml.includes("<div"), false);

        // Ungültige Schreibweise wird abgelehnt, nicht gespeichert.
        const invalidRes = await postMac(
            "/admin/adminmac",
            "mac=aa%3Abb%3Acc%3Add%3Aee&comment=kaputt",
        );
        const invalidHtml = await invalidRes.text();
        assertEquals(invalidRes.status, 400);
        assertEquals(invalidHtml.includes("Ungültige MAC-Adresse"), true);
        // Der globale Toast-Handler zeigt `responseText` — HTML wäre ein
        // komplettes Panel im Dialog (#152).
        assertEquals(
            invalidRes.headers.get("content-type"),
            "text/plain; charset=UTF-8",
        );
        assertEquals(invalidHtml.includes("<html"), false);
        assertEquals(invalidHtml.includes("<div"), false);

        // Leerer Kommentar ist nicht erlaubt.
        const noCommentRes = await postMac(
            "/admin/adminmac",
            `mac=${encodeURIComponent(mac)}&comment=`,
        );
        const noCommentHtml = await noCommentRes.text();
        assertEquals(noCommentRes.status, 400);
        assertEquals(noCommentHtml.includes("Bitte einen Kommentar angeben"), true);

        // Entfernen: die MAC verschwindet aus der Liste.
        const deleteRes = await postMac(
            "/admin/adminmac/delete",
            `mac=${encodeURIComponent(mac)}`,
        );
        const deleteHtml = await deleteRes.text();
        assertEquals(deleteRes.status, 200);
        assertEquals(deleteHtml.includes(`MAC-Freigabe entfernt: ${mac}`), true);
        assertEquals(deleteHtml.includes(comment), false);

        // Erneutes Entfernen meldet den Fehler, statt still zu gelingen.
        const deleteAgainRes = await postMac(
            "/admin/adminmac/delete",
            `mac=${encodeURIComponent(mac)}`,
        );
        const deleteAgainHtml = await deleteAgainRes.text();
        assertEquals(deleteAgainRes.status, 400);
        assertEquals(
            deleteAgainHtml.includes(`Die MAC-Adresse ${mac} war nicht freigegeben.`),
            true,
        );
    } finally {
        db.exec(`DELETE FROM adminmac WHERE mac = '${mac}'`);
    }
});

Deno.test("Schüler von freigegebener MAC wird nicht Admin (#147)", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const studentEmail = `mac-student-${suffix}@example.com`;
    const mac = `02:00:02:${suffix.slice(0, 2)}:${suffix.slice(2, 4)}:${suffix.slice(4, 6)}`;

    try {
        await upsertFixtureUser({
            email: studentEmail,
            name: "Mac Student",
            klasse: "5AHITM",
        });
        // Die Test-IP ist mit genau dieser MAC gesehen und die MAC ist
        // freigegeben — der Login bleibt trotzdem ohne Admin-Rechte.
        ipfactRepo.registerSeen(LOCAL_TEST_IP, new Date(), mac);
        db.prepare("INSERT INTO adminmac (mac, comment, created_at) VALUES (?, ?, ?)")
            .run(mac, "schueler-geraet", new Date().toISOString());

        const cookie = await registerAndGetCookie(studentEmail);

        const adminRes = await fetch(`${BASE_URL}/admin/application`, {
            headers: { "Cookie": cookie },
        });
        await adminRes.text();
        assertEquals(adminRes.status, 403);

        const macRes = await fetch(`${BASE_URL}/admin/adminmac`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": cookie,
            },
            body: `mac=${encodeURIComponent(mac)}&comment=fremd`,
        });
        await macRes.text();
        assertEquals(macRes.status, 403);

        const homeRes = await fetch(`${BASE_URL}/`, {
            headers: { "Cookie": cookie },
        });
        const homeHtml = await homeRes.text();
        assertEquals(homeRes.status, 200);
        assertEquals(homeHtml.includes('href="/admin/application"'), false);
    } finally {
        db.exec(`DELETE FROM adminmac WHERE mac = '${mac}'`);
        await clearForensicsByIp(LOCAL_TEST_IP);
        await clearForensicsByUserEmail(studentEmail);
    }
});

// --- Admin-Upload für Unterlagen (#134) -----------------------------------
//
// Die Tests arbeiten im echten `UNTERLAGEN_DIR` des Entwicklungsservers.
// Der Inhalt wird vorher gesichert und im `finally` wiederhergestellt,
// damit ein Testlauf keine vorhandenen Angaben vernichtet.

type UnterlagenSnapshot = { name: string; bytes: Uint8Array }[];

async function snapshotUnterlagen(): Promise<UnterlagenSnapshot> {
    const snapshot: UnterlagenSnapshot = [];
    for await (const entry of Deno.readDir(config.UNTERLAGEN_DIR)) {
        if (!entry.isFile) continue;
        snapshot.push({
            name: entry.name,
            bytes: await Deno.readFile(`${config.UNTERLAGEN_DIR}/${entry.name}`),
        });
    }
    return snapshot;
}

async function restoreUnterlagen(snapshot: UnterlagenSnapshot): Promise<void> {
    for await (const entry of Deno.readDir(config.UNTERLAGEN_DIR)) {
        if (entry.isFile) {
            await Deno.remove(`${config.UNTERLAGEN_DIR}/${entry.name}`);
        }
    }
    for (const file of snapshot) {
        await Deno.writeFile(`${config.UNTERLAGEN_DIR}/${file.name}`, file.bytes);
    }
}

async function uploadUnterlage(
    cookie: string,
    filename: string,
    content: string,
    options: { type?: string; replace?: boolean } = {},
): Promise<Response> {
    const form = new FormData();
    form.append(
        "file",
        new File([content], filename, { type: options.type ?? "text/markdown" }),
    );
    if (options.replace) {
        form.append("replace_existing", "on");
    }
    return await fetch(`${BASE_URL}/admin/unterlagen`, {
        method: "POST",
        headers: { "Cookie": cookie },
        body: form,
    });
}

Deno.test("Admin-Upload Unterlagen: funktioniert außerhalb des Examensfensters (#134)", async () => {
    const snapshot = await snapshotUnterlagen();
    const cookie = await registerAndGetCookie("grafg@spengergasse.at");

    // Kein laufendes Examen: das Gating aus #131 gilt nur für Schüler.
    clearExamState();

    try {
        const res = await uploadUnterlage(cookie, "angabe.md", "# Angabe 1\n");
        const html = await res.text();
        assertEquals(res.status, 200);
        assertEquals(html.includes("Unterlage gespeichert: angabe.md"), true);
        assertEquals(html.includes("Unterlagen (Angaben)"), true);
        assertEquals(html.includes('hx-encoding="multipart/form-data"'), true);
        assertEquals(html.includes("Vorhandene Unterlagen"), true);
        assertEquals(html.includes("angabe.md"), true);

        assertEquals(
            await Deno.readTextFile(`${config.UNTERLAGEN_DIR}/angabe.md`),
            "# Angabe 1\n",
        );

        // Die Schülerseite liest das Verzeichnis bei jedem Rendern neu.
        const homeHtml = await (await fetch(`${BASE_URL}/`)).text();
        assertEquals(homeHtml.includes('id="angaben-list"'), true);
        assertEquals(homeHtml.includes("angabe.md"), true);

        // Der Schüler-Download bleibt außerhalb des Examens gesperrt.
        const gated = await fetch(`${BASE_URL}/unterlagen/angabe.md`, {
            headers: { "Cookie": cookie },
        });
        await gated.text();
        assertEquals(gated.status, 403);
    } finally {
        clearExamState();
        await restoreUnterlagen(snapshot);
    }
});

Deno.test("Admin-Unterlagen: Schüler dürfen weder hochladen noch löschen (#134)", async () => {
    const snapshot = await snapshotUnterlagen();
    const suffix = crypto.randomUUID().slice(0, 8);
    const studentEmail = `unterlagen-student-${suffix}@example.com`;

    await upsertFixtureUser({
        email: studentEmail,
        name: "Unterlagen Student",
        klasse: "5AHITM",
    });
    await Deno.writeTextFile(`${config.UNTERLAGEN_DIR}/bestehend.md`, "# Alt\n");

    try {
        const cookie = await registerAndGetCookie(studentEmail);

        const uploadRes = await uploadUnterlage(cookie, "fremd.md", "# Fremd\n");
        await uploadRes.text();
        assertEquals(uploadRes.status, 403);

        const deleteRes = await fetch(`${BASE_URL}/admin/unterlagen/delete`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": cookie,
            },
            body: "filename=bestehend.md",
        });
        await deleteRes.text();
        assertEquals(deleteRes.status, 403);

        const deleteAllRes = await fetch(
            `${BASE_URL}/admin/unterlagen/delete-all`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Cookie": cookie,
                },
                body: "confirm_delete_all=unterlagen-loeschen",
            },
        );
        await deleteAllRes.text();
        assertEquals(deleteAllRes.status, 403);

        // Nichts wurde angelegt oder gelöscht.
        assertEquals(
            await Deno.readTextFile(`${config.UNTERLAGEN_DIR}/bestehend.md`),
            "# Alt\n",
        );
        await assertRejects(() =>
            Deno.stat(`${config.UNTERLAGEN_DIR}/fremd.md`)
        );
    } finally {
        await clearForensicsByUserEmail(studentEmail);
        await restoreUnterlagen(snapshot);
    }
});

Deno.test("Admin-Unterlagen: Dateityp, Inhalt, Pfadanteile und Ersetzen (#134)", async () => {
    const snapshot = await snapshotUnterlagen();
    const cookie = await registerAndGetCookie("grafg@spengergasse.at");

    try {
        // Endung nicht in UNTERLAGEN_PERMITTED_FILETYPES.
        const txtRes = await uploadUnterlage(cookie, "angabe.txt", "# Angabe\n", {
            type: "text/plain",
        });
        const txtMessage = await txtRes.text();
        assertEquals(txtRes.status, 415);
        assertEquals(txtMessage, "Für Unterlagen sind nur .md Dateien erlaubt.");

        // Endung passt, Inhalt nicht (Content-Sniffing wie bei Abgaben).
        const sniffForm = new FormData();
        sniffForm.append(
            "file",
            new File([uploadZipBytes], "angabe.md", { type: "text/markdown" }),
        );
        const sniffRes = await fetch(`${BASE_URL}/admin/unterlagen`, {
            method: "POST",
            headers: { "Cookie": cookie },
            body: sniffForm,
        });
        const sniffMessage = await sniffRes.text();
        assertEquals(sniffRes.status, 415);
        assertEquals(
            sniffMessage.includes("Der Dateiinhalt passt nicht zu .md."),
            true,
        );

        // Pfadanteile im Dateinamen verlassen das Verzeichnis nicht.
        const traversalRes = await uploadUnterlage(
            cookie,
            "../entwischt.md",
            "# boese\n",
        );
        const traversalMessage = await traversalRes.text();
        assertEquals(traversalRes.status, 400);
        assertEquals(traversalMessage.includes("ist nicht zulässig"), true);
        await assertRejects(() =>
            Deno.stat(`${config.UNTERLAGEN_DIR}/../entwischt.md`)
        );

        // Ersetzen ohne Bestätigung ändert nichts.
        await Deno.writeTextFile(
            `${config.UNTERLAGEN_DIR}/angabe.md`,
            "# Alt\n",
        );
        const noConfirmRes = await uploadUnterlage(
            cookie,
            "angabe.md",
            "# Neu\n",
        );
        const noConfirmMessage = await noConfirmRes.text();
        assertEquals(noConfirmRes.status, 409);
        assertEquals(noConfirmMessage.includes("existiert bereits"), true);
        assertEquals(
            await Deno.readTextFile(`${config.UNTERLAGEN_DIR}/angabe.md`),
            "# Alt\n",
        );

        // Mit Bestätigung wird ersetzt.
        const confirmRes = await uploadUnterlage(
            cookie,
            "angabe.md",
            "# Neu\n",
            { replace: true },
        );
        await confirmRes.text();
        assertEquals(confirmRes.status, 200);
        assertEquals(
            await Deno.readTextFile(`${config.UNTERLAGEN_DIR}/angabe.md`),
            "# Neu\n",
        );

        // Einzellöschen.
        const deleteRes = await fetch(`${BASE_URL}/admin/unterlagen/delete`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": cookie,
            },
            body: `filename=${encodeURIComponent("angabe.md")}`,
        });
        const deleteMessage = await deleteRes.text();
        assertEquals(deleteRes.status, 200);
        assertEquals(deleteMessage.includes("Unterlage gelöscht: angabe.md"), true);
        await assertRejects(() =>
            Deno.stat(`${config.UNTERLAGEN_DIR}/angabe.md`)
        );
    } finally {
        await restoreUnterlagen(snapshot);
    }
});

Deno.test("Admin-Unterlagen: alles löschen braucht eine Bestätigung (#134)", async () => {
    const snapshot = await snapshotUnterlagen();
    const cookie = await registerAndGetCookie("grafg@spengergasse.at");

    try {
        await Deno.writeTextFile(`${config.UNTERLAGEN_DIR}/angabe-a.md`, "# A\n");
        await Deno.writeTextFile(`${config.UNTERLAGEN_DIR}/angabe-b.md`, "# B\n");

        const refusedRes = await fetch(
            `${BASE_URL}/admin/unterlagen/delete-all`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Cookie": cookie,
                },
                body: "confirm_delete_all=nein",
            },
        );
        const refusedMessage = await refusedRes.text();
        assertEquals(refusedRes.status, 400);
        assertEquals(
            refusedMessage,
            "Ungültige Anfrage für das Löschen der Unterlagen.",
        );
        assertEquals(
            await Deno.readTextFile(`${config.UNTERLAGEN_DIR}/angabe-a.md`),
            "# A\n",
        );

        const res = await fetch(`${BASE_URL}/admin/unterlagen/delete-all`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": cookie,
            },
            body: "confirm_delete_all=unterlagen-loeschen",
        });
        const html = await res.text();
        assertEquals(res.status, 200);
        assertEquals(
            html.includes("Alle Unterlagen wurden gelöscht (2 Dateien)."),
            true,
        );

        for await (const entry of Deno.readDir(config.UNTERLAGEN_DIR)) {
            assertEquals(entry.isFile, false, `Nicht gelöscht: ${entry.name}`);
        }

        // Die Schülerseite zeigt den deutschen Leerzustand.
        const homeHtml = await (await fetch(`${BASE_URL}/`)).text();
        assertEquals(homeHtml.includes("Es liegen noch keine Angaben bereit."), true);
    } finally {
        await restoreUnterlagen(snapshot);
    }
});

async function registerAndGetCookie(email: string): Promise<string> {
    const registerRes = await fetch(`${BASE_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `email=${encodeURIComponent(email)}`,
    });
    await registerRes.text(); // consume body to avoid resource leak
    const cookie = registerRes.headers.get("set-cookie");
    assertExists(cookie);
    return cookie;
}

async function postExamForm(
    cookie: string,
    path: string,
    body: string,
): Promise<Response> {
    return await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
            "Cookie": cookie,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
    });
}

type ExamStateResponse = {
    status: string;
    remaining_seconds: number;
};

async function getExamState(cookie: string): Promise<ExamStateResponse> {
    const res = await fetch(`${BASE_URL}/api/exam/state`, {
        headers: { "Cookie": cookie },
    });
    assertEquals(res.status, 200);
    return await res.json();
}

Deno.test("Router-Split: /exammode am Root ist nach dem Split 404", async () => {
    const res = await fetch(`${BASE_URL}/exammode`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "internet_active=on",
    });
    await res.text(); // consume body to avoid resource leak
    assertEquals(res.status, 404);
});

Deno.test("requireAdmin: alle /admin-Routen liefern ohne Admin 403", async () => {
    const adminPaths: Array<[string, "GET" | "POST"]> = [
        ["/admin/students", "GET"],
        ["/admin/application", "GET"],
        ["/admin/application", "POST"],
        ["/admin/ip-detail?ip=127.0.0.1", "GET"],
        ["/admin/theme", "POST"],
        ["/admin/adminmac", "POST"],
        ["/admin/adminmac/delete", "POST"],
        ["/admin/unterlagen", "POST"],
        ["/admin/unterlagen/delete", "POST"],
        ["/admin/unterlagen/delete-all", "POST"],
        ["/admin/download-abgaben", "GET"],
        ["/admin/wipe-abgaben", "POST"],
        ["/admin/cleanup-database", "POST"],
    ];

    // Anonym
    for (const [path, method] of adminPaths) {
        const res = await fetch(`${BASE_URL}${path}`, { method });
        assertEquals(res.status, 403, `${method} ${path} sollte anonym 403 liefern`);
        await res.text(); // consume body to avoid resource leak
    }

    // Als Schüler
    const suffix = crypto.randomUUID().slice(0, 8);
    const studentEmail = `admin-guard-${suffix}@example.com`;
    await upsertFixtureUser({
        email: studentEmail,
        name: "Admin Guard Student",
        klasse: "5AHITM",
    });

    try {
        const cookie = await registerAndGetCookie(studentEmail);

        for (const [path, method] of adminPaths) {
            const res = await fetch(`${BASE_URL}${path}`, {
                method,
                headers: { "Cookie": cookie },
            });
            assertEquals(res.status, 403, `${method} ${path} sollte als Schüler 403 liefern`);
            await res.text(); // consume body to avoid resource leak
        }
    } finally {
        await clearForensicsByUserEmail(studentEmail);
    }
});

Deno.test("Exam-API: Admin-Endpunkte sind für Schüler gesperrt", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const studentEmail = `exam-guard-${suffix}@example.com`;
    await upsertFixtureUser({
        email: studentEmail,
        name: "Exam Guard Student",
        klasse: "5AHITM",
    });

    try {
        const cookie = await registerAndGetCookie(studentEmail);

        for (const path of [
            "/api/exam/start",
            "/api/exam/pause",
            "/api/exam/resume",
            "/api/exam/stop",
            "/api/exam/extra",
        ]) {
            const res = await postExamForm(cookie, path, "minutes=30");
            assertEquals(res.status, 403, `POST ${path} sollte als Schüler 403 liefern`);
            await res.text(); // consume body to avoid resource leak
        }
    } finally {
        await clearForensicsByUserEmail(studentEmail);
    }
});

Deno.test("Exam-API: anonyme Anfragen erhalten 401 bzw. 403", async () => {
    // Anonyme Admin-Aktionen
    for (const path of [
        "/api/exam/start",
        "/api/exam/pause",
        "/api/exam/resume",
        "/api/exam/stop",
        "/api/exam/extra",
    ]) {
        const res = await postExamForm("", path, "minutes=30");
        assertEquals(res.status, 403, `POST ${path} sollte anonym 403 liefern`);
        await res.text(); // consume body to avoid resource leak
    }

    // Anonymer Countdown-Zugriff
    const stateRes = await fetch(`${BASE_URL}/api/exam/state`);
    assertEquals(stateRes.status, 401);
    await stateRes.text(); // consume body to avoid resource leak
});

Deno.test("Exam-API: ungültige Dauer wird mit 400 und deutscher Meldung abgelehnt", async () => {
    clearExamState();
    try {
        const cookie = await registerAndGetCookie("grafg@spengergasse.at");

        for (const body of [
            "minutes=0",
            "minutes=-3",
            "minutes=abc",
            "minutes=1.5",
            "minutes=",
            "minutes=601",
            "",
        ]) {
            const res = await postExamForm(cookie, "/api/exam/start", body);
            assertEquals(res.status, 400, `Body '${body}' sollte 400 liefern`);
            const text = await res.text();
            assert(text.length > 0, "Fehlermeldung sollte nicht leer sein");
        }

        for (const body of ["minutes=0", "minutes=-3", "minutes=abc", ""]) {
            const res = await postExamForm(cookie, "/api/exam/extra", body);
            assertEquals(res.status, 400, `Zusatzzeit '${body}' sollte 400 liefern`);
            await res.text(); // consume body to avoid resource leak
        }

        // Keine der abgelehnten Anfragen darf einen Exam-Zustand erzeugt haben.
        const state = await getExamState(cookie);
        assertEquals(state.status, "idle");
        assertEquals(state.remaining_seconds, 0);

        // Ungültige State-Machine-Übergänge ohne Examen: 409 mit deutscher Meldung.
        const pauseRes = await postExamForm(cookie, "/api/exam/pause", "");
        assertEquals(pauseRes.status, 409);
        assertEquals((await pauseRes.text()).includes("Es läuft kein Examen"), true);

        const stopRes = await postExamForm(cookie, "/api/exam/stop", "");
        assertEquals(stopRes.status, 409);
        assertEquals((await stopRes.text()).includes("Es läuft kein Examen"), true);
    } finally {
        clearExamState();
    }
});

Deno.test("Exam-API: Happy-Path als Admin über start/pause/resume/extra/stop", async () => {
    clearExamState();
    const suffix = crypto.randomUUID().slice(0, 8);
    const studentEmail = `exam-state-${suffix}@example.com`;
    await upsertFixtureUser({
        email: studentEmail,
        name: "Exam State Student",
        klasse: "5AHITM",
    });

    try {
        const adminCookie = await registerAndGetCookie("grafg@spengergasse.at");
        const studentCookie = await registerAndGetCookie(studentEmail);

        // Start: 60 Minuten
        const startRes = await postExamForm(adminCookie, "/api/exam/start", "minutes=60");
        assertEquals(startRes.status, 200);
        assertEquals((await startRes.text()).includes("60 Minuten"), true);

        // Countdown als Schüler: Login genügt
        const runningState = await getExamState(studentCookie);
        assertEquals(runningState.status, "running");
        assert(
            runningState.remaining_seconds > 0 &&
                runningState.remaining_seconds <= 60 * 60,
            `remaining_seconds sollte im 60-Minuten-Fenster liegen: ${runningState.remaining_seconds}`,
        );

        // Doppelstart: 409
        const secondStartRes = await postExamForm(adminCookie, "/api/exam/start", "minutes=30");
        assertEquals(secondStartRes.status, 409);
        await secondStartRes.text(); // consume body to avoid resource leak

        // Pause: Countdown friert ein
        const pauseRes = await postExamForm(adminCookie, "/api/exam/pause", "");
        assertEquals(pauseRes.status, 200);
        await pauseRes.text();

        const pausedState = await getExamState(studentCookie);
        assertEquals(pausedState.status, "paused");
        assert(pausedState.remaining_seconds > 0, "pausiertes Examen sollte Restzeit behalten");

        // Resume
        const resumeRes = await postExamForm(adminCookie, "/api/exam/resume", "");
        assertEquals(resumeRes.status, 200);
        await resumeRes.text();

        const resumedState = await getExamState(studentCookie);
        assertEquals(resumedState.status, "running");

        // Zusatzzeit: Restzeit steigt deutlich
        const beforeExtra = await getExamState(studentCookie);
        const extraRes = await postExamForm(adminCookie, "/api/exam/extra", "minutes=5");
        assertEquals(extraRes.status, 200);
        await extraRes.text();

        const afterExtra = await getExamState(studentCookie);
        assertEquals(afterExtra.status, "running");
        assert(
            afterExtra.remaining_seconds > beforeExtra.remaining_seconds + 200,
            `Zusatzzeit sollte die Restzeit erhöhen: ${beforeExtra.remaining_seconds} -> ${afterExtra.remaining_seconds}`,
        );

        // Stopp: Exam Mode Off, Restzeit 0
        const stopRes = await postExamForm(adminCookie, "/api/exam/stop", "");
        assertEquals(stopRes.status, 200);
        await stopRes.text();

        const stoppedState = await getExamState(studentCookie);
        assertEquals(stoppedState.status, "stopped");
        assertEquals(stoppedState.remaining_seconds, 0);

        // Neustart nach Stopp ist möglich
        const restartRes = await postExamForm(adminCookie, "/api/exam/start", "minutes=10");
        assertEquals(restartRes.status, 200);
        await restartRes.text();

        const restartedState = await getExamState(studentCookie);
        assertEquals(restartedState.status, "running");

        // Sauberer Endzustand: Examen stoppen
        const cleanupStopRes = await postExamForm(adminCookie, "/api/exam/stop", "");
        assertEquals(cleanupStopRes.status, 200);
        await cleanupStopRes.text();
    } finally {
        clearExamState();
        await clearForensicsByUserEmail(studentEmail);
    }
});

Deno.test("Exam-Gating: Upload und Unterlagen nur während Examenzeit", async () => {
    clearExamState();
    const suffix = crypto.randomUUID().slice(0, 8);
    const studentEmail = `exam-gating-${suffix}@example.com`;
    await upsertFixtureUser({
        email: studentEmail,
        name: "Exam Gating Student",
        klasse: "5AHITM",
    });

    // PERMITTED_FILETYPES kommt aus der .env (hier: md) — der Test
    // lädt deshalb eine .md-Datei hoch (MIME wie im bestehenden
    // Chrome-Szenario leer).
    const uploadForm = () => {
        const formData = new FormData();
        formData.append("file", new Blob(["# Exam Gating"], { type: "" }), "gating.md");
        return formData;
    };

    try {
        const cookie = await registerAndGetCookie(studentEmail);

        // Idle: Startseite lesbar, aber ohne Formular und ohne Countdown.
        const idlePageRes = await fetch(`${BASE_URL}/`, {
            headers: { "Cookie": cookie },
        });
        assertEquals(idlePageRes.status, 200);
        const idleHtml = await idlePageRes.text();
        assertEquals(idleHtml.includes("Uploads sind nur während des Examens möglich."), true);
        assertEquals(idleHtml.includes('hx-post="/upload"'), false);
        assertEquals(idleHtml.includes("exam-countdown"), false);

        // Idle: POST /upload wird mit 403 abgelehnt.
        const idlePostRes = await fetch(`${BASE_URL}/upload`, {
            method: "POST",
            headers: { "Cookie": cookie },
            body: uploadForm(),
        });
        assertEquals(idlePostRes.status, 403);
        assertEquals((await idlePostRes.text()).includes("Uploads sind nur während des Examens möglich."), true);

        // Idle: Unterlagen-Download wird mit 403 abgelehnt.
        const idleFilesRes = await fetch(`${BASE_URL}/unterlagen/gating-dummy.txt`, {
            headers: { "Cookie": cookie },
        });
        assertEquals(idleFilesRes.status, 403);
        assertEquals((await idleFilesRes.text()).includes("Unterlagen sind nur während des Examens verfügbar."), true);

        // Der Unterlagen-Index auf der Startseite bleibt öffentlich.
        const homeRes = await fetch(`${BASE_URL}/`);
        assertEquals(homeRes.status, 200);
        await homeRes.text(); // consume body

        // Running: Startseite mit Formular, Countdown und Motivation.
        seedExamState("running");
        const runPageRes = await fetch(`${BASE_URL}/`, {
            headers: { "Cookie": cookie },
        });
        assertEquals(runPageRes.status, 200);
        const runHtml = await runPageRes.text();
        assertEquals(runHtml.includes('hx-post="/upload"'), true);
        assertEquals(runHtml.includes("exam-countdown"), true);
        assertEquals(runHtml.includes("Restzeit:"), true);
        assertEquals(runHtml.includes("Früh abgeben"), true);

        // Running: Upload wird akzeptiert.
        const runPostRes = await fetch(`${BASE_URL}/upload`, {
            method: "POST",
            headers: { "Cookie": cookie },
            body: uploadForm(),
        });
        assertEquals(runPostRes.status, 200);
        const runPostHtml = await runPostRes.text();
        const filenameMatch = runPostHtml.match(/<span class="fw-bold text-break[^"]*">([^<]+)<\/span>/);
        assertExists(filenameMatch);
        await Deno.remove(`${config.ABGABEN_DIR}/${filenameMatch[1]}`);

        // Running: Unterlagen-Download ist nicht mehr gesperrt.
        const runFilesRes = await fetch(`${BASE_URL}/unterlagen/gating-dummy.txt`, {
            headers: { "Cookie": cookie },
        });
        assert(
            runFilesRes.status !== 403,
            `Während des Examens sollte /unterlagen nicht 403 liefern (war ${runFilesRes.status})`,
        );
        await runFilesRes.text(); // consume body

        // Paused: Gating bleibt offen, Countdown zeigt die Pause an.
        seedExamState("paused");
        const pausedPageRes = await fetch(`${BASE_URL}/`, {
            headers: { "Cookie": cookie },
        });
        assertEquals(pausedPageRes.status, 200);
        const pausedHtml = await pausedPageRes.text();
        assertEquals(pausedHtml.includes("Prüfungszeit pausiert"), true);
        assertEquals(pausedHtml.includes('hx-post="/upload"'), true);

        const pausedFilesRes = await fetch(`${BASE_URL}/unterlagen/gating-dummy.txt`, {
            headers: { "Cookie": cookie },
        });
        assert(
            pausedFilesRes.status !== 403,
            `Während der Pause sollte /unterlagen nicht 403 liefern (war ${pausedFilesRes.status})`,
        );
        await pausedFilesRes.text(); // consume body

        // Stopped: Upload und Unterlagen wieder gesperrt.
        seedExamState("stopped");
        const stoppedPageRes = await fetch(`${BASE_URL}/`, {
            headers: { "Cookie": cookie },
        });
        assertEquals(stoppedPageRes.status, 200);
        const stoppedHtml = await stoppedPageRes.text();
        assertEquals(stoppedHtml.includes("Uploads sind nur während des Examens möglich."), true);

        const stoppedPostRes = await fetch(`${BASE_URL}/upload`, {
            method: "POST",
            headers: { "Cookie": cookie },
            body: uploadForm(),
        });
        assertEquals(stoppedPostRes.status, 403);
        await stoppedPostRes.text(); // consume body

        const stoppedFilesRes = await fetch(`${BASE_URL}/unterlagen/gating-dummy.txt`, {
            headers: { "Cookie": cookie },
        });
        assertEquals(stoppedFilesRes.status, 403);
        await stoppedFilesRes.text(); // consume body
    } finally {
        clearExamState();
        await clearForensicsByUserEmail(studentEmail);
    }
});
