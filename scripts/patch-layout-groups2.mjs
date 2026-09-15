import fs from "node:fs";

const path = "js/studio-layout.js";
let s = fs.readFileSync(path, "utf8");

const oldLoad = `/**
 * 配置の読み込み。
 * 地図4種（今日/明日×天気/降水）は content では分けず、
 * 「地方 × 解像度」の1スロットを共有する。
 * 例: 近畿×1920x1080 で今日の降水を動かしたら、明日の降水にも同じ map/cards が効く。
 */
export function loadLayout(regionId, contentId = "today_weather", width = 0, height = 0) {
  regionId = canonicalRegion(regionId);
  try {
    const all = readLayoutStore();
    const saved = layoutStoreKeys(regionId).map((key) => all[key]).find(Boolean);
    const w = Math.round(Number(width) || 0);
    const h = Math.round(Number(height) || 0);
    const vpKey = w > 0 && h > 0 ? viewportSizeKey(w, h) : "";
    const shippedRegion = shippedDefaults.layouts?.[regionId];
    const shippedExact = vpKey ? shippedRegion?.viewports?.[vpKey] : null;
    const shippedNear = !shippedExact && w > 0 && h > 0
      ? nearestViewportSlice(shippedRegion?.viewports, w, h)
      : null;
    const localSlice = saved ? pickLayoutSlice(saved, width, height) : null;
    const slice = localSlice || shippedExact || shippedNear;
    if (!slice && !saved) return emptyLayout(regionId);
    const entry = layoutEntryFrom(slice || saved || {});
    if (!isValidMapTransform(entry.map, regionId)) {
      entry.map = { ...emptyLayout(regionId).map };
    } else {
      entry.map.scale = clamp(Number(entry.map.scale) || 1, 0.4, 3.6);
      entry.map.x = clamp(Number(entry.map.x) || 0, -48, 48);
      entry.map.y = clamp(Number(entry.map.y) || 0, -48, 48);
      entry.map.gen = MAP_LAYOUT_GEN;
    }
    const weatherCards = entry.cards || {};
    const popCards = entry.cardsPop || {};
    const cards = Object.keys(weatherCards).length ? weatherCards : popCards;
    return {
      map: entry.map,
      okinawa: entry.okinawa,
      precipLegend: entry.precipLegend,
      cards: { ...cards }
    };
  } catch {
    return emptyLayout(regionId);
  }
}`;

const newLoad = `/**
 * 配置の読み込み。
 * 単位: 地方 × 配置グループ(daily_weather|daily_precip) × 縦横比テンプレート
 * 今日⇔明日は同グループ内で共有。天気と降水は別グループ。
 */
export function loadLayout(regionId, contentId = "today_weather", width = 0, height = 0) {
  regionId = canonicalRegion(regionId);
  const group = getLayoutGroup(contentId);
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  const aspect = w > 0 && h > 0 ? aspectTemplateKey(w, h) : "16:9";
  try {
    const all = readLayoutStore();
    const saved = layoutStoreKeys(regionId).map((key) => all[key]).find(Boolean);
    let slice = pickGroupAspectSlice(saved, group, aspect);
    if (!slice && saved?.viewports) {
      // 移行直後の保険: 旧 viewports から同縦横比を探す
      for (const [vpKey, entry] of Object.entries(saved.viewports)) {
        const wh = parseViewportKey(vpKey);
        if (wh.w > 0 && aspectTemplateKey(wh.w, wh.h) === aspect) {
          slice = entry;
          break;
        }
      }
      if (!slice) slice = pickLayoutSlice(saved, width, height);
    }
    const shippedRegion = shippedDefaults.layouts?.[regionId];
    const shippedGroup = pickGroupAspectSlice(shippedRegion, group, aspect);
    let shipped = shippedGroup;
    if (!shipped && shippedRegion?.viewports) {
      const vpKey = w > 0 && h > 0 ? viewportSizeKey(w, h) : "";
      shipped = (vpKey && shippedRegion.viewports[vpKey])
        || nearestViewportSlice(shippedRegion.viewports, w, h);
    }
    slice = slice || shipped;
    if (!slice) return emptyLayout(regionId);
    const entry = layoutEntryFrom(slice);
    if (!isValidMapTransform(entry.map, regionId)) {
      entry.map = { ...emptyLayout(regionId).map };
    } else {
      entry.map.scale = clamp(Number(entry.map.scale) || 1, 0.4, 3.6);
      entry.map.x = clamp(Number(entry.map.x) || 0, -48, 48);
      entry.map.y = clamp(Number(entry.map.y) || 0, -48, 48);
      entry.map.gen = MAP_LAYOUT_GEN;
    }
    const weatherCards = entry.cards || {};
    const popCards = entry.cardsPop || {};
    const cards = Object.keys(weatherCards).length ? weatherCards : popCards;
    return {
      map: entry.map,
      okinawa: entry.okinawa,
      precipLegend: entry.precipLegend,
      cards: { ...cards }
    };
  } catch {
    return emptyLayout(regionId);
  }
}`;

