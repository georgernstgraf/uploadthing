import type { Context } from "hono";
import config from "../lib/config.ts";
import * as hbs from "../lib/handlebars.ts";
import { get_unterlagen } from "../lib/pathfuncs.ts";
import type { HonoContextVars } from "../lib/types.ts";
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
        success: options.success,
        toast_message: options.toast_message,
        toast_type: options.toast_type,
    });
}

/** Panel des Neuanmelde-Notausgangs; leer, wenn kein Examen läuft. */
export async function buildRegistrationWindowPanel(): Promise<string> {
    const examOpen = await service.exam.isExamWindowOpen();
    if (!examOpen) {
        return "";
    }

    const remaining = service.exam.getRegistrationWindowRemainingSeconds();
    return hbs.adminRegistrationWindowTemplate({
        open: remaining > 0,
        remaining_label: remaining > 0
            ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
            : "",
    });
}

/** Inhalt der Startseite (ohne Shell). */
export async function buildStartContent(
    c: PageContext,
    options: StartPageOptions = {},
): Promise<string> {
    const is_admin = c.get("is_admin");
    const panel_html = await buildPanel(c, options);
    const registration_window_html = is_admin
        ? await buildRegistrationWindowPanel()
        : "";

    return hbs.startPageTemplate({
        files: await get_unterlagen(),
        panel_html,
        registration_window_html,
    });
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
