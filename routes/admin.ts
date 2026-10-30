import { Context, Hono } from "hono";
import { HonoContextVars } from "../lib/types.ts";
import { localDateString, localTimeString, dateTimeString } from "../lib/timefunc.ts";
import * as hbs from "../lib/handlebars.ts";
import * as service from "../service/service.ts";
import config, { parsePermittedFileTypes } from "../lib/config.ts";
import { normalizeMac } from "../lib/mac.ts";
import { requireAdmin } from "../middleware/admin.ts";
import {
    AdminCleanupDatabaseSchema,
    AdminFileTypesSchema,
    AdminMacDeleteSchema,
    AdminMacSchema,
    AdminQuerySchema,
    AdminThemeSchema,
    AdminUnterlagenDeleteAllSchema,
    AdminUnterlagenDeleteSchema,
    AdminUnterlagenUploadSchema,
} from "../lib/schemas.ts";

const adminRouter = new Hono<{ Variables: HonoContextVars }>();

// Alle /admin-Routen sind admin-pflichtig; die Sperre läuft vor jedem Handler.
adminRouter.use("*", requireAdmin);

const start_ms_earlier = 3.6 * 1.5e6;
const one_day_ms = 24 * 3.6e6;
const time_cutoff_ms = config.TODAY_HOURS_CUTOFF * 3.6e6;

/**
 * Rendert die Admin-Seite im Erfolgsfall. Fehler laufen **nicht** über
 * diese Funktion, sondern als `c.text(<Meldung>, 4xx)`: der globale
 * Toast-Handler (`templates/index.hbs`) zeigt `responseText` an, und ein
 * komplettes Panel wäre dort ein HTML-Baum statt einer Meldung (#152).
 */
async function renderApplicationPage(
    c: Context<{ Variables: HonoContextVars }>,
    success_message?: string,
    cleanup_result_html?: string,
) {
    const remote_user = c.get("remoteuser");
    if (!remote_user) {
        return c.redirect("/whoami");
    }

    const exam = await service.exam.getStatusView();
    const firewall = service.admin.buildExamFirewallPanel(
        await service.admin.getExamModeStatus(),
    );

    const content = hbs.adminFileTypesTemplate({
        permitted_filetypes: config.PERMITTED_FILETYPES.join(", "),
        current_filetypes: config.PERMITTED_FILETYPES,
        unterlagen: await service.unterlagen.list(),
        unterlagen_filetypes: config.UNTERLAGEN_PERMITTED_FILETYPES,
        unterlagen_accept: config.UNTERLAGEN_PERMITTED_FILETYPES
            .map((extension) => `.${extension}`)
            .join(","),
        max_upload_mb: config.MAX_UPLOAD_MB,
        allowed_macs: service.adminmac.list().map((entry) => ({
            mac: entry.mac,
            comment: entry.comment,
            created_at: dateTimeString(entry.created_at.toISOString()),
        })),
        env_admin_macs: service.adminmac.envAllowedMacs(),
        exam_panel_html: hbs.adminExamModeTemplate({
            exam_status: exam.status,
            exam_remaining_label: exam.remaining_label,
            exam_open: exam.open,
            exam_running: exam.status === "running" || exam.status === "paused",
            firewall_state: firewall.firewall_state,
            firewall_error: firewall.firewall_error,
            firewall_modal: firewall.firewall_modal,
        }),
        available_themes: service.admin.listAvailableThemes(),
        current_theme_key: service.admin.getCurrentThemeKey(),
        success_message,
        cleanup_result_html,
    });

    if (c.req.header("HX-Request") === "true") {
        return c.html(content);
    }

    return c.html(hbs.indexTemplate({
        remote_user,
        remote_ip: c.get("remoteip"),
        is_admin: c.get("is_admin"),
        page_title: config.page_title,
        hero_url: config.hero_url,
        theme_asset_version: config.THEME_ASSET_VERSION,
        content,
    }));
}

