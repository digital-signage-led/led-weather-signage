/**
 * スタジオ用の配置編集。
 * 地図・カード位置は地域×解像度で1つ（今日/明日×天気/降水の4種で共有）。
 * カード倍率もその4種で共有。全国は単体、地方は地方同士で倍率を共有。
 */

import { canonicalContent, canonicalRegion, isNational } from "./catalog.js?v=pref368";
import { isValidMapTransform, MAP_LAYOUT_GEN, MAP_SCALE_MAX, MAP_SHIFT_MAX } from "./map-layout.js?v=pref412";
import { focusPrefsFor } from "./map-renderer.js?v=pref406";
import {
  aspectTemplateKey,
  describeLayoutShare,
  describeMapShare,
  getLayoutGroup,
  isSharedMapContent,
  layoutSharePeers,
  mapLayoutStorageKey,
  MAP_LAYOUT_DOC_VERSION,
  parseViewportKey,
  SHARED_DAILY_MAP_CONTENTS
} from "./layout-groups.js?v=pref391";
import {
  autoPlacePrecipLegend,
  clampLegendInSafeArea,
  createLegendLayout,
  legendStatusLabel,
  normalizePrecipLegend as normalizeLegendDoc,
  PRECIP_LEGEND_DEFAULT,
  precipLegendObstacleRect,
  shouldAutoPlaceLegend
} from "./precip-legend-layout.js?v=pref388";

export {
  aspectTemplateKey,
  describeLayoutShare,
  describeMapShare,
  getLayoutGroup,
  isSharedMapContent,
  layoutSharePeers,
  mapLayoutStorageKey,
  SHARED_DAILY_MAP_CONTENTS
};
export {
  autoPlacePrecipLegend,
  legendStatusLabel,
  PRECIP_LEGEND_DEFAULT,
  precipLegendObstacleRect,
  shouldAutoPlaceLegend
};

const STORAGE_KEY = "led-weather-layout-v7";
const MAP_STORE_KEY = "led-weather-map-v3";
const STORAGE_KEY_LEGACY_V6 = "led-weather-layout-v6";
const STORAGE_KEY_LEGACY_V5 = "led-weather-layout-v5";
const CARD_SIZE_KEY = "led-weather-card-size-v5";
const CARD_SIZE_KEY_LEGACY_V4 = "led-weather-card-size-v4";
const CARD_SIZE_KEY_LEGACY_V3 = "led-weather-card-size-v3";
const CARD_SIZE_KEY_LEGACY_V2 = "led-weather-card-size-v2";
const TITLE_SCALE_KEY = "led-weather-title-scale-v3";
const TITLE_SCALE_KEY_LEGACY = "led-weather-title-scale-v2";
const STAMP_SCALE_KEY = "led-weather-stamp-scale-v1";

/** リポジトリ同梱の完成配置。localStorage に無い解像度だけ補完する。 */
let shippedDefaults = { layouts: {}, cardScales: {}, titleScales: {} };
export const CARD_SCALE_MIN = 0.28;
export const CARD_SCALE_MAX = 3;
export const TITLE_SCALE_MIN = 0.6;
export const TITLE_SCALE_MAX = 2.8;
export const CARD_POS_MIN = -40;
export const CARD_POS_MAX = 140;

function emptyLayout(regionId = "national") {
  regionId = canonicalRegion(regionId);
  return {
    map: { scale: 1, rotate: 0, x: 0, y: 0, gen: MAP_LAYOUT_GEN },
    okinawa: { x: 20, y: 38, scale: 1 },
    precipLegend: { ...PRECIP_LEGEND_DEFAULT },
    cards: {}
  };
}

function normalizePrecipLegend(pos = {}, width = 0, height = 0) {
  return normalizeLegendDoc(pos, width, height);
}

function isPopContent(contentId = "today_weather") {
  return getLayoutGroup(contentId) === "daily_precip";
}

function layoutStoreKeys(regionId) {
  const id = canonicalRegion(regionId);
  return [id, id.toUpperCase(), id === "chubu" ? "HOKURIKU" : "", id === "chubu" ? "TOKAI" : ""]
    .filter(Boolean);
}

function migrateRegionToGroups(regionDef = {}) {
  const groups = {};
  const ensure = (group, aspect, entry) => {
    if (!groups[group]) groups[group] = { aspects: {} };
    const prev = groups[group].aspects[aspect];
    const nextRev = Number(entry?.rev) || 0;
    const prevRev = Number(prev?.rev) || 0;
    if (!prev || nextRev >= prevRev) {
      groups[group].aspects[aspect] = layoutEntryFrom(entry);
    }
  };
  for (const [group, pack] of Object.entries(regionDef.groups || {})) {
    for (const [aspect, entry] of Object.entries(pack?.aspects || {})) {
      ensure(group, aspect, entry);
    }
  }
  for (const [vpKey, entry] of Object.entries(regionDef.viewports || {})) {
    const { w, h } = parseViewportKey(vpKey);
    if (!(w > 0 && h > 0) || !entry) continue;
    const aspect = aspectTemplateKey(w, h);
    // 旧4コンテンツ共有スロットは「今日」基準で天気・降水の両グループへ複製
    ensure("daily_weather", aspect, entry);
    ensure("daily_precip", aspect, entry);
  }
  if ((regionDef.map || regionDef.cards) && !Object.keys(regionDef.viewports || {}).length) {
    ensure("daily_weather", "16:9", regionDef);
    ensure("daily_precip", "16:9", regionDef);
  }
  return { groups };
}

