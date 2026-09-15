import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const skip = new Set(["node_modules", ".git", "src", "weather-icons-jma"]);
const targets = [];

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (skip.has(name)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(js|html|css)$/.test(name)) targets.push(p);
  }
}

walk(root);
let changed = 0;
for (const file of targets) {
  const text = fs.readFileSync(file, "utf8");
  const next = text
    .replace(/\?v=pref\d+/g, "?v=pref352")
    .replace(/DATA_VERSION = "pref\d+"/g, 'DATA_VERSION = "pref352"')
    .replace(/MAP_VERSION = "pref\d+"/g, 'MAP_VERSION = "pref352"')
    .replace(/const DATA_VERSION = "pref\d+"/g, 'const DATA_VERSION = "pref352"');
  if (next !== text) {
    fs.writeFileSync(file, next, "utf8");
    changed += 1;
    console.log("updated", path.relative(root, file));
  }
}
console.log("files", changed);
