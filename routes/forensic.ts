import { Hono } from "hono";
import { IPHistory, Variables } from "../lib/types.ts";
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
    forensic_ipcount_array.sort((a, b) => {
        const hasA = ip2users.has(a.ip);
        const hasB = ip2users.has(b.ip);
        if (hasA === hasB) {
            return a.lastseen.localeCompare(b.lastseen);
        }
        return Number(hasB) - Number(hasA);
    });
    const ip_history = new Map<string, IPHistory>();
    for (const iprec of forensic_ipcount_array) {
        ip_history.set(iprec.ip, service.history.ofIP(iprec.ip));
    }
    return c.html(
        hbs.forensicTemplate({
            remote_ip: c.get("remoteip"),
            remote_user,
            endtime,
            startdate,
            enddate,
            spg_times: cf.spg_times,
            forensic_ipcount_array,
            starttime,
            ip2users,
        }),
    );
});
// Stub endpoint 1: Get forensic logs
forensicRouter.get("/users", (c) => {
    const _startTime = c.req.query("startTime");
    const _endTime = c.req.query("endTime");
    return c.json({
        message: "Forensic logs endpoint",
        data: [],
        timestamp: new Date().toISOString(),
    });
});

export default forensicRouter;
