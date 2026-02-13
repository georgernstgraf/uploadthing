import { Hono } from "hono";
import { HonoContextVars } from "../lib/types.ts";
import { localDateString, localTimeString } from "../lib/timefunc.ts";
import * as hbs from "../lib/handlebars.ts";
import * as service from "../service/service.ts";
import config from "../lib/config.ts";
import { ForensicQuerySchema } from "../lib/schemas.ts";

const forensicRouter = new Hono<{ Variables: HonoContextVars }>();
const start_ms_earlier = 3.6 * 1.5e6; // 1.5 hours ago
const one_day_ms = 24 * 3.6e6; // plus one day
const time_cutoff_ms = config.TODAY_HOURS_CUTOFF * 3.6e6;

// Forensic main page

forensicRouter.get("/", async (c) => {
    const is_admin = c.get("is_admin");
    if (!is_admin) {
        return c.text("Forbidden", 403);
    }

    const remote_user = c.get("remoteuser");
    if (!remote_user) {
        return c.redirect("/whoami");
    }

    const query = c.req.query();
    const validation = ForensicQuerySchema.safeParse(query);
    if (!validation.success) {
        return c.text("Ungültiges Datums- oder Zeitformat. Bitte verwenden Sie YYYY-MM-DD und HH:MM.", 400);
    }

    let startdate = c.req.query("startdate") ||
        localDateString(new Date(Date.now() - start_ms_earlier));
    let starttime = c.req.query("starttime");
    // if either startdate or starttime is missing, default to 2 hours ago
    if (!starttime) {
        starttime = localTimeString(new Date(Date.now() - start_ms_earlier));
        const times = [...config.spg_times, starttime];
        times.sort();
        const index = times.indexOf(starttime);
        times.splice(index, 1); // remove the added time
        starttime = times.at(index < times.length ? index : -1)!;
    }
    const requestedEndDate = c.req.query("enddate");
    const requestedEndTime = c.req.query("endtime");

    // endtime provided?
    const endtimeProvided = Boolean(requestedEndDate || requestedEndTime);
    let enddate = requestedEndDate ||
        localDateString(new Date(Date.now() + one_day_ms));
    let endtime = requestedEndTime || starttime;
    let startDateTime = new Date(`${startdate} ${starttime}`);
    let endDateTime = new Date(`${enddate} ${endtime}`);

    // end before start => swap
    if (endDateTime.getTime() < startDateTime.getTime()) {
        [startdate, enddate] = [enddate, startdate];
        [starttime, endtime] = [endtime, starttime];
        [startDateTime, endDateTime] = [endDateTime, startDateTime];
    }

    // Calculate if start time is within the configured cutoff
    const withinTimeCutoff = Math.abs(
        new Date().getTime() - startDateTime.getTime(),
    ) < time_cutoff_ms;
    const endtimeInFuture = endDateTime.getTime() > new Date().getTime();

    const refreshSeconds = config.forensic_refresh_seconds;

    const { registered, unregistered } = await service.ipforensics.for_range(
        startDateTime,
        endDateTime,
        !endtimeProvided,
    );
    const is_full = c.req.header("HX-Request") !== "true";
    const templateData = {
        // simple data
        remote_ip: c.get("remoteip"),
        remote_user,
        is_admin,
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
        forensic_refresh_seconds: refreshSeconds,
        page_title: config.page_title,
        is_full,
    };

    return c.html(hbs.forensicTemplate(templateData));
});

export default forensicRouter;
