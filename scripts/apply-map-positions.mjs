/**
 * marker-positions.json の座標を地方マスターへ反映する。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const positions = JSON.parse(fs.readFileSync(path.join(root, "src/maps/marker-positions.json"), "utf8"));
const file = path.join(root, "src/data/regions/regions.js");
let text = fs.readFileSync(file, "utf8");

for (const [id, xy] of Object.entries(positions.national)) {
  const re = new RegExp(`(nationalPoint: \\{ id: "${id}", name: "[^"]+", )x: [0-9.]+, y: [0-9.]+`);
  text = text.replace(re, `$1x: ${xy.x}, y: ${xy.y}`);
}

for (const [regionId, cities] of Object.entries(positions.regions)) {
  for (const [id, xy] of Object.entries(cities)) {
    const re = new RegExp(`(\\{ id: "${id}", name: "[^"]+", prefectureId: "[^"]+", forecastAreaId: "[^"]+", )x: [0-9.]+, y: [0-9.]+`);
    const next = text.replace(re, `$1x: ${xy.x}, y: ${xy.y}`);
    if (next === text) {
      console.warn("miss", regionId, id);
    }
    text = next;
  }
}

fs.writeFileSync(file, text);
console.log("POSITIONS_OK");
