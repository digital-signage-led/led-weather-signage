import { open } from "shapefile";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shp = path.join(root, "src/maps/source/gm-jpn-all_u_2_2/gm-jpn-all_u_2_2/polbnda_jpn.shp");
const dbf = path.join(root, "src/maps/source/gm-jpn-all_u_2_2/gm-jpn-all_u_2_2/polbnda_jpn.dbf");
const source = await open(shp, dbf);
const nam = new Map();
while (true) {
  const result = await source.read();
  if (result.done) break;
  nam.set(result.value.properties.nam, (nam.get(result.value.properties.nam) || 0) + 1);
}
console.log([...nam.entries()].sort((a, b) => a[0].localeCompare(b[0])));
