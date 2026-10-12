import { assert, assertEquals, assertExists } from "@std/assert";
import config from "../lib/config.ts";
import {
    applyTheme,
    cleanupDatabaseOlderThanOneYear,
    getCurrentThemeKey,
    getExamModeCommandArg,
    getExamModeStatus,
    listAvailableThemes,
    runExamModeOnStartup,
    setInternetActive,
} from "./admin.ts";
import { db } from "../repo/db.ts";
import * as usersRepo from "../repo/users.ts";
import * as cookiepresentsRepo from "../repo/cookiepresents.ts";
import * as registrationsRepo from "../repo/registrations.ts";
import * as ipfactRepo from "../repo/ipfact.ts";
import * as abgabenRepo from "../repo/abgaben.ts";
import * as examRepo from "../repo/exam.ts";
import { clearExamState } from "../test/helpers/forensics_fixture.ts";

Deno.test("getExamModeCommandArg maps internet state to script arg", () => {
    assertEquals(getExamModeCommandArg(true), "stop");
    assertEquals(getExamModeCommandArg(false), "start");
});

Deno.test("setInternetActive updates runtime state on success", async () => {
    const originalCommand = config.EXAMMODE_COMMAND;
    const originalInternetState = config.INTERNET_ACTIVE;

    try {
        config.EXAMMODE_COMMAND = "exammode";
        config.INTERNET_ACTIVE = false;

        const result = await setInternetActive(true, (command, args) => {
            assertEquals(command, "exammode");
            assertEquals(args, ["stop"]);
            return Promise.resolve({
                code: 0,
                stdout: "internet enabled",
                stderr: "",
            });
        });

        assertEquals(result.ok, true);
        assertEquals(result.internet_active, true);
        assertEquals(config.INTERNET_ACTIVE, true);
        assertEquals(result.stdout, "internet enabled");
    } finally {
        config.EXAMMODE_COMMAND = originalCommand;
        config.INTERNET_ACTIVE = originalInternetState;
    }
});

Deno.test("setInternetActive keeps previous state on failure", async () => {
    const originalCommand = config.EXAMMODE_COMMAND;
    const originalInternetState = config.INTERNET_ACTIVE;

    try {
        config.EXAMMODE_COMMAND = "exammode";
        config.INTERNET_ACTIVE = true;

        const result = await setInternetActive(false, () => {
            return Promise.resolve({
                code: 0,
                stdout: "internet disabled",
                stderr: "",
            });
        });

        assertEquals(result.ok, true);
        assertEquals(result.internet_active, false);
        assertEquals(config.INTERNET_ACTIVE, false);
        assertEquals(result.stdout, "internet disabled");
    } finally {
        config.EXAMMODE_COMMAND = originalCommand;
        config.INTERNET_ACTIVE = originalInternetState;
    }
});

Deno.test("getExamModeStatus returns internet_active from stdout", async () => {
    const originalCommand = config.EXAMMODE_COMMAND;
    const originalInternetState = config.INTERNET_ACTIVE;

    try {
        config.EXAMMODE_COMMAND = "exammode";

        const resultOn = await getExamModeStatus((command, args) => {
            assertEquals(command, "exammode");
            assertEquals(args, ["status"]);
            return Promise.resolve({ code: 0, stdout: "on", stderr: "" });
        });
        assertEquals(resultOn.ok, true);
        assertEquals(resultOn.internet_active, false);

        const resultOff = await getExamModeStatus(() => {
            return Promise.resolve({ code: 0, stdout: "off", stderr: "" });
        });
        assertEquals(resultOff.ok, true);
        assertEquals(resultOff.internet_active, true);

        const resultFail = await getExamModeStatus(() => {
            return Promise.resolve({ code: 1, stdout: "", stderr: "error" });
        });
        assertEquals(resultFail.ok, false);
    } finally {
        config.EXAMMODE_COMMAND = originalCommand;
        config.INTERNET_ACTIVE = originalInternetState;
    }
});

