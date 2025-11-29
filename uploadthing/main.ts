import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { createHash } from "node:crypto";
import Handlebars from "handlebars";
import cf from "./config.ts";
import { get_unterlagen } from "./lib.ts";
import { remoteIPMiddleware } from "./middleware/remoteip.ts";

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
Handlebars.registerPartial(
  "top",
  Deno.readTextFileSync("templates/top.hbs"),
);

// ensure ABGABEN_DIR exists
await Deno.mkdir(cf.ABGABEN_DIR, { recursive: true });

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use("*", remoteIPMiddleware);
app.get("/", async (c) => {
  const files = await get_unterlagen();
  return c.html(dirIndexTemplate({
    UNTERLAGEN_DIR: cf.UNTERLAGEN_DIR,
    files,
  }));
});
app.get("static/style.css", (c) => {
  return c.html(Deno.readTextFileSync("static/style.css"), 200, {
    "Content-Type": "text/css",
  });
});
// 1. Directory Index Handler
app.get(cf.UPLOAD_DIR, (c) => {
  const remote_ip = c.get("remoteip");
  return c.html(uploadTemplate({ remote_ip }));
});
app.post(cf.UPLOAD_DIR, async (c) => {
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
    `${cf.ABGABEN_DIR}/${remote_ip}-${file.name}`,
    data,
  );
  return c.html(
    successTemplate({ remote_ip, filename: file.name, filesize, md5sum }),
  );
});
app.use(`${cf.UNTERLAGEN_DIR}/*`, serveStatic({ root: "./" }));
Deno.serve(
  {
    hostname: "0.0.0.0",
    port: 8000, // Optionally specify a port
  },
  (req, info) => app.fetch(req, { info }),
);
