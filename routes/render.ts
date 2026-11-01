import type { Context } from "hono";
import config from "../lib/config.ts";
import * as hbs from "../lib/handlebars.ts";
import { get_unterlagen } from "../lib/pathfuncs.ts";
import { localTimeString } from "../lib/timefunc.ts";
import type { HonoContextVars } from "../lib/types.ts";
import type { ServiceIpAdmin } from "../service/ipadmin.ts";
import type { ExamPresence } from "../service/abgaben.ts";
import * as service from "../service/service.ts";

/**
 * Gemeinsames Rendern der Startseite (#146): links Angaben und
 * Dokumentationen, rechts Anmeldung bzw. Abgabe. Anmeldung, Abgabe und
 * Fehlerfälle landen immer in derselben rechten Spalte, damit es keinen
 * Seitenwechsel gibt.
 */

/** Erfolgsdaten einer Abgabe für die Nicht-HTMX-Antwort. */
export type AbgabeSuccess = {
    filename: string;
    filesize: string;
    duration_seconds: string;
    md5sum: string;
};

export type StartPageOptions = {
    /** Fehlermeldung der Anmeldung (keine Treffer, LDAP, Sperre). */
    login_error?: string;
    /** Nur beim klassischen Formular-POST: Zusammenfassung der Abgabe. */
    success?: AbgabeSuccess;
    /** Erfolgsmeldung für den Toast nach einer Abgabe. */
    toast_message?: string;
    toast_type?: string;
};

type PageContext = Context<{ Variables: HonoContextVars }>;

/** Setzt die Anzeige der zulässigen Dateitypen aus `PERMITTED_FILETYPES`. */
function germanFileTypes(types: string[]): { label: string; feedback: string } {
    const listed = types.map((type) => `.${type}`);
    const label = listed.join(" oder ");
    return { label, feedback: label };
}

/**
 * Warntext zu WLAN-Unterbrechungen im laufenden Examen (#166).
 *
 * Reine Textbildung, damit sie ohne Datenbank prüfbar ist. Leer, wenn
 * weder Dropouts noch ein IP-Wechsel vorliegen; die Abgabe bleibt in
 * jedem Fall möglich.
 */
export function formatDropoutNotice(
    presence: ExamPresence,
): string | undefined {
    const parts: string[] = [];

    if (presence.dropouts > 0) {
        const minutes = presence.missed_minutes;
        const dropouts = presence.dropouts;
        const minuteWord = minutes === 1 ? "Minute" : "Minuten";
        const dropoutWord = dropouts === 1 ? "Dropout" : "Dropouts";
        parts.push(
            `Du warst ${minutes} ${minuteWord} nicht im WLAN (${dropouts} ${dropoutWord}).`,
        );
    }

    if (presence.ip_change) {
        parts.push("Deine IP-Adresse hat sich während des Examens geändert.");
    }

    if (parts.length === 0) {
        return undefined;
    }

    parts.push(
        "Du kannst trotzdem abgeben; der Dateiname wird entsprechend markiert.",
    );
    return parts.join(" ");
}

/**
 * Warntext für die aktuelle Person im laufenden Examen. `exam_open`
 * entscheidet, ob überhaupt gemessen wird: außerhalb des Examens gibt es
 * keinen Dropout, über den zu informieren wäre.
 */
function dropoutNotice(
    c: PageContext,
    examOpen: boolean,
): string | undefined {
    const user = c.get("remoteuser");
    const ip = c.get("remoteip");
    if (!user?.id || !ip || !examOpen) {
        return undefined;
    }

    return formatDropoutNotice(
        service.abgaben.examPresence(
            user.id,
            ip,
            service.exam.getState()?.started_at ?? null,
        ),
    );
}

/** Panel der rechten Spalte: Anmeldung oder Abgabe. */
export async function buildPanel(
    c: PageContext,
    options: StartPageOptions = {},
): Promise<string> {
    const remote_user = c.get("remoteuser");
    if (!remote_user) {
        return hbs.loginPanelTemplate({ error: options.login_error });
    }

    const exam = await service.exam.getStatusView();
    const types = config.PERMITTED_FILETYPES;
    const germanTypes = germanFileTypes(types);

    return hbs.abgabeTemplate({
        accept_attr: types.map((type) => `.${type}`).join(","),
        types_label: germanTypes.label,
        types_feedback: germanTypes.feedback,
        exam_open: exam.open,
        exam_ends_at_ms: exam.ends_at_ms ?? undefined,
        exam_paused: exam.status === "paused",
        exam_remaining_label: exam.remaining_label,
        dropout_notice: dropoutNotice(c, exam.open),
        success: options.success,
        toast_message: options.toast_message,
        toast_type: options.toast_type,
        // Eine abgelehnte Anmeldung (etwa der gesperrte Namenswechsel im
        // Examen) muss auch den bereits angemeldeten Nutzer erreichen
        // (#152) — er sieht das Abgabe-Panel, nicht die Anmeldung.
        login_error: options.login_error,
    });
}

