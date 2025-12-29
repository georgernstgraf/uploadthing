import { Hono } from "hono";
import { localTimeString, localDateString, Variables } from "../lib/lib.ts";
import * as hbs from "../lib/templates.ts";
import * as service from "../service/service.ts";
import cf from "../lib/config.ts";

const forensicRouter = new Hono<{ Variables: Variables }>();

forensicRouter.get("/", (c) => {
  const remote_user = c.get("remoteuser");
  if (!remote_user) {
    return c.text("Unauthorized", 401);
  }
  const start_localtime = localTimeString(new Date(Date.now() - 3_600_000));
  const end_localtime = localTimeString(new Date());
  const today = localDateString(new Date());
  const foundips = service.ipfact.ips_with_counts_in_range(
    start_localtime,
    end_localtime,
  );
  return c.html(
    hbs.forensicTemplate({
      remote_ip: c.get("remoteip")!,
      remote_user,
      foundips,
      spg_times: cf.spg_times,
      start_localtime,
      end_localtime,
      today
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
