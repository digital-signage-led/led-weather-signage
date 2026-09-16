/**
 * 正式19コンテンツ・都道府県・観測地点・既存60URL保護。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalContent } from "../js/catalog.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contents = JSON.parse(readFileSync(path.join(root, "data/contents.json"), "utf8")).contents;
const prefectures = JSON.parse(readFileSync(path.join(root, "data/prefectures.json"), "utf8")).prefectures;
const stations = JSON.parse(readFileSync(path.join(root, "data/stations.json"), "utf8")).stations;
const regions = JSON.parse(readFileSync(path.join(root, "data/regions.json"), "utf8")).regions;

let failed = 0;
function assert(cond, message) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL ${message}`);
    return;
  }
  console.log(`ok   ${message}`);
}

const EXISTING = ["today_weather", "today_precip", "tomorrow_weather", "tomorrow_precip", "weekly_weather", "weekly_precip"];
const OFFICIAL = [
  ...EXISTING,
  "hourly_forecast",
  "rain_forecast",
  "kikikuru_landslide", "kikikuru_inundation", "kikikuru_flood",
  "weather_warning", "early_warning", "typhoon", "lightning_nowcast", "tornado_nowcast",
  "amedas_temperature", "amedas_rainfall", "amedas_wind"
];
const LEGACY = [
  "hourly_weather", "hourly_precip", "hourly_temperature", "precip_probability_trend",
  "rain_nowcast", "temperature_24h", "rainfall_trend", "wind_speed_trend",
  "weekly_temperature", "today_tomorrow_temperature"
];

assert(contents.length === 19, `19 contents (${contents.length})`);
assert(contents.slice(0, 6).map((c) => c.id).join() === EXISTING.join(), "existing 6 unchanged");
assert(OFFICIAL.every((id) => contents.some((c) => c.id === id)), "official 19 ids");
assert(LEGACY.every((id) => !contents.some((c) => c.id === id)), "legacy ids hidden from catalog");
assert(canonicalContent("hourly_weather") === "hourly_forecast", "alias hourly_weather");
assert(canonicalContent("hourly_temperature") === "hourly_forecast", "alias hourly_temperature");
assert(canonicalContent("rain_nowcast") === "rain_forecast", "alias rain_nowcast");
assert(canonicalContent("temperature_24h") === "amedas_temperature", "alias temperature_24h");
assert(canonicalContent("rainfall_trend") === "amedas_rainfall", "alias rainfall_trend");
assert(canonicalContent("wind_speed_trend") === "amedas_wind", "alias wind_speed_trend");
assert(canonicalContent("weekly_temperature") === "weekly_weather", "alias weekly_temperature");
assert(canonicalContent("today_tomorrow_temperature") === "today_weather", "alias today_tomorrow_temperature");
assert(contents.find((c) => c.id === "hourly_forecast")?.name === "時間別予報", "hourly name");
assert(contents.find((c) => c.id === "rain_forecast")?.name === "雨の予報", "rain name");
assert(contents.find((c) => c.id === "typhoon")?.location_scope === "national", "typhoon national");
assert(contents.find((c) => c.id === "hourly_forecast")?.location_scopes?.includes("prefecture"), "hourly pref scope");
assert(contents.find((c) => c.id === "hourly_forecast")?.location_scopes?.includes("station"), "hourly station scope");
assert(prefectures.length === 47, `47 prefs (${prefectures.length})`);
assert(stations.length > 1000, `stations exist (${stations.length})`);
assert(stations.filter((s) => s.pref_id === "akita").length > 10, "akita many stations");
assert(contents.filter((c) => EXISTING.includes(c.id)).every((c) => c.location_scope === "region"), "existing stay region scope");
assert(contents.filter((c) => c.id.startsWith("kikikuru_")).length === 3, "kikikuru stay 3");

let existingUrls = 0;
for (const region of regions) {
  for (const id of EXISTING) {
    existingUrls += 1;
    const url = `/?region=${region.id}&content=${id}`;
    assert(url.includes(`content=${id}`), url);
  }
}
assert(existingUrls === 60, `existing 60 urls (${existingUrls})`);

if (failed) {
  console.error(`\n${failed} v1 registry checks failed`);
  process.exit(1);
}
console.log("\nv1 registry checks passed");
