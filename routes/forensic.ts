import { Hono } from "hono";
import { IPHistoryRecord, Variables } from "../lib/types.ts";
import { localDateString, localTimeString } from "../lib/timefunc.ts";
import * as hbs from "../lib/handlebars.ts";
import * as service from "../service/service.ts";
import cf from "../lib/config.ts";

const forensicRouter = new Hono<{ Variables: Variables }>();
const start_ms_earlier = 3.6 * 1.5e6; // 1.5 hours ago
const one_day_ms = 24 * 3.6e6; // plus one day
const twelve_hours_ms = 12 * 3.6e6;

// Forensic main page

forensicRouter.get("/", async (c) => {
    const remote_user = c.get("remoteuser");
    if (!remote_user) {
        return c.text("Unauthorized", 401);
    }
    let startdate = c.req.query("startdate") ||
        localDateString(new Date(Date.now() - start_ms_earlier));
    let starttime = c.req.query("starttime");
    // if either startdate or starttime is missing, default to 2 hours ago
    if (!starttime) {
        starttime = localTimeString(new Date(Date.now() - start_ms_earlier));
        const times = [...cf.spg_times, starttime];
        times.sort();
        const index = times.indexOf(starttime);
        times.splice(index, 1); // remove the added time
        starttime = times.at(index < times.length ? index : -1)!;
    }
    let enddate = c.req.query("enddate") ||
        localDateString(new Date(Date.now() + one_day_ms));
    let endtime = c.req.query("endtime") || starttime;
    // Calculate if start time is within the last 12 hours
    let startDateTime = new Date(`${startdate} ${starttime}`);
    let endDateTime = new Date(`${enddate} ${endtime}`);

    if (endDateTime.getTime() < startDateTime.getTime()) {
        [startdate, enddate] = [enddate, startdate];
        [starttime, endtime] = [endtime, starttime];
        [startDateTime, endDateTime] = [endDateTime, startDateTime];
    }

    const within12hours = Math.abs(
        new Date().getTime() - startDateTime.getTime(),
    ) < twelve_hours_ms; // 12 hours in milliseconds
    const endtimeInFuture = endDateTime.getTime() > new Date().getTime();

    const ipfact_array = service.ipfact.ips_with_counts_in_range(
        `${startdate} ${starttime}`,
        `${enddate} ${endtime}`,
    );
    const ipList = ipfact_array.map((f) => f.ip);
    const ip2users = service.user.ofIPs(ipList);
    const registered_ips = service.user.get_registered_ips(ipList);
    const missingIps = ipList.filter((ip) => !ip2users.has(ip));
    if (missingIps.length > 0) {
        const registrationUsers = await service.user.ofIPsFromRegistrationsInRange(
            missingIps,
            `${startdate} ${starttime}`,
            `${enddate} ${endtime}`,
        );
        for (const [ip, user] of registrationUsers.entries()) {
            ip2users.set(ip, user);
            registered_ips.add(ip);
        }
    }

    const { with_name, without_name } = service.ipfact
        .split_ips_by_registration_status(
            ipfact_array,
            registered_ips,
        );

    const ip_history = new Map<string, IPHistoryRecord[]>();
    for (const iprec of ipfact_array) {
        ip_history.set(iprec.ip, service.registrations.ofIP(iprec.ip));
    }
    const user_history = service.registrations.ofEmail();
    return c.html(
        hbs.forensicTemplate({
            remote_ip: c.get("remoteip"),
            remote_user,
            startdate,
            starttime,
            endtime,
            enddate,
            spg_times: cf.spg_times,
            forensic_ipcount_array: with_name, // Keep for backward compatibility
            ip2users,
            ip_history,
            user_history,
            // New data for the two tables
            ips_with_name: with_name,
            ips_without_name: without_name,
            within12hours,
            endtimeInFuture,
            page_title: cf.page_title,
        }),
    );
});

export default forensicRouter;
