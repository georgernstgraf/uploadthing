const config = {
    ABGABEN_DIR: `${Deno.env.get("HOME")}/abgaben`,
    UNTERLAGEN_DIR: `${Deno.env.get("HOME")}/unterlagen`,
    LISTEN_HOST: Deno.env.get("LISTEN_HOST"),
    LISTEN_PORT: Number(Deno.env.get("LISTEN_PORT")),
    page_title: `${Deno.env.get("LISTEN_HOST") || "localhost"}:${
        Deno.env.get("LISTEN_PORT")
    }`,
    MAX_UPLOAD_MB: Number(Deno.env.get("MAX_UPLOAD_MB") || "50"),
    SERVICE_DN: Deno.env.get("SERVICE_DN")!,
    SERVICE_PW: Deno.env.get("SERVICE_PW")!,
    SERVICE_URL: Deno.env.get("SERVICE_URL")!,
    SEARCH_BASE: Deno.env.get("SEARCH_BASE")!,
    logdir: Deno.env.get("LOGDIR") || "/var/log/exampy",
    ldap_retry_wait_seconds: 7,
    TODAY_HOURS_CUTOFF: Number(Deno.env.get("TODAY_HOURS_CUTOFF") || "12"),
    forensic_stale_minutes: Number(
        Deno.env.get("FORENSIC_STALE_MINUTES") || "3",
    ),
    forensic_refresh_seconds: Number(
        Deno.env.get("FORENSIC_REFRESH_SECONDS") || "15",
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
    COOKIE_SECRET: Deno.env.get("COOKIE_SECRET") ||
        "dev-secret-do-not-use-in-production-change-me",
    COOKIE_MAX_AGE_MS: 5 * 30 * 24 * 60 * 60 * 1000, // 5 months in ms
    COOKIE_MAX_AGE_S: 5 * 30 * 24 * 60 * 60, // 5 months in seconds
    SESSION_REFRESH_THRESHOLD_MS: 7 * 24 * 60 * 60 * 1000, // 1 week in ms
    DENO_ENV: Deno.env.get("DENO_ENV") || "development",
    ADMIN_IPS: (Deno.env.get("ADMIN_IPS") || "").split(",").map((s) => s.trim()).filter(Boolean),
};

export const isProduction = config.DENO_ENV === "production";
export const isDevelopment = config.DENO_ENV !== "production";

export default config;
