/**
 * スタジオ用の配置編集。
 * 地図・カード位置は地域×解像度で1つ（今日/明日×天気/降水の4種で共有）。
 * カード倍率もその4種で共有。全国は単体、地方は地方同士で倍率を共有。
 */

import { canonicalContent, canonicalRegion, isNational } from "./catalog.js?v=pref339";

const STORAGE_KEY = "led-weather-layout-v5";
const STORAGE_KEY_LEGACY = "led-weather-layout-v4";
const CARD_SIZE_KEY = "led-weather-card-size-v4";
const CARD_SIZE_KEY_LEGACY_V3 = "led-weather-card-size-v3";
const CARD_SIZE_KEY_LEGACY_V2 = "led-weather-card-size-v2";
const TITLE_SCALE_KEY = "led-weather-title-scale-v2";
const TITLE_SCALE_KEY_LEGACY = "led-weather-title-scale-v1";

/** リポジトリ同梱の完成配置。localStorage に無い解像度だけ補完する。 */
let shippedDefaults = { layouts: {}, cardScales: {}, titleScales: {} };
export const CARD_SCALE_MIN = 0.28;
export const CARD_SCALE_MAX = 3;
export const TITLE_SCALE_MIN = 0.6;
export const TITLE_SCALE_MAX = 2.8;
export const CARD_POS_MIN = -40;
export const CARD_POS_MAX = 140;
/** 降水確率レジェンド（朝/昼/夜）の既定位置＝画面右下 */
export const PRECIP_LEGEND_DEFAULT = { x: 86, y: 68 };

function emptyLayout(regionId = "national") {
  regionId = canonicalRegion(regionId);
  return {
    map: { scale: 1, rotate: 0, x: 0, y: 0 },
    okinawa: { x: 20, y: 38, scale: 1 },
    precipLegend: { ...PRECIP_LEGEND_DEFAULT },
    cards: {}
  };
}

function normalizePrecipLegend(pos = {}) {
  const x = Number(pos.x);
  const y = Number(pos.y);
  // 旧デフォルト（左上 3,22）は右下へ移す
  if (!Number.isFinite(x) || !Number.isFinite(y)
    || (Math.abs(x - 3) < 0.51 && Math.abs(y - 22) < 0.51)) {
    return { ...PRECIP_LEGEND_DEFAULT };
  }
  return {
    x: clamp(x, 0, 92),
    y: clamp(y, 0, 92)
  };
}

/** 地図4種（今日/明日 × 天気/降水）は配置・倍率を共有する。 */
function isSharedMapContent(contentId = "today_weather") {
  const id = canonicalContent(contentId);
  return id === "today_weather"
    || id === "today_precip"
    || id === "tomorrow_weather"
    || id === "tomorrow_precip";
}

function isPopContent(contentId = "today_weather") {
  const id = canonicalContent(contentId);
  return id === "today_precip" || id === "tomorrow_precip";
}

function layoutStoreKeys(regionId) {
  const id = canonicalRegion(regionId);
  return [id, id.toUpperCase(), id === "chubu" ? "HOKURIKU" : "", id === "chubu" ? "TOKAI" : ""]
    .filter(Boolean);
}

function readLayoutStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) || {};
    const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY_LEGACY) || "{}");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy || {}));
    return legacy || {};
  } catch {
    return {};
  }
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
    const response = await fetch("data/layout-defaults.json", { cache: "no-store" });
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
      const prev = all[id] || {};
      const viewports = { ...(prev.viewports || {}) };
      let regionChanged = false;
      for (const [vpKey, entry] of Object.entries(regionDef.viewports || {})) {
        const localRev = Number(viewports[vpKey]?.rev) || 0;
        const entryRev = Number(entry?.rev) || shippedRev;
        // 同梱の方が新しければ上書き（全国・明日などで直した配置をデプロイ後に反映）
        if (!viewports[vpKey] || entryRev > localRev) {
          viewports[vpKey] = entry;
          regionChanged = true;
        }
      }
      if (regionChanged) {
        all[id] = { ...prev, viewports };
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
    entry.map.scale = clamp(Number(entry.map.scale) || 1, 0.4, 3.6);
    entry.map.x = clamp(Number(entry.map.x) || 0, -40, 40);
    entry.map.y = clamp(Number(entry.map.y) || 0, -40, 40);
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
}

