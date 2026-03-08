import { assertEquals, assertExists } from "@std/assert";
import config from "../lib/config.ts";
import {
    applyTheme,
    getCurrentThemeKey,
    getExamModeCommandArg,
    listAvailableThemes,
    setInternetActive,
} from "./admin.ts";

Deno.test("getExamModeCommandArg maps internet state to script arg", () => {
    assertEquals(getExamModeCommandArg(true), "off");
    assertEquals(getExamModeCommandArg(false), "on");
});

Deno.test("setInternetActive updates runtime state on success", async () => {
    const originalCommand = config.EXAMMODE_COMMAND;
    const originalInternetState = config.INTERNET_ACTIVE;

    try {
        config.EXAMMODE_COMMAND = "exammode";
        config.INTERNET_ACTIVE = false;

        const result = await setInternetActive(true, (command, args) => {
            assertEquals(command, "exammode");
            assertEquals(args, ["off"]);
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