/**
 * Nur das Warnband der Abgabe (#166).
 *
 * Ein abgeschlossener Scan kann die Dropout-Lage ändern; der Push holt
 * dann nur dieses Fragment, damit die im Formular gewählte Datei
 * erhalten bleibt. Ohne laufendes Examen bleibt die Hülle leer.
 */
export async function buildDropoutsPanel(c: PageContext): Promise<string> {
    const exam = await service.exam.getStatusView();
    return hbs.abgabeDropoutsTemplate({
        dropout_notice: dropoutNotice(c, exam.open),
    });
}

/** Eine Gefahr, die den roten Balken im Examen-Panel auslöst (#161). */
export type ExamHazard = hbs.ExamHazardView;

/**
 * Sammelt die Gründe, aus denen das Examen gerade „nicht dicht" ist
 * (#161). Leer, solange kein Examen läuft — nach einem Stopp ist die
 * Gefahr vorbei und der Zustand steht als Klartext im Panel.
 */
export function buildExamHazards(options: {
    exam_running: boolean;
    firewall_state: string;
    registration_open: boolean;
    registration_since: string;
}): ExamHazard[] {
    if (!options.exam_running) {
        return [];
    }

    const hazards: ExamHazard[] = [];

    if (options.firewall_state === "frei") {
        hazards.push({
            key: "internet",
            title: "Internet frei",
            detail:
                "Die Sperrregel ist nicht aktiv. Der Internetzugang im Prüfungsnetz ist offen, solange das Examen läuft.",
        });
    }

    if (options.registration_open) {
        hazards.push({
            key: "registration",
            title: "Neuanmeldung freigegeben",
            detail: options.registration_since
                ? `Seit ${options.registration_since} dürfen sich Schüler neu anmelden — ein Namenswechsel während der Prüfung ist damit möglich.`
                : "Schüler dürfen sich neu anmelden — ein Namenswechsel während der Prüfung ist damit möglich.",
        });
    }

    return hazards;
}

export type ExamPanelOptions = {
    success_message?: string;
    firewall_error?: string;
};

/**
 * Einzige Stelle, die die Daten des Examen-Panels zusammenstellt (#161).
 * Vorher bauten `routes/admin.ts` und `routes/api.ts` dasselbe Panel
 * getrennt — dabei wäre die Gefahrenliste irgendwann auseinandergelaufen.
 */
export async function buildExamPanelData(
    options: ExamPanelOptions = {},
): Promise<hbs.AdminExamModeTemplateData> {
    const exam = await service.exam.getStatusView();
    const firewall = service.admin.buildExamFirewallPanel(
        await service.admin.getExamModeStatus(),
        options.firewall_error,
    );
    const exam_running = exam.status === "running" || exam.status === "paused";
    const registration_open = service.exam.isStudentRegistrationAllowed();
    const opened_at = service.exam.getStudentRegistrationOpenedAt();
    const registration_since = registration_open && opened_at
        ? localTimeString(opened_at)
        : "";

    return {
        exam_status: exam.status,
        exam_remaining_label: exam.remaining_label,
        exam_open: exam.open,
        exam_running,
        firewall_state: firewall.firewall_state,
        firewall_error: firewall.firewall_error,
        firewall_modal: firewall.firewall_modal,
        registration_open,
        registration_since,
        exam_hazards: buildExamHazards({
            exam_running,
            firewall_state: firewall.firewall_state,
            registration_open,
            registration_since,
        }),
        success_message: options.success_message,
    };
}

/** Inhalt der Startseite (ohne Shell). */
export async function buildStartContent(
    c: PageContext,
    options: StartPageOptions = {},
): Promise<string> {
    const panel_html = await buildPanel(c, options);

    return hbs.startPageTemplate({
        files: await get_unterlagen(),
        panel_html,
    });
}