function readLayoutStore() {
  try {
    const rawV7 = localStorage.getItem(STORAGE_KEY);
    if (rawV7) return JSON.parse(rawV7) || {};
    const legacyRaw = localStorage.getItem(STORAGE_KEY_LEGACY_V6)
      || localStorage.getItem(STORAGE_KEY_LEGACY_V5)
      || "{}";
    const legacy = JSON.parse(legacyRaw) || {};
    const migrated = {};
    for (const [regionId, regionDef] of Object.entries(legacy)) {
      if (!regionDef || typeof regionDef !== "object") continue;
      migrated[canonicalRegion(regionId)] = migrateRegionToGroups(regionDef);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    try {
      localStorage.removeItem(STORAGE_KEY_LEGACY_V6);
      localStorage.removeItem(STORAGE_KEY_LEGACY_V5);
    } catch {
      /* ignore */
    }
    return migrated;
  } catch {
    return {};
  }
}

function pickGroupAspectSlice(regionSaved, group, aspect) {
  return regionSaved?.groups?.[group]?.aspects?.[aspect] || null;
}

function readMapStore() {
  try {
    return JSON.parse(localStorage.getItem(MAP_STORE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeMapStore(all) {
  localStorage.setItem(MAP_STORE_KEY, JSON.stringify(all));
}

function engineMapFromDoc(doc = {}) {
  return {
    scale: Number(doc.scale ?? doc.map?.scale) || 1,
    x: Number(doc.translateX ?? doc.x ?? doc.map?.x) || 0,
    y: Number(doc.translateY ?? doc.y ?? doc.map?.y) || 0,
    rotate: Number(doc.rotation ?? doc.rotate ?? doc.map?.rotate) || 0,
    gen: doc.gen || doc.map?.gen || MAP_LAYOUT_GEN
  };
}

function mapDocFromEngine(regionId, aspect, map = {}, okinawa) {
  return {
    region: canonicalRegion(regionId),
    aspectTemplate: aspect,
    scale: Number(map.scale) || 1,
    translateX: Number(map.x) || 0,
    translateY: Number(map.y) || 0,
    rotation: Number(map.rotate) || 0,
    version: MAP_LAYOUT_DOC_VERSION,
    gen: MAP_LAYOUT_GEN,
    okinawa: okinawa ? { ...okinawa } : undefined
  };
}

function pickLegacyMapSlice(regionId, aspect) {
  const all = readLayoutStore();
  const saved = layoutStoreKeys(regionId).map((key) => all[key]).find(Boolean);
  const weather = pickGroupAspectSlice(saved, "daily_weather", aspect);
  const precip = pickGroupAspectSlice(saved, "daily_precip", aspect);
  const shipped = shippedDefaults.layouts?.[canonicalRegion(regionId)];
  const shippedWeather = pickGroupAspectSlice(shipped, "daily_weather", aspect);
  const shippedPrecip = pickGroupAspectSlice(shipped, "daily_precip", aspect);
  return weather || shippedWeather || precip || shippedPrecip || null;
}

/** 地図設定: 地方 × 縦横比。コンテンツIDは使わない。 */
export function loadMapLayout(regionId, width = 0, height = 0) {
  regionId = canonicalRegion(regionId);
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  const aspect = w > 0 && h > 0 ? aspectTemplateKey(w, h) : "16:9";
  const key = mapLayoutStorageKey(regionId, aspect);
  const store = readMapStore();
  let doc = store[key];
  if (!doc) {
    const legacy = pickLegacyMapSlice(regionId, aspect);
    if (legacy?.map) {
      doc = mapDocFromEngine(regionId, aspect, legacy.map, legacy.okinawa);
      store[key] = doc;
      writeMapStore(store);
    }
  }
  if (!doc) {
    return {
      map: { ...emptyLayout(regionId).map },
      okinawa: { ...emptyLayout(regionId).okinawa },
      fromStore: false,
      aspect,
      storageKey: key
    };
  }
  const map = engineMapFromDoc(doc);
  map.scale = clamp(Number(map.scale) || 1, 0.4, MAP_SCALE_MAX);
  map.x = clamp(Number(map.x) || 0, -MAP_SHIFT_MAX, MAP_SHIFT_MAX);
  map.y = clamp(Number(map.y) || 0, -MAP_SHIFT_MAX, MAP_SHIFT_MAX);
  map.rotate = clamp(Number(map.rotate) || 0, -40, 40);
  map.gen = MAP_LAYOUT_GEN;
  return {
    map,
    okinawa: { ...emptyLayout(regionId).okinawa, ...(doc.okinawa || {}) },
    fromStore: true,
    aspect,
    storageKey: key
  };
}

export function saveMapLayout(regionId, map, okinawa, width = 0, height = 0) {
  regionId = canonicalRegion(regionId);
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  const aspect = w > 0 && h > 0 ? aspectTemplateKey(w, h) : "16:9";
  const key = mapLayoutStorageKey(regionId, aspect);
  const store = readMapStore();
  store[key] = mapDocFromEngine(regionId, aspect, map, okinawa);
  writeMapStore(store);
  return key;
}

function layoutEntryFrom(source = {}) {
  const base = emptyLayout();
  return {
    map: { ...base.map, ...(source.map || {}) },
    okinawa: { ...base.okinawa, ...(source.okinawa || {}) },
    precipLegend: normalizePrecipLegend(source.precipLegend),
    cards: { ...(source.cards || {}) },
    cardsPop: { ...(source.cardsPop || source.cards || {}) }
  };
}

function pickLayoutSlice(saved, width = 0, height = 0) {
  if (!saved) return null;
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  if (w > 0 && h > 0) {
    const exact = saved.viewports?.[viewportSizeKey(w, h)];
    if (exact) return exact;
    const nearest = nearestViewportSlice(saved.viewports, w, h);
    if (nearest) return nearest;
  }
  if (saved.map || saved.cards) return saved;
  return null;
}

function nearestViewportSlice(viewports, width, height) {
  if (!viewports || typeof viewports !== "object") return null;
  const keys = Object.keys(viewports);
  if (!keys.length) return null;
  const targetArea = Math.max(1, width * height);
  let best = null;
  let bestScore = Infinity;
  for (const key of keys) {
    const parts = key.split("x");
    const ww = Number(parts[0]);
    const hh = Number(parts[1]);
    if (!(ww > 0 && hh > 0)) continue;
    const score = Math.abs(Math.log((ww * hh) / targetArea)) + Math.abs(ww / hh - width / height) * 0.35;
    if (score < bestScore) {
      bestScore = score;
      best = viewports[key];
    }
  }
  return best;
}

export async function initLayoutDefaults() {
  try {
    const response = await fetch(`${window.__LED_BASE__ || ""}data/layout-defaults.json`, { cache: "no-store" });
    if (response.ok) {
      const doc = await response.json();
      if (doc && typeof doc === "object") shippedDefaults = doc;
    }
  } catch {
    /* ignore */
  }
  seedLocalStorageFromDefaults();
}

function seedLocalStorageFromDefaults() {
  try {
    const shippedRev = Number(shippedDefaults.rev) || 0;
    const all = readLayoutStore();
    let changed = false;
    for (const [regionId, regionDef] of Object.entries(shippedDefaults.layouts || {})) {
      const id = canonicalRegion(regionId);
      const prev = all[id] || { groups: {} };
      const groups = { ...(prev.groups || {}) };
      let regionChanged = false;
      const applyEntry = (group, aspect, entry) => {
        if (!groups[group]) groups[group] = { aspects: {} };
        if (!groups[group].aspects) groups[group].aspects = {};
        const localRev = Number(groups[group].aspects[aspect]?.rev) || 0;
        const entryRev = Number(entry?.rev) || shippedRev;
        if (!groups[group].aspects[aspect] || entryRev > localRev) {
          groups[group].aspects[aspect] = layoutEntryFrom(entry);
          regionChanged = true;
        }
      };
      for (const [group, pack] of Object.entries(regionDef.groups || {})) {
        for (const [aspect, entry] of Object.entries(pack?.aspects || {})) {
          applyEntry(group, aspect, entry);
        }
      }
      for (const [vpKey, entry] of Object.entries(regionDef.viewports || {})) {
        const { w, h } = parseViewportKey(vpKey);
        if (!(w > 0 && h > 0) || !entry) continue;
        const aspect = aspectTemplateKey(w, h);
        applyEntry("daily_weather", aspect, entry);
        applyEntry("daily_precip", aspect, entry);
      }
      if (regionChanged) {
        all[id] = { groups };
        changed = true;
      }
    }
    if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(all));

    const cardAll = readCardScaleStore();
    let cardChanged = false;
    const localScaleRev = Number(cardAll.__rev) || 0;
    const forceScales = shippedRev > localScaleRev;
    for (const [key, scale] of Object.entries(shippedDefaults.cardScales || {})) {
      if (key === "__rev") continue;
      if ((forceScales || cardAll[key] == null) && Number.isFinite(Number(scale))) {
        cardAll[key] = clamp(Number(scale), CARD_SCALE_MIN, CARD_SCALE_MAX);
        cardChanged = true;
      }
    }
    if (forceScales) {
      cardAll.__rev = shippedRev;
      cardChanged = true;
    }
    if (cardChanged) localStorage.setItem(CARD_SIZE_KEY, JSON.stringify(cardAll));

    let titleAll = {};
    try {
      titleAll = JSON.parse(localStorage.getItem(TITLE_SCALE_KEY) || "{}") || {};
    } catch {
      titleAll = {};
    }
    if (typeof titleAll !== "object" || Array.isArray(titleAll)) titleAll = {};
    let titleChanged = false;
    const localTitleRev = Number(titleAll.__rev) || 0;
    const forceTitles = shippedRev > localTitleRev;
    for (const [key, scale] of Object.entries(shippedDefaults.titleScales || {})) {
      if (key === "__rev") continue;
      if ((forceTitles || titleAll[key] == null) && Number.isFinite(Number(scale))) {
        titleAll[key] = clamp(Number(scale), TITLE_SCALE_MIN, TITLE_SCALE_MAX);
        titleChanged = true;
      }
    }
    if (forceTitles) {
      titleAll.__rev = shippedRev;
      titleChanged = true;
    }
    if (titleChanged) localStorage.setItem(TITLE_SCALE_KEY, JSON.stringify(titleAll));
  } catch {
    /* ignore */
  }
}

/**
 * 配置の読み込み。
 * 地図: 地方 × 縦横比（4日次コンテンツ共通）
 * ボックス/凡例: 地方 × グループ × 縦横比
 */
function cardCount(entry) {
  if (!entry) return 0;
  return Math.max(
    Object.keys(entry.cards || {}).length,
    Object.keys(entry.cardsPop || {}).length
  );
}

function richestSlice(regionDef, group, aspect, width, height) {
  if (!regionDef) return null;
  const candidates = [];
  const add = (entry, weight) => {
    if (!entry) return;
    candidates.push({ entry, score: weight + cardCount(entry) * 20 });
  };
  add(pickGroupAspectSlice(regionDef, group, aspect), 200);
  for (const [vpKey, entry] of Object.entries(regionDef.viewports || {})) {
    const wh = parseViewportKey(vpKey);
    const same = wh.w > 0 && aspectTemplateKey(wh.w, wh.h) === aspect;
    add(entry, same ? 120 : 40);
  }
  if (width > 0 && height > 0) add(pickLayoutSlice(regionDef, width, height), 80);
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.entry || null;
}

export function loadLayout(regionId, contentId = "today_weather", width = 0, height = 0, options = {}) {
  regionId = canonicalRegion(regionId);
  const group = getLayoutGroup(contentId);
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  const aspect = w > 0 && h > 0 ? aspectTemplateKey(w, h) : "16:9";
  const sharedMap = loadMapLayout(regionId, w, h);
  try {
    const all = readLayoutStore();
    const saved = layoutStoreKeys(regionId).map((key) => all[key]).find(Boolean);
    const shippedRegion = shippedDefaults.layouts?.[regionId];
    const local = richestSlice(saved, group, aspect, width, height);
    const shipped = richestSlice(shippedRegion, group, aspect, width, height);
    const preferShipped = Boolean(options.preferShipped);
    let slice = preferShipped
      ? (cardCount(shipped) >= cardCount(local) ? shipped : local) || shipped || local
      : local || shipped;
    const base = emptyLayout(regionId);
    if (!slice) {
      return {
        ...base,
        map: sharedMap.map,
        okinawa: sharedMap.okinawa
      };
    }
    const entry = layoutEntryFrom(slice);
    const weatherCards = entry.cards || {};
    const popCards = entry.cardsPop || {};
    const cards = Object.keys(weatherCards).length ? weatherCards : popCards;
    return {
      map: sharedMap.map,
      okinawa: sharedMap.okinawa,
      precipLegend: entry.precipLegend,
      cards: { ...cards }
    };
  } catch {
    return {
      ...emptyLayout(regionId),
      map: sharedMap.map,
      okinawa: sharedMap.okinawa
    };
  }
}

/**
 * 配置の保存。
 * キー: 地方 × getLayoutGroup(content) × aspectTemplateKey(w,h)
 * 今日⇔明日は同グループへ書き込み、天気と降水は分離する。
 */
export function saveLayout(regionId, layout, contentId = "today_weather", width = 0, height = 0, options = {}) {
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
  const nextCards = options.clearCards
    ? {}
    : (Object.keys(layout.cards || {}).length
      ? layout.cards
      : (prevSlice.cards || {}));
  const entry = {
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
  if (layout.map) saveMapLayout(regionId, layout.map, layout.okinawa, w, h);
}

export function applyMapTransform(screen, layoutOrMap) {
  const map = layoutOrMap.map || layoutOrMap;
  const okinawa = layoutOrMap.okinawa || emptyLayout().okinawa;
  screen.style.setProperty("--map-scale", String(map.scale));
  screen.style.setProperty("--map-rotate", `${map.rotate}deg`);
  screen.style.setProperty("--map-x", `${map.x}%`);
  screen.style.setProperty("--map-y", `${map.y}%`);
  screen.classList.toggle("is-map-rotated", Number(map.rotate) !== 0);
  screen.style.setProperty("--oki-x", `${okinawa.x}%`);
  screen.style.setProperty("--oki-y", `${okinawa.y}%`);
  screen.style.setProperty("--oki-scale", String(okinawa.scale));
  const geo = screen.querySelector(".map-geo");
  if (geo) {
    const scale = Number(map.scale) || 1;
    const x = Number(map.x) || 0;
    const y = Number(map.y) || 0;
    geo.style.width = `${scale * 100}%`;
    geo.style.height = `${scale * 100}%`;
    geo.style.left = `${50 - 50 * scale + x}%`;
    geo.style.top = `${50 - 50 * scale + y}%`;
  }
}

/**
 * 地図・ピン・惁E��カードが .map-stage 冁E��収まるよぁEscale / 平行移勁E/ カード位置を�E計算する、E
 * 初期表示・リサイズ・ズーム�E�パン後に呼ぶ、E
 *
 * 地図のセンタリングは geo�E��E島�E�だけを基準にする。カードを含めて中忁E��取ると
 * 左側カードに引っ張られて地図が右へ寁E��返し、右端が�Eれて見えるため、E
 * カード�E位置クランプで収め、なお�Eみ出すときだけ地図を縮める�E�平行移動�EしなぁE��、E
 */
export function containMapInStage(screen, layout, { marginPct = 2.4, recenter = true } = {}) {
  if (!screen || !layout?.map) return false;
  const stage = screen.querySelector(".map-stage");
  const geo = screen.querySelector(".map-geo");
  const cardsEl = screen.querySelector(".map-cards");
  if (!stage || !geo) return false;

  layout.map.scale = clamp(Number(layout.map.scale) || 1, 0.4, MAP_SCALE_MAX);
  layout.map.x = clamp(Number(layout.map.x) || 0, -MAP_SHIFT_MAX, MAP_SHIFT_MAX);
  layout.map.y = clamp(Number(layout.map.y) || 0, -MAP_SHIFT_MAX, MAP_SHIFT_MAX);

  const stageBox = stage.getBoundingClientRect();
  if (stageBox.width < 12 || stageBox.height < 12) return false;

  const padX = stageBox.width * (marginPct / 100);
  const padY = stageBox.height * (marginPct / 100);
  const headerBox = screen.querySelector(".led-header")?.getBoundingClientRect();
  const footerBox = screen.querySelector(".led-footer")?.getBoundingClientRect();
  const top = Math.max(stageBox.top + padY, (headerBox?.bottom || stageBox.top) + padY);
  const bottom = Math.min(stageBox.bottom - padY, (footerBox?.top || stageBox.bottom) - padY);
  const bounds = {
    left: stageBox.left + padX,
    right: stageBox.right - padX,
    top,
    bottom,
    width: Math.max(1, stageBox.width - padX * 2),
    height: Math.max(1, bottom - top)
  };
  const fitEl = screen.querySelector(".map-fit") || stage;
  let changed = false;

  const measure = (includeCards) => {
    let minL = Infinity;
    let minT = Infinity;
    let maxR = -Infinity;
    let maxB = -Infinity;
    const add = (el) => {
      if (!el) return;
      const box = el.getBoundingClientRect();
      if (box.width <= 0 && box.height <= 0) return;
      minL = Math.min(minL, box.left);
      minT = Math.min(minT, box.top);
      maxR = Math.max(maxR, box.right);
      maxB = Math.max(maxB, box.bottom);
    };
    const regionId = canonicalRegion(screen.dataset.region);
    const focus = new Set(focusPrefsFor(regionId));
    if (focus.size && !isNational(regionId) && regionId !== "okinawa") {
      geo.querySelectorAll("path[data-pref]").forEach((path) => {
        if (path.closest(".map-fills-cover")) return;
        if (!focus.has(path.getAttribute("data-pref"))) return;
        add(path);
      });
    } else {
      add(geo);
    }
    if (includeCards) cardsEl?.querySelectorAll(".city-card").forEach(add);
    if (!Number.isFinite(minL)) return null;
    return { minL, minT, maxR, maxB, w: maxR - minL, h: maxB - minT };
  };

  /** 列島を�E台の余白冁E��。縮小と�E�オプションで�E�センタリング、E*/
  const fitMap = () => {
    applyMapTransform(screen, layout);
    void stage.offsetWidth;
    const content = measure(false);
    if (!content) return false;
    let localChanged = false;

    const scaleNeed = Math.min(bounds.width / content.w, bounds.height / content.h, 1);
    if (scaleNeed < 0.997) {
      const next = clamp(layout.map.scale * scaleNeed * 0.97, 0.4, MAP_SCALE_MAX);
      if (Math.abs(next - layout.map.scale) > 0.0005) {
        layout.map.scale = next;
        localChanged = true;
        applyMapTransform(screen, layout);
        void stage.offsetWidth;
      }
    }

    if (!recenter) return localChanged;

    const again = measure(false);
    if (!again) return localChanged;
    const fitBox = fitEl.getBoundingClientRect();
    const shiftXpx = (bounds.left + bounds.right - (again.minL + again.maxR)) / 2;
    const shiftYpx = (bounds.top + bounds.bottom - (again.minT + again.maxB)) / 2;
    if (fitBox.width > 1 && Math.abs(shiftXpx) > 0.5) {
      layout.map.x = clamp(layout.map.x + (shiftXpx / fitBox.width) * 100, -MAP_SHIFT_MAX, MAP_SHIFT_MAX);
      localChanged = true;
    }
    if (fitBox.height > 1 && Math.abs(shiftYpx) > 0.5) {
      layout.map.y = clamp(layout.map.y + (shiftYpx / fitBox.height) * 100, -MAP_SHIFT_MAX, MAP_SHIFT_MAX);
      localChanged = true;
    }
    if (localChanged) applyMapTransform(screen, layout);
    return localChanged;
  };

  /** カード込みで幁E��足りなぁE��きだけ縮小。カード方向へ地図を寁E��なぁE��E*/
  const shrinkForCards = () => {
    applyMapTransform(screen, layout);
    void stage.offsetWidth;
    const content = measure(true);
    if (!content) return false;
    const scaleNeed = Math.min(bounds.width / content.w, bounds.height / content.h, 1);
    if (scaleNeed >= 0.997) return false;
    const next = clamp(layout.map.scale * scaleNeed * 0.97, 0.4, MAP_SCALE_MAX);
    if (Math.abs(next - layout.map.scale) <= 0.0005) return false;
    layout.map.scale = next;
    applyMapTransform(screen, layout);
    return true;
  };

  for (let i = 0; i < 5; i += 1) {
    if (!fitMap()) break;
    changed = true;
  }
  if (clampCardsToStage(screen, layout)) changed = true;
  for (let i = 0; i < 5; i += 1) {
    if (!shrinkForCards()) break;
    changed = true;
    clampCardsToStage(screen, layout);
  }
  if (clampCardsToStage(screen, layout)) changed = true;
  applyMapTransform(screen, layout);
  return changed;
}

/** 地方ピックアップがフッター下で切れているとき、見える位置まで上げる */
export function nudgeRegionalPickupIntoView(screen, layout, regionId) {
  regionId = canonicalRegion(regionId);
  if (!screen || !layout?.map || isNational(regionId) || regionId === "okinawa") return false;
  const stage = screen.querySelector(".map-stage");
  const geo = screen.querySelector(".map-geo");
  const fitEl = screen.querySelector(".map-fit") || stage;
  if (!stage || !geo || !fitEl) return false;
  applyMapTransform(screen, layout);
  void stage.offsetWidth;
  const stageBox = stage.getBoundingClientRect();
  const fitBox = fitEl.getBoundingClientRect();
  const geoBox = geo.getBoundingClientRect();
  const footer = screen.querySelector(".led-footer");
  const footerTop = footer?.getBoundingClientRect().top ?? stageBox.bottom;
  const limitBottom = Math.min(stageBox.bottom, footerTop) - 10;
  if (fitBox.height < 12 || geoBox.height < 8) return false;
  let changed = false;
  const overflowBottom = geoBox.bottom - limitBottom;
  if (overflowBottom > 2) {
    layout.map.y = clamp(
      (Number(layout.map.y) || 0) - (overflowBottom / fitBox.height) * 100,
      -60,
      60
    );
    changed = true;
    applyMapTransform(screen, layout);
    void stage.offsetWidth;
  }
  return changed;
}

/** 惁E��カードが舞台外にはみ出さなぁE��ぁE% 位置を補正する、E*/
export function clampCardsToStage(screen, layout) {
  const stage = screen?.querySelector(".map-stage");
  const cardsEl = screen?.querySelector(".map-cards");
  if (!stage || !cardsEl) return false;
  const stageBox = stage.getBoundingClientRect();
  const layerBox = cardsEl.getBoundingClientRect();
  if (stageBox.width < 12 || layerBox.width < 12) return false;

  let changed = false;
  const pad = Math.max(22, stageBox.width * 0.032);
  for (const card of cardsEl.querySelectorAll(".city-card")) {
    const cityId = card.dataset.cityId;
    const box = card.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) continue;
    let dx = 0;
    let dy = 0;
    if (box.left < stageBox.left + pad) dx = stageBox.left + pad - box.left;
    if (box.right > stageBox.right - pad) dx = stageBox.right - pad - box.right;
    if (box.top < stageBox.top + pad) dy = stageBox.top + pad - box.top;
    if (box.bottom > stageBox.bottom - pad) dy = stageBox.bottom - pad - box.bottom;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;

    const x = clamp(
      (Number.parseFloat(card.style.left) || 0) + (dx / layerBox.width) * 100,
      CARD_POS_MIN,
      CARD_POS_MAX
    );
    const y = clamp(
      (Number.parseFloat(card.style.top) || 0) + (dy / layerBox.height) * 100,
      CARD_POS_MIN,
      CARD_POS_MAX
    );
    card.style.left = `${x}%`;
    card.style.top = `${y}%`;
    if (cityId && layout?.cards?.[cityId]?.locked) {
      layout.cards[cityId] = { ...layout.cards[cityId], x, y };
    }
    changed = true;
  }
  if (changed) centerCityCards(cardsEl);
  return changed;
}

export function viewportSizeKey(width, height) {
  return `${Math.round(Number(width) || 0)}x${Math.round(Number(height) || 0)}`;
}

/** 配置グループ名をカード倍率キーに使う。 */
function cardScaleVariant(contentId = "today_weather") {
  const group = getLayoutGroup(contentId);
  if (group === "daily_weather") return "daily_weather";
  if (group === "daily_precip") return "daily_precip";
  return isPopContent(contentId) ? "pop" : "weather";
}

/** 全国は単体、地方はすべて同じ親キー。 */
function cardScaleScope(regionId = "national") {
  return isNational(canonicalRegion(regionId)) ? "national" : "regional";
}

/** 例: regional:daily_precip:16:9 */
function cardScaleKey(contentId = "today_weather", regionId = "national", width = 0, height = 0) {
  const base = `${cardScaleScope(regionId)}:${cardScaleVariant(contentId)}`;
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  if (w > 0 && h > 0) return `${base}:${aspectTemplateKey(w, h)}`;
  return base;
}

/** 旧 weather/pop キーからも読めるようにする。 */
function cardScaleLookupKeys(contentId = "today_weather", regionId = "national", width = 0, height = 0) {
  const scope = cardScaleScope(regionId);
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  const sized = w > 0 && h > 0;
  const group = getLayoutGroup(contentId);
  const aspect = sized ? aspectTemplateKey(w, h) : "";
  const variants = isSharedMapContent(contentId)
    ? [group, "map", "weather", "pop"]
    : [cardScaleVariant(contentId), "weather", "pop"];
  const keys = [];
  for (const variant of variants) {
    if (aspect) keys.push(`${scope}:${variant}:${aspect}`);
    if (sized) keys.push(`${scope}:${variant}:${viewportSizeKey(w, h)}`);
    keys.push(`${scope}:${variant}`);
    keys.push(variant);
  }
  return [...new Set(keys)];
}

/** 近い解像度に保存されたカード倍率を探す（全画面表示で巨大化しないため）。 */
function nearestCardScaleValue(stores, scope, variants, width, height) {
  if (!(width > 0 && height > 0)) return null;
  const targetArea = Math.max(1, width * height);
  const ratio = width / height;
  let best = null;
  let bestScore = Infinity;
  for (const store of stores) {
    if (!store || typeof store !== "object") continue;
    for (const [key, raw] of Object.entries(store)) {
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      for (const variant of variants) {
        const prefix = `${scope}:${variant}:`;
        if (!key.startsWith(prefix)) continue;
        const parts = key.slice(prefix.length).split("x");
        const ww = Number(parts[0]);
        const hh = Number(parts[1]);
        if (!(ww > 0 && hh > 0)) continue;
        const score = Math.abs(Math.log((ww * hh) / targetArea)) + Math.abs(ww / hh - ratio) * 0.35;
        if (score < bestScore) {
          bestScore = score;
          best = value;
        }
      }
    }
  }
  return best;
}

function readCardScaleStore() {
  try {
    const raw = localStorage.getItem(CARD_SIZE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
    const legacy =
      JSON.parse(localStorage.getItem(CARD_SIZE_KEY_LEGACY_V4) || "null")
      || JSON.parse(localStorage.getItem(CARD_SIZE_KEY_LEGACY_V3) || "null")
      || JSON.parse(localStorage.getItem(CARD_SIZE_KEY_LEGACY_V2) || "{}");
    const migrated = {};
    for (const [key, value] of Object.entries(legacy || {})) {
      migrated[key] = clamp(Number(value) || 1, CARD_SCALE_MIN, CARD_SCALE_MAX);
    }
    // v2 の weather/pop だけなら�E国・地方の両方へ展開
    for (const variant of ["weather", "pop"]) {
      if (legacy?.[variant] == null) continue;
      const value = clamp(Number(legacy[variant]) || 1, CARD_SCALE_MIN, CARD_SCALE_MAX);
      if (migrated[`national:${variant}`] == null) migrated[`national:${variant}`] = value;
      if (migrated[`regional:${variant}`] == null) migrated[`regional:${variant}`] = value;
    }
    localStorage.setItem(CARD_SIZE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return {};
  }
}

export function loadCardScale(contentId = "today_weather", regionId = "national", width = 0, height = 0) {
  try {
    const all = readCardScaleStore();
    const keys = cardScaleLookupKeys(contentId, regionId, width, height);
    let value;
    for (const key of keys) {
      if (all[key] != null) {
        value = Number(all[key]);
        break;
      }
      if (shippedDefaults.cardScales?.[key] != null) {
        value = Number(shippedDefaults.cardScales[key]);
        break;
      }
    }
    if (!Number.isFinite(value)) {
      const scope = cardScaleScope(regionId);
      const variants = isSharedMapContent(contentId)
        ? ["map", "weather", "pop"]
        : [cardScaleVariant(contentId), "weather", "pop"];
      const nearest = nearestCardScaleValue(
        [all, shippedDefaults.cardScales],
        scope,
        variants,
        Math.round(Number(width) || 0),
        Math.round(Number(height) || 0)
      );
      if (Number.isFinite(nearest)) value = nearest;
    }
    // 地図コンテンツは未設定時も 1 にせず LED向けの小さめ既定にする
    const fallback = isSharedMapContent(contentId) ? 0.52 : 1;
    return clamp(Number(value) || fallback, CARD_SCALE_MIN, CARD_SCALE_MAX);
  } catch {
    return isSharedMapContent(contentId) ? 0.52 : 1;
  }
}

export function saveCardScale(contentId, scale, regionId = "national", width = 0, height = 0) {
  const next = clamp(scale, CARD_SCALE_MIN, CARD_SCALE_MAX);
  const all = readCardScaleStore();
  const scope = cardScaleScope(regionId);
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  const vp = w > 0 && h > 0 ? `:${viewportSizeKey(w, h)}` : "";
  // 地図4種は map/weather/pop を同時更新して切り替えでも同じ倍率にする
  const variants = isSharedMapContent(contentId)
    ? [getLayoutGroup(contentId), "map", "weather", "pop"]
    : [cardScaleVariant(contentId)];
  for (const variant of variants) {
    all[`${scope}:${variant}${vp}`] = next;
  }
  localStorage.setItem(CARD_SIZE_KEY, JSON.stringify(all));
}

export function resetCardScale(contentId = "today_weather", regionId = "national", width = 0, height = 0) {
  saveCardScale(contentId, 1, regionId, width, height);
  return 1;
}

export function applyCardScale(screen, scale) {
  if (!screen) return;
  screen.style.setProperty("--card-scale", String(clamp(scale, CARD_SCALE_MIN, CARD_SCALE_MAX)));
}

function titleScaleKeys(width = 0, height = 0, regionId = "national", contentId = "today_weather") {
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  const region = canonicalRegion(regionId);
  const vpKey = w > 0 && h > 0 ? viewportSizeKey(w, h) : "default";
  const group = getLayoutGroup(contentId);
  return {
    group,
    vpKey,
    groupKey: `${region}:${group}:${vpKey}`,
    regionKey: `${region}:${vpKey}`
  };
}

function readTitleScaleStore() {
  try {
    const raw = localStorage.getItem(TITLE_SCALE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      if (Number.isFinite(Number(parsed))) return { default: Number(parsed) };
    }
    const legacy = Number(localStorage.getItem(TITLE_SCALE_KEY_LEGACY));
    if (Number.isFinite(legacy) && legacy > 0) {
      const all = { default: legacy };
      localStorage.setItem(TITLE_SCALE_KEY, JSON.stringify(all));
      return all;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function loadTitleScale(width = 0, height = 0, regionId = "national", contentId = "today_weather") {
  try {
    const all = readTitleScaleStore();
    const { group, groupKey, regionKey, vpKey } = titleScaleKeys(width, height, regionId, contentId);
    const dailyPair = group === "daily_weather" || group === "daily_precip";
    return clamp(
      Number(
        all[groupKey]
        ?? shippedDefaults.titleScales?.[groupKey]
        ?? (dailyPair ? all[regionKey] : null)
        ?? (dailyPair ? all[vpKey] : null)
        ?? (dailyPair ? all.default : null)
        ?? (dailyPair ? shippedDefaults.titleScales?.[regionKey] : null)
        ?? (dailyPair ? shippedDefaults.titleScales?.[vpKey] : null)
      ) || 1,
      TITLE_SCALE_MIN,
      TITLE_SCALE_MAX
    );
  } catch {
    return 1;
  }
}

export function saveTitleScale(scale, width = 0, height = 0, regionId = "national", contentId = "today_weather") {
  const all = readTitleScaleStore();
  const { groupKey } = titleScaleKeys(width, height, regionId, contentId);
  all[groupKey] = clamp(scale, TITLE_SCALE_MIN, TITLE_SCALE_MAX);
  localStorage.setItem(TITLE_SCALE_KEY, JSON.stringify(all));
}

export function resetTitleScale(width = 0, height = 0, regionId = "national", contentId = "today_weather") {
  saveTitleScale(1, width, height, regionId, contentId);
  return 1;
}

export function loadStampScale(width = 0, height = 0, regionId = "national", contentId = "today_weather") {
  try {
    const all = JSON.parse(localStorage.getItem(STAMP_SCALE_KEY) || "{}") || {};
    const { groupKey } = titleScaleKeys(width, height, regionId, contentId);
    const stored = Number(all[groupKey]);
    if (Number.isFinite(stored) && stored > 0) {
      return clamp(stored, TITLE_SCALE_MIN, TITLE_SCALE_MAX);
    }
  } catch {
    /* inherit title */
  }
  return loadTitleScale(width, height, regionId, contentId);
}

export function saveStampScale(scale, width = 0, height = 0, regionId = "national", contentId = "today_weather") {
  const all = (() => {
    try {
      return JSON.parse(localStorage.getItem(STAMP_SCALE_KEY) || "{}") || {};
    } catch {
      return {};
    }
  })();
  const { groupKey } = titleScaleKeys(width, height, regionId, contentId);
  all[groupKey] = clamp(scale, TITLE_SCALE_MIN, TITLE_SCALE_MAX);
  localStorage.setItem(STAMP_SCALE_KEY, JSON.stringify(all));
}

export function applyTitleScale(screen, scale, stampScale) {
  if (!screen) return;
  const title = clamp(scale, TITLE_SCALE_MIN, TITLE_SCALE_MAX);
  const stamp = Number.isFinite(Number(stampScale))
    ? clamp(stampScale, TITLE_SCALE_MIN, TITLE_SCALE_MAX)
    : title;
  screen.style.setProperty("--title-scale", String(title));
  screen.style.setProperty("--stamp-scale", String(stamp));
}

export function applyLockedCards(placed, layout) {
  for (const item of placed) {
    const locked = layout.cards?.[item.cityId];
    if (!locked || !Number.isFinite(Number(locked.x)) || !Number.isFinite(Number(locked.y))) continue;
    item.x = Number(locked.x);
    item.y = Number(locked.y);
    item.locked = true;
  }
  return placed;
}

/** 手動配置・手動縮尺があるとき、表示中の全カードを固定する。 */
export function freezeCardLayout(laidOut, layout, { force = false } = {}) {
  if (!layout || !Array.isArray(laidOut) || !laidOut.length) return false;
  const hasCards = Object.keys(layout.cards || {}).length > 0;
  const hasCustom = force || hasCards || isCustomLayout(layout);
  if (!hasCustom) return false;
  layout.cards = layout.cards || {};
  for (const item of laidOut) {
    if (!item?.cityId) continue;
    layout.cards[item.cityId] = {
      x: Number(item.x) || 0,
      y: Number(item.y) || 0,
      locked: true
    };
  }
  return true;
}

export function isCustomLayout(layout) {
  if (!layout) return false;
  // 自動フィット後の scale/x/y（gen 付き）はカスタム扱いしない。
  // カード固定や回転・凡例移動だけを手動配置とみなす。
  return Math.abs(Number(layout.map?.rotate) || 0) > 0.5
    || Object.keys(layout.cards || {}).length > 0
    || Boolean(layout.precipLegend?.manuallyFixed)
    || (layout.precipLegend?.anchor === "custom"
      && (Math.abs((layout.precipLegend.x ?? PRECIP_LEGEND_DEFAULT.x) - PRECIP_LEGEND_DEFAULT.x) > 0.5
        || Math.abs((layout.precipLegend.y ?? PRECIP_LEGEND_DEFAULT.y) - PRECIP_LEGEND_DEFAULT.y) > 0.5));
}

/** ユーザーが地図倍率・位置を明示編集したか（自動フィット値と区別）。 */
export function isManualMapTransform(layout, autofit = null) {
  if (!layout?.map) return false;
  if (Math.abs(Number(layout.map.rotate) || 0) > 0.5) return true;
  if (!autofit) {
    return Math.abs(Number(layout.map.x) || 0) > 0.05
      || Math.abs(Number(layout.map.y) || 0) > 0.05
      || Math.abs((Number(layout.map.scale) || 1) - 1) > 0.02;
  }
  return Math.abs((Number(layout.map.scale) || 1) - (Number(autofit.scale) || 1)) > 0.04
    || Math.abs((Number(layout.map.x) || 0) - (Number(autofit.x) || 0)) > 0.8
    || Math.abs((Number(layout.map.y) || 0) - (Number(autofit.y) || 0)) > 0.8;
}

export function snapshotLayoutDefaults(regionId, layout, contentId, width, height, cardScale, titleScale) {
  regionId = canonicalRegion(regionId);
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  const group = getLayoutGroup(contentId);
  const aspect = w > 0 && h > 0 ? aspectTemplateKey(w, h) : "16:9";
  const vpKey = viewportSizeKey(w, h);
  const entry = {
    map: { ...(layout.map || emptyLayout().map) },
    okinawa: { ...(layout.okinawa || emptyLayout().okinawa) },
    precipLegend: { ...(layout.precipLegend || emptyLayout().precipLegend) },
    cards: { ...(layout.cards || {}) },
    cardsPop: { ...(layout.cards || {}) },
    rev: Date.now()
  };
  const scale = clamp(Number(cardScale) || 1, CARD_SCALE_MIN, CARD_SCALE_MAX);
  const scope = cardScaleScope(regionId);
  const cardScales = isSharedMapContent(contentId)
    ? {
      [`${scope}:${group}:${aspect}`]: scale,
      [cardScaleKey(contentId, regionId, w, h)]: scale
    }
    : {
      [cardScaleKey(contentId, regionId, w, h)]: scale
    };
  const titleKey = `${canonicalRegion(regionId)}:${group}:${vpKey}`;
  return {
    rev: entry.rev,
    layouts: {
      [regionId]: {
        groups: {
          [group]: {
            aspects: {
              [aspect]: entry
            }
          }
        },
        // 旧ツール互換のため viewports も残す
        viewports: {
          [vpKey]: entry
        }
      }
    },
    cardScales,
    titleScales: {
      [titleKey]: clamp(Number(titleScale) || 1, TITLE_SCALE_MIN, TITLE_SCALE_MAX)
    }
  };
}

export function centerCityCards(cardsEl) {
  if (!cardsEl) return;
  for (const card of cardsEl.querySelectorAll(".city-card")) {
    card.style.marginLeft = "0";
    card.style.marginTop = "0";
  }
}

export function resetLayout(regionId, contentId = "today_weather", width = 0, height = 0) {
  regionId = canonicalRegion(regionId);
  const layout = emptyLayout(regionId);
  const group = getLayoutGroup(contentId);
  if (!isSharedMapContent(contentId)) return layout;
  const all = readLayoutStore();
  const prev = all[regionId] || { groups: {} };
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  const aspect = w > 0 && h > 0 ? aspectTemplateKey(w, h) : "16:9";
  const entry = {
    precipLegend: layout.precipLegend,
    cards: {},
    cardsPop: {},
    rev: Date.now()
  };
  saveMapLayout(regionId, layout.map, layout.okinawa, w, h);
  const groups = { ...(prev.groups || {}) };
  const pack = { aspects: { ...(groups[group]?.aspects || {}) } };
  pack.aspects[aspect] = entry;
  groups[group] = pack;
  all[regionId] = { groups };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return layout;
}

export function bindMapControls(form, layout, onMapChange) {
  const scale = form.querySelector("#map-scale");
  const rotate = form.querySelector("#map-rotate");
  const shiftX = form.querySelector("#map-x");
  const shiftY = form.querySelector("#map-y");
  const scaleOut = form.querySelector("#map-scale-value");
  const rotateOut = form.querySelector("#map-rotate-value");

  const sync = () => {
    scale.value = String(layout.map.scale);
    rotate.value = String(layout.map.rotate);
    shiftX.value = String(layout.map.x);
    shiftY.value = String(layout.map.y);
    scaleOut.textContent = `${Number(layout.map.scale).toFixed(2)}`;
    rotateOut.textContent = `${Math.round(layout.map.rotate)}°`;
  };

  const read = () => {
    layout.map.scale = Number(scale.value);
    layout.map.rotate = Number(rotate.value);
    layout.map.x = Number(shiftX.value);
    layout.map.y = Number(shiftY.value);
    sync();
    onMapChange();
  };

  scale.addEventListener("input", read);
  rotate.addEventListener("input", read);
  shiftX.addEventListener("input", read);
  shiftY.addEventListener("input", read);
  sync();
  return sync;
}

export function bindMapEditor(fitEl, layout, onMapChange) {
  if (!fitEl) return;

  const apply = () => {
    layout.map.scale = clamp(layout.map.scale, 0.4, MAP_SCALE_MAX);
    layout.map.x = clamp(layout.map.x, -MAP_SHIFT_MAX, MAP_SHIFT_MAX);
    layout.map.y = clamp(layout.map.y, -MAP_SHIFT_MAX, MAP_SHIFT_MAX);
    onMapChange();
  };

  fitEl.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".city-card")) return;
    if (event.target.closest(".map-okinawa-dock")) return;
    event.preventDefault();
    fitEl.setPointerCapture(event.pointerId);
    const box = fitEl.getBoundingClientRect();
    const resizing = Boolean(event.target.closest(".map-resize"));
    const start = {
      x: event.clientX,
      y: event.clientY,
      mapX: layout.map.x,
      mapY: layout.map.y,
      scale: layout.map.scale
    };
    fitEl.classList.add("is-dragging-map");

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      if (resizing) {
        layout.map.scale = start.scale + (start.y - moveEvent.clientY) / (box.height * 0.45);
      } else {
        layout.map.x = start.mapX + (dx / box.width) * 100;
        layout.map.y = start.mapY + (dy / box.height) * 100;
      }
      apply();
    };

    const onUp = () => {
      fitEl.releasePointerCapture(event.pointerId);
      fitEl.classList.remove("is-dragging-map");
      fitEl.removeEventListener("pointermove", onMove);
      fitEl.removeEventListener("pointerup", onUp);
    };

    fitEl.addEventListener("pointermove", onMove);
    fitEl.addEventListener("pointerup", onUp);
  });

  fitEl.addEventListener("wheel", (event) => {
    if (event.target.closest(".city-card")) return;
    if (event.target.closest(".map-okinawa-dock")) return;
    event.preventDefault();
    // 通常のホイール／トラックパッドは上下移動。拡大縮小は Ctrl（または Meta）＋ホイールのみ。
    // 「上に直したい」操作で列島が勝手に大きくならないようにする。
    if (event.ctrlKey || event.metaKey) {
      const factor = event.deltaY < 0 ? 1.08 : 0.93;
      layout.map.scale *= factor;
      apply();
      return;
    }
    const box = fitEl.getBoundingClientRect();
    if (box.height > 1 && Math.abs(event.deltaY) > 0.1) {
      layout.map.y = clamp(
        layout.map.y - (event.deltaY / box.height) * 28,
        -48,
        48
      );
    }
    if (box.width > 1 && Math.abs(event.deltaX) > 0.1) {
      layout.map.x = clamp(
        layout.map.x - (event.deltaX / box.width) * 28,
        -48,
        48
      );
    }
    apply();
  }, { passive: false });
}

export function listCardPositions(cardsEl) {
  if (!cardsEl) return [];
  return [...cardsEl.querySelectorAll(".city-card")].map((card) => ({
    cityId: card.dataset.cityId,
    cityName: card.querySelector(".city-card-name")?.textContent || card.dataset.cityId,
    x: Number.parseFloat(card.style.left) || 0,
    y: Number.parseFloat(card.style.top) || 0
  }));
}

export function moveLockedCard(cardsEl, layout, regionId, contentId, cityId, x, y) {
  const card = cardsEl?.querySelector(`[data-city-id="${cityId}"]`);
  x = clamp(x, CARD_POS_MIN, CARD_POS_MAX);
  y = clamp(y, CARD_POS_MIN, CARD_POS_MAX);
  layout.cards[cityId] = {
    x,
    y,
    locked: true
  };
  if (card) {
    card.style.left = `${x}%`;
    card.style.top = `${y}%`;
    card.classList.add("is-locked");
    centerCityCards(cardsEl);
  }
  const screen = cardsEl?.closest?.(".led-screen");
  const w = Number.parseFloat(screen?.style?.getPropertyValue("--led-width")) || screen?.clientWidth || 0;
  const h = Number.parseFloat(screen?.style?.getPropertyValue("--led-height")) || screen?.clientHeight || 0;
  saveLayout(regionId, layout, contentId, w, h);
}

export function bindCardEditor(cardsEl, layout, regionId, contentId = "today_weather", onChange, screen) {
  const layer = cardsEl;

  const screenSize = () => {
    const w = Number.parseFloat(screen?.style?.getPropertyValue("--led-width")) || screen?.clientWidth || 0;
    const h = Number.parseFloat(screen?.style?.getPropertyValue("--led-height")) || screen?.clientHeight || 0;
    return { w, h };
  };

  const persist = () => {
    const { w, h } = screenSize();
    saveLayout(regionId, layout, contentId, w, h);
    onChange?.(listCardPositions(layer), loadCardScale(contentId, regionId, w, h));
  };

  const currentScale = () => {
    const { w, h } = screenSize();
    return loadCardScale(contentId, regionId, w, h);
  };

  const applySharedScale = (scale) => {
    const next = clamp(scale, CARD_SCALE_MIN, CARD_SCALE_MAX);
    const { w, h } = screenSize();
    saveCardScale(contentId, next, regionId, w, h);
    applyCardScale(screen, next);
    centerCityCards(layer);
    onChange?.(listCardPositions(layer), next);
  };

  const lockCard = (card, x, y) => {
    const cityId = card.dataset.cityId;
    if (!cityId) return;
    layout.cards[cityId] = { x, y, locked: true };
    card.style.left = `${x}%`;
    card.style.top = `${y}%`;
    card.classList.add("is-locked");
    centerCityCards(layer);
    persist();
  };

  layer.addEventListener("pointerdown", (event) => {
    const card = event.target.closest(".city-card");
    if (!card || !layer.contains(card)) return;
    event.preventDefault();
    event.stopPropagation();
    card.setPointerCapture(event.pointerId);

    const box = () => layer.getBoundingClientRect();
    const start = {
      x: event.clientX,
      y: event.clientY,
      moved: false,
      left: parseFloat(card.style.left),
      top: parseFloat(card.style.top)
    };

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      if (!start.moved && dx * dx + dy * dy < 16) return;
      start.moved = true;
      card.classList.add("is-dragging");
      const area = box();
      const x = start.left + (dx / area.width) * 100;
      const y = start.top + (dy / area.height) * 100;
      lockCard(card, clamp(x, CARD_POS_MIN, CARD_POS_MAX), clamp(y, CARD_POS_MIN, CARD_POS_MAX));
    };

    const onUp = () => {
      card.releasePointerCapture(event.pointerId);
      card.classList.remove("is-dragging");
      card.removeEventListener("pointermove", onMove);
      card.removeEventListener("pointerup", onUp);
    };

    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerup", onUp);
  });

  layer.addEventListener("wheel", (event) => {
    const card = event.target.closest(".city-card");
    if (!card || !layer.contains(card)) return;
    event.preventDefault();
    event.stopPropagation();
    const factor = event.deltaY < 0 ? 1.08 : 0.93;
    applySharedScale(currentScale() * factor);
  }, { passive: false });
}

export function bindOkinawaEditor(dockEl, layout, onChange) {
  if (!dockEl) return;
  if (!layout.okinawa) layout.okinawa = { ...emptyLayout().okinawa };

  const apply = () => {
    layout.okinawa.x = clamp(layout.okinawa.x, CARD_POS_MIN, CARD_POS_MAX);
    layout.okinawa.y = clamp(layout.okinawa.y, CARD_POS_MIN, CARD_POS_MAX);
    layout.okinawa.scale = clamp(layout.okinawa.scale, 0.7, 2.2);
    onChange();
  };

  dockEl.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    dockEl.setPointerCapture(event.pointerId);
    const box = dockEl.parentElement.getBoundingClientRect();
    const start = {
      x: event.clientX,
      y: event.clientY,
      okiX: layout.okinawa.x,
      okiY: layout.okinawa.y
    };
    dockEl.classList.add("is-dragging");

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      layout.okinawa.x = start.okiX + (dx / box.width) * 100;
      layout.okinawa.y = start.okiY + (dy / box.height) * 100;
      apply();
    };

    const onUp = () => {
      dockEl.releasePointerCapture(event.pointerId);
      dockEl.classList.remove("is-dragging");
      dockEl.removeEventListener("pointermove", onMove);
      dockEl.removeEventListener("pointerup", onUp);
    };

    dockEl.addEventListener("pointermove", onMove);
    dockEl.addEventListener("pointerup", onUp);
  });

  dockEl.addEventListener("wheel", (event) => {
    event.preventDefault();
    event.stopPropagation();
    layout.okinawa.scale *= event.deltaY < 0 ? 1.08 : 0.93;
    apply();
  }, { passive: false });
}

