import { assert, assertEquals, assertExists } from "@std/assert";
import config from "../lib/config.ts";
import * as hbs from "../lib/handlebars.ts";
import {
    applyTheme,
    buildExamFirewallPanel,
    cleanupDatabaseOlderThanOneYear,
    describeFirewallState,
    getCurrentThemeKey,
    getExamModeStatus,
    listAvailableThemes,
    runExamModeOnStartup,
    setInternetActive,
} from "./admin.ts";
import {
    fakeFirewall,
    TEST_OPNSENSE_CONFIG,
    TEST_RULE_UUID_LEGACY,
    withOpnsenseConfig,
} from "../test/helpers/opnsense_fixture.ts";
import { db } from "../repo/db.ts";
import * as usersRepo from "../repo/users.ts";
import * as cookiepresentsRepo from "../repo/cookiepresents.ts";
import * as registrationsRepo from "../repo/registrations.ts";
import * as ipfactRepo from "../repo/ipfact.ts";
import * as abgabenRepo from "../repo/abgaben.ts";
import * as examRepo from "../repo/exam.ts";
import { clearExamState } from "../test/helpers/forensics_fixture.ts";

Deno.test("setInternetActive sperrt über die API, wenn das Internet freigegeben werden soll", async () => {
    const { runner, calls } = fakeFirewall({ enabled: false });

    await withOpnsenseConfig(TEST_OPNSENSE_CONFIG, async () => {
        const result = await setInternetActive(false, runner);

        assertEquals(result.ok, true);
        assertEquals(result.internet_active, false);
        assertEquals(result.stdout, "Sperre aktiviert");
    });

    assertEquals(
        calls.map((call) => `${call.method} ${call.url.replace("https://firewall.test:8443", "")}`),
        [
            "POST /api/firewall/filter/searchRule",
            `POST /api/firewall/filter/toggleRule/${TEST_RULE_UUID_LEGACY}`,
            "POST /api/firewall/filter/apply",
            "POST /api/firewall/filter/searchRule",
        ],
    );
    assertEquals(calls[0].authorization, `Basic ${btoa("test-key:test-secret")}`);
});

Deno.test("setInternetActive gibt die Sperre frei, ohne doppelt zu schalten", async () => {
    const { runner, calls } = fakeFirewall({ enabled: false });

    await withOpnsenseConfig(TEST_OPNSENSE_CONFIG, async () => {
        const result = await setInternetActive(true, runner);

        assertEquals(result.ok, true);
        assertEquals(result.internet_active, true);
        assertEquals(result.stdout, "Sperre ist bereits inaktiv");
    });

    assertEquals(calls.some((call) => call.url.includes("toggleRule")), false);
    assertEquals(calls.some((call) => call.url.endsWith("/apply")), false);
});

Deno.test("setInternetActive meldet API-Fehler ohne den gewünschten Zustand zu behaupten", async () => {
    const { runner } = fakeFirewall({ enabled: false, applyStatus: 500 });

    await withOpnsenseConfig(TEST_OPNSENSE_CONFIG, async () => {
        const result = await setInternetActive(false, runner);

        assertEquals(result.ok, false);
        assertEquals(result.code, 500);
        assertEquals(result.internet_active, false);
        assertEquals(
            result.stderr.startsWith(
                "Regel wurde umgeschaltet, konnte aber nicht angewendet werden",
            ),
            true,
        );
    });
});

Deno.test("getExamModeStatus liest den echten Zustand von der Firewall", async () => {
    await withOpnsenseConfig(TEST_OPNSENSE_CONFIG, async () => {
        const freigegeben = fakeFirewall({ enabled: false });
        const frei = await getExamModeStatus(freigegeben.runner);
        assertEquals(frei.ok, true);
        assertEquals(frei.configured, true);
        assertEquals(frei.internet_active, true);

        const gesperrt = fakeFirewall({ enabled: true });
        const state = await getExamModeStatus(gesperrt.runner);
        assertEquals(state.ok, true);
        assertEquals(state.internet_active, false);
    });
});

Deno.test("getExamModeStatus meldet Unbekanntes als null", async () => {
    await withOpnsenseConfig(TEST_OPNSENSE_CONFIG, async () => {
        const { runner } = fakeFirewall({ enabled: false, searchStatus: 503 });
        const result = await getExamModeStatus(runner);
        assertEquals(result.ok, false);
        assertEquals(result.configured, true);
        assertEquals(result.internet_active, null);
    });
});

