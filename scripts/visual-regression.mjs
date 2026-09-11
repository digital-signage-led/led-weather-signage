/**
 * 本番URLを実viewportで撮影し、基準ショットと比較する。
 * --update で基準を更新する。
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const update = process.argv.includes("--update");
const chrome = process.env.CHROME_PATH
  || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outDir = path.join(root, "tests", update ? "baselines" : "current");
const baseDir = path.join(root, "tests", "baselines");

const SIZES = [
  [432, 288],
  [528, 352],
  [576, 432],
  [704, 528],
  [720, 576],
  [880, 704]
];

mkdirSync(outDir, { recursive: true });

const shots = [];
for (const [w, h] of SIZES) {
  const name = `${w}x${h}-national-today.png`;
  const dest = path.join(outDir, name);
  const url = `http://127.0.0.1:5173/view?region=national&content=today_weather`;
  execFileSync(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    `--window-size=${w},${h}`,
    "--virtual-time-budget=20000",
    `--screenshot=${dest}`,
    url
  ], { stdio: "ignore" });
  shots.push({ name, dest, width: w, height: h });
  console.log(`shot ${name}`);
}

if (update) {
  writeFileSync(path.join(baseDir, "manifest.json"), JSON.stringify({
    createdAt: new Date().toISOString(),
    shots: shots.map((item) => item.name)
  }, null, 2));
  console.log(`updated ${shots.length} baselines`);
  process.exit(0);
}

let failed = 0;
for (const shot of shots) {
  const baseline = path.join(baseDir, shot.name);
  if (!existsSync(baseline)) {
    console.error(`FAIL missing baseline ${shot.name} (run with --update)`);
    failed += 1;
    continue;
  }
  const a = readFileSync(shot.dest);
  const b = readFileSync(baseline);
  const hashA = createHash("sha256").update(a).digest("hex");
  const hashB = createHash("sha256").update(b).digest("hex");
  const sizeDelta = Math.abs(a.length - b.length) / Math.max(b.length, 1);
  if (hashA !== hashB) {
    console.error(`DIFF ${shot.name} sizeΔ=${(sizeDelta * 100).toFixed(1)}%`);
    failed += 1;
  } else {
    console.log(`ok   ${shot.name}`);
  }
}

if (failed) {
  console.error(`\n${failed} visual diffs`);
  process.exit(1);
}
console.log("\nvisual checks passed");
