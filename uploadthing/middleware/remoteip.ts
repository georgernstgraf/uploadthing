import { createMiddleware } from "hono/factory";

export const remoteIPMiddleware = createMiddleware(async (c, next) => {
  const addr = c.env.info.remoteAddr;
  const remoteip = addr.transport === "tcp" || addr.transport === "udp"
    ? addr.hostname
    : "unix-socket";

  c.set("remoteip", remoteip);
  await next();
});
