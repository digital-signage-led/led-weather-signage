import { open } from "shapefile";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shp = path.join(root, "src/maps/source/gm-jpn-all_u_2_2/gm-jpn-all_u_2_2/polbnda_jpn.shp");
const dbf = path.join(root, "src/maps/source/gm-jpn-all_u_2_2/gm-jpn-all_u_2_2/polbnda_jpn.dbf");

const source = await open(shp, dbf);
const names = new Map();
let count = 0;
let sample = null;
while (true) {
  const result = await source.read();
  if (result.done) break;
  count += 1;
  if (!sample) sample = result.value.properties;
  const key = JSON.stringify(result.value.properties);
  names.set(key, (names.get(key) || 0) + 1);
}
console.log("count", count);
console.log("sample", sample);
const unique = [...names.keys()].slice(0, 20).map((k) => JSON.parse(k));
console.log("unique sample", unique);
console.log("unique count", names.size);
