/**
 * 10地域 × 6コンテンツ = 60パターンと、旧IDエイリアスを確認する。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalContent, canonicalRegion } from "../js/catalog.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const regions = JSON.parse(readFileSync(path.join(root, "data/regions.json"), "utf8")).regions;
const contents = JSON.parse(readFileSync(path.join(root, "data/contents.json"), "utf8")).contents;

let failed = 0;
function assert(cond, message) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL ${message}`);
    return;
  }
  console.log(`ok   ${message}`);
}

const REGION_IDS = ["national", "hokkaido", "tohoku", "kanto", "chubu", "kinki", "chugoku", "shikoku", "kyushu", "okinawa"];
const CONTENT_IDS = ["today_weather", "today_precip", "tomorrow_weather", "tomorrow_precip", "weekly_weather", "weekly_precip"];
const HIDDEN_NAMES = ["関東甲信", "北陸", "東海", "九州北部", "九州南部・奄美", "九州南部"];

const existing = contents.filter((item) => CONTENT_IDS.includes(item.id));
assert(regions.length === 10, `region count ${regions.length}`);
assert(existing.length === 6, `existing content count ${existing.length}`);
assert(contents.length === 19, `official content count ${contents.length}`);
assert(canonicalContent("rain_nowcast") === "rain_forecast", "alias rain_nowcast → rain_forecast");
assert(canonicalContent("hourly_weather") === "hourly_forecast", "alias hourly_weather → hourly_forecast");
assert(canonicalContent("temperature_24h") === "amedas_temperature", "alias temperature_24h");
assert(!contents.some((item) => item.id === "rain_nowcast"), "rain_nowcast hidden from catalog list");
assert(contents.find((item) => item.id === "rain_forecast")?.name === "雨の予報", "rain_forecast name");
assert(contents.find((item) => item.id === "hourly_forecast")?.name === "時間別予報", "hourly_forecast name");
assert(contents.slice(0, 6).every((item, i) => item.id === CONTENT_IDS[i]), "existing six content ids stay first and unchanged");
assert(regions.every((item) => REGION_IDS.includes(item.id)), "region ids match spec");
assert(existing.every((item) => CONTENT_IDS.includes(item.id)), "content ids match spec");
assert(regions.every((item) => !HIDDEN_NAMES.includes(item.name)), "retired names are not in the region master");
assert(contents.some((item) => item.id === "tomorrow_precip"), "tomorrow_precip exists");

assert(canonicalRegion("NATIONAL") === "national", "alias NATIONAL");
assert(canonicalRegion("HOKURIKU") === "chubu", "alias HOKURIKU → chubu");
assert(canonicalRegion("TOKAI") === "chubu", "alias TOKAI → chubu");
assert(canonicalRegion("CHUBU") === "chubu", "alias CHUBU");
assert(canonicalRegion("KYUSHU_NORTH") === "kyushu", "alias KYUSHU_NORTH → kyushu");
assert(canonicalRegion("KYUSHU_SOUTH") === "kyushu", "alias KYUSHU_SOUTH → kyushu");
assert(canonicalRegion("KANTO") === "kanto", "alias KANTO");
assert(canonicalContent("today") === "today_weather", "alias today");
assert(canonicalContent("pop") === "today_precip", "alias pop");
assert(canonicalContent("tomorrow") === "tomorrow_weather", "alias tomorrow");
assert(canonicalContent("weekly-pop") === "weekly_precip", "alias weekly-pop");

let patterns = 0;
for (const region of regions) {
  for (const content of existing) {
    patterns += 1;
    const title = `${region.name}｜${content.name}`;
    assert(title.includes("｜"), `title ${title}`);
  }
}
assert(patterns === 60, `60 patterns (${patterns})`);

if (failed) {
  console.error(`\n${failed} catalog checks failed`);
  process.exit(1);
}
console.log("\ncatalog checks passed");