/** 降水確率（朝・昼・夜）凡例位置を適用 */
export function applyPrecipLegend(screenOrHost, layout, width = 0, height = 0) {
  if (!layout.precipLegend) layout.precipLegend = { ...PRECIP_LEGEND_DEFAULT };
  layout.precipLegend = normalizePrecipLegend(layout.precipLegend, width, height);
  const aspect = width > 0 && height > 0 ? aspectTemplateKey(width, height) : layout.precipLegend.layoutType;
  // 縦横比が変わった保存を流用しない（別 aspect キーが原則、ここは保険）
  if (aspect && layout.precipLegend.layoutType && layout.precipLegend.layoutType !== aspect) {
    layout.precipLegend = createLegendLayout({ anchor: "bottom-right", manuallyFixed: false }, width, height);
  } else {
    layout.precipLegend.layoutType = aspect || layout.precipLegend.layoutType;
  }
  const screen = screenOrHost?.closest?.(".led-screen") || screenOrHost?.querySelector?.(".led-screen") || document.getElementById("led-screen");
  const host = screenOrHost?.querySelector?.(".led-body") || screenOrHost;
  const el = host?.querySelector?.(".precip-tod-legend") || document.querySelector(".precip-tod-legend");
  if (!el) return;
  const safe = screen ? clampLegendInSafeArea(screen, layout.precipLegend) : layout.precipLegend;
  layout.precipLegend = safe;
  el.style.left = `${safe.x}%`;
  el.style.top = `${safe.y}%`;
  el.dataset.legendStatus = legendStatusLabel(safe);
  el.classList.toggle("is-fixed", Boolean(safe.manuallyFixed));
}