Deno.test("getExamModeStatus ist ohne Konfiguration nicht konfiguriert", async () => {
    await withOpnsenseConfig(null, async () => {
        const result = await getExamModeStatus();
        assertEquals(result.configured, false);
        assertEquals(result.ok, false);
        assertEquals(result.internet_active, null);
    });
});

Deno.test("describeFirewallState bildet alle vier Anzeigezustände ab", () => {
    const base = { code: 0, stdout: "", stderr: "" };
    assertEquals(
        describeFirewallState({ ...base, ok: true, configured: true, internet_active: true }),
        "frei",
    );
    assertEquals(
        describeFirewallState({ ...base, ok: true, configured: true, internet_active: false }),
        "gesperrt",
    );
    assertEquals(
        describeFirewallState({ ...base, ok: false, configured: true, internet_active: null }),
        "unbekannt",
    );
    assertEquals(
        describeFirewallState({ ...base, ok: false, configured: false, internet_active: null }),
        "nicht-konfiguriert",
    );
});

Deno.test("buildExamFirewallPanel zeigt das Modal nur bei echtem Fehlerzustand", () => {
    const frei = buildExamFirewallPanel({
        code: 200,
        stdout: "",
        stderr: "",
        ok: true,
        configured: true,
        internet_active: true,
    });
    assertEquals(frei.firewall_state, "frei");
    assertEquals(frei.firewall_error, undefined);
    assertEquals(frei.firewall_modal, false);

    const unbekannt = buildExamFirewallPanel({
        code: 401,
        stdout: "",
        stderr: "Regelzustand lesen fehlgeschlagen (HTTP 401)",
        ok: false,
        configured: true,
        internet_active: null,
    });
    assertEquals(unbekannt.firewall_state, "unbekannt");
    assertEquals(unbekannt.firewall_modal, true);
    assertEquals(unbekannt.firewall_error, "Regelzustand lesen fehlgeschlagen (HTTP 401)");

    const nichtKonfiguriert = buildExamFirewallPanel({
        code: 0,
        stdout: "",
        stderr: "OPNsense-API ist nicht konfiguriert.",
        ok: false,
        configured: false,
        internet_active: null,
    });
    assertEquals(nichtKonfiguriert.firewall_state, "nicht-konfiguriert");
    assertEquals(nichtKonfiguriert.firewall_modal, false);

    const aktionsFehler = buildExamFirewallPanel({
        code: 200,
        stdout: "",
        stderr: "",
        ok: true,
        configured: true,
        internet_active: true,
    }, "Sperre umschalten fehlgeschlagen (HTTP 403)");
    assertEquals(aktionsFehler.firewall_state, "frei");
    assertEquals(aktionsFehler.firewall_error, "Sperre umschalten fehlgeschlagen (HTTP 403)");
    assertEquals(aktionsFehler.firewall_modal, true);
});

Deno.test("runExamModeOnStartup löst die Sperre beim Start", async () => {
    const firewall = fakeFirewall({ enabled: true });
    const { runner } = firewall;
    clearExamState();

    try {
        await withOpnsenseConfig(TEST_OPNSENSE_CONFIG, async () => {
            await runExamModeOnStartup(runner);

            const state = await getExamModeStatus(runner);
            assertEquals(state.internet_active, true);
            assertEquals(firewall.isEnabled(), false);
        });
    } finally {
        clearExamState();
    }
});

Deno.test("runExamModeOnStartup ohne API-Konfiguration ruft die Firewall nicht auf", async () => {
    clearExamState();

    try {
        await withOpnsenseConfig(null, async () => {
            let runnerCalled = false;
            await runExamModeOnStartup(() => {
                runnerCalled = true;
                return Promise.resolve(new Response("{}"));
            });
            assertEquals(runnerCalled, false);
        });
    } finally {
        clearExamState();
    }
});

Deno.test("runExamModeOnStartup beendet den Prozess bei Firewall-Fehler nicht", async () => {
    clearExamState();

    try {
        await withOpnsenseConfig(TEST_OPNSENSE_CONFIG, async () => {
            const { runner } = fakeFirewall({ enabled: true, searchStatus: 503 });
            // Würde der Start weiterhin `Deno.exit(1)` rufen, wäre dieser Test rot.
            await runExamModeOnStartup(runner);
        });

        assertEquals(true, true);
    } finally {
        clearExamState();
    }
});