export function saveLayout(regionId, layout, contentId = "today_weather", width = 0, height = 0) {
  regionId = canonicalRegion(regionId);
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
    map: layout.map || prevSlice.map || emptyLayout().map,
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

  layout.map.scale = clamp(Number(layout.map.scale) || 1, 0.4, 3.6);
  layout.map.x = clamp(Number(layout.map.x) || 0, -48, 48);
  layout.map.y = clamp(Number(layout.map.y) || 0, -48, 48);

  const stageBox = stage.getBoundingClientRect();
  if (stageBox.width < 12 || stageBox.height < 12) return false;

  const padX = stageBox.width * (marginPct / 100);
  const padY = stageBox.height * (marginPct / 100);
  const bounds = {
    left: stageBox.left + padX,
    right: stageBox.right - padX,
    top: stageBox.top + padY,
    bottom: stageBox.bottom - padY,
    width: Math.max(1, stageBox.width - padX * 2),
    height: Math.max(1, stageBox.height - padY * 2)
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
    add(geo);
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
      const next = clamp(layout.map.scale * scaleNeed * 0.97, 0.4, 3.6);
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
      layout.map.x = clamp(layout.map.x + (shiftXpx / fitBox.width) * 100, -48, 48);
      localChanged = true;
    }
    if (fitBox.height > 1 && Math.abs(shiftYpx) > 0.5) {
      layout.map.y = clamp(layout.map.y + (shiftYpx / fitBox.height) * 100, -48, 48);
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
    const next = clamp(layout.map.scale * scaleNeed * 0.97, 0.4, 3.6);
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

/** 地図4種は map。それ以外は weather / pop。 */
function cardScaleVariant(contentId = "today_weather") {
  if (isSharedMapContent(contentId)) return "map";
  return isPopContent(contentId) ? "pop" : "weather";
}

/** 全国は単体、地方はすべて同じ親キー。 */
function cardScaleScope(regionId = "national") {
  return isNational(canonicalRegion(regionId)) ? "national" : "regional";
}

/** 例: regional:map:1920x1080 */
function cardScaleKey(contentId = "today_weather", regionId = "national", width = 0, height = 0) {
  const base = `${cardScaleScope(regionId)}:${cardScaleVariant(contentId)}`;
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  if (w > 0 && h > 0) return `${base}:${viewportSizeKey(w, h)}`;
  return base;
}

/** 旧 weather/pop キーからも読めるようにする。 */
function cardScaleLookupKeys(contentId = "today_weather", regionId = "national", width = 0, height = 0) {
  const scope = cardScaleScope(regionId);
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  const sized = w > 0 && h > 0;
  const vp = sized ? `:${viewportSizeKey(w, h)}` : "";
  const variants = isSharedMapContent(contentId)
    ? ["map", "weather", "pop"]
    : [cardScaleVariant(contentId), "weather", "pop"];
  const keys = [];
  for (const variant of variants) {
    keys.push(`${scope}:${variant}${vp}`);
    if (sized) keys.push(`${scope}:${variant}`);
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
      JSON.parse(localStorage.getItem(CARD_SIZE_KEY_LEGACY_V3) || "null")
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
  const variants = isSharedMapContent(contentId) ? ["map", "weather", "pop"] : [cardScaleVariant(contentId)];
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

export function loadTitleScale(width = 0, height = 0, regionId = "national") {
  try {
    const raw = localStorage.getItem(TITLE_SCALE_KEY);
    let all = {};
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") all = parsed;
      else if (Number.isFinite(Number(parsed))) all = { default: Number(parsed) };
    } else {
      const legacy = Number(localStorage.getItem(TITLE_SCALE_KEY_LEGACY));
      if (Number.isFinite(legacy) && legacy > 0) {
        all = { default: legacy };
        localStorage.setItem(TITLE_SCALE_KEY, JSON.stringify(all));
      }
    }
    const w = Math.round(Number(width) || 0);
    const h = Math.round(Number(height) || 0);
    const region = canonicalRegion(regionId);
    const vpKey = w > 0 && h > 0 ? viewportSizeKey(w, h) : "default";
    const regionKey = `${region}:${vpKey}`;
    return clamp(
      Number(
        all[regionKey]
        ?? all[vpKey]
        ?? all.default
        ?? shippedDefaults.titleScales?.[regionKey]
        ?? shippedDefaults.titleScales?.[vpKey]
      ) || 1,
      TITLE_SCALE_MIN,
      TITLE_SCALE_MAX
    );
  } catch {
    return 1;
  }
}

export function saveTitleScale(scale, width = 0, height = 0, regionId = "national") {
  let all = {};
  try {
    all = JSON.parse(localStorage.getItem(TITLE_SCALE_KEY) || "{}") || {};
  } catch {
    all = {};
  }
  if (typeof all !== "object" || Array.isArray(all)) all = {};
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  const region = canonicalRegion(regionId);
  const vpKey = w > 0 && h > 0 ? viewportSizeKey(w, h) : "default";
  const key = `${region}:${vpKey}`;
  all[key] = clamp(scale, TITLE_SCALE_MIN, TITLE_SCALE_MAX);
  localStorage.setItem(TITLE_SCALE_KEY, JSON.stringify(all));
}

export function resetTitleScale(width = 0, height = 0, regionId = "national") {
  saveTitleScale(1, width, height, regionId);
  return 1;
}

export function applyTitleScale(screen, scale) {
  if (!screen) return;
  screen.style.setProperty("--title-scale", String(clamp(scale, TITLE_SCALE_MIN, TITLE_SCALE_MAX)));
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
  return Math.abs(Number(layout.map?.x) || 0) > 0.05
    || Math.abs(Number(layout.map?.y) || 0) > 0.05
    || Math.abs((Number(layout.map?.scale) || 1) - 1) > 0.02
    || Math.abs(Number(layout.map?.rotate) || 0) > 0.5
    || Object.keys(layout.cards || {}).length > 0
    || (layout.precipLegend
      && (Math.abs((layout.precipLegend.x ?? PRECIP_LEGEND_DEFAULT.x) - PRECIP_LEGEND_DEFAULT.x) > 0.5
        || Math.abs((layout.precipLegend.y ?? PRECIP_LEGEND_DEFAULT.y) - PRECIP_LEGEND_DEFAULT.y) > 0.5));
}

export function snapshotLayoutDefaults(regionId, layout, contentId, width, height, cardScale, titleScale) {
  regionId = canonicalRegion(regionId);
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
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
      [`${scope}:map:${vpKey}`]: scale,
      [`${scope}:weather:${vpKey}`]: scale,
      [`${scope}:pop:${vpKey}`]: scale
    }
    : {
      [cardScaleKey(contentId, regionId, w, h)]: scale
    };
  const titleKey = `${canonicalRegion(regionId)}:${vpKey}`;
  return {
    rev: entry.rev,
    layouts: {
      [regionId]: {
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
  const all = readLayoutStore();
  const prev = all[regionId] || {};
  const entry = {
    map: layout.map,
    okinawa: layout.okinawa,
    precipLegend: layout.precipLegend,
    cards: {},
    cardsPop: {}
  };
  const viewports = { ...(prev.viewports || {}) };
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  if (w > 0 && h > 0) {
    viewports[viewportSizeKey(w, h)] = entry;
    all[regionId] = { ...prev, ...entry, viewports };
  } else {
    all[regionId] = { ...entry, viewports: {} };
  }
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
    layout.map.scale = clamp(layout.map.scale, 0.4, 3.6);
    layout.map.x = clamp(layout.map.x, -48, 48);
    layout.map.y = clamp(layout.map.y, -48, 48);
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
export function applyPrecipLegend(screenOrHost, layout) {
  if (!layout.precipLegend) layout.precipLegend = { ...PRECIP_LEGEND_DEFAULT };
  layout.precipLegend = normalizePrecipLegend(layout.precipLegend);
  const pos = layout.precipLegend;
  const host = screenOrHost?.querySelector?.(".led-body") || screenOrHost;
  const el = host?.querySelector?.(".precip-tod-legend") || document.querySelector(".precip-tod-legend");
  if (!el) return;
  el.style.left = `${pos.x}%`;
  el.style.top = `${pos.y}%`;
}

/** 朝�E昼・夜�E例をドラチE��で移動（編雁E��ード！E*/
export function bindPrecipLegendEditor(layout, regionId, contentId, onChange) {
  const el = document.querySelector(".precip-tod-legend");
  const host = el?.closest(".led-body");
  if (!el || !host) return;
  if (!layout.precipLegend) layout.precipLegend = { ...emptyLayout().precipLegend };
  applyPrecipLegend(host, layout);
  el.classList.add("is-editable");

  const persist = () => {
    const screen = el.closest(".led-screen");
    const w = Number.parseFloat(screen?.style?.getPropertyValue("--led-width")) || screen?.clientWidth || 0;
    const h = Number.parseFloat(screen?.style?.getPropertyValue("--led-height")) || screen?.clientHeight || 0;
    saveLayout(regionId, layout, contentId, w, h);
    onChange?.(layout.precipLegend);
  };

  el.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const box = host.getBoundingClientRect();
    const start = {
      x: layout.precipLegend.x,
      y: layout.precipLegend.y,
      px: event.clientX,
      py: event.clientY
    };
    el.classList.add("is-dragging");
    el.setPointerCapture(event.pointerId);

    const onMove = (moveEvent) => {
      const dx = ((moveEvent.clientX - start.px) / box.width) * 100;
      const dy = ((moveEvent.clientY - start.py) / box.height) * 100;
      layout.precipLegend.x = clamp(start.x + dx, 0, 92);
      layout.precipLegend.y = clamp(start.y + dy, 0, 92);
      applyPrecipLegend(host, layout);
    };
    const onUp = () => {
      el.classList.remove("is-dragging");
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      persist();
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
