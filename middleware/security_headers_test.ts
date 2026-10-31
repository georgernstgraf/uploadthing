import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { securityHeaderValues, securityHeaders } from "./security_headers.ts";

function makeApp(): Hono {
    const app = new Hono();
    app.use("*", securityHeaders);
    app.get("/", (c) => c.html("<p>ok</p>"));
    app.get("/fragment", (c) => c.text("Teil"));
    app.get("/boom", () => {
        throw new Error("kaputt");
    });
    return app;
}

Deno.test("securityHeaderValues - setzt upgrade-insecure-requests, kein HSTS", () => {
    const values = securityHeaderValues();
    assertEquals(values["Content-Security-Policy"], "upgrade-insecure-requests");
    // HSTS ist eine bewusste Entscheidung, siehe Kommentar in security_headers.ts
    assertEquals("Strict-Transport-Security" in values, false);
});

Deno.test("securityHeaders - Header auf HTML-Antworten", async () => {
    const res = await makeApp().request("/");
    assertEquals(res.status, 200);
    assertEquals(
        res.headers.get("content-security-policy"),
        "upgrade-insecure-requests",
    );
    assertEquals(
        await res.text(),
        "<p>ok</p>",
        "Body darf durch die Middleware nicht verändert werden",
    );
});

Deno.test("securityHeaders - Header auf Fragment-Antworten für HTMX", async () => {
    const res = await makeApp().request("/fragment");
    assertEquals(res.status, 200);
    assertEquals(
        res.headers.get("content-security-policy"),
        "upgrade-insecure-requests",
    );
});

Deno.test("securityHeaders - Header auch auf 500-Antworten", async () => {
    const res = await makeApp().request("/boom");
    assertEquals(res.status, 500);
    assertEquals(
        res.headers.get("content-security-policy"),
        "upgrade-insecure-requests",
    );
});
