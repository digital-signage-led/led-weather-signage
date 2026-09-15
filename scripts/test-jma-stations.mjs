/**
 * 気象庁正式観測所マスターと content フィルタ。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const doc = JSON.parse(readFileSync(path.join(root, "data/stations.json"), "utf8"));
const prefs = JSON.parse(readFileSync(path.join(root, "data/prefectures.json"), "utf8")).prefectures;
const stations = doc.stations;

let failed = 0;
function assert(cond, message) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL ${message}`);
    return;
  }
  console.log(`ok   ${message}`);
}

assert(doc.source === "Japan Meteorological Agency", "source JMA");
assert(doc.source_date === "2026-03-24", `source_date ${doc.source_date}`);
assert(stations.length >= 1400, `total ${stations.length}`);
assert(new Set(stations.map((s) => s.station_id)).size === stations.length, "unique station ids");
assert(prefs.every((p) => stations.some((s) => s.pref_id === p.pref_id)), "all 47 prefs have stations");

const akita = stations.filter((s) => s.pref_id === "akita");
assert(akita.length > 10, `akita count ${akita.length}`);
assert(akita.some((s) => s.station_name === "秋田" && s.station_id === "32402"), "akita 32402");
assert(akita.some((s) => s.station_name === "大館"), "akita odates");
assert(akita.some((s) => s.station_name === "角館"), "akita kakunodate");
assert(akita.some((s) => s.station_name === "田沢湖"), "akita tazawako");

const temp = akita.filter((s) => s.temperature_available);
const rain = akita.filter((s) => s.rainfall_available);
const wind = akita.filter((s) => s.wind_available);
assert(temp.length > 5 && temp.length < rain.length, `akita temp ${temp.length} < rain ${rain.length}`);
assert(wind.length === temp.length || wind.length > 5, `akita wind ${wind.length}`);
assert(rain.some((s) => s.jma_station_type === "雨"), "akita has rain-only");
assert(temp.every((s) => s.jma_station_type !== "雨"), "temp list excludes 雨");

assert(stations.some((s) => s.station_id === "44132" && s.pref_id === "tokyo"), "keep tokyo 44132");
assert(stations.filter((s) => s.pref_id === "tokyo").length > 5, "tokyo many");
assert(stations.filter((s) => s.pref_id === "osaka").length > 5, "osaka many");
assert(stations.filter((s) => s.pref_id === "hokkaido").length > 50, "hokkaido many");
assert(stations.filter((s) => s.pref_id === "hiroshima").length > 5, "hiroshima many");
assert(stations.filter((s) => s.pref_id === "fukuoka").length > 5, "fukuoka many");
assert(stations.filter((s) => s.pref_id === "okinawa").length > 5, "okinawa many");

assert(stations.every((s) => s.jma_station_type && s.elements), "type and elements");
assert(["官", "四", "雨", "雪"].every((t) => stations.some((s) => s.jma_station_type === t)), "official types present");

if (failed) {
  console.error(`\n${failed} station checks failed`);
  process.exit(1);
}
console.log("\nstation master checks passed");
