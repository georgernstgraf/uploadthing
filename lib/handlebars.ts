import Handlebars from "handlebars";
import { UserType, TopType } from "./types.ts";
import type {
    ServiceAdminAnomalies,
    ServiceIPDetail,
    ServiceIpAdmin,
} from "../service/ipadmin.ts";
import type { FirewallState } from "../service/admin.ts";
import type { TikPanelState } from "../service/tik.ts";

// --- 2. Template Data Type Definitions ---

type StartPageTemplateData = {
    files: string[];
    panel_html: string;
};

type AbgabeTemplateData = {
    accept_attr?: string;
    types_label?: string;
    types_feedback?: string;
    exam_open?: boolean;
    exam_ends_at_ms?: number;
    exam_paused?: boolean;
    exam_remaining_label?: string;
    toast_message?: string;
    toast_type?: string;
    /** Abgelehnte Anmeldung, sichtbar auch für bereits Angemeldete (#152). */
    login_error?: string;
    success?: {
        filename: string;
        filesize: string;
        duration_seconds: string;
        md5sum: string;
    };
};

type LoginPanelTemplateData = {
    title?: string;
    error?: string;
};

type WhoamiTemplateData = {
    remote_user: UserType | null;
    login_panel_html: string;
};

type NavTemplateData = TopType;

type UserbadgeTemplateData = TopType;

type MainTemplateData = TopType & {
    content: string;
};

type IndexTemplateData = TopType & {
    content: string;
};

type LdapTemplateData = {
    users: { email: string; label: string; klasse?: string }[];
    error?: string;
    empty?: boolean;
    has_more?: boolean;
};

type AdminTemplateData = {
    remote_user: UserType;
    spg_times: string[];
    starttime: string;
    endtime: string;
    startdate: string;
    enddate: string;
    ips_with_name: ServiceIpAdmin[];
    ips_without_name: ServiceIpAdmin[];
    teacher_ips: ServiceIpAdmin[];
    anomalies: ServiceAdminAnomalies;
    range_first_seen: string;
    range_last_seen: string;
    withinTimeCutoff: boolean;
    endtimeInFuture: boolean;
    endtimeProvided: boolean;
    tik_state: TikPanelState;
    tik_last_attempt: string;
    tik_last_success: string;
    tik_last_count: number;
    tik_error: string;
};

type AdminFileTypesTemplateData = {
    permitted_filetypes: string;
    current_filetypes: string[];
    /** Dateien in `UNTERLAGEN_DIR` (#134), so wie Schüler sie sehen. */
    unterlagen: string[];
    /** Erlaubte Endungen aus `UNTERLAGEN_PERMITTED_FILETYPES`. */
    unterlagen_filetypes: string[];
    /** `accept`-Attribut für das Upload-Feld, z. B. `.md`. */
    unterlagen_accept: string;
    max_upload_mb: number;
    /** Freigegebene MACs aus der Datenbank (#147). */
    allowed_macs: { mac: string; comment: string; created_at: string }[];
    /** Zusätzliche Freigaben aus `ADMIN_MACS` (nur lesbar). */
    env_admin_macs: string[];
    exam_panel_html: string;
    available_themes: { key: string; label: string }[];
    current_theme_key: string | null;
    success_message?: string;
    cleanup_result_html?: string;
};

export type AdminExamModeTemplateData = {
    exam_status: "idle" | "running" | "paused" | "stopped";
    exam_remaining_label: string;
    exam_open: boolean;
    /** true bei running und paused — steuert Warnband, Schalter und Dialoge. */
    exam_running: boolean;
    firewall_state: FirewallState;
    firewall_error?: string;
    /** true = nicht wegklickbares Modal mit dem API-Fehler zeigen. */
    firewall_modal: boolean;
    /** Anmelde-Freigabe während des Examens (#161). */
    registration_open: boolean;
    /** Anzeigefertige Uhrzeit der Freigabe, leer wenn gesperrt. */
    registration_since: string;
    /** Gründe, aus denen das Examen „nicht dicht" ist; leer = alles zu. */
    exam_hazards: ExamHazardView[];
    success_message?: string;
};

/** Anzeigeform einer Gefahr im roten Balken. */
export type ExamHazardView = {
    key: "internet" | "registration";
    title: string;
    detail: string;
};

