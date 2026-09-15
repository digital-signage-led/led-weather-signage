import { applyLayerToDoc, emptyContentDoc, resolveDisplayConfig, validateDisplayDoc } from "../js/display-config.js";

let failed = 0;
function assert(cond, message) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL ${message}`);
    return;
  }
  console.log(`ok   ${message}`);
}

const doc = emptyContentDoc("temperature_24h");
doc.graph_scale = 1.1;
const withPref = applyLayerToDoc(doc, "prefecture", { prefId: "osaka", layer: { graph_scale: 1.2 } });
const withSt = applyLayerToDoc(withPref, "station", { stationId: "62078", layer: { graph_scale: 1.4 } });
const resolved = resolveDisplayConfig({
  contentDoc: withSt,
  defaultsDoc: { graph_scale: 0.9 },
  prefId: "osaka",
  stationId: "62078"
});
assert(resolved.graph_scale === 1.4, "station override wins");
assert(resolveDisplayConfig({ contentDoc: withSt, prefId: "osaka" }).graph_scale === 1.2, "pref override");
assert(resolveDisplayConfig({ contentDoc: withSt }).graph_scale === 1.1, "content settings");
assert(validateDisplayDoc({ ...withSt, graph_scale: 99 }).length > 0, "rejects out of range");
assert(validateDisplayDoc(withSt, { contentIds: ["temperature_24h"], prefIds: ["osaka"], stationIds: ["62078"] }).length === 0, "valid doc");
assert(emptyContentDoc("today_weather").content_id === "today_weather", "legacy content docs exist");

if (failed) {
  console.error(`\n${failed} display-config checks failed`);
  process.exit(1);
}
console.log("\ndisplay-config checks passed");
