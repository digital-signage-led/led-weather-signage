/**
 * 任意解像度の計測が、特定サイズ分岐になっていないことを確認する。
 */
import { cityLimit, fluidPx, readViewport, tokensFor } from "../js/viewport.js";

const contentMap = { id: "today_weather", name: "今日の天気", kind: "map", card: "weather" };
const contentTable = { id: "weekly_weather", name: "週間天気", kind: "table", card: "weather" };

const known = [
  [432, 288],
  [528, 352],
  [576, 432],
  [704, 528],
  [720, 576],
  [880, 704],
  [1024, 600],
  [1376, 448],
  [1920, 1080],
  [390, 844],
  [240, 180]
];

let failed = 0;

function assert(cond, message) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL ${message}`);
    return;
  }
  console.log(`ok   ${message}`);
}

for (const [w, h] of known) {
  const vp = readViewport(w, h);
  assert(vp.width === w && vp.height === h, `read ${w}×${h}`);
  assert(Number.isFinite(vp.aspect) && vp.aspect > 0, `aspect ${w}×${h}`);
  const tokens = tokensFor(vp, contentMap);
  assert(tokens["--font-city"].endsWith("px"), `tokens ${w}×${h}`);
  assert(tokens["--card-box-w"].endsWith("px") && tokens["--card-box-h"].endsWith("px"), `card box ${w}×${h}`);
  const mapLimit = cityLimit(vp, "kyushu", contentMap, 7);
  const tableLimit = cityLimit(vp, "kyushu", contentTable, 7);
  assert(mapLimit >= 3 && mapLimit <= 7, `map limit ${w}×${h} = ${mapLimit}`);
  assert(tableLimit >= 3 && tableLimit <= 7, `table limit ${w}×${h} = ${tableLimit}`);
}

const a = readViewport(500, 400);
const b = readViewport(501, 401);
assert(
  fluidPx(b.minSide, 0.03, 10, 22) >= fluidPx(a.minSide, 0.03, 10, 22),
  "font size moves continuously with minSide"
);

assert(readViewport(80, 80).width >= 160, "tiny width falls back safely");
assert(readViewport(99999, 40).height >= 120, "tiny height falls back safely");

const seed = 20260911;
function rand(i) {
  const x = Math.sin(seed + i * 97) * 10000;
  return x - Math.floor(x);
}

for (let i = 0; i < 12; i += 1) {
  const w = 200 + Math.round(rand(i) * 1800);
  const h = 160 + Math.round(rand(i + 20) * 1200);
  const vp = readViewport(w, h);
  const limit = cityLimit(vp, "national", contentMap, 9);
  assert(limit >= 3 && limit <= 9 && Number.isFinite(limit), `random ${vp.width}×${vp.height} limit=${limit}`);
  const tokens = tokensFor(vp, contentMap);
  const cityPx = Number.parseInt(tokens["--font-city"], 10);
  assert(cityPx >= 10, `random ${vp.width}×${vp.height} min type ${cityPx}`);
}

if (failed) {
  console.error(`\n${failed} checks failed`);
  process.exit(1);
}
console.log("\nviewport checks passed");