type AdminIPDetailTemplateData = ServiceIPDetail;

// --- 3. Handlebars Helpers ---

Handlebars.registerHelper("eq", function (a, b) {
    return a === b;
});

Handlebars.registerHelper("or", function (a, b) {
    return Boolean(a || b);
});

Handlebars.registerHelper("get", function (map, key) {
    if (!map) {
        console.warn(
            `[handlebars:get] Called with null/undefined map for key: ${String(key)}`,
        );
        return undefined;
    }
    return map.get(key);
});

Handlebars.registerHelper("givenNameInitial", function (name: string) {
    if (!name || typeof name !== "string") return "?";
    const firstSpace = name.indexOf(" ");
    if (firstSpace === -1 || firstSpace >= name.length - 1) {
        return name.charAt(0).toUpperCase();
    }
    return name.charAt(firstSpace + 1).toUpperCase();
});

Handlebars.registerHelper(
    "submissionTooltip",
    function (submissions: { at: string; filename: string }[] = []) {
        if (!Array.isArray(submissions) || submissions.length === 0) {
            return "Keine Abgabe";
        }
        return submissions.map((submission) => {
            return `${submission.at} - ${submission.filename}`;
        }).join("\n");
    },
);

// deno-lint-ignore no-explicit-any
Handlebars.registerHelper("let", function (this: any, value, options) {
    return options.fn(this, {
        data: options.data,
        blockParams: [value],
    });
});

// --- 4. Handlebars Partials ---

Handlebars.registerPartial(
    "nav",
    Deno.readTextFileSync("templates/nav.hbs"),
);
Handlebars.registerPartial(
    "userbadge",
    Deno.readTextFileSync("templates/userbadge.hbs"),
);
Handlebars.registerPartial(
    "main",
    Deno.readTextFileSync("templates/main.hbs"),
);
Handlebars.registerPartial(
    "admin-report",
    Deno.readTextFileSync("templates/admin-report.hbs"),
);

// --- 5. Handlebars Compiled Templates (Exports) ---

export const indexTemplate = Handlebars.compile<IndexTemplateData>(
    Deno.readTextFileSync("templates/index.hbs"),
);
export const mainTemplate = Handlebars.compile<MainTemplateData>(
    Deno.readTextFileSync("templates/main.hbs"),
);
export const startPageTemplate = Handlebars.compile<StartPageTemplateData>(
    Deno.readTextFileSync("templates/home.hbs"),
);
export const abgabeTemplate = Handlebars.compile<AbgabeTemplateData>(
    Deno.readTextFileSync("templates/abgabe.hbs"),
);
export const loginPanelTemplate = Handlebars.compile<LoginPanelTemplateData>(
    Deno.readTextFileSync("templates/login-panel.hbs"),
);
export const ldapTemplate = Handlebars.compile<LdapTemplateData>(
    Deno.readTextFileSync("templates/ldap.hbs"),
);
export const whoamiTemplate = Handlebars.compile<WhoamiTemplateData>(
    Deno.readTextFileSync("templates/whoami.hbs"),
);
export const adminTemplate = Handlebars.compile<AdminTemplateData>(
    Deno.readTextFileSync("templates/admin.hbs"),
);
export const adminReportTemplate = Handlebars.compile<AdminTemplateData>(
    Deno.readTextFileSync("templates/admin-report.hbs"),
);
export const adminFileTypesTemplate = Handlebars.compile<AdminFileTypesTemplateData>(
    Deno.readTextFileSync("templates/admin-filetypes.hbs"),
);
export const adminExamModeTemplate = Handlebars.compile<AdminExamModeTemplateData>(
    Deno.readTextFileSync("templates/admin-exammode.hbs"),
);
export const navTemplate = Handlebars.compile<NavTemplateData>(
    Deno.readTextFileSync("templates/nav.hbs"),
);
export const userbadgeTemplate = Handlebars.compile<UserbadgeTemplateData>(
    Deno.readTextFileSync("templates/userbadge.hbs"),
);
export const adminIPDetailTemplate = Handlebars.compile<AdminIPDetailTemplateData>(
    Deno.readTextFileSync("templates/admin-ip-detail.hbs"),
);
