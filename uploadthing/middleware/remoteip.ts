import { createMiddleware } from "hono/factory";
import * as db from "../db/service.ts";
export const remoteIPMiddleware = createMiddleware(async (c, next) => {
  const addr = c.env.info.remoteAddr;
  const remoteip = addr.transport === "tcp" || addr.transport === "udp"
    ? addr.hostname
    : "unix-socket";

  c.set("remoteip", remoteip);
  const ipUser = await db.getIPUser(remoteip);
  c.set("ipuser", ipUser.name);
  await next();
});
