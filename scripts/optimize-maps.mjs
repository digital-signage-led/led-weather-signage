/**
 * SVGO で japan.svg を安全に最適化。
 * data-pref の先頭ゼロ（"01" など）と県形状を保持する。
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { optimize } from "svgo";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "maps/japan.svg");
const input = readFileSync(file, "utf8");
const beforePrefs = [...input.matchAll(/data-pref="([^"]+)"/g)].map((m) => m[1]).sort();

const { data } = optimize(input, {
  path: file,
  multipass: true,
  plugins: [
    "removeDoctype",
    "removeXMLProcInst",
    "removeComments",
    "removeMetadata",
    "removeEditorsNSData",
    "cleanupAttrs",
    "removeEmptyAttrs",
    "removeEmptyContainers",
    {
      name: "convertPathData",
      params: {
        floatPrecision: 3,
        transformPrecision: 3,
        makeArcs: false,
        applyTransforms: false,
        forceAbsolutePath: false
      }
    }
  ]
});

const afterPrefs = [...data.matchAll(/data-pref="([^"]+)"/g)].map((m) => m[1]).sort();
const missing = beforePrefs.filter((id) => !afterPrefs.includes(id));
const extra = afterPrefs.filter((id) => !beforePrefs.includes(id));
if (missing.length || extra.length || beforePrefs.length !== afterPrefs.length) {
  console.error("SVGO aborted: pref mismatch", { missing, extra, before: beforePrefs.length, after: afterPrefs.length });
  process.exit(1);
}
if (!/data-pref="01"/.test(data) || !/data-pref="47"/.test(data)) {
  console.error("SVGO aborted: required prefs lost");
  process.exit(1);
}

writeFileSync(file, data);
writeFileSync(path.join(root, "src/maps/japan.svg"), data);
console.log(`svgo maps/japan.svg ${input.length} -> ${data.length} (${((1 - data.length / input.length) * 100).toFixed(1)}%)`);
console.log("prefs", afterPrefs.length);