Deno.test("runExamModeOnStartup schaltet beim Start das Internet frei", async () => {
    const originalCommand = Deno.env.get("EXAMMODE_COMMAND");
    const originalInternetState = config.INTERNET_ACTIVE;
    clearExamState();

    try {
        Deno.env.set("EXAMMODE_COMMAND", "exammode");
        config.INTERNET_ACTIVE = false;

        const capturedArgs: string[] = [];
        await runExamModeOnStartup((_command, args) => {
            capturedArgs.push(...args);
            return Promise.resolve({
                code: 0,
                stdout: "internet enabled",
                stderr: "",
            });
        });

        assertEquals(capturedArgs, ["stop"]);
        assertEquals(config.INTERNET_ACTIVE, true);
    } finally {
        if (originalCommand !== undefined) {
            Deno.env.set("EXAMMODE_COMMAND", originalCommand);
        } else {
            Deno.env.delete("EXAMMODE_COMMAND");
        }
        config.INTERNET_ACTIVE = originalInternetState;
        clearExamState();
    }
});

Deno.test("runExamModeOnStartup ohne EXAMMODE_COMMAND überspringt den Runner", async () => {
    const originalCommand = Deno.env.get("EXAMMODE_COMMAND");
    const originalInternetState = config.INTERNET_ACTIVE;
    clearExamState();

    try {
        Deno.env.delete("EXAMMODE_COMMAND");
        config.INTERNET_ACTIVE = false;

        let runnerCalled = false;
        await runExamModeOnStartup(() => {
            runnerCalled = true;
            return Promise.resolve({ code: 0, stdout: "", stderr: "" });
        });

        assertEquals(runnerCalled, false);
        assertEquals(config.INTERNET_ACTIVE, false);
    } finally {
        if (originalCommand !== undefined) {
            Deno.env.set("EXAMMODE_COMMAND", originalCommand);
        }
        config.INTERNET_ACTIVE = originalInternetState;
        clearExamState();
    }
});

Deno.test("runExamModeOnStartup setzt einen hängengebliebenen Exam-Zustand auf stopped", async () => {
    const originalCommand = Deno.env.get("EXAMMODE_COMMAND");
    clearExamState();

    try {
        Deno.env.delete("EXAMMODE_COMMAND");

        for (const status of ["running", "paused"] as const) {
            examRepo.upsert({
                status,
                duration_seconds: 600,
                started_at: new Date("2026-10-12T08:00:00.000Z"),
                paused_seconds: 30,
                extra_seconds: 60,
                updated_at: new Date("2026-10-12T08:05:00.000Z"),
            });

            await runExamModeOnStartup(() => {
                throw new Error("Runner darf ohne EXAMMODE_COMMAND nicht laufen.");
            });

            const state = examRepo.get();
            assertEquals(state?.status, "stopped");
            assertEquals(state?.duration_seconds, 600);
            assertEquals(state?.extra_seconds, 60);
            clearExamState();
        }
    } finally {
        if (originalCommand !== undefined) {
            Deno.env.set("EXAMMODE_COMMAND", originalCommand);
        }
        clearExamState();
    }
});

Deno.test("runExamModeOnStartup lässt fehlende oder beendete Exam-Zustände unverändert", async () => {
    const originalCommand = Deno.env.get("EXAMMODE_COMMAND");
    clearExamState();

    try {
        Deno.env.delete("EXAMMODE_COMMAND");

        const noopRunner = () => {
            throw new Error("Runner darf ohne EXAMMODE_COMMAND nicht laufen.");
        };

        // Ohne Zeile: bleibt ohne Zeile (idle).
        await runExamModeOnStartup(noopRunner);
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
        await runExamModeOnStartup(noopRunner);
        assertEquals(examRepo.get()?.status, "stopped");
    } finally {
        if (originalCommand !== undefined) {
            Deno.env.set("EXAMMODE_COMMAND", originalCommand);
        }
        clearExamState();
    }
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

Deno.test("setInternetActive keeps previous state on failure", async () => {
    const originalCommand = config.EXAMMODE_COMMAND;
    const originalInternetState = config.INTERNET_ACTIVE;

    try {
        config.EXAMMODE_COMMAND = "exammode";
        config.INTERNET_ACTIVE = true;

        const result = await setInternetActive(false, () => {
            return Promise.resolve({ code: 7, stdout: "", stderr: "ssh failed" });
        });

        assertEquals(result.ok, false);
        assertEquals(result.internet_active, true);
        assertEquals(config.INTERNET_ACTIVE, true);
        assertEquals(result.stderr, "ssh failed");
    } finally {
        config.EXAMMODE_COMMAND = originalCommand;
        config.INTERNET_ACTIVE = originalInternetState;
    }
});
