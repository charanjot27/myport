// Builds the Chrome extension and packs it as public/downloads/jotr-chrome-extension.zip,
// so the website's "Add to Chrome" guide can offer it before it is on the Chrome Web Store.
// Skips with a warning (instead of failing the web build) if the extension can't be built.
import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const ext = join(web, "../extension");
// --store: the Chrome Web Store upload (manifest.json at the zip root, fails loudly).
const store = process.argv.includes("--store");
const out = store ? join(ext, "jotr-chrome-web-store.zip") : join(web, "public/downloads/jotr-chrome-extension.zip");

try {
  execFileSync(process.execPath, [join(ext, "build.mjs")], { cwd: ext, stdio: "inherit", env: { ...process.env, JOTR_STORE: store ? "1" : "" } });
} catch (e) {
  if (store) throw e;
  console.warn(`[pack-extension] skipped: the extension did not build (${e.message}).`);
  process.exit(0);
}

async function files(dir) {
  const list = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) list.push(...(await files(p)));
    else list.push(p);
  }
  return list;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = zlib.crc32 ?? ((buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
});

// Minimal ZIP writer (deflate), enough for Chrome's "Load unpacked" after unzipping.
const dist = join(ext, "dist");
const root = store ? "" : "jotr-chrome-extension/";
const locals = [];
const central = [];
let offset = 0;
for (const file of (await files(dist)).sort()) {
  const name = Buffer.from(root + relative(dist, file).split("\\").join("/"));
  const data = await readFile(file);
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const useDeflate = deflated.length < data.length;
  const body = useDeflate ? deflated : data;
  const crc = crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(useDeflate ? 8 : 0, 8);
  header.writeUInt32LE(0x00210000, 10); // fixed DOS time/date (reproducible builds)
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(body.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  locals.push(header, name, body);
  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(20, 4);
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0, 8);
  entry.writeUInt16LE(useDeflate ? 8 : 0, 10);
  entry.writeUInt32LE(0x00210000, 12);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(body.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(name.length, 28);
  entry.writeUInt32LE(offset, 42);
  central.push(entry, name);
  offset += header.length + name.length + body.length;
}
const centralSize = central.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(central.length / 2, 8);
end.writeUInt16LE(central.length / 2, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);
await mkdir(dirname(out), { recursive: true });
await writeFile(out, Buffer.concat([...locals, ...central, end]));
console.log(`[pack-extension] ${relative(web, out)} (${((offset + centralSize) / 1e6).toFixed(1)} MB)`);
