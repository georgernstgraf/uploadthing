import { assertEquals, assertExists } from "@std/assert";
import { createHash } from "node:crypto";
import endpoints from "./endpoints.json" with { type: "json" };
import config from "../lib/config.ts";

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

Deno.test("GET / - Home page", async () => {
    const res = await fetch(`${BASE_URL}/`);
    assertEquals(res.status, 200);
    const text = await res.text();
    assertExists(text);
    assertEquals(res.headers.get("content-type")?.includes("text/html"), true);
});

Deno.test("GET /forensic/logs - Forensic logs", async () => {
    const res = await fetch(`${BASE_URL}/forensic/logs`);
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

    const testContent = "Test content for MD5 verification";
    const formData = new FormData();
    const file = new Blob([testContent], { type: "application/zip" });
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

    const filenameMatch = html.match(/<span class="fw-bold text-break fs-xl">([^<]+)<\/span>/);
    assertExists(filenameMatch);
    const filename = filenameMatch[1];

    const filePath = `${config.ABGABEN_DIR}/${filename}`;
    const fileContent = await Deno.readFile(filePath);
    const computedMd5 = computeMd5(fileContent);

    assertEquals(responseMd5, computedMd5);

    await Deno.remove(filePath);
});
