import { assertEquals, assertExists } from "@std/assert";
import { createHash } from "node:crypto";
import endpoints from "./endpoints.json" with { type: "json" };
import config from "../lib/config.ts";
import * as service from "../service/service.ts";

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
    // May return 200 or 404 depending on logs directory existence
    assertEquals([200, 404].includes(res.status), true);
    const text = await res.text();
    assertExists(text);
});

Deno.test("GET /ldap?email=graf - LDAP search", async () => {
    const res = await fetch(`${BASE_URL}/ldap?email=graf`);
    assertEquals(res.status, 200);
    const text = await res.text();
    assertExists(text);
});

Deno.test("POST /activeips - Register active IPs", async () => {
    const res = await fetch(`${BASE_URL}/activeips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ips: ["10.10.10.10", "7.7.7.7", "8.8.1.1"] }),
    });
    assertEquals(res.status, 200);
    const json = await res.json();
    assertEquals(json.ok, "true");
    assertExists(json.count);
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
    const originalInternetState = config.INTERNET_ACTIVE;
    const originalThemeKey = service.admin.getCurrentThemeKey();
    const testEmail = "grafg@spengergasse.at";

    const anonymousRes = await fetch(`${BASE_URL}/whoami`);
    const anonymousHtml = await anonymousRes.text();
    assertEquals(anonymousHtml.includes('href="/admin"'), false);
    assertEquals(anonymousHtml.includes('href="/admin/filetypes"'), false);

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
    assertEquals(homeHtml.includes('href="/admin/filetypes"'), true);
    assertEquals(homeHtml.includes(">Dateitypen<"), false);

    const settingsRes = await fetch(`${BASE_URL}/admin/filetypes`, {
        headers: { "Cookie": cookie },
    });
    const settingsHtml = await settingsRes.text();
    assertEquals(settingsRes.status, 200);
    assertEquals(settingsHtml.includes("Erlaubte Dateitypen"), true);
    assertEquals(settingsHtml.includes("Dokumentationsserver-Firewall-Regel"), true);
    assertEquals(settingsHtml.includes("Internet aktiv"), true);
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

    const adminRes = await fetch(`${BASE_URL}/admin`, {
        headers: { "Cookie": cookie },
    });
    const adminHtml = await adminRes.text();
    assertEquals(adminRes.status, 200);
    assertEquals(adminHtml.includes("Abgaben &amp; Datenbank herunterladen (TAR.GZ)"), false);
    assertEquals(adminHtml.includes("Abgaben-Verzeichnis leeren"), false);

    const disableInternetRes = await fetch(`${BASE_URL}/api/exammode`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": cookie,
        },
        body: "",
    });
    const disableInternetHtml = await disableInternetRes.text();
    assertEquals(disableInternetRes.status, 200);
    assertEquals(disableInternetHtml.includes("Internet blockiert"), true);

    const enableInternetRes = await fetch(`${BASE_URL}/api/exammode`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": cookie,
        },
        body: "internet_active=on",
    });
    const enableInternetHtml = await enableInternetRes.text();
    assertEquals(enableInternetRes.status, 200);
    assertEquals(enableInternetHtml.includes("Internet aktiv"), true);

    const updateRes = await fetch(`${BASE_URL}/admin/filetypes`, {
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

    const uploadRes = await fetch(`${BASE_URL}/upload`, {
        headers: { "Cookie": cookie },
    });
    const uploadHtml = await uploadRes.text();
    assertEquals(uploadHtml.includes(".pdf"), true);

    const restoreRes = await fetch(`${BASE_URL}/admin/filetypes`, {
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

    config.INTERNET_ACTIVE = originalInternetState;
});

// Dynamic test runner for all endpoints from JSON
Deno.test("All endpoints from endpoints.json respond", async (t) => {
    for (const endpoint of endpoints.endpoints as Endpoint[]) {
        await t.step(
            `${endpoint.method} ${endpoint.path} - ${endpoint.description}`,
            async () => {
                const url = `${BASE_URL}${endpoint.path}`;
                const options: RequestInit = { method: endpoint.method };

                if (endpoint.method === "POST" && endpoint.data) {
                    options.headers = { "Content-Type": "application/json" };
                    options.body = JSON.stringify(endpoint.data);
                }

                const res = await fetch(url, options);
                assertExists(res.status);
                await res.text(); // consume body to avoid resource leak
            },
        );
    }
});

Deno.test("POST /upload - Authenticated upload with MD5 verification", async () => {
    const testEmail = "grafg@spengergasse.at";

    const registerRes = await fetch(`${BASE_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `email=${encodeURIComponent(testEmail)}`,
    });
    await registerRes.text(); // consume body
    const cookie = registerRes.headers.get("set-cookie");
    assertExists(cookie);

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
});

Deno.test("POST /upload - rejects zip with non-zip content", async () => {
    const testEmail = "grafg@spengergasse.at";

    const registerRes = await fetch(`${BASE_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `email=${encodeURIComponent(testEmail)}`,
    });
    await registerRes.text();
    const cookie = registerRes.headers.get("set-cookie");
    assertExists(cookie);

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
});
