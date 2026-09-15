/**
 * 4日次コンテンツが同じ地図キー・同じ map 値を読むことを確認する。
 */
import { aspectTemplateKey, describeMapShare, mapLayoutStorageKey, SHARED_DAILY_MAP_CONTENTS } from "../js/layout-groups.js";

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};

const { loadLayout, saveLayout, loadMapLayout, saveMapLayout } = await import("../js/studio-layout.js");

const region = "chugoku";
const w = 1920;
const h = 1080;
const aspect = aspectTemplateKey(w, h);
const key = mapLayoutStorageKey(region, aspect);
const expected = "mapLayout:chugoku:16-9";
if (key !== expected) {
  console.error(`FAIL key ${key} != ${expected}`);
  process.exit(1);
}

saveMapLayout(region, { scale: 1.42, x: -3.5, y: 2, rotate: 4, gen: "national-vb-1" }, { x: 20, y: 38, scale: 1 }, w, h);

const maps = [];
for (const content of SHARED_DAILY_MAP_CONTENTS) {
  const layout = loadLayout(region, content, w, h);
  maps.push({
    content,
    scale: layout.map.scale,
    translateX: layout.map.x,
    translateY: layout.map.y,
    rotation: layout.map.rotate
  });
}

const first = maps[0];
const same = maps.every((m) => (
  m.scale === first.scale
  && m.translateX === first.translateX
  && m.translateY === first.translateY
  && m.rotation === first.rotation
));

if (!same) {
  console.error("FAIL maps differ", maps);
  process.exit(1);
}

saveLayout(region, {
  map: { scale: 1.8, x: 5, y: -2, rotate: -6 },
  okinawa: { x: 20, y: 38, scale: 1 },
  cards: { hiroshima: { x: 10, y: 10 } },
  precipLegend: { x: 80, y: 60 }
}, "today_precip", w, h);

const after = SHARED_DAILY_MAP_CONTENTS.map((content) => loadLayout(region, content, w, h).map);
const first2 = after[0];
if (!after.every((m) => m.scale === first2.scale && m.x === first2.x && m.y === first2.y && m.rotate === first2.rotate)) {
  console.error("FAIL after saveLayout", after);
  process.exit(1);
}
if (Math.abs(first2.scale - 1.8) > 0.001) {
  console.error("FAIL scale not updated", first2);
  process.exit(1);
}

const weatherCards = loadLayout(region, "today_weather", w, h).cards;
const precipCards = loadLayout(region, "today_precip", w, h).cards;
if (!precipCards.hiroshima) {
  console.error("FAIL precip cards missing");
  process.exit(1);
}

const info = describeMapShare(region, w, h);
console.log("OK", {
  key: info.storageKey,
  shared: maps,
  afterSave: first2,
  weatherCardKeys: Object.keys(weatherCards),
  precipCardKeys: Object.keys(precipCards),
  message: info.saveMessage
});
