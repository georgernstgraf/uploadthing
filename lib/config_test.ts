import { assertEquals, assertExists } from "@std/assert";
import { fromFileUrl, resolve } from "@std/path";
import config, {
    buildHeroUrl,
    isDevelopment,
    isProduction,
    parseOpnsenseConfig,
    parsePermittedFileTypes,
    parseSqliteDatabaseUrl,
    parseTlsConfig,
} from "./config.ts";

Deno.test("config - buildHeroUrl prefers PUBLIC_URL", () => {
    assertEquals(
        buildHeroUrl("https://tst.spengergasse.at:8443", "127.0.0.1", 8000),
        "https://tst.spengergasse.at:8443",
    );
});

Deno.test("config - buildHeroUrl strips trailing slashes from PUBLIC_URL", () => {
    assertEquals(
        buildHeroUrl("http://router:8000/", undefined, 8000),
        "http://router:8000",
    );
    assertEquals(
        buildHeroUrl("http://router:8000//", undefined, 8000),
        "http://router:8000",
    );
});

Deno.test("config - buildHeroUrl falls back to listen address", () => {
    assertEquals(
        buildHeroUrl(undefined, "127.0.0.1", 8000),
        "http://127.0.0.1:8000/",
    );
    assertEquals(
        buildHeroUrl(undefined, undefined, 8000),
        "http://localhost:8000/",
    );
});

Deno.test("config - buildHeroUrl ignores blank PUBLIC_URL", () => {
    assertEquals(
        buildHeroUrl("   ", "router", 8000),
        "http://router:8000/",
    );
});

Deno.test("config - PERMITTED_FILETYPES is an array", () => {
    assertEquals(Array.isArray(config.PERMITTED_FILETYPES), true);
});

Deno.test("config - parseOpnsenseConfig returns null without credentials", () => {
    assertEquals(parseOpnsenseConfig({}), null);
    assertEquals(
        parseOpnsenseConfig({ ruleUuid: "e3e720e6-27fb-4565-b8cf-3a73cf682b54" }),
        null,
    );
});

Deno.test("config - parseOpnsenseConfig accepts complete credentials", () => {
    assertEquals(
        parseOpnsenseConfig({
            apiKey: "key",
            apiSecret: "secret",
            apiUrl: "https://192.168.21.1:8443/",
            ruleUuid: "e3e720e6-27fb-4565-b8cf-3a73cf682b54",
        }),
        {
            apiUrl: "https://192.168.21.1:8443",
            apiKey: "key",
            apiSecret: "secret",
            ruleUuid: "e3e720e6-27fb-4565-b8cf-3a73cf682b54",
        },
    );
});

Deno.test("config - parseOpnsenseConfig rejects key without secret", () => {
    const error = (() => {
        try {
            parseOpnsenseConfig({
                apiKey: "key",
                apiUrl: "https://192.168.21.1:8443",
                ruleUuid: "uuid",
            });
        } catch (caught) {
            return caught;
        }
        return null;
    })();

    assertExists(error);
    assertEquals(
        error instanceof Error ? error.message : String(error),
        "OPNSENSE_API_KEY und OPNSENSE_API_SECRET müssen gemeinsam gesetzt sein.",
    );
});

Deno.test("config - parseOpnsenseConfig rejects secret without key", () => {
    const error = (() => {
        try {
            parseOpnsenseConfig({
                apiSecret: "secret",
                apiUrl: "https://192.168.21.1:8443",
                ruleUuid: "uuid",
            });
        } catch (caught) {
            return caught;
        }
        return null;
    })();

    assertExists(error);
    assertEquals(
        error instanceof Error ? error.message : String(error),
        "OPNSENSE_API_KEY und OPNSENSE_API_SECRET müssen gemeinsam gesetzt sein.",
    );
});

Deno.test("config - parseOpnsenseConfig requires API URL", () => {
    const error = (() => {
        try {
            parseOpnsenseConfig({ apiKey: "key", apiSecret: "secret", ruleUuid: "uuid" });
        } catch (caught) {
            return caught;
        }
        return null;
    })();

    assertExists(error);
    assertEquals(
        error instanceof Error ? error.message : String(error),
        "OPNSENSE_API_URL muss gesetzt sein, wenn OPNSENSE_API_KEY und OPNSENSE_API_SECRET gesetzt sind (z. B. https://192.168.21.1:8443).",
    );
});

Deno.test("config - parseOpnsenseConfig requires rule UUID", () => {
    const error = (() => {
        try {
            parseOpnsenseConfig({
                apiKey: "key",
                apiSecret: "secret",
                apiUrl: "https://192.168.21.1:8443",
            });
        } catch (caught) {
            return caught;
        }
        return null;
    })();

    assertExists(error);
    assertEquals(
        error instanceof Error ? error.message : String(error),
        "OPNSENSE_EXAMMODE_RULE_UUID muss gesetzt sein, wenn OPNSENSE_API_KEY und OPNSENSE_API_SECRET gesetzt sind.",
    );
});

Deno.test("config - OPNSENSE is null without credentials", () => {
    assertEquals(config.OPNSENSE, null);
});

Deno.test("config - parsePermittedFileTypes normalizes input", () => {
    assertEquals(parsePermittedFileTypes(".ZIP, md, zip , PDF"), [
        "zip",
        "md",
        "pdf",
    ]);
});

Deno.test("config - parseSqliteDatabaseUrl parses Prisma SQLite URL", () => {
    const prismaDir = resolve(fromFileUrl(new URL("../prisma/", import.meta.url)));
    assertEquals(
        parseSqliteDatabaseUrl("file:../uploadthing.db"),
        resolve(prismaDir, "../uploadthing.db"),
    );
    assertEquals(
        parseSqliteDatabaseUrl("file:./tmp/test.db"),
        resolve(prismaDir, "./tmp/test.db"),
    );
});

