import { Hono } from "hono";
import { IPHistoryRecord, Variables } from "../lib/types.ts";
import { localDateString, localTimeString } from "../lib/timefunc.ts";
import * as hbs from "../lib/handlebars.ts";
import * as service from "../service/service.ts";
import cf from "../lib/config.ts";

const forensicRouter = new Hono<{ Variables: Variables }>();
const start_ms_earlier = 3.6 * 1.5e6; // 1.5 hours ago
const plus_one_day_ms = 24 * 3.6e6; // plus one day

// Forensic main page

forensicRouter.get("/", (c) => {
    const remote_user = c.get("remoteuser");
    if (!remote_user) {
        return c.text("Unauthorized", 401);
    }
    const startdate = c.req.query("startdate") ||
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
    const enddate = c.req.query("enddate") ||
        localDateString(new Date(Date.now() + plus_one_day_ms));
    const endtime = c.req.query("endtime") || starttime;
    const forensic_ipcount_array = service.ipfact.ips_with_counts_in_range(
        `${startdate} ${starttime}`,
        `${enddate} ${endtime}`,
    );
    const ip2users = service.user.ofIPs(
        forensic_ipcount_array.map((f) => f.ip),
    );
    const registered_ips = service.user.get_registered_ips(
        forensic_ipcount_array.map((f) => f.ip),
    );
    
    const { with_name, without_name } = service.ipfact.split_ips_by_registration_status(
        forensic_ipcount_array,
        registered_ips,
    );
    
    const ip_history = new Map<string, IPHistoryRecord[]>();
    for (const iprec of forensic_ipcount_array) {
        ip_history.set(iprec.ip, service.history.ofIP(iprec.ip));
    }
    const user_history = service.history.ofEmail();
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
        }),
    );
});

export default forensicRouter;
