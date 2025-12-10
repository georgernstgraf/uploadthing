import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { createHash } from "node:crypto";
import Handlebars from "handlebars";
import config from "./lib/config.ts";
import { get_unterlagen } from "./lib/lib.ts";
import { remoteIPMiddleware } from "./middleware/remoteip.ts";
import * as service from "./service/service.ts";
type Bindings = {
  info: Deno.ServeHandlerInfo;
};

type Variables = {
  remoteip: string;
};

const dirIndexTemplate = Handlebars.compile(
  Deno.readTextFileSync("templates/dirindex.hbs"),
);
const uploadTemplate = Handlebars.compile(
  Deno.readTextFileSync("templates/upload.hbs"),
);
const successTemplate = Handlebars.compile(
  Deno.readTextFileSync("templates/success.hbs"),
);
const ldapTemplate = Handlebars.compile(
  Deno.readTextFileSync("templates/ldap.hbs"),
);
Handlebars.registerPartial(
  "top",
  Deno.readTextFileSync("templates/top.hbs"),
);

// ensure ABGABEN_DIR exists
await Deno.mkdir(config.ABGABEN_DIR, { recursive: true });

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use("*", remoteIPMiddleware);
app.get("/", async (c) => {
  const files = await get_unterlagen();
  return c.html(dirIndexTemplate({
    UNTERLAGEN_DIR: config.UNTERLAGEN_DIR,
    files,
  }));
});
app.get(
  "static/*",
  serveStatic({
    root: "./static",
    rewriteRequestPath: (path) => path.replace(/^\/static/, "/"),
  }),
);
// 1. Directory Index Handler
app.get("upload", (c) => {
  const remote_ip = c.get("remoteip");
  return c.html(uploadTemplate({ remote_ip }));
});
app.post("upload", async (c) => {
  const beginTime = Date.now();
  const remote_ip = c.get("remoteip");
  const formData = await c.req.formData();
  const file = formData.get("file") as File;
  if (!file) {
    return c.text("No file uploaded", 400);
  }
  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);
  const filesize = data.length;
  const hash = createHash("md5");
  hash.update(data);
  const md5sum = hash.digest("hex");
  await Deno.writeFile(
    `${config.ABGABEN_DIR}/${remote_ip}-${file.name}`,
    data,
  );
  const endTime = Date.now();
  const durationSeconds = ((endTime - beginTime) / 1000).toFixed(1);
  return c.html(
    successTemplate({
      remote_ip,
      filename: file.name,
      filesize: (filesize / 1024).toFixed(0),
      md5sum,
      durationSeconds,
    }),
  );
});

app.get("ldap", async (c) => {
  const query = c.req.query();
  try {
    const users = await service.ldap.getUserByEmail(query.email);
    return c.html(ldapTemplate({ users }));
  } catch (e) {
    return c.text((e as Error).message, 400);
  }
});
//  I get a filename per json
app.post("newscanfile", async (c) => {
  try {
    const body = await c.req.json();
    const file = body.file as string;
    const result = service.ip.eatfile(file);
    return c.json({ "ok": "true", file, result });
  } catch (e) {
    return c.json({ "ok": "false", "message": (e as Error).message }, 400);
  }
});
app.get(
  "unterlagen/*",
  serveStatic({
    root: config.UNTERLAGEN_DIR,
    rewriteRequestPath: (path) => path.replace(/^\/unterlagen/, "/"),
  }),
);

Deno.serve(
  {
    hostname: config.LISTEN_HOST,
    port: config.LISTEN_PORT,
  },
  (req, info) => app.fetch(req, { info }),
);