adminRouter.get("/students", async (c) => {
    const is_admin = c.get("is_admin");

    const remote_user = c.get("remoteuser");
    if (!remote_user) {
        return c.redirect("/whoami");
    }

    const query = c.req.query();
    const validation = AdminQuerySchema.safeParse(query);
    if (!validation.success) {
        return c.text("Ungültiges Datums- oder Zeitformat. Bitte verwenden Sie YYYY-MM-DD und HH:MM.", 400);
    }

    let startdate = c.req.query("startdate") ||
        localDateString(new Date(Date.now() - start_ms_earlier));
    let starttime = c.req.query("starttime");
    if (!starttime) {
        starttime = localTimeString(new Date(Date.now() - start_ms_earlier));
        const times = [...config.spg_times, starttime];
        times.sort();
        const index = times.indexOf(starttime);
        times.splice(index, 1);
        starttime = times.at(index < times.length ? index : -1)!;
    }
    const requestedEndDate = c.req.query("enddate");
    const requestedEndTime = c.req.query("endtime");

    const endtimeProvided = Boolean(requestedEndDate || requestedEndTime);
    let enddate = requestedEndDate ||
        localDateString(new Date(Date.now() + one_day_ms));
    let endtime = requestedEndTime || starttime;
    let startDateTime = new Date(`${startdate} ${starttime}`);
    let endDateTime = new Date(`${enddate} ${endtime}`);

    if (endDateTime.getTime() < startDateTime.getTime()) {
        [startdate, enddate] = [enddate, startdate];
        [starttime, endtime] = [endtime, starttime];
        [startDateTime, endDateTime] = [endDateTime, startDateTime];
    }

    const withinTimeCutoff = Math.abs(
        new Date().getTime() - startDateTime.getTime(),
    ) < time_cutoff_ms;
    const endtimeInFuture = endDateTime.getTime() > new Date().getTime();

    const refreshSeconds = config.admin_refresh_seconds;

    const { registered, unregistered, teacher_ips, anomalies, range_first_seen, range_last_seen } = await service.ipadmin.for_range(
        startDateTime,
        endDateTime,
        !endtimeProvided,
    );
    const tik = service.tik.getPanel();

    const content = hbs.adminTemplate({
        remote_user,
        startdate,
        starttime,
        endtime,
        enddate,
        spg_times: config.spg_times,
        ips_with_name: registered,
        ips_without_name: unregistered,
        teacher_ips,
        anomalies,
        range_first_seen,
        range_last_seen,
        withinTimeCutoff,
        endtimeInFuture,
        endtimeProvided,
        admin_refresh_seconds: refreshSeconds,
        tik_state: tik.state,
        tik_last_attempt: tik.last_attempt,
        tik_last_success: tik.last_success,
        tik_last_count: tik.count,
        tik_error: tik.error,
    });

    if (c.req.header("HX-Request") === "true") {
        return c.html(content);
    }

    return c.html(hbs.indexTemplate({
        remote_user,
        remote_ip: c.get("remoteip"),
        is_admin,
        page_title: config.page_title,
        hero_url: config.hero_url,
        theme_asset_version: config.THEME_ASSET_VERSION,
        content,
    }));
});

adminRouter.get("/ip-detail", async (c) => {
    const ip = c.req.query("ip");
    if (!ip) {
        return c.text("Missing ip parameter", 400);
    }

    const query = c.req.query();
    const validation = AdminQuerySchema.safeParse(query);
    if (!validation.success) {
        return c.text("Ungültiges Datums- oder Zeitformat.", 400);
    }

    const startdate = c.req.query("startdate") ||
        localDateString(new Date(Date.now() - start_ms_earlier));
    let starttime = c.req.query("starttime");
    if (!starttime) {
        starttime = localTimeString(new Date(Date.now() - start_ms_earlier));
        const times = [...config.spg_times, starttime];
        times.sort();
        const index = times.indexOf(starttime);
        times.splice(index, 1);
        starttime = times.at(index < times.length ? index : -1)!;
    }
    const requestedEndDate = c.req.query("enddate");
    const requestedEndTime = c.req.query("endtime");
    const enddate = requestedEndDate ||
        localDateString(new Date(Date.now() + one_day_ms));
    const endtime = requestedEndTime || starttime;
    let startDateTime = new Date(`${startdate} ${starttime}`);
    let endDateTime = new Date(`${enddate} ${endtime}`);

    if (endDateTime.getTime() < startDateTime.getTime()) {
        [startDateTime, endDateTime] = [endDateTime, startDateTime];
    }

    try {
        const detail = await service.ipadmin.getIPDetail(ip, startDateTime, endDateTime);
        return c.html(hbs.adminIPDetailTemplate(detail));
    } catch (error) {
        console.error("ip-detail error:", error);
        return c.text(`Detail konnte nicht geladen werden: ${(error as Error).message}`, 500);
    }
});

