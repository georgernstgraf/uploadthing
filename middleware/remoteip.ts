import { createMiddleware } from "hono/factory";
import * as service from "../service/service.ts";
export const remoteIPMiddleware = createMiddleware(async (c, next) => {
    const addr = c.env.info.remoteAddr;
    const remoteip = addr.transport === "tcp" || addr.transport === "udp"
        ? addr.hostname
        : "unix-socket";

    c.set("remoteip", remoteip);
    const remoteuser = await service.user.getRegisteredByIp(remoteip);
    c.set("remoteuser", remoteuser);
    await next();
});
