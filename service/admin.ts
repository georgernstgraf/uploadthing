import { fromFileUrl, join } from "@std/path";
import * as repo from "../repo/repo.ts";
import config from "../lib/config.ts";
import {
    getRuleEnabled,
    isConfigured,
    setRuleEnabled,
} from "./opnsense.ts";
import type { ExamModeRunner } from "./opnsense.ts";

export type { ExamModeRunner } from "./opnsense.ts";

/**
 * Ergebnis eines Schaltversuchs der Exam-Sperre.
 *
 * `internet_active` ist der Zustand, der hergestellt werden sollte —
 * nicht die Bestätigung, dass er hergestellt wurde. Den echten Zustand
 * liefert ausschließlich `getExamModeStatus()`, das die Firewall liest.
 */
export type ExamModeResult = {
    code: number;
    stdout: string;
    stderr: string;
    internet_active: boolean;
    ok: boolean;
};

/**
 * Von der Firewall gelesener Zustand. `internet_active: null` heißt
 * „unbekannt" (Status nicht abrufbar), `configured: false` heißt „die
 * Firewall-Steuerung ist nicht konfiguriert" (lokale Entwicklung).
 */
export type ExamModeStatusResult = {
    code: number;
    stdout: string;
    stderr: string;
    configured: boolean;
    internet_active: boolean | null;
    ok: boolean;
};

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

/**
 * Schaltet die Exam-Sperre über die OPNsense-API.
 *
 * `internet_active: true` löst die Sperre (Regel aus), `false` schaltet
 * sie scharf (Regel an). Die Rückgabe meldet nur, ob das Schalten
 * geklappt hat; der sichtbare Zustand kommt aus `getExamModeStatus()`.
 */
export async function setInternetActive(
    internet_active: boolean,
    runner?: ExamModeRunner,
): Promise<ExamModeResult> {
    const result = await setRuleEnabled(!internet_active, runner);

    return {
        code: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        internet_active,
        ok: result.ok,
    };
}

/**
 * Liest den echten Zustand der Sperrregel von der Firewall. Wird bei
 * jedem Rendern des Admin-Panels aufgerufen — bewusst ohne Polling.
 */
export async function getExamModeStatus(
    runner?: ExamModeRunner,
): Promise<ExamModeStatusResult> {
    const state = await getRuleEnabled(runner);

    return {
        code: state.code,
        stdout: state.stdout,
        stderr: state.stderr,
        configured: state.configured,
        internet_active: state.rule_enabled === null ? null : !state.rule_enabled,
        ok: state.ok,
    };
}

/**
 * Anzeigezustand der Firewall-Karte im Admin-Panel.
 *
 * - `frei`: Regel aus, Internet freigegeben
 * - `gesperrt`: Regel aktiv, Internet gesperrt
 * - `unbekannt`: Status nicht abrufbar (Schalter deaktiviert, Modal)
 * - `nicht-konfiguriert`: keine API-Credentials (lokale Entwicklung)
 */
export type FirewallState = "frei" | "gesperrt" | "unbekannt" | "nicht-konfiguriert";

export function describeFirewallState(status: ExamModeStatusResult): FirewallState {
    if (!status.configured) {
        return "nicht-konfiguriert";
    }
    if (status.internet_active === null) {
        return "unbekannt";
    }
    return status.internet_active ? "frei" : "gesperrt";
}

/**
 * Daten für die Firewall-Karte im Admin-Panel.
 *
 * `actionError` ist der Fehler der auslösenden Aktion (z. B. „Examen
 * starten konnte die Sperre nicht schalten"); er hat Vorrang vor einem
 * Lesefehler, weil er die Ursache nennt. Ein Zustand „unbekannt" zeigt
 * das Modal immer, ein nicht konfigurierter Client nie.
 */
export type ExamFirewallPanel = {
    firewall_state: FirewallState;
    firewall_error?: string;
    firewall_modal: boolean;
};

export function buildExamFirewallPanel(
    status: ExamModeStatusResult,
    actionError?: string,
): ExamFirewallPanel {
    const firewall_state = describeFirewallState(status);
    const readError = status.ok ? undefined : status.stderr;
    const firewall_error = actionError ?? readError;
    const alerts = firewall_state !== "nicht-konfiguriert" && Boolean(firewall_error);

    return {
        firewall_state,
        firewall_error,
        firewall_modal: alerts || firewall_state === "unbekannt",
    };
}

export function isExamModeConfigured(): boolean {
    return isConfigured();
}

/**
 * Beim Applikationsstart ist Exam Mode Off / Internet frei:
 *
 * - Ein beim vorherigen Prozesslauf hängengebliebener Exam-Zustand
 *   (`running`/`paused`) wird auf `stopped` gesetzt, damit kein
 *   Countdown über den Neustart weiterläuft.
 * - Ist die OPNsense-API konfiguriert, wird die Sperrregel gelöst.
 * - Ein Fehler der Firewall-API beendet den Prozess **nicht**: die
 *   Sperre ist nicht von jeder Maschine aus schaltbar (keine
 *   Credentials, Firewall offline) und die App muss trotzdem starten.
 *   Der Fehler wird geloggt; das Panel zeigt anschließend den echten
 *   Zustand der Regel.
 */
export async function runExamModeOnStartup(
    runner?: ExamModeRunner,
): Promise<void> {
    resetExamStateOnStartup();

    if (!isConfigured()) {
        console.log(
            "OPNsense-API nicht konfiguriert, Internet-Freigabe beim Start übersprungen",
        );
        return;
    }

    console.log("Löse Exam-Sperre beim Start (Internet frei) ...");
    const result = await setInternetActive(true, runner);

    if (!result.ok) {
        console.error(
            `Exam-Sperre konnte beim Start nicht gelöst werden (HTTP ${result.code}): ${result.stderr}`,
        );
        return;
    }

    console.log("Exam-Sperre beim Start gelöst (Internet frei)");
}

/**
 * Setzt einen beim vorherigen Lauf hängengebliebenen Exam-Zustand
 * (`running`/`paused`) konsistent auf `stopped`. Fehlende oder
 * bereits beendete Zustände bleiben unverändert.
 */
function resetExamStateOnStartup(): void {
    const state = repo.exam.get();
    if (!state || (state.status !== "running" && state.status !== "paused")) {
        return;
    }

    repo.exam.upsert({
        ...state,
        status: "stopped",
        updated_at: new Date(),
    });
    console.log("Exam state reset to stopped on startup");
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

export function cleanupDatabaseOlderThanOneYear(
    now = new Date(),
): DatabaseCleanupResult {
    const cutoff = new Date(now);
    cutoff.setFullYear(cutoff.getFullYear() - 1);

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