Deno.test("runExamModeOnStartup setzt einen hängengebliebenen Exam-Zustand auf stopped", async () => {
    clearExamState();

    try {
        for (const status of ["running", "paused"] as const) {
            examRepo.upsert({
                status,
                duration_seconds: 600,
                started_at: new Date("2026-10-12T08:00:00.000Z"),
                paused_seconds: 30,
                extra_seconds: 60,
                updated_at: new Date("2026-10-12T08:05:00.000Z"),
            });

            await withOpnsenseConfig(null, async () => {
                await runExamModeOnStartup(() => {
                    throw new Error("Ohne Konfiguration darf kein Aufruf erfolgen.");
                });
            });

            const state = examRepo.get();
            assertEquals(state?.status, "stopped");
            assertEquals(state?.duration_seconds, 600);
            assertEquals(state?.extra_seconds, 60);
            clearExamState();
        }
    } finally {
        clearExamState();
    }
});

Deno.test("runExamModeOnStartup lässt fehlende oder beendete Exam-Zustände unverändert", async () => {
    clearExamState();

    try {
        // Ohne Zeile: bleibt ohne Zeile (idle).
        await withOpnsenseConfig(null, () => runExamModeOnStartup());
        assertEquals(examRepo.get(), null);

        // Gestoppter Zustand bleibt gestoppt.
        examRepo.upsert({
            status: "stopped",
            duration_seconds: 600,
            started_at: new Date("2026-10-12T08:00:00.000Z"),
            paused_seconds: 0,
            extra_seconds: 0,
            updated_at: new Date("2026-10-12T09:00:00.000Z"),
        });
        await withOpnsenseConfig(null, () => runExamModeOnStartup());
        assertEquals(examRepo.get()?.status, "stopped");
    } finally {
        clearExamState();
    }
});

Deno.test("Exam-Panel zeigt Warnband und Modal im Fehlerzustand", () => {
    const warnung = hbs.adminExamModeTemplate({
        exam_status: "running",
        exam_remaining_label: "01:00:00",
        exam_open: true,
        exam_running: true,
        firewall_state: "frei",
        firewall_modal: false,
    });
    assertEquals(warnung.includes("Examen läuft · Internet frei"), true);
    assertEquals(warnung.includes('id="exam-firewall-warning"'), true);

    const unbekannt = hbs.adminExamModeTemplate({
        exam_status: "running",
        exam_remaining_label: "01:00:00",
        exam_open: true,
        exam_running: true,
        firewall_state: "unbekannt",
        firewall_error: "Sperre konnte nicht geschaltet werden: HTTP 403",
        firewall_modal: true,
    });
    assertEquals(unbekannt.includes("Zustand unbekannt"), true);
    assertEquals(unbekannt.includes('data-show="true"'), true);
    assertEquals(unbekannt.includes("HTTP 403"), true);
    assertEquals(unbekannt.includes("disabled"), true);
    assertEquals(unbekannt.includes("Examen läuft · Internet frei"), false);

    const nichtKonfiguriert = hbs.adminExamModeTemplate({
        exam_status: "idle",
        exam_remaining_label: "00:00:00",
        exam_open: false,
        exam_running: false,
        firewall_state: "nicht-konfiguriert",
        firewall_modal: false,
    });
    assertEquals(nichtKonfiguriert.includes("Nicht konfiguriert"), true);
    assertEquals(nichtKonfiguriert.includes('data-show="true"'), false);
});

Deno.test("Exam-Panel bestätigt das Freigeben während eines Examens", () => {
    const gesperrt = hbs.adminExamModeTemplate({
        exam_status: "running",
        exam_remaining_label: "01:00:00",
        exam_open: true,
        exam_running: true,
        firewall_state: "gesperrt",
        firewall_modal: false,
    });
    assertEquals(
        gesperrt.includes("hx-confirm=\"Examen läuft — Internet wirklich freigeben?\""),
        true,
    );

    const frei = hbs.adminExamModeTemplate({
        exam_status: "running",
        exam_remaining_label: "01:00:00",
        exam_open: true,
        exam_running: true,
        firewall_state: "frei",
        firewall_modal: false,
    });
    assertEquals(
        frei.includes("Internet wirklich freigeben"),
        false,
    );
});


