import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emptyContentDoc, SYSTEM_DEFAULTS } from "../js/display-config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contents = JSON.parse(readFileSync(path.join(root, "data/contents.json"), "utf8")).contents;
const dir = path.join(root, "data/display/contents");
mkdirSync(dir, { recursive: true });
mkdirSync(path.join(root, "data/display/history"), { recursive: true });

const now = new Date().toISOString();
const catalog = {};
for (const item of contents) {
  const doc = emptyContentDoc(item.id);
  doc.updated_at = now;
  doc.legacy_layout = ["map", "table"].includes(item.kind);
  writeFileSync(path.join(dir, `${item.id}.json`), `${JSON.stringify(doc, null, 2)}\n`);
  catalog[item.id] = { version: 1, updated_at: now, status: "published" };
}

const defaults = {
  version: 1,
  updated_at: now,
  publish_api: "",
  pages_origin: "https://digital-signage-led.github.io/led-weather-signage/",
  ...SYSTEM_DEFAULTS
};
writeFileSync(path.join(root, "data/display/defaults.json"), `${JSON.stringify(defaults, null, 2)}\n`);
writeFileSync(path.join(root, "data/display/manifest.json"), `${JSON.stringify({
  version: 1,
  updated_at: now,
  published_at: now,
  publisher: "init",
  commit: "",
  contents: catalog,
  history: [{ version: 1, published_at: now, content_id: "*", scope: "init", commit: "", status: "published" }]
}, null, 2)}\n`);
console.log(`init ${contents.length} display content files`);
