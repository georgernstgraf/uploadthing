import { assertEquals, assertExists, assert } from "@std/assert";
import { createHash } from "node:crypto";
import endpoints from "./endpoints.json" with { type: "json" };
import config from "../lib/config.ts";
import * as service from "../service/service.ts";
import { db } from "../repo/db.ts";
import * as ipfactRepo from "../repo/ipfact.ts";
import * as registrationsRepo from "../repo/registrations.ts";
import * as usersRepo from "../repo/users.ts";
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

Deno.test("GET /admin/logs - Admin logs", async () => {
    const res = await fetch(`${BASE_URL}/admin/logs`);
    // Route wurde entfernt: für Anonyme liefert die requireAdmin-Middleware
    // 403, für Admins bleibt ein unregistrierter Pfad 404.
    assertEquals([200, 403, 404].includes(res.status), true);
    const text = await res.text();
    assertExists(text);
});

Deno.test("GET /ldap?email=graf - LDAP search", async () => {
    const res = await fetch(`${BASE_URL}/ldap?email=graf`);
    assertEquals(res.status, 200);
    const text = await res.text();
    assertExists(text);
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
    assertEquals(settingsHtml.includes("Theme anwenden"), true);
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

    // Upload-Seite nur mit laufendem Examen vollständig prüfbar
    seedExamState("running");

    const uploadRes = await fetch(`${BASE_URL}/upload`, {
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

        const res = await fetch(`${BASE_URL}/admin/students`, {
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

        // Idle: Upload-Seite lesbar, aber ohne Formular und ohne Countdown.
        const idlePageRes = await fetch(`${BASE_URL}/upload`, {
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

        // Running: Upload-Seite mit Formular, Countdown und Motivation.
        seedExamState("running");
        const runPageRes = await fetch(`${BASE_URL}/upload`, {
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
        const pausedPageRes = await fetch(`${BASE_URL}/upload`, {
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
        const stoppedPageRes = await fetch(`${BASE_URL}/upload`, {
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
