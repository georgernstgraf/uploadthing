import { Hono } from "hono";
import { IPHistoryRecord, Variables } from "../lib/types.ts";
import { localDateString, localTimeString } from "../lib/timefunc.ts";
import * as hbs from "../lib/handlebars.ts";
import * as service from "../service/service.ts";
import config from "../lib/config.ts";

const forensicRouter = new Hono<{ Variables: Variables }>();
const start_ms_earlier = 3.6 * 1.5e6; // 1.5 hours ago
const one_day_ms = 24 * 3.6e6; // plus one day
const twelve_hours_ms = 12 * 3.6e6;

// Forensic main page

forensicRouter.get("/", async (c) => {
    const remote_user = c.get("remoteuser");
    if (!remote_user) {
        return c.redirect("/whoami");
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

    // Calculate if start time is within the last 12 hours
    const within12hours = Math.abs(
        new Date().getTime() - startDateTime.getTime(),
    ) < twelve_hours_ms; // 12 hours in milliseconds
    const endtimeInFuture = endDateTime.getTime() > new Date().getTime();

    const refreshSeconds = config.forensic_refresh_seconds;

    const { registered, unregistered } = service.ipforensics.for_range(
        startDateTime,
        endDateTime,
        !endtimeProvided,
    );
    const ips_in_range = [...registered, ...unregistered].map((entry) =>
        entry.ip
    );

    const ip2users = await service.user.ofIPs_in_timerange(
        ips_in_range,
        startDateTime,
        endDateTime,
    );
    const missingIps = ips_in_range.filter((ip) => !ip2users.has(ip));
    if (missingIps.length > 0) {
        const registrationUsers = await service.user
            .ofIPsFromRegistrationsInRange(
                missingIps,
                `${startdate} ${starttime}`,
                `${enddate} ${endtime}`,
            );
        for (const [ip, user] of registrationUsers.entries()) {
            ip2users.set(ip, user);
        }
    }

    const with_name = registered.map((entry) => ({
        ip: entry.ip,
        count: entry.seen_count,
        lastseen: entry.seen_at_desc[0] ?? "",
        is_stale: entry.is_stale,
    }));
    const without_name = unregistered.map((entry) => ({
        ip: entry.ip,
        count: entry.seen_count,
        lastseen: entry.seen_at_desc[0] ?? "",
        is_stale: entry.is_stale,
    }));

    const ip_history = new Map<string, IPHistoryRecord[]>();
    for (const iprec of [...registered, ...unregistered]) {
        ip_history.set(iprec.ip, service.registrations.ofIP(iprec.ip));
    }
    const user_history = service.registrations.ofEmail();
    const templateData = {
        // simple data
        remote_ip: c.get("remoteip"),
        remote_user,
        startdate,
        starttime,
        endtime,
        enddate,
        spg_times: config.spg_times,
        forensic_ipcount_array: with_name, // Keep for backward compatibility
        ip2users,
        ip_history,
        user_history,
        // New data for the two tables
        ips_with_name: with_name,
        ips_without_name: without_name,
        within12hours,
        endtimeInFuture,
        endtimeProvided,
        forensic_refresh_seconds: refreshSeconds,
        page_title: config.page_title,
    };

    if (c.req.header("HX-Request") === "true") {
        return c.html(hbs.forensicReportTemplate(templateData));
    }

    return c.html(hbs.forensicTemplate(templateData));
});

export default forensicRouter;