adminRouter.get("/application", async (c) => {
    return await renderApplicationPage(c);
});

adminRouter.post("/application", async (c) => {
    const formData = await c.req.formData();
    const validation = AdminFileTypesSchema.safeParse(formData);
    if (!validation.success) {
        return c.text(
            validation.error.issues[0]?.message || "Ungültige Dateitypen",
            400,
        );
    }

    const fileTypes = parsePermittedFileTypes(validation.data.permitted_filetypes);
    if (fileTypes.length === 0) {
        return c.text("Mindestens ein Dateityp ist erforderlich", 400);
    }

    config.PERMITTED_FILETYPES = fileTypes;
    return renderApplicationPage(
        c,
        `Erlaubte Dateitypen aktualisiert: ${fileTypes.map((type) => "." + type).join(", ")}`,
    );
});

adminRouter.post("/unterlagen", async (c) => {
    let formData: FormData;
    try {
        formData = await c.req.formData();
    } catch (error) {
        console.error(
            `[UNTERLAGEN] Formular konnte nicht gelesen werden: ${(error as Error).message}`,
        );
        return c.text(
            "Das Formular konnte nicht gelesen werden. Bitte die Seite neu laden und erneut versuchen.",
            400,
        );
    }

    const validation = AdminUnterlagenUploadSchema.safeParse(formData);
    if (!validation.success) {
        return c.text(
            validation.error.issues[0]?.message || "Keine Datei ausgewählt.",
            400,
        );
    }

    // Fehler (Typ, Inhalt, Größe, fehlende Bestätigung) wirft der Service
    // als AppError; der globale Handler antwortet mit der deutschen
    // Meldung und einem non-2xx-Status, den htmx als Toast zeigt.
    const filename = await service.unterlagen.upload(
        validation.data.file,
        // Das Häkchen ist die Bestätigung; ohne es wird nicht ersetzt.
        Boolean(validation.data.replace_existing),
    );
    return await renderApplicationPage(c, `Unterlage gespeichert: ${filename}`);
});

adminRouter.post("/unterlagen/delete", async (c) => {
    const formData = await c.req.formData();
    const validation = AdminUnterlagenDeleteSchema.safeParse(formData);
    if (!validation.success) {
        return c.text(
            validation.error.issues[0]?.message || "Bitte eine Unterlage auswählen.",
            400,
        );
    }

    const filename = await service.unterlagen.remove(validation.data.filename);
    return await renderApplicationPage(c, `Unterlage gelöscht: ${filename}`);
});

adminRouter.post("/unterlagen/delete-all", async (c) => {
    const formData = await c.req.formData();
    const validation = AdminUnterlagenDeleteAllSchema.safeParse(formData);
    if (!validation.success) {
        return c.text(
            validation.error.issues[0]?.message ||
                "Ungültige Anfrage für das Löschen der Unterlagen.",
            400,
        );
    }

    // „Alles löschen“ räumt das flache Verzeichnis; es gibt kein Archiv
    // und keine Versionierung, aus der etwas zurückgeholt werden könnte.
    const removed = await service.unterlagen.removeAll();
    return await renderApplicationPage(
        c,
        removed === 1
            ? "Eine Unterlage wurde gelöscht."
            : `Alle Unterlagen wurden gelöscht (${removed} Dateien).`,
    );
});

adminRouter.post("/adminmac", async (c) => {
    const formData = await c.req.formData();
    const validation = AdminMacSchema.safeParse(formData);
    if (!validation.success) {
        return c.text(
            validation.error.issues[0]?.message || "Ungültige MAC-Adresse",
            400,
        );
    }

    try {
        const entry = service.adminmac.add(
            validation.data.mac,
            validation.data.comment,
        );
        return renderApplicationPage(
            c,
            `MAC-Adresse freigegeben: ${entry.mac} (${entry.comment})`,
        );
    } catch (error) {
        // Ungültige Schreibweise oder bereits vorhandene Freigabe: die
        // Meldung nennt den Grund, damit der Fehler sichtbar bleibt.
        return c.text((error as Error).message, 400);
    }
});

