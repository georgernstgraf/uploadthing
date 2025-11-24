import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import Handlebars from "handlebars";

const ABGABEN_DIR = "/tmp/abgaben";
const UNTERLAGEN_DIR = "unterlagen";
const UPLOAD_DIR = "upload";

type Bindings = {
  info: Deno.ServeHandlerInfo;
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
await Deno.mkdir(ABGABEN_DIR, { recursive: true });

const app = new Hono<{ Bindings: Bindings }>();
app.get("/", (c) => {
  return c.html(Deno.readTextFile("static/index.html"));
});
app.get("static/style.css", (c) => {
  return c.html(Deno.readTextFileSync("static/style.css"), 200, {
    "Content-Type": "text/css",
  });
});
// 1. Directory Index Handler
app.get(UNTERLAGEN_DIR, async (c) => {
  const files: string[] = [];
  try {
    for await (const dirEntry of Deno.readDir(UNTERLAGEN_DIR)) {
      if (!dirEntry.name.startsWith(".")) {
        files.push(dirEntry.name);
      }
    }
  } catch (_error) {
    return c.text("Directory not found", 404);
  }
  files.sort();

  return c.html(dirIndexTemplate({
    UNTERLAGEN_DIR,
    files,
  }));
});
app.get(UPLOAD_DIR, (c) => {
  const addr = c.env.info.remoteAddr;
  const remote_ip = addr.transport === "tcp" || addr.transport === "udp"
    ? addr.hostname
    : "unix-socket";
  return c.html(uploadTemplate({ remote_ip }));
});
app.post(UPLOAD_DIR, async (c) => {
  const addr = c.env.info.remoteAddr;
  const remote_ip = addr.transport === "tcp" || addr.transport === "udp"
    ? addr.hostname
    : "unix-socket";
  const formData = await c.req.formData();
  const file = formData.get("file") as File;
  if (!file) {
    return c.text("No file uploaded", 400);
  }
  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);
  await Deno.writeFile(`${ABGABEN_DIR}/${file.name}`, data);
  return c.html(successTemplate({ remote_ip, filename: file.name }));
});
app.use(`${UNTERLAGEN_DIR}/*`, serveStatic({ root: "./" }));
Deno.serve((req, info) => app.fetch(req, { info }));
