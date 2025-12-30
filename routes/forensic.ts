import { Hono } from "hono";
import { Variables } from "../lib/types.ts";
import { localDateString, localTimeString } from "../lib/timefunc.ts";
import * as hbs from "../lib/handlebars.ts";
import * as service from "../service/service.ts";
import cf from "../lib/config.ts";

const forensicRouter = new Hono<{ Variables: Variables }>();
const start_ms_earlier = 3.6 * 1.5e6;
const plus_one_day_ms = 24 * 3.6e6;

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
    const foundips = service.ipfact.ips_with_counts_in_range(
        `${startdate} ${starttime}`,
        `${enddate} ${endtime}`,
    );
    const ip2users = service.user.ofIPs(foundips.map((f) => f.ip));
    foundips.sort((a, b) => {
        const hasA = ip2users.has(a.ip);
        const hasB = ip2users.has(b.ip);
        if (hasA === hasB) {
            return a.lastseen.localeCompare(b.lastseen);
        }
        return Number(hasB) - Number(hasA);
    });
    return c.html(
        hbs.forensicTemplate({
            remote_ip: c.get("remoteip"),
            remote_user,
            foundips,
            spg_times: cf.spg_times,
            starttime,
            endtime,
            startdate,
            enddate,
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

// Stub endpoint 2: Get IP history
/* forensicRouter.get("/ip-history/:ip", async (c) => {
  const ip = c.req.param("ip");
  return c.json({
    message: "IP history endpoint",
    ip,
    history: [],
    timestamp: new Date().toISOString(),
  });
});

// Stub endpoint 3: Search forensic data
forensicRouter.post("/search", async (c) => {
  const body = await c.req.json();
  return c.json({
    message: "Forensic search endpoint",
    query: body,
    results: [],
    timestamp: new Date().toISOString(),
  });
});
 */
export default forensicRouter;
