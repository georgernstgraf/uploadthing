import { Hono } from "hono";
import { HonoContextVars } from "../lib/types.ts";
import { localDateString, localTimeString } from "../lib/timefunc.ts";
import * as hbs from "../lib/handlebars.ts";
import * as service from "../service/service.ts";
import config from "../lib/config.ts";
import { AdminQuerySchema } from "../lib/schemas.ts";

const adminRouter = new Hono<{ Variables: HonoContextVars }>();
const start_ms_earlier = 3.6 * 1.5e6;
const one_day_ms = 24 * 3.6e6;
const time_cutoff_ms = config.TODAY_HOURS_CUTOFF * 3.6e6;

adminRouter.get("/", async (c) => {
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

    const { registered, unregistered } = await service.ipadmin.for_range(
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
        content,
    }));
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

    const cmd = new Deno.Command("zip", {
        args: ["-q", "-r", "-", "."],
        cwd: config.ABGABEN_DIR,
        stdout: "piped",
    });

    const child = cmd.spawn();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").split("T").join("_").slice(0, 15);
    const filename = `abgaben_${timestamp}.zip`;

    c.header("Content-Type", "application/zip");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);

    return c.body(child.stdout);
});

export default adminRouter;
