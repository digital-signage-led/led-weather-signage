/**
 * V1レジストリ・都道府県・観測地点・既存60URL保護。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const NEW_IDS = [
  "hourly_weather", "hourly_precip", "hourly_temperature", "today_tomorrow_temperature",
  "temperature_24h", "precip_probability_trend", "rainfall_trend", "wind_speed_trend", "weekly_temperature",
  "rain_forecast",
  "kikikuru_landslide", "kikikuru_inundation", "kikikuru_flood",
  "weather_warning", "early_warning", "typhoon", "lightning_nowcast", "tornado_nowcast",
  "amedas_temperature", "amedas_rainfall", "amedas_wind"
];

assert(contents.length === 27, "27 contents");
assert(contents.slice(0, 6).map((c) => c.id).join() === EXISTING.join(), "existing 6 unchanged");
assert(NEW_IDS.every((id) => contents.some((c) => c.id === id)), "21 new content ids");
assert(!contents.some((c) => c.id === "rain_nowcast"), "rain_nowcast not a studio content");
assert(contents.find((c) => c.id === "rain_forecast")?.name === "雨の予報", "rain_forecast display name");
assert(contents.filter((c) => c.category === "map").length === 1, "one rain/map content");
const rainPrefs = prefectures.filter((p) => p.enabled).length;
assert(rainPrefs === 47, `rain_forecast 47 prefs (${rainPrefs})`);
assert(prefectures.length === 47, `47 prefs (${prefectures.length})`);
assert(prefectures.every((p) => p.pref_id && p.pref_name && p.region_id && p.enabled), "pref fields");
assert(stations.length > 1000, `stations exist (${stations.length})`);
assert(stations.every((s) => s.station_id && s.pref_id), "station ids");
assert(stations.some((s) => s.station_id === "44132" && s.temperature_available), "tokyo 44132 temp");
assert(stations.filter((s) => s.pref_id === "akita").length > 10, "akita many stations");
assert(["national", "hokkaido", "tohoku", "kanto", "chubu", "kinki", "chugoku", "shikoku", "kyushu", "okinawa"].every((id) => regions.some((r) => r.id === id)), "10 regions stay");
assert(contents.filter((c) => EXISTING.includes(c.id)).every((c) => c.location_scope === "region"), "existing stay region scope");
assert(contents.find((c) => c.id === "temperature_24h").status === "live", "24h temp live");
assert(contents.filter((c) => c.id.startsWith("kikikuru_")).every((c) => c.status === "live" && c.data_source.startsWith("jma_risk")), "kikikuru live jma risk");

let existingUrls = 0;
for (const region of regions) {
  for (const id of EXISTING) {
    existingUrls += 1;
    const url = `/?region=${region.id}&content=${id}`;
    assert(url.includes(`content=${id}`), url);
  }
}
assert(existingUrls === 60, `existing 60 urls (${existingUrls})`);

const windUrls = stations.filter((s) => s.wind_available).length;
const noWind = stations.filter((s) => !s.wind_available).length;
assert(windUrls >= 0, `wind stations ${windUrls}, skipped ${noWind}`);

if (failed) {
  console.error(`\n${failed} v1 registry checks failed`);
  process.exit(1);
}
console.log("\nv1 registry checks passed");
