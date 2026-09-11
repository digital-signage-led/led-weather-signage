/**
 * 気象庁予報JSONから data/weather.json を更新する。
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import locations from "../data/locations.json" with { type: "json" };
import { fetchJmaWeather } from "../js/jma-live.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = await fetchJmaWeather(locations.cities);
writeFileSync(path.join(root, "data/weather.json"), `${JSON.stringify(out, null, 2)}\n`);
for (const point of out.points) {
  console.log(`${point.cityId} ${point.weather} ${point.weatherLabel} ${point.tempMax}/${point.tempMin} ${point.pop}%`);
}
console.log(`wrote ${out.points.length} points  updatedAt=${out.updatedAt}`);
