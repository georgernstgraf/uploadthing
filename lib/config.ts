import { parseSqliteDatabaseUrl } from "./dbpath.ts";
import { normalizeMac } from "./mac.ts";

function requireEnv(name: string, hint?: string): string {
    const value = Deno.env.get(name);
    if (!value) {
        throw new Error(`${name} muss gesetzt sein${hint ? ` (${hint})` : ""}.`);
    }
    return value;
}

function parseRequiredIpList(name: string): string[] {
    const raw = requireEnv(name, "komma-separierte IP-Liste");
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * `ADMIN_MACS` ist die Übergangsfreigabe für Lehrpersonen-Geräte (#147),
 * bis die Liste im Admin-Bereich gepflegt wird.
 *
 * Fehlt die Variable oder ist sie leer, gibt es keine Freigabe über die
 * Env — das ist kein Startfehler. Ein Eintrag, der keine MAC-Adresse ist,
 * ist dagegen ein Tippfehler, der eine Freigabe still unwirksam machen
 * würde: er bricht den Start mit deutscher Meldung ab. Die Werte werden
 * kanonisiert (`aa:bb:cc:dd:ee:ff`), doppelte Einträge fallen weg.
 */
export function parseAdminMacList(raw: string | undefined): string[] {
    const value = raw?.trim() ?? "";
    if (!value) {
        return [];
    }

    const macs = new Set<string>();
    for (const entry of value.split(",")) {
        const trimmed = entry.trim();
        if (!trimmed) {
            continue;
        }

        const mac = normalizeMac(trimmed);
        if (!mac) {
            throw new Error(
                `ADMIN_MACS enthält keine gültige MAC-Adresse: "${trimmed}" (erwartet z. B. aa:bb:cc:dd:ee:ff).`,
            );
        }
        macs.add(mac);
    }

    return [...macs];
}

export function parsePermittedFileTypes(raw: string): string[] {
    return [...new Set(
        raw
            .split(",")
            .map((s) => s.trim().toLowerCase().replace(/^\.+/, ""))
            .filter(Boolean),
    )];
}

/**
 * Erlaubte Dateitypen für Prüfungsunterlagen (#134).
 *
 * `UNTERLAGEN_PERMITTED_FILETYPES` ist bewusst getrennt von
 * `PERMITTED_FILETYPES` (das gilt für Abgaben und ist zur Laufzeit über
 * die Admin-Oberfläche änderbar). Fehlt die Variable, ist `md` erlaubt —
 * die Unterlagen sind Angaben in Markdown.
 *
 * Eine gesetzte, aber leere Liste (z. B. `,,`) ist ein Startfehler: sonst
 * wäre der Admin-Upload stillschweigend für jede Datei gesperrt.
 */
export function parseUnterlagenFileTypes(raw: string | undefined): string[] {
    const value = raw?.trim() ?? "";
    if (!value) {
        return ["md"];
    }

    const types = parsePermittedFileTypes(value);
    if (types.length === 0) {
        throw new Error(
            'UNTERLAGEN_PERMITTED_FILETYPES enthält keinen gültigen Dateityp (erwartet z. B. "md" oder "md, pdf").',
        );
    }
    return types;
}

export type OpnsenseConfig = {
    apiUrl: string;
    apiKey: string;
    apiSecret: string;
    ruleUuid: string;
};

/**
 * Zugang zur OPNsense-API für die Exam-Sperre.
 *
 * `OPNSENSE_API_KEY` und `OPNSENSE_API_SECRET` sind beide oder keins:
 * fehlen beide, ist die Firewall-Steuerung deaktiviert (lokale
 * Entwicklung) und das Admin-Panel zeigt „nicht konfiguriert". Ist nur
 * eine der beiden Variablen gesetzt, ist das ein Startfehler — ein
 * halb konfigurierter Client würde sonst stillschweigend nichts tun.
 *
 * Sind die Credentials gesetzt, gehören API-URL und Regel-UUID zwingend
 * dazu: beides ist Betriebswissen und steht nicht im Code.
 */
export function parseOpnsenseConfig(
    options: {
        apiKey?: string;
        apiSecret?: string;
        apiUrl?: string;
        ruleUuid?: string;
    },
): OpnsenseConfig | null {
    const apiKey = options.apiKey?.trim() ?? "";
    const apiSecret = options.apiSecret?.trim() ?? "";

    if (!apiKey && !apiSecret) {
        return null;
    }

    if (!apiKey || !apiSecret) {
        throw new Error(
            "OPNSENSE_API_KEY und OPNSENSE_API_SECRET müssen gemeinsam gesetzt sein.",
        );
    }

    const apiUrl = options.apiUrl?.trim().replace(/\/+$/, "") ?? "";
    if (!apiUrl) {
        throw new Error(
            "OPNSENSE_API_URL muss gesetzt sein, wenn OPNSENSE_API_KEY und OPNSENSE_API_SECRET gesetzt sind (z. B. https://192.168.21.1:8443).",
        );
    }

    const ruleUuid = options.ruleUuid?.trim() ?? "";
    if (!ruleUuid) {
        throw new Error(
            "OPNSENSE_EXAMMODE_RULE_UUID muss gesetzt sein, wenn OPNSENSE_API_KEY und OPNSENSE_API_SECRET gesetzt sind.",
        );
    }

    return { apiUrl, apiKey, apiSecret, ruleUuid };
}

export type TikConfig = {
    url: string;
    user: string;
    password: string;
};

/**
 * Zugang zum MikroTik-REST-Endpunkt (#145).
 *
 * Die drei Variablen sind gemeinsam oder gar nicht gesetzt: fehlen alle,
 * ist das Polling deaktiviert (lokale Entwicklung ohne Prüfungsnetz) und
 * das Admin-Panel zeigt „nicht konfiguriert". Fehlt auch nur eine, ist das
 * ein Startfehler — ein halb konfigurierter Client würde sonst
 * stillschweigend keine IP-Adressen erfassen.
 *
 * Das Passwort bleibt ausschließlich in der `.env`; es taucht in keiner
 * Fehlermeldung und keinem Log auf.
 */
export function parseTikConfig(
    options: { url?: string; user?: string; password?: string },
): TikConfig | null {
    const url = options.url?.trim().replace(/\/+$/, "") ?? "";
    const user = options.user?.trim() ?? "";
    const password = options.password ?? "";

    if (!url && !user && !password) {
        return null;
    }

    if (!url || !user || !password) {
        throw new Error(
            "TIK_URL, TIK_USER und TIK_PASSWORD müssen gemeinsam gesetzt sein.",
        );
    }

    return { url, user, password };
}

export function parseTlsConfig(
    certPath: string | undefined,
    keyPath: string | undefined,
): { certPath: string; keyPath: string } | null {
    if (!certPath && !keyPath) {
        return null;
    }
    if (certPath && keyPath) {
        return { certPath, keyPath };
    }
    throw new Error(
        "TLS_CERT_PATH und TLS_KEY_PATH müssen gemeinsam gesetzt sein.",
    );
}

/**
 * Baut die im Hero-Header angezeigte URL.
 *
 * PUBLIC_URL (vollständige URL, z. B. "https://tst.spengergasse.at:8443")
 * hat Vorrang und ist vom Bind-Host entkoppelt. Ohne PUBLIC_URL gilt das
 * bisherige Verhalten: "http://<LISTEN_HOST>:<LISTEN_PORT>/".
 */
export function buildHeroUrl(
    publicUrl: string | undefined,
    listenHost: string | undefined,
    listenPort: number,
): string {
    const trimmed = publicUrl?.trim();
    if (trimmed) {
        return trimmed.replace(/\/+$/, "");
    }
    return `http://${listenHost || "localhost"}:${listenPort}/`;
}

/**
 * Titelzeile im Browser-Tab (#149).
 *
 * Mit PUBLIC_URL steht dort der Hostname, unter dem die App erreichbar
 * ist ("tst.spengergasse.at") — nicht die Bind-Adresse. Port und Pfad
 * gehören nicht in den Tab-Titel. Ohne PUBLIC_URL gilt das bisherige
 * Verhalten "<LISTEN_HOST>:<LISTEN_PORT>".
 *
 * Eine gesetzte, aber unparsebare PUBLIC_URL bricht den Start mit einer
 * deutschen Meldung ab: sonst stünde wieder die Bind-Adresse im Titel
 * und der Konfigurationsfehler bliebe unbemerkt.
 */
export function buildPageTitle(
    publicUrl: string | undefined,
    listenHost: string | undefined,
    listenPort: number,
): string {
    const trimmed = publicUrl?.trim();
    if (!trimmed) {
        return `${listenHost || "localhost"}:${listenPort}`;
    }

    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        throw new Error(
            `PUBLIC_URL ist keine gültige URL: "${trimmed}" (erwartet z. B. https://tst.spengergasse.at/).`,
        );
    }
    return parsed.hostname;
}

const databaseUrl = Deno.env.get("DATABASE_URL") || "";

const config = {
    DATABASE_PATH: parseSqliteDatabaseUrl(databaseUrl),
    ABGABEN_DIR: requireEnv("ABGABEN_DIR"),
    UNTERLAGEN_DIR: requireEnv("UNTERLAGEN_DIR"),
    LISTEN_HOST: Deno.env.get("LISTEN_HOST"),
    LISTEN_PORT: Number(requireEnv("LISTEN_PORT", "z.B. 8000")),
    TLS: parseTlsConfig(
        Deno.env.get("TLS_CERT_PATH"),
        Deno.env.get("TLS_KEY_PATH"),
    ),
    OPNSENSE: parseOpnsenseConfig({
        apiKey: Deno.env.get("OPNSENSE_API_KEY"),
        apiSecret: Deno.env.get("OPNSENSE_API_SECRET"),
        apiUrl: Deno.env.get("OPNSENSE_API_URL"),
        ruleUuid: Deno.env.get("OPNSENSE_EXAMMODE_RULE_UUID"),
    }),
    TIK: parseTikConfig({
        url: Deno.env.get("TIK_URL"),
        user: Deno.env.get("TIK_USER"),
        password: Deno.env.get("TIK_PASSWORD"),
    }),
    page_title: buildPageTitle(
        Deno.env.get("PUBLIC_URL"),
        Deno.env.get("LISTEN_HOST"),
        Number(Deno.env.get("LISTEN_PORT")),
    ),
    hero_url: buildHeroUrl(
        Deno.env.get("PUBLIC_URL"),
        Deno.env.get("LISTEN_HOST"),
        Number(Deno.env.get("LISTEN_PORT")),
    ),
    MAX_UPLOAD_MB: Number(Deno.env.get("MAX_UPLOAD_MB") || "50"),
    PERMITTED_FILETYPES: parsePermittedFileTypes(
        Deno.env.get("PERMITTED_FILETYPES") || "zip",
    ),
    UNTERLAGEN_PERMITTED_FILETYPES: parseUnterlagenFileTypes(
        Deno.env.get("UNTERLAGEN_PERMITTED_FILETYPES"),
    ),
    SERVICE_DN: requireEnv("SERVICE_DN"),
    SERVICE_PW: requireEnv("SERVICE_PW"),
    SERVICE_URL: requireEnv("SERVICE_URL"),
    SEARCH_BASE: requireEnv("SEARCH_BASE"),
    logdir: Deno.env.get("LOGDIR") || "/var/log/exampy",
    ldap_retry_wait_seconds: 7,
    TODAY_HOURS_CUTOFF: Number(Deno.env.get("TODAY_HOURS_CUTOFF") || "12"),
    admin_stale_minutes: Number(
        Deno.env.get("ADMIN_STALE_MINUTES") || "3",
    ),
    admin_refresh_seconds: Number(
        Deno.env.get("ADMIN_REFRESH_SECONDS") || "15",
    ),
    spg_times: [
        "08:00",
        "08:50",
        "09:40",
        "09:55",
        "10:45",
        "11:35",
        "12:25",
        "12:35",
        "13:25",
        "14:15",
        "14:25",
        "15:15",
        "16:05",
        "16:15",
        "17:05",
        "17:10",
        "17:55",
        "18:40",
        "18:50",
        "19:35",
        "20:20",
        "20:30",
        "21:15",
        "22:00",
    ],
    COOKIE_NAME: Deno.env.get("COOKIE_NAME") || "ut_session",
    COOKIE_SECRET: requireEnv("COOKIE_SECRET"),
    COOKIE_MAX_AGE_MS: 5 * 30 * 24 * 60 * 60 * 1000, // 5 months in ms
    COOKIE_MAX_AGE_S: 5 * 30 * 24 * 60 * 60, // 5 months in seconds
    SESSION_REFRESH_THRESHOLD_MS: 7 * 24 * 60 * 60 * 1000, // 1 week in ms
    DENO_ENV: Deno.env.get("DENO_ENV") || "development",
    ADMIN_IPS: parseRequiredIpList("ADMIN_IPS"),
    // Übergangsfreigabe für Lehrpersonen-Geräte (#147); fehlend = keine
    // MAC-Freigabe über die Env, die DB-Allowlist bleibt davon unberührt.
    ADMIN_MACS: parseAdminMacList(Deno.env.get("ADMIN_MACS")),
    THEME_ASSET_VERSION: `${Date.now()}`,
};

export const isProduction = config.DENO_ENV === "production";
export const isDevelopment = config.DENO_ENV !== "production";

export default config;