Deno.test("cleanupDatabaseOlderThanOneYear deletes only old time-based records", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `cleanup-${suffix}@example.com`;
    const ip = `203.0.113.${Number.parseInt(suffix.slice(0, 2), 16) % 100 + 10}`;
    const now = new Date("2026-03-12T12:00:00.000Z");
    const oldDate = new Date("2025-01-15T12:00:00.000Z");
    const freshDate = new Date("2026-03-05T12:00:00.000Z");

    try {
        const user = await usersRepo.upsert({
            email,
            name: "Cleanup Test",
            klasse: "5AHITM",
        });

        await cookiepresentsRepo.create(ip, user.id, oldDate);
        await cookiepresentsRepo.create(ip, user.id, freshDate);
        registrationsRepo.create(ip, user.id, oldDate);
        registrationsRepo.create(ip, user.id, freshDate);
        ipfactRepo.registerSeen(ip, oldDate);
        ipfactRepo.registerSeen(ip, freshDate);
        abgabenRepo.create(user.id, ip, `old-${suffix}.pdf`, oldDate);
        abgabenRepo.create(user.id, ip, `fresh-${suffix}.pdf`, freshDate);

        const result = cleanupDatabaseOlderThanOneYear(now);

        assert(result.deleted_cookiepresents >= 1);
        assert(result.deleted_registrations >= 1);
        assert(result.deleted_ipfacts >= 1);
        assert(result.deleted_submissions >= 1);
        assertEquals(
            result.total_deleted,
            result.deleted_cookiepresents + result.deleted_registrations +
                result.deleted_ipfacts + result.deleted_submissions,
        );

        const cookieCount = Number((db.prepare(
            "SELECT COUNT(*) AS count FROM cookiepresents WHERE ip = ?",
        ).get(ip) as { count: number }).count);
        const registrationCount = Number((db.prepare(
            "SELECT COUNT(*) AS count FROM registrations WHERE ip = ?",
        ).get(ip) as { count: number }).count);
        const ipfactCount = Number((db.prepare(
            "SELECT COUNT(*) AS count FROM ipfact WHERE ip = ?",
        ).get(ip) as { count: number }).count);
        const abgabenCount = Number((db.prepare(
            "SELECT COUNT(*) AS count FROM abgaben WHERE ip = ?",
        ).get(ip) as { count: number }).count);

        assertEquals(cookieCount, 1);
        assertEquals(registrationCount, 1);
        assertEquals(ipfactCount, 1);
        assertEquals(abgabenCount, 1);
    } finally {
        db.exec(`DELETE FROM cookiepresents WHERE ip = '${ip}'`);
        db.exec(`DELETE FROM registrations WHERE ip = '${ip}'`);
        db.exec(`DELETE FROM ipfact WHERE ip = '${ip}'`);
        db.exec(`DELETE FROM abgaben WHERE ip = '${ip}'`);
        usersRepo.deleteByEmail(email);
    }
});

Deno.test("listAvailableThemes returns valid themes with UI labels", () => {
    const themes = listAvailableThemes();

    assertEquals(themes.some((theme) => theme.key === "alien" && theme.label === "Alien"), true);
    assertEquals(themes.some((theme) => theme.key === "krokus" && theme.label === "Crocus"), true);
});

Deno.test("applyTheme copies theme assets and updates current theme", async () => {
    const themesDir = await Deno.makeTempDir();
    const staticDir = await Deno.makeTempDir();
    const originalAssetVersion = config.THEME_ASSET_VERSION;

    try {
        Deno.mkdirSync(`${themesDir}/alien`, { recursive: true });
        Deno.mkdirSync(`${themesDir}/krokus`, { recursive: true });
        Deno.mkdirSync(`${staticDir}/img`, { recursive: true });

        Deno.writeTextFileSync(`${themesDir}/alien/theme.css`, "alien-theme");
        Deno.writeTextFileSync(`${themesDir}/alien/bg-light.jpg`, "alien-light");
        Deno.writeTextFileSync(`${themesDir}/alien/bg-dark.jpg`, "alien-dark");
        Deno.writeTextFileSync(`${themesDir}/krokus/theme.css`, "krokus-theme");
        Deno.writeTextFileSync(`${themesDir}/krokus/bg-light.jpg`, "krokus-light");
        Deno.writeTextFileSync(`${themesDir}/krokus/bg-dark.jpg`, "krokus-dark");

        const applied = applyTheme("krokus", { themesDir, staticDir });

        assertEquals(applied.key, "krokus");
        assertEquals(applied.label, "Crocus");
        assertEquals(Deno.readTextFileSync(`${staticDir}/theme.css`), "krokus-theme");
        assertEquals(Deno.readTextFileSync(`${staticDir}/img/bg-light.jpg`), "krokus-light");
        assertEquals(Deno.readTextFileSync(`${staticDir}/img/bg-dark.jpg`), "krokus-dark");
        assertEquals(getCurrentThemeKey({ themesDir, staticDir }), "krokus");
        assertExists(config.THEME_ASSET_VERSION);
        assertEquals(config.THEME_ASSET_VERSION !== originalAssetVersion, true);
    } finally {
        config.THEME_ASSET_VERSION = originalAssetVersion;
        await Deno.remove(themesDir, { recursive: true });
        await Deno.remove(staticDir, { recursive: true });
    }
});