if (!s.includes("地図4種（今日/明日×天気/降水）は content では分けず")) {
  console.error("loadLayout comment not found");
  process.exit(1);
}
s = s.replace(oldLoad, newLoad);

const oldSaveStart = `/**
 * 配置の保存。
 * contentId は互換のため残すが、地図4種はキーに使わない（地方×解像度のみ）。
 * 週間表など非地図コンテンツから呼ばれても、同じ region×viewport スロットを更新する点に注意。
 */
export function saveLayout(regionId, layout, contentId = "today_weather", width = 0, height = 0) {
  regionId = canonicalRegion(regionId);
  const contentKey = canonicalContent(contentId);
  // 週間表は地図配置スロットを触らない（地図4種の地方×解像度共有を壊さない）
  if (contentKey === "weekly_weather" || contentKey === "weekly_precip") return;
  const all = readLayoutStore();
  const prev = all[regionId] || {};
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  const vpKey = w > 0 && h > 0 ? viewportSizeKey(w, h) : "";
  const prevSlice = (vpKey && prev.viewports?.[vpKey])
    || pickLayoutSlice(prev, w, h)
    || prev
    || {};
  const nextCards = Object.keys(layout.cards || {}).length
    ? layout.cards
    : (prevSlice.cards || {});
  const entry = {
    map: {
      ...(layout.map || prevSlice.map || emptyLayout().map),
      gen: MAP_LAYOUT_GEN
    },
    okinawa: layout.okinawa || prevSlice.okinawa || emptyLayout().okinawa,
    precipLegend: layout.precipLegend || prevSlice.precipLegend || emptyLayout().precipLegend,
    cards: { ...nextCards },
    cardsPop: { ...nextCards },
    rev: Date.now()
  };
  const viewports = { ...(prev.viewports || {}) };
  if (vpKey) viewports[vpKey] = entry;
  all[regionId] = {
    ...prev,
    ...entry,
    viewports
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}`;

const newSave = `/**
 * 配置の保存。
 * キー: 地方 × getLayoutGroup(content) × aspectTemplateKey(w,h)
 * 今日⇔明日は同グループへ書き込み、天気と降水は分離する。
 */
export function saveLayout(regionId, layout, contentId = "today_weather", width = 0, height = 0) {
  regionId = canonicalRegion(regionId);
  const group = getLayoutGroup(contentId);
  if (group === "weekly_weather" || group === "weekly_precip") return;
  if (!isSharedMapContent(contentId)) return;
  const all = readLayoutStore();
  const prev = all[regionId] || { groups: {} };
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  const aspect = w > 0 && h > 0 ? aspectTemplateKey(w, h) : "16:9";
  const prevSlice = pickGroupAspectSlice(prev, group, aspect)
    || pickLayoutSlice(prev, w, h)
    || {};
  const nextCards = Object.keys(layout.cards || {}).length
    ? layout.cards
    : (prevSlice.cards || {});
  const entry = {
    map: {
      ...(layout.map || prevSlice.map || emptyLayout().map),
      gen: MAP_LAYOUT_GEN
    },
    okinawa: layout.okinawa || prevSlice.okinawa || emptyLayout().okinawa,
    precipLegend: layout.precipLegend || prevSlice.precipLegend || emptyLayout().precipLegend,
    cards: { ...nextCards },
    cardsPop: { ...nextCards },
    rev: Date.now()
  };
  const groups = { ...(prev.groups || {}) };
  const pack = { aspects: { ...(groups[group]?.aspects || {}) } };
  pack.aspects[aspect] = entry;
  groups[group] = pack;
  all[regionId] = { groups };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}`;

if (!s.includes("地図4種はキーに使わない")) {
  console.error("saveLayout not found");
  process.exit(1);
}
s = s.replace(oldSaveStart, newSave);

fs.writeFileSync(path, s);
console.log("ok pass2 load/save");
