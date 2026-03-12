import { fromFileUrl, join } from "@std/path";
import * as repo from "../repo/repo.ts";
import config from "../lib/config.ts";

export type ExamModeResult = {
    code: number;
    stdout: string;
    stderr: string;
    command_arg: "on" | "off";
    internet_active: boolean;
    ok: boolean;
};

export type ExamModeRunnerResult = {
    code: number;
    stdout: string;
    stderr: string;
};

export type ExamModeRunner = (
    command: string,
    args: string[],
) => Promise<ExamModeRunnerResult>;

export type ThemeOption = {
    key: string;
    label: string;
};

export type DatabaseCleanupResult = {
    cutoff: Date;
    deleted_cookiepresents: number;
    deleted_registrations: number;
    deleted_ipfacts: number;
    deleted_submissions: number;
    total_deleted: number;
};

type ThemePathsOptions = {
    themesDir?: string;
    staticDir?: string;
};

const defaultThemesDir = fromFileUrl(new URL("../themes", import.meta.url));
const defaultStaticDir = fromFileUrl(new URL("../static", import.meta.url));

function getThemePaths(options: ThemePathsOptions = {}) {
    return {
        themesDir: options.themesDir ?? defaultThemesDir,
        staticDir: options.staticDir ?? defaultStaticDir,
    };
}

function getThemeLabel(key: string): string {
    if (key === "krokus") {
        return "Crocus";
    }

    return key.charAt(0).toUpperCase() + key.slice(1);
}

function getThemeSourcePaths(themeKey: string, themesDir: string) {
    const themeDir = join(themesDir, themeKey);
    return {
        themeCss: join(themeDir, "theme.css"),
        bgLight: join(themeDir, "bg-light.jpg"),
        bgDark: join(themeDir, "bg-dark.jpg"),
    };
}

function getThemeTargetPaths(staticDir: string) {
    return {
        themeCss: join(staticDir, "theme.css"),
        bgLight: join(staticDir, "img", "bg-light.jpg"),
        bgDark: join(staticDir, "img", "bg-dark.jpg"),
    };
}

function fileExists(path: string): boolean {
    try {
        Deno.statSync(path);
        return true;
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return false;
        }

        throw error;
    }
}

function hasRequiredThemeFiles(themeKey: string, themesDir: string): boolean {
    const paths = getThemeSourcePaths(themeKey, themesDir);
    return fileExists(paths.themeCss) && fileExists(paths.bgLight) && fileExists(paths.bgDark);
}

function filesEqual(pathA: string, pathB: string): boolean {
    if (!fileExists(pathA) || !fileExists(pathB)) {
        return false;
    }

    const fileA = Deno.readFileSync(pathA);
    const fileB = Deno.readFileSync(pathB);

    if (fileA.length !== fileB.length) {
        return false;
    }

    return fileA.every((value, index) => value === fileB[index]);
}

export function listAvailableThemes(options: ThemePathsOptions = {}): ThemeOption[] {
    const { themesDir } = getThemePaths(options);
    const themes: ThemeOption[] = [];

    for (const entry of Deno.readDirSync(themesDir)) {
        if (!entry.isDirectory) continue;
        if (!hasRequiredThemeFiles(entry.name, themesDir)) continue;

        themes.push({
            key: entry.name,
            label: getThemeLabel(entry.name),
        });
    }

    return themes.sort((a, b) => a.label.localeCompare(b.label, "de"));
}

export function getCurrentThemeKey(options: ThemePathsOptions = {}): string | null {
    const { themesDir, staticDir } = getThemePaths(options);
    const targetPaths = getThemeTargetPaths(staticDir);

    for (const theme of listAvailableThemes({ themesDir, staticDir })) {
        const sourcePaths = getThemeSourcePaths(theme.key, themesDir);

        if (
            filesEqual(sourcePaths.themeCss, targetPaths.themeCss) &&
            filesEqual(sourcePaths.bgLight, targetPaths.bgLight) &&
            filesEqual(sourcePaths.bgDark, targetPaths.bgDark)
        ) {
            return theme.key;
        }
    }

    return null;
}

export function applyTheme(themeKey: string, options: ThemePathsOptions = {}): ThemeOption {
    const { themesDir, staticDir } = getThemePaths(options);
    const theme = listAvailableThemes({ themesDir, staticDir }).find((entry) => entry.key === themeKey);

    if (!theme) {
        throw new Error(`Unbekanntes Theme: ${themeKey}`);
    }

    const sourcePaths = getThemeSourcePaths(theme.key, themesDir);
    const targetPaths = getThemeTargetPaths(staticDir);

    Deno.mkdirSync(join(staticDir, "img"), { recursive: true });
    Deno.copyFileSync(sourcePaths.themeCss, targetPaths.themeCss);
    Deno.copyFileSync(sourcePaths.bgLight, targetPaths.bgLight);
    Deno.copyFileSync(sourcePaths.bgDark, targetPaths.bgDark);
    config.THEME_ASSET_VERSION = `${Date.now()}`;

    return theme;
}

export function getExamModeCommandArg(internet_active: boolean): "on" | "off" {
    return internet_active ? "off" : "on";
}

async function defaultExamModeRunner(
    command: string,
    args: string[],
): Promise<ExamModeRunnerResult> {
    const output = await new Deno.Command(command, {
        args,
        stdout: "piped",
        stderr: "piped",
    }).output();

    return {
        code: output.code,
        stdout: new TextDecoder().decode(output.stdout).trim(),
        stderr: new TextDecoder().decode(output.stderr).trim(),
    };
}

export async function setInternetActive(
    internet_active: boolean,
    runner: ExamModeRunner = defaultExamModeRunner,
): Promise<ExamModeResult> {
    const command_arg = getExamModeCommandArg(internet_active);
    const result = await runner(config.EXAMMODE_COMMAND, [command_arg]);
    const ok = result.code === 0;

    if (ok) {
        config.INTERNET_ACTIVE = internet_active;
    }

    return {
        ...result,
        command_arg,
        internet_active: config.INTERNET_ACTIVE,
        ok,
    };
}

export function createDatabaseBackup(destinationPath: string): void {
    try {
        Deno.removeSync(destinationPath);
    } catch (e) {
        if (!(e instanceof Deno.errors.NotFound)) {
            console.error("Error removing old vacuum.db:", e);
        }
    }

    repo.vacuumInto(destinationPath);
}

export function wipeAbgabenDirectory(dirPath: string): void {
    try {
        for (const dirEntry of Deno.readDirSync(dirPath)) {
            Deno.removeSync(`${dirPath}/${dirEntry.name}`, { recursive: true });
        }
    } catch (e) {
        if (e instanceof Deno.errors.NotFound) {
            Deno.mkdirSync(dirPath, { recursive: true });
        } else {
            console.error(`Error wiping directory ${dirPath}:`, e);
            throw e;
        }
    }
}

export function cleanupDatabaseOlderThanOneMonth(
    now = new Date(),
): DatabaseCleanupResult {
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - 1);

    const deleted_cookiepresents = repo.cookiepresents.deleteOlderThan(cutoff);
    const deleted_registrations = repo.registrations.deleteOlderThan(cutoff);
    const deleted_ipfacts = repo.ipfact.deleteOlderThan(cutoff);
    const deleted_submissions = repo.abgaben.deleteOlderThan(cutoff);

    return {
        cutoff,
        deleted_cookiepresents,
        deleted_registrations,
        deleted_ipfacts,
        deleted_submissions,
        total_deleted: deleted_cookiepresents + deleted_registrations +
            deleted_ipfacts + deleted_submissions,
    };
}
