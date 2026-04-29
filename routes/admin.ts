import { Context, Hono } from "hono";
import { HonoContextVars } from "../lib/types.ts";
import { localDateString, localTimeString } from "../lib/timefunc.ts";
import * as hbs from "../lib/handlebars.ts";
import * as service from "../service/service.ts";
import config, { parsePermittedFileTypes } from "../lib/config.ts";
import {
    AdminCleanupDatabaseSchema,
    AdminFileTypesSchema,
    AdminQuerySchema,
    AdminThemeSchema,
} from "../lib/schemas.ts";

const adminRouter = new Hono<{ Variables: HonoContextVars }>();
const start_ms_earlier = 3.6 * 1.5e6;
const one_day_ms = 24 * 3.6e6;
const time_cutoff_ms = config.TODAY_HOURS_CUTOFF * 3.6e6;

function renderApplicationPage(
    c: Context<{ Variables: HonoContextVars }>,
    success_message?: string,
    error_message?: string,
    cleanup_result_html?: string,
) {
    const remote_user = c.get("remoteuser");
    if (!remote_user) {
        return c.redirect("/whoami");
    }

    const content = hbs.adminFileTypesTemplate({
        permitted_filetypes: config.PERMITTED_FILETYPES.join(", "),
        current_filetypes: config.PERMITTED_FILETYPES,
        firewall_toggle_html: hbs.adminExamModeTemplate({
            internet_active: config.INTERNET_ACTIVE,
        }),
        available_themes: service.admin.listAvailableThemes(),
        current_theme_key: service.admin.getCurrentThemeKey(),
        success_message,
        error_message,
        cleanup_result_html,
    });

    if (c.req.header("HX-Request") === "true") {
        return c.html(content, error_message ? 400 : 200);
    }

    return c.html(hbs.indexTemplate({
        remote_user,
        remote_ip: c.get("remoteip"),
        is_admin: c.get("is_admin"),
        page_title: config.page_title,
        theme_asset_version: config.THEME_ASSET_VERSION,
        content,
    }), error_message ? 400 : 200);
}

adminRouter.get("/students", async (c) => {
    const is_admin = c.get("is_admin");
    if (!is_admin) {
        return c.text("Forbidden", 403);
    }

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

    const { registered, unregistered, anomalies, range_first_seen, range_last_seen } = await service.ipadmin.for_range(
        startDateTime,
        endDateTime,
        !endtimeProvided,
    );

    const content = hbs.adminTemplate({
        remote_user,
        startdate,
        starttime,
        endtime,
        enddate,
        spg_times: config.spg_times,
        ips_with_name: registered,
        ips_without_name: unregistered,
        anomalies,
        range_first_seen,
        range_last_seen,
        withinTimeCutoff,
        endtimeInFuture,
        endtimeProvided,
        admin_refresh_seconds: refreshSeconds,
    });

    if (c.req.header("HX-Request") === "true") {
        return c.html(content);
    }

    return c.html(hbs.indexTemplate({
        remote_user,
        remote_ip: c.get("remoteip"),
        is_admin,
        page_title: config.page_title,
        theme_asset_version: config.THEME_ASSET_VERSION,
        content,
    }));
});

adminRouter.get("/application", (c) => {
    const is_admin = c.get("is_admin");
    if (!is_admin) {
        return c.text("Forbidden", 403);
    }

    return renderApplicationPage(c);
});

adminRouter.post("/application", async (c) => {
    const is_admin = c.get("is_admin");
    if (!is_admin) {
        return c.text("Forbidden", 403);
    }

    const formData = await c.req.formData();
    const validation = AdminFileTypesSchema.safeParse(formData);
    if (!validation.success) {
        return renderApplicationPage(
            c,
            undefined,
            validation.error.issues[0]?.message || "Ungültige Dateitypen",
        );
    }

    const fileTypes = parsePermittedFileTypes(validation.data.permitted_filetypes);
    if (fileTypes.length === 0) {
        return renderApplicationPage(c, undefined, "Mindestens ein Dateityp ist erforderlich");
    }

    config.PERMITTED_FILETYPES = fileTypes;
    return renderApplicationPage(
        c,
        `Erlaubte Dateitypen aktualisiert: ${fileTypes.map((type) => "." + type).join(", ")}`,
    );
});

adminRouter.post("/theme", async (c) => {
    const is_admin = c.get("is_admin");
    if (!is_admin) {
        return c.text("Forbidden", 403);
    }

    const formData = await c.req.formData();
    const validation = AdminThemeSchema.safeParse(formData);
    if (!validation.success) {
        return renderApplicationPage(
            c,
            undefined,
            validation.error.issues[0]?.message || "Ungültiges Theme",
        );
    }

    try {
        const theme = service.admin.applyTheme(validation.data.theme);
        return renderApplicationPage(c, `Theme aktiviert: ${theme.label}`);
    } catch (error) {
        return renderApplicationPage(
            c,
            undefined,
            `Theme konnte nicht aktiviert werden: ${(error as Error).message}`,
        );
    }
});

adminRouter.get("/download-abgaben", (c) => {
    const is_admin = c.get("is_admin");
    if (!is_admin) {
        return c.text("Forbidden", 403);
    }

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
    const is_admin = c.get("is_admin");
    if (!is_admin) {
        return c.text("Forbidden", 403);
    }

    try {
        service.admin.wipeAbgabenDirectory(config.ABGABEN_DIR);
        return c.html(`<div class="alert alert-success fs-lg mt-2 mx-auto" style="max-width: 800px;">Abgaben-Verzeichnis erfolgreich geleert.</div>`);
    } catch (e) {
        console.error("Error wiping abgaben directory:", e);
        return c.html(`<div class="alert alert-danger fs-lg mt-2 mx-auto" style="max-width: 800px;">Fehler beim Leeren des Abgaben-Verzeichnisses.</div>`, 500);
    }
});

adminRouter.post("/cleanup-database", async (c) => {
    const is_admin = c.get("is_admin");
    if (!is_admin) {
        return c.text("Forbidden", 403);
    }

    const formData = await c.req.formData();
    const validation = AdminCleanupDatabaseSchema.safeParse(formData);
    if (!validation.success) {
        return renderApplicationPage(c, undefined, "Ungültige Anfrage für die Datenbankbereinigung");
    }

    try {
        const result = service.admin.cleanupDatabaseOlderThanOneMonth();
        const html = `<div class="alert alert-success fs-lg mt-2 mx-auto" style="max-width: 720px;">Datenbank bereinigt. Entfernt: ${result.deleted_cookiepresents} Cookies, ${result.deleted_registrations} Registrierungen, ${result.deleted_ipfacts} IP-Logs, ${result.deleted_submissions} Abgaben (gesamt ${result.total_deleted}).</div>`;
        return renderApplicationPage(c, undefined, undefined, html);
    } catch (error) {
        console.error("Error cleaning up database:", error);
        return renderApplicationPage(c, undefined, "Fehler bei der Datenbankbereinigung");
    }
});

export default adminRouter;
