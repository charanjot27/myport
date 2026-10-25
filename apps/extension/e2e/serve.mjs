// Tiny static server for the extension test page.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const dir = join(dirname(fileURLToPath(import.meta.url)), "site");
createServer(async (req, res) => {
  try {
    const body = await readFile(join(dir, new URL(req.url, "http://x").pathname.replace(/^\/+/, "") || "call.html"));
    res.writeHead(200, { "content-type": req.url.endsWith(".js") ? "text/javascript" : "text/html" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(Number(process.env.PORT ?? 4300));
