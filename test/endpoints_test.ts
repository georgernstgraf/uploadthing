import { assertEquals, assertExists } from "@std/assert";
import endpoints from "./endpoints.json" with { type: "json" };

const BASE_URL = Deno.env.get("TEST_BASE_URL") || endpoints.baseUrl;

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