adminRouter.post("/adminmac/delete", async (c) => {
    const formData = await c.req.formData();
    const validation = AdminMacDeleteSchema.safeParse(formData);
    if (!validation.success) {
        return c.text(
            validation.error.issues[0]?.message || "Ungültige MAC-Adresse",
            400,
        );
    }

    if (!service.adminmac.remove(validation.data.mac)) {
        return c.text(
            `Die MAC-Adresse ${validation.data.mac} war nicht freigegeben.`,
            400,
        );
    }

    return renderApplicationPage(
        c,
        `MAC-Freigabe entfernt: ${
            normalizeMac(validation.data.mac) ?? validation.data.mac
        }`,
    );
});

adminRouter.post("/theme", async (c) => {
    const formData = await c.req.formData();
    const validation = AdminThemeSchema.safeParse(formData);
    if (!validation.success) {
        return c.text(
            validation.error.issues[0]?.message || "Ungültiges Theme",
            400,
        );
    }

    try {
        const theme = service.admin.applyTheme(validation.data.theme);
        return renderApplicationPage(c, `Theme aktiviert: ${theme.label}`);
    } catch (error) {
        console.error(
            `[ADMIN] Theme konnte nicht aktiviert werden: ${(error as Error).message}`,
        );
        return c.text(
            `Theme konnte nicht aktiviert werden: ${(error as Error).message}`,
            500,
        );
    }
});

adminRouter.get("/download-abgaben", (c) => {
    const vacuumPath = `${config.ABGABEN_DIR}/vacuum.db`;
    
    try {
        service.admin.createDatabaseBackup(vacuumPath);
    } catch (e) {
        console.error("Error creating database backup:", e);
        return c.text("Failed to create database backup.", 500);
    }

    const cmd = new Deno.Command("tar", {
        args: ["-czf", "-", "."],
        cwd: config.ABGABEN_DIR,
        stdout: "piped",
    });

    const child = cmd.spawn();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").split("T").join("_").slice(0, 16);
    const filename = `abgaben_${timestamp}.tar.gz`;

    c.header("Content-Type", "application/gzip");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);

    return c.body(child.stdout);
});

adminRouter.post("/wipe-abgaben", (c) => {
    try {
        service.admin.wipeAbgabenDirectory(config.ABGABEN_DIR);
        return c.html(`<div class="alert alert-success fs-lg mt-2 mx-auto" style="max-width: 800px;">Abgaben-Verzeichnis erfolgreich geleert.</div>`);
    } catch (e) {
        console.error("Error wiping abgaben directory:", e);
        return c.html(`<div class="alert alert-danger fs-lg mt-2 mx-auto" style="max-width: 800px;">Fehler beim Leeren des Abgaben-Verzeichnisses.</div>`, 500);
    }
});

adminRouter.post("/cleanup-database", async (c) => {
    const formData = await c.req.formData();
    const validation = AdminCleanupDatabaseSchema.safeParse(formData);
    if (!validation.success) {
        return c.text("Ungültige Anfrage für die Datenbankbereinigung", 400);
    }

    try {
        const result = service.admin.cleanupDatabaseOlderThanOneYear();
        const html = `<div id="cleanup-result" class="alert alert-success fs-lg mt-2 mx-auto" style="max-width: 720px;">Datenbank bereinigt. Entfernt: ${result.deleted_cookiepresents} Cookies, ${result.deleted_registrations} Registrierungen, ${result.deleted_ipfacts} IP-Logs, ${result.deleted_submissions} Abgaben (gesamt ${result.total_deleted}).</div>`;
        return renderApplicationPage(c, undefined, html);
    } catch (error) {
        console.error("Error cleaning up database:", error);
        return c.text("Fehler bei der Datenbankbereinigung", 500);
    }
});

export default adminRouter;