/**
 * Nur die Angaben-Karte (#164).
 *
 * `GET /angaben-panel` tauscht sie aus, wenn die Lehrperson eine Unterlage
 * hochlädt oder löscht. Bewusst nur die Dateiliste lesen: das Abgabe-Panel
 * daneben bleibt unberührt (eine gewählte Datei darf nicht verloren gehen).
 */
export async function buildAngabenPanel(): Promise<string> {
    return hbs.angabenTemplate({ files: await get_unterlagen() });
}

/**
 * Antwort für die Anmeldung: HTMX tauscht `#app-main` (ganzes `<main>`,
 * damit die Navigation für Lehrpersonen erscheint), ein klassischer
 * Formular-POST bekommt die volle Seite.
 */
export async function respondWithStartPage(
    c: PageContext,
    options: StartPageOptions = {},
): Promise<Response> {
    const content = await buildStartContent(c, options);

    if (c.req.header("HX-Request") === "true") {
        return c.html(hbs.mainTemplate({
            remote_user: c.get("remoteuser"),
            remote_ip: c.get("remoteip"),
            is_admin: c.get("is_admin"),
            page_title: config.page_title,
            hero_url: config.hero_url,
            theme_asset_version: config.THEME_ASSET_VERSION,
            content,
        }));
    }

    return c.html(hbs.indexTemplate({
        remote_user: c.get("remoteuser"),
        remote_ip: c.get("remoteip"),
        is_admin: c.get("is_admin"),
        page_title: config.page_title,
        hero_url: config.hero_url,
        theme_asset_version: config.THEME_ASSET_VERSION,
        content,
    }));
}

/** Der aufgelöste Zeitraum, auf den sich ein Kärtchen bezieht (#163). */
export type AdminCardRange = {
    startdate: string;
    starttime: string;
    enddate: string;
    endtime: string;
};

/**
 * Farbe eines Kärtchens aus den Daten ableiten.
 *
 * Dieselbe Einteilung, nach der `for_range` gruppiert: ohne jede
 * Cookie-Präsenz ist die IP unbekannt (eigener Zweig), mit Lehrpersonen-
 * Identität gehört sie zu den Lehrenden, sonst zu den Schülern. Damit
 * rendert der Fragment-Endpunkt ein Kärtchen genau so, wie es in der
 * Liste stand — ohne dass die Gruppe in der URL mitgeschickt wird.
 */
function studentCardTone(card: ServiceIpAdmin): hbs.AdminStudentCardTone {
    if (card.cookie_presents.length === 0) {
        return "unbekannt";
    }
    const primaryUser = card.cookie_presents[0]?.user ?? null;
    return primaryUser?.klasse === service.user.TEACHER_CLASS
        ? "lehrend"
        : "schueler";
}

/**
 * Kontext eines Kärtchens (#163): Karten-Daten plus `tone` und
 * `card_url`. Der Slug für `id` und SSE-Trigger entsteht im Template aus
 * `ip` (`ipSlug`-Helper). `card_url` trägt `ip` **und** den aufgelösten
 * Zeitraum — die Karte verlässt sich nicht auf `hx-include` und rendert
 * die Wahrheit ihres eigenen Zeitraums.
 *
 * Die URL ist über `URLSearchParams` kodiert und wird deshalb im Template
 * unescaped ausgegeben (`{{{card_url}}}`): HTML-Escaping würde die
 * `=`-Trenner zu `&#x3D;` machen und die Adresse unlesbar, aber nicht
 * unsicher — in die URL gelangen nur kodierte Werte.
 */
export function buildStudentCard(
    card: ServiceIpAdmin,
    range: AdminCardRange,
): hbs.AdminStudentCardTemplateData {
    const query = new URLSearchParams({
        ip: card.ip,
        startdate: range.startdate,
        starttime: range.starttime,
        enddate: range.enddate,
        endtime: range.endtime,
    });

    return {
        ...card,
        tone: studentCardTone(card),
        card_url: `/admin/student-card?${query.toString()}`,
    };
}

/** Daten des MikroTik-Streifens — für die Seite und für `/admin/tik-panel`. */
export function buildTikPanelData(): hbs.TikPanelTemplateData {
    const panel = service.tik.getPanel();
    return {
        tik_state: panel.state,
        tik_last_attempt: panel.last_attempt,
        tik_last_success: panel.last_success,
        tik_last_count: panel.count,
        tik_error: panel.error,
    };
}