Deno.test("config - parseSqliteDatabaseUrl rejects empty string", () => {
    const error = (() => {
        try {
            parseSqliteDatabaseUrl("");
        } catch (caught) {
            return caught;
        }
        return null;
    })();

    assertExists(error);
    assertEquals(
        error instanceof Error
            ? error.message
            : String(error),
        "DATABASE_URL must be set to a Prisma-style SQLite file: URL.",
    );
});

Deno.test("config - parseSqliteDatabaseUrl rejects non-file URLs", () => {
    for (const invalid of ["uploadthing.db", "postgres://localhost/app"]) {
        const error = (() => {
            try {
                parseSqliteDatabaseUrl(invalid);
            } catch (caught) {
                return caught;
            }
            return null;
        })();

        assertExists(error);
        assertEquals(
            error instanceof Error
                ? error.message
                : String(error),
            "DATABASE_URL must use a Prisma-style SQLite file: URL.",
        );
    }
});

Deno.test("config - MAX_UPLOAD_MB has default value", () => {
    assertEquals(typeof config.MAX_UPLOAD_MB, "number");
    assertEquals(config.MAX_UPLOAD_MB > 0, true);
});

Deno.test("config - ADMIN_IPS is parsed as array", () => {
    assertEquals(Array.isArray(config.ADMIN_IPS), true);
});

Deno.test("config - TODAY_HOURS_CUTOFF has default value", () => {
    assertEquals(typeof config.TODAY_HOURS_CUTOFF, "number");
    assertEquals(config.TODAY_HOURS_CUTOFF, 12);
});

Deno.test("config - COOKIE_MAX_AGE_MS is calculated correctly", () => {
    const expected = 5 * 30 * 24 * 60 * 60 * 1000;
    assertEquals(config.COOKIE_MAX_AGE_MS, expected);
});

Deno.test("config - COOKIE_MAX_AGE_S is calculated correctly", () => {
    const expected = 5 * 30 * 24 * 60 * 60;
    assertEquals(config.COOKIE_MAX_AGE_S, expected);
});

Deno.test("config - SESSION_REFRESH_THRESHOLD_MS is calculated correctly", () => {
    const expected = 7 * 24 * 60 * 60 * 1000;
    assertEquals(config.SESSION_REFRESH_THRESHOLD_MS, expected);
});

Deno.test("config - parseTlsConfig returns null when neither path is set", () => {
    assertEquals(parseTlsConfig(undefined, undefined), null);
});

Deno.test("config - parseTlsConfig returns config when both paths are set", () => {
    assertEquals(
        parseTlsConfig("/etc/uploadthing/tls/fullchain.pem", "/etc/uploadthing/tls/privkey.pem"),
        { certPath: "/etc/uploadthing/tls/fullchain.pem", keyPath: "/etc/uploadthing/tls/privkey.pem" },
    );
});

Deno.test("config - parseTlsConfig rejects cert without key", () => {
    const error = (() => {
        try {
            parseTlsConfig("/etc/uploadthing/tls/fullchain.pem", undefined);
        } catch (caught) {
            return caught;
        }
        return null;
    })();

    assertExists(error);
    assertEquals(
        error instanceof Error ? error.message : String(error),
        "TLS_CERT_PATH und TLS_KEY_PATH müssen gemeinsam gesetzt sein.",
    );
});

Deno.test("config - parseTlsConfig rejects key without cert", () => {
    const error = (() => {
        try {
            parseTlsConfig(undefined, "/etc/uploadthing/tls/privkey.pem");
        } catch (caught) {
            return caught;
        }
        return null;
    })();

    assertExists(error);
    assertEquals(
        error instanceof Error ? error.message : String(error),
        "TLS_CERT_PATH und TLS_KEY_PATH müssen gemeinsam gesetzt sein.",
    );
});

Deno.test("config - TLS defaults to null without env vars", () => {
    assertEquals(config.TLS, null);
});

Deno.test("config - spg_times is an array of time strings", () => {
    assertEquals(Array.isArray(config.spg_times), true);
    assertEquals(config.spg_times.length > 0, true);
    assertEquals(config.spg_times[0], "08:00");
});

Deno.test("config - DENO_ENV is set", () => {
    assertExists(config.DENO_ENV);
});

Deno.test("config - isProduction boolean is calculated", () => {
    assertEquals(typeof isProduction, "boolean");
});

Deno.test("config - isDevelopment boolean is calculated", () => {
    assertEquals(typeof isDevelopment, "boolean");
});

Deno.test("config - ABGABEN_DIR is set", () => {
    assertExists(config.ABGABEN_DIR);
    assertEquals(config.ABGABEN_DIR.includes("abgaben"), true);
});

Deno.test("config - DATABASE_PATH is derived from DATABASE_URL", () => {
    assertExists(config.DATABASE_PATH);
    assertEquals(config.DATABASE_PATH.length > 0, true);
});

Deno.test("config - UNTERLAGEN_DIR is set", () => {
    assertExists(config.UNTERLAGEN_DIR);
    assertEquals(config.UNTERLAGEN_DIR.includes("unterlagen"), true);
});

Deno.test("config - SERVICE_DN is set", () => {
    assertExists(config.SERVICE_DN);
});

Deno.test("config - SERVICE_PW is set", () => {
    assertExists(config.SERVICE_PW);
});

Deno.test("config - SERVICE_URL is set", () => {
    assertExists(config.SERVICE_URL);
});

Deno.test("config - SEARCH_BASE is set", () => {
    assertExists(config.SEARCH_BASE);
});

Deno.test("config - COOKIE_SECRET is set", () => {
    assertExists(config.COOKIE_SECRET);
});