/**
 * 朝・昼・夜凡例をドラッグ移動（編集モードのみ）。
 * 座標は led-body の％。iframe 内では getBoundingClientRect が設計座標に対応。
 * 親プレビュー倍率がある場合は data-preview-scale を参照。
 */
export function bindPrecipLegendEditor(layout, regionId, contentId, onChange) {
  const el = document.querySelector(".precip-tod-legend");
  const host = el?.closest(".led-body");
  const screen = el?.closest(".led-screen");
  if (!el || !host) return;
  if (el.dataset.legendBound === "1") return;
  el.dataset.legendBound = "1";

  const w = Number.parseFloat(screen?.style?.getPropertyValue("--led-width")) || screen?.clientWidth || 0;
  const h = Number.parseFloat(screen?.style?.getPropertyValue("--led-height")) || screen?.clientHeight || 0;
  if (!layout.precipLegend) layout.precipLegend = { ...emptyLayout().precipLegend };
  layout.precipLegend = normalizePrecipLegend(layout.precipLegend, w, h);
  applyPrecipLegend(host, layout, w, h);
  el.classList.add("is-editable");

  const persist = () => {
    const sw = Number.parseFloat(screen?.style?.getPropertyValue("--led-width")) || screen?.clientWidth || 0;
    const sh = Number.parseFloat(screen?.style?.getPropertyValue("--led-height")) || screen?.clientHeight || 0;
    layout.precipLegend.layoutType = aspectTemplateKey(sw, sh);
    saveLayout(regionId, layout, contentId, sw, sh);
    onChange?.(layout.precipLegend);
  };

  el.addEventListener("pointerdown", (event) => {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const box = host.getBoundingClientRect();
    // iframe 内は設計座標。親が CSS scale している場合のみ dataset を更新する。
    const previewScale = Math.max(0.01, Number(document.documentElement.dataset.previewScale) || 1);
    const start = {
      x: layout.precipLegend.x,
      y: layout.precipLegend.y,
      px: event.clientX,
      py: event.clientY
    };
    el.classList.add("is-dragging");
    try {
      el.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }

    const onMove = (moveEvent) => {
      const logicalDeltaX = (moveEvent.clientX - start.px) / previewScale;
      const logicalDeltaY = (moveEvent.clientY - start.py) / previewScale;
      const dx = (logicalDeltaX / box.width) * 100;
      const dy = (logicalDeltaY / box.height) * 100;
      layout.precipLegend = createLegendLayout({
        ...layout.precipLegend,
        anchor: "custom",
        x: clamp(start.x + dx, 0, 92),
        y: clamp(start.y + dy, 0, 90),
        offsetX: 0,
        offsetY: 0,
        manuallyFixed: Boolean(layout.precipLegend.manuallyFixed)
      }, w, h);
      // custom 時はアンカー基準の offset を論理 px で保持（同縦横比の別解像度向け）
      const base = { x: 86, y: 68 };
      layout.precipLegend.offsetX = Math.round(((layout.precipLegend.x - base.x) / 100) * w);
      layout.precipLegend.offsetY = Math.round(((layout.precipLegend.y - base.y) / 100) * h);
      applyPrecipLegend(host, layout, w, h);
    };
    const onUp = () => {
      el.classList.remove("is-dragging");
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      if (screen) {
        layout.precipLegend = clampLegendInSafeArea(screen, layout.precipLegend);
        applyPrecipLegend(host, layout, w, h);
      }
      persist();
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  });
}

/**
 * 凡例と重なる未固定カードを少しずらす（相互自動配置の連携）。
 * @returns {boolean} 動かしたか
 */
export function nudgeCardsAwayFromLegend(cardsEl, layout, screen) {
  if (!cardsEl || !layout || !screen) return false;
  const legendBox = precipLegendObstacleRect(screen);
  if (!legendBox) return false;
  const host = cardsEl.closest(".led-body") || cardsEl.parentElement;
  if (!host) return false;
  const hostBox = host.getBoundingClientRect();
  if (hostBox.width < 8 || hostBox.height < 8) return false;

  let moved = false;
  for (const card of cardsEl.querySelectorAll(".city-card")) {
    const cityId = card.dataset.cityId;
    if (layout.cards?.[cityId]?.locked) continue;
    const box = card.getBoundingClientRect();
    if (!(
      box.right + 4 < legendBox.left
      || box.left - 4 > legendBox.right
      || box.bottom + 4 < legendBox.top
      || box.top - 4 > legendBox.bottom
    )) {
      const cardCx = (box.left + box.right) / 2;
      const cardCy = (box.top + box.bottom) / 2;
      const legCx = (legendBox.left + legendBox.right) / 2;
      const legCy = (legendBox.top + legendBox.bottom) / 2;
      let dx = cardCx - legCx;
      let dy = cardCy - legCy;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) { dx = 1; dy = 0; }
      const len = Math.hypot(dx, dy) || 1;
      const pushPx = 18;
      const nx = (dx / len) * pushPx;
      const ny = (dy / len) * pushPx;
      const xPct = clamp(((cardCx + nx - hostBox.left) / hostBox.width) * 100, 2, 98);
      const yPct = clamp(((cardCy + ny - hostBox.top) / hostBox.height) * 100, 4, 92);
      card.style.left = `${xPct}%`;
      card.style.top = `${yPct}%`;
      if (layout.cards?.[cityId]) {
        layout.cards[cityId] = { ...layout.cards[cityId], x: xPct, y: yPct };
      }
      moved = true;
    }
  }
  return moved;
}

export function runLegendCommand(screen, layout, command, regionId, contentId, width, height) {
  if (!layout) return layout?.precipLegend;
  layout.precipLegend = normalizePrecipLegend(layout.precipLegend, width, height);
  if (command === "auto" || command === "reset") {
    layout.precipLegend.manuallyFixed = false;
    layout.precipLegend.anchor = "bottom-right";
    autoPlacePrecipLegend(screen, layout, { force: true, width, height });
  } else if (command === "fix") {
    layout.precipLegend.manuallyFixed = true;
    layout.precipLegend = clampLegendInSafeArea(screen, layout.precipLegend);
  } else if (command === "unfix") {
    layout.precipLegend.manuallyFixed = false;
    // 固定解除後も手動座標は維持（自動へ戻すのは auto/reset）
  }
  applyPrecipLegend(screen, layout, width, height);
  if (regionId && contentId) saveLayout(regionId, layout, contentId, width, height);
  return layout.precipLegend;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
