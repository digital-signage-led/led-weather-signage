/**
 * 国土地理院「地球地図日本」から生成した SVG をインライン描画し、
 * 緯度経度を同じ投影で地図上の位置へ変換する。
 */

import { canonicalRegion, isNational } from "./catalog.js?v=pref368";
import { cardSizePct } from "./viewport.js?v=pref368";
import { MAP_VERSION } from "./version.js?v=pref368";
import { MAP_LAYOUT_GEN, MAP_SCALE_MAX, MAP_SHIFT_MAX } from "./map-layout.js?v=pref412";

import { jmaIconFile } from "./jma-icons.js?v=pref368";

const iconCache = new Map();
let iconSeq = 0;
let mapSvgTextPromise = null;
let mapSvgTemplate = null;
const viewBoxByRegion = new Map();
const borderHtmlByRegion = new Map();

function inlineJmaSvg(svgText, prefix) {
  let svg = String(svgText).replace(/^\uFEFF/, "").replace(/<\?xml[^>]*>/, "").trim();
  svg = svg.replace(/<svg\b([^>]*)>/i, (_, attrs) => {
    const rest = String(attrs)
      .replace(/\s(width|height)="[^"]*"/g, "")
      .replace(/\sclass="[^"]*"/g, "")
      .replace(/\sstyle="[^"]*"/g, "");
    return `<svg class="jma-icon" width="100%" height="100%" style="max-width:100%;max-height:100%;display:block" preserveAspectRatio="xMidYMid meet"${rest}>`;
  });
  svg = svg.replace(/\bid="([^"]+)"/g, `id="${prefix}-$1"`);
  svg = svg.replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`);
  svg = svg.replace(/xlink:href="#([^"]+)"/g, `xlink:href="#${prefix}-$1"`);
  return svg;
}

export async function loadMapSvg(mapFile = "japan.svg") {
  // 全国・地方とも共通の japan.svg。1回だけ取得し以降はメモリ再利用。
  if (!mapSvgTextPromise) {
    const file = "japan.svg";
    mapSvgTextPromise = fetch(`maps/${file}?v=${MAP_VERSION}`)
      .then((response) => {
        if (!response.ok) throw new Error(`${file} を読み込めません`);
        return response.text();
      })
      .catch((err) => {
        mapSvgTextPromise = null;
        throw err;
      });
  }
  return mapSvgTextPromise;
}

function cloneMapSvg(svgText) {
  if (!mapSvgTemplate) {
    const fitted = svgText.replace("<svg ", '<svg preserveAspectRatio="xMidYMid meet" ');
    const parsed = new DOMParser().parseFromString(fitted, "image/svg+xml");
    const node = parsed.documentElement;
    if (node.querySelector("parsererror")) {
      mapSvgTemplate = null;
      return null;
    }
    mapSvgTemplate = node;
  }
  return mapSvgTemplate.cloneNode(true);
}

export async function loadIcon(weather, night = false) {
  const file = jmaIconFile(weather, night);
  if (!iconCache.has(file)) {
    const response = await fetch(file);
    if (!response.ok) throw new Error(`アイコンを読み込めません: ${file}`);
    iconCache.set(file, await response.text());
  }
  iconSeq += 1;
  return inlineJmaSvg(iconCache.get(file), `jma${iconSeq}`);
}

/** 地図は画面いっぱいに置き、カードは各地点のそばへ重ねる。 */
export const MAP_CORE = { left: 0, top: 0, right: 100, bottom: 100 };

export function mountMap(stage, svgText, regionId = "national") {
  regionId = canonicalRegion(regionId);
  stage.innerHTML = `
    <div id="map-layer" class="map-fit">
      <div class="map-geo">
        <div class="map-core">
          <div class="map-square">
            <div class="map-svg"></div>
            <svg class="map-pins" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true"></svg>
          </div>
        </div>
      </div>
      <div class="map-leaders"></div>
      <div class="map-cards"></div>
      <button type="button" class="map-resize" aria-label="地図の大きさを変える"></button>
    </div>
  `;
  const host = stage.querySelector(".map-svg");
  const cloned = cloneMapSvg(svgText);
  if (cloned) host.appendChild(document.importNode(cloned, true));
  else {
    const fitted = svgText.replace("<svg ", '<svg preserveAspectRatio="xMidYMid meet" ');
    host.innerHTML = fitted;
  }
  const mapSvg = host.querySelector("svg");
  applyScreenFocus(mapSvg, regionId);
  prepareCommonMapLayers(mapSvg, regionId);
  dropOutOfFrameTris(mapSvg, regionId);
  paintNeighborLand(mapSvg, regionId);
  prepareMapStrokes(mapSvg, regionId);
  fitRegionalView(mapSvg, stage.querySelector(".map-pins"), regionId);
  const fit = stage.querySelector(".map-fit");
  // 沖縄枠の切り離しは全国画面のみ（地方の沖縄は inset を拡大表示）。
  const okinawa = isNational(regionId) ? detachOkinawaInset(fit, mapSvg) : null;
  return {
    pins: stage.querySelector(".map-pins"),
    leaders: stage.querySelector(".map-leaders"),
    cards: stage.querySelector(".map-cards"),
    geo: stage.querySelector(".map-geo"),
    fit,
    okinawaDock: okinawa?.dock || null,
    okinawaPins: okinawa?.pins || null,
    regionId
  };
}

/** 全国図の沖縄枠は列島の拡大・移動に追従させず、画面内に残す。 */
const OKINAWA_DOCK_VIEWBOX = "6 37 20 22";

function detachOkinawaInset(fitEl, mapSvg) {
  const inset = mapSvg?.querySelector(".map-okinawa-inset");
  if (!inset || !fitEl) return null;
  const dock = document.createElement("div");
  dock.className = "map-okinawa-dock";
  dock.setAttribute("aria-label", "沖縄");
  const overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  overlay.setAttribute("class", "map-okinawa-overlay");
  overlay.setAttribute("viewBox", OKINAWA_DOCK_VIEWBOX);
  overlay.setAttribute("preserveAspectRatio", "xMidYMid meet");
  overlay.setAttribute("aria-hidden", "true");
  overlay.appendChild(inset);
  const pins = document.createElementNS("http://www.w3.org/2000/svg", "g");
  pins.setAttribute("class", "map-okinawa-pins");
  overlay.appendChild(pins);
  dock.appendChild(overlay);
  fitEl.appendChild(dock);
  return { dock, pins };
}

/** 地方画面の強調県（JIS 都道府県コード）。共通 japan.svg 上で緑にする。 */
const SCREEN_FOCUS_PREFS = {
  hokkaido: ["01"],
  tohoku: ["02", "03", "04", "05", "06", "07"],
  kanto: ["08", "09", "10", "11", "12", "13", "14"],
  chubu: ["15", "16", "17", "18", "19", "20", "21", "22", "23", "24"],
  kinki: ["24", "25", "26", "27", "28", "29", "30"],
  chugoku: ["31", "32", "33", "34", "35"],
  shikoku: ["36", "37", "38", "39"],
  kyushu: ["40", "41", "42", "43", "44", "45", "46"],
  okinawa: ["47"]
};

/** 全国共通 SVG の基準 viewBox（地方でも差し替えない）。 */
export const NATIONAL_MAP_VIEWBOX = "0 0 100 100";

const PRESET_CARD_SCREENS = new Set([
  "national", "hokkaido", "tohoku", "kanto", "chubu",
  "kinki", "chugoku", "shikoku", "kyushu", "okinawa"
]);

export function focusPrefsFor(regionId) {
  return SCREEN_FOCUS_PREFS[canonicalRegion(regionId)] || [];
}

/** 全都道府県パスへ識別属性を付与（地方判定は JS の都道府県コード一覧で行う）。 */
function annotatePrefAttributes(svg) {
  if (!svg) return;
  svg.querySelectorAll("[data-pref]").forEach((el) => {
    const code = el.getAttribute("data-pref");
    if (!code) return;
    el.setAttribute("data-pref-code", code);
    if (!el.id) el.setAttribute("id", `pref-${code}`);
  });
}

/**
 * 共通地図を地方表示向けに整える。
 * 県を display:none で消さない（REGION ≠ 描画対象）。沖縄 inset の枠だけ調整する。
 */
function prepareCommonMapLayers(svg, regionId) {
  if (!svg) return;
  annotatePrefAttributes(svg);
  regionId = canonicalRegion(regionId);
  if (isNational(regionId)) return;
  if (regionId === "okinawa") {
    // 地方沖縄は inset を拡大表示。本州は残しつつ inset の白枠だけ外す。
    svg.querySelectorAll(".map-okinawa-inset > rect").forEach((el) => el.setAttribute("display", "none"));
    return;
  }
  const inset = svg.querySelector(".map-okinawa-inset");
  if (inset) inset.setAttribute("display", "none");
}

/**
 * getBBox() は要素自身の transform を含めない。
 * 沖縄inset は全国図コーナーへ移動する transform 付きなので、
 * 頂点を行列で写してルート座標の枠を取る。
 */
function transformBoxCorners(box, matrix) {
  if (!box || !Number.isFinite(box.x) || (box.width <= 0 && box.height <= 0)) return null;
  const corners = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x + box.width, box.y + box.height],
    [box.x, box.y + box.height]
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x0, y0] of corners) {
    const x = matrix ? matrix.a * x0 + matrix.c * y0 + matrix.e : x0;
    const y = matrix ? matrix.b * x0 + matrix.d * y0 + matrix.f : y0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

function elementBoxInSvg(el) {
  if (!el || el.getAttribute("display") === "none") return null;
  let box;
  try {
    box = el.getBBox();
  } catch {
    return null;
  }
  let matrix = null;
  try {
    matrix = el.transform?.baseVal?.consolidate()?.matrix || null;
  } catch {
    matrix = null;
  }
  return transformBoxCorners(box, matrix);
}

/** path など子要素の bbox に、親（沖縄inset）の transform を掛ける。 */
function elementBoxWithParentTransform(el, parent) {
  if (!el || el.getAttribute("display") === "none") return null;
  let box;
  try {
    box = el.getBBox();
  } catch {
    return null;
  }
  let matrix = null;
  try {
    matrix = parent?.transform?.baseVal?.consolidate()?.matrix || null;
  } catch {
    matrix = null;
  }
  return transformBoxCorners(box, matrix);
}

/** 離島まで枠に入れると本島が小さくなる地方。path 中心付近の島だけ枠に使う。 */
const REGION_FIT_CORE = {
  // 対馬・種子島以南を外し、九州本島と近傍を大きく見せる
  kyushu: { minX: 7.2, maxX: 23.2, minY: 73.8, maxY: 93.3 }
};

function pathInFitCore(regionId, bounds) {
  const core = REGION_FIT_CORE[regionId];
  if (!core || !bounds) return true;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return cx >= core.minX && cx <= core.maxX && cy >= core.minY && cy <= core.maxY;
}

/**
 * 全国共通 viewBox を常に使う（沖縄地方だけ inset 拡大用の枠）。
 * 地方の寄りは CSS transform（scale/x/y）で行う。viewBox で県を切らない。
 */
function fitRegionalView(svg, pinsSvg, regionId) {
  if (!svg) return;
  regionId = canonicalRegion(regionId);
  let view = NATIONAL_MAP_VIEWBOX;

  if (regionId === "okinawa") {
    const cached = viewBoxByRegion.get(regionId);
    if (cached) {
      svg.setAttribute("viewBox", cached);
      if (pinsSvg) pinsSvg.setAttribute("viewBox", cached);
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const inset = svg.querySelector(".map-okinawa-inset");
    const paths = inset?.querySelectorAll("path") || [];
    if (inset && paths.length) {
      paths.forEach((path) => {
        const bounds = elementBoxWithParentTransform(path, inset);
        if (!bounds) return;
        minX = Math.min(minX, bounds.minX);
        minY = Math.min(minY, bounds.minY);
        maxX = Math.max(maxX, bounds.maxX);
        maxY = Math.max(maxY, bounds.maxY);
      });
    }
    if (Number.isFinite(minX) && maxX - minX >= 2 && maxY - minY >= 2) {
      const pad = 1.2;
      view = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
    } else {
      view = OKINAWA_DOCK_VIEWBOX;
    }
    viewBoxByRegion.set(regionId, view);
  } else if (!viewBoxByRegion.has("national")) {
    // 全国土地の実測（初回のみ）。以降は 0 0 100 100 系を共有。
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    svg.querySelectorAll(".map-fills path[data-pref], .map-okinawa-inset path").forEach((path) => {
      const bounds = elementBoxInSvg(path);
      if (!bounds) return;
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    });
    if (Number.isFinite(minX) && maxX - minX > 4 && maxY - minY > 4) {
      const pad = 1.8;
      view = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
    }
    viewBoxByRegion.set("national", view);
  } else {
    view = viewBoxByRegion.get("national");
  }

  svg.setAttribute("viewBox", view);
  if (pinsSvg) pinsSvg.setAttribute("viewBox", view);
}

/**
 * 対象地方の都道府県 bbox から、地図レイヤー用の scale / x% / y% を求める。
 * viewBox は全国のまま。フォーカス地方がステージに収まる倍率を採用する。
 */
export function computeFocusMapTransform(svg, regionId, {
  margin = 0.2,
  minScale = 0.45,
  maxScale = MAP_SCALE_MAX
} = {}) {
  regionId = canonicalRegion(regionId);
  if (!svg || isNational(regionId) || regionId === "okinawa") {
    return { scale: 1, x: 0, y: 0, rotate: 0, gen: MAP_LAYOUT_GEN };
  }

  const vb = (svg.getAttribute("viewBox") || NATIONAL_MAP_VIEWBOX).trim().split(/[\s,]+/).map(Number);
  const vx = vb[0];
  const vy = vb[1];
  const vw = vb[2] || 100;
  const vh = vb[3] || 100;
  const focus = new Set(focusPrefsFor(regionId));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  svg.querySelectorAll(".map-fills path[data-pref]").forEach((path) => {
    if (path.closest(".map-fills-cover")) return;
    const pref = path.getAttribute("data-pref");
    if (!pref || !focus.has(pref)) return;
    const bounds = elementBoxInSvg(path);
    if (!bounds) return;
    if (!pathInFitCore(regionId, bounds)) return;
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  });
  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) {
    return regionalFallbackTransform(regionId);
  }

  const focusW = (maxX - minX) * (1 + margin * 2);
  const focusH = (maxY - minY) * (1 + margin * 2);
  let scale = Math.min(vw / focusW, vh / focusH);
  if (!Number.isFinite(scale) || scale <= 0) scale = 1;
  scale = Math.min(maxScale, Math.max(minScale, scale));

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const nx = (cx - vx) / vw;
  const ny = (cy - vy) / vh;
  const x = scale * 100 * (0.5 - nx);
  const y = scale * 100 * (0.48 - ny);
  if (scale < 1.25) return regionalFallbackTransform(regionId);
  return {
    scale: Math.round(scale * 1000) / 1000,
    x: Math.round(Math.max(-MAP_SHIFT_MAX, Math.min(MAP_SHIFT_MAX, x)) * 100) / 100,
    y: Math.round(Math.max(-MAP_SHIFT_MAX, Math.min(MAP_SHIFT_MAX, y)) * 100) / 100,
    rotate: 0,
    gen: MAP_LAYOUT_GEN
  };
}

const REGION_FALLBACK_TRANSFORM = {
  hokkaido: { scale: 1.95, x: -64, y: 64 },
  tohoku: { scale: 2.4, x: -46, y: 15 },
  kanto: { scale: 4.8, x: -66, y: -65 },
  chubu: { scale: 2.4, x: -7, y: -31 },
  kinki: { scale: 4.7, x: 40, y: -106 },
  chugoku: { scale: 4.2, x: 96, y: -88 },
  shikoku: { scale: 5.1, x: 104, y: -148 },
  kyushu: { scale: 2.7, x: 100, y: -97 }
};

export function regionalFallbackTransform(regionId) {
  const fallback = REGION_FALLBACK_TRANSFORM[canonicalRegion(regionId)];
  if (!fallback) return { scale: 1, x: 0, y: 0, rotate: 0, gen: MAP_LAYOUT_GEN };
  return { ...fallback, rotate: 0, gen: MAP_LAYOUT_GEN };
}

/** 保存済み map 変換が現行座標系として妥当か。 */
export { isValidMapTransform, MAP_LAYOUT_GEN, MAP_SCALE_MAX, MAP_SHIFT_MAX } from "./map-layout.js?v=pref412";

function applyScreenFocus(svg, regionId) {
  const prefs = focusPrefsFor(regionId);
  if (!svg || !prefs.length) return;
  const focusSet = new Set(prefs);
  svg.querySelectorAll("[data-pref]").forEach((el) => {
    const id = el.getAttribute("data-pref");
    if (!id) return;
    const wantFocus = focusSet.has(id);
    el.classList.toggle("map-as-focus", wantFocus);
    el.classList.toggle("map-as-dim", !wantFocus);
    el.removeAttribute("display");
  });
}

/** 枠の外へ突き出した三角は海の上に縞になるので除く。 */
const OUT_OF_FRAME_PREFS = {
  kanto: ["20"]
};

/** ピックアップ以外の周辺県は色を付けず、白のまま残す。 */
function paintNeighborLand(svg, regionId = "") {
  if (!svg) return;
  regionId = canonicalRegion(regionId);
  const national = isNational(regionId);
  const focusPrefs = new Set(focusPrefsFor(regionId));
  // メイン地方は緑、周辺はグレー（REGION 強調 ≠ 周辺を消す）
  const focusFill = "#76c85a";
  const dimFill = "#d0d5db";
  const focusStroke = national
    ? `stroke: none !important;`
    : `stroke: #ffffff !important;
      stroke-width: 0.07 !important;
      stroke-linejoin: round !important;
      stroke-linecap: round !important;
      paint-order: fill stroke;
      vector-effect: none;`;
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `
    .map-fills.map-focus > path:not(.map-as-dim),
    .map-fills .map-as-focus {
      fill: ${focusFill} !important;
      fill-rule: nonzero !important;
      ${focusStroke}
    }
    .map-fills.map-dim > path,
    .map-fills .map-as-dim {
      fill: ${dimFill} !important;
      fill-rule: nonzero !important;
      stroke: none !important;
    }
  `;
  svg.insertBefore(style, svg.firstChild);
  const applyFocusPaint = (el) => {
    el.setAttribute("fill", focusFill);
    el.setAttribute("fill-rule", "nonzero");
    el.style.setProperty("fill", focusFill, "important");
    el.style.setProperty("fill-rule", "nonzero", "important");
    if (national) {
      el.style.setProperty("stroke", "none", "important");
    } else {
      el.style.setProperty("stroke", "#ffffff", "important");
      el.style.setProperty("stroke-width", "0.07", "important");
      el.style.setProperty("stroke-linejoin", "round", "important");
      el.style.setProperty("stroke-linecap", "round", "important");
      el.style.removeProperty("vector-effect");
    }
  };
  const nodes = svg.querySelectorAll(".map-fills.map-dim path, .map-fills .map-as-dim");
  for (const el of nodes) {
    if (el.closest(".map-borders, .map-borders-inner, .map-borders-coast, .map-fills-cover")) continue;
    const pref = el.getAttribute("data-pref");
    if (pref && focusPrefs.has(pref)) continue;
    el.setAttribute("fill", "#d0d5db");
    el.setAttribute("fill-rule", "nonzero");
    el.style.setProperty("fill", "#d0d5db", "important");
    el.style.setProperty("fill-rule", "nonzero", "important");
    el.style.setProperty("stroke", "none", "important");
  }
  const focus = svg.querySelectorAll(".map-fills.map-focus path, .map-fills .map-as-focus");
  for (const el of focus) {
    if (el.classList.contains("map-as-dim") || el.closest(".map-dim")) continue;
    if (el.closest(".map-borders, .map-borders-inner, .map-borders-coast, .map-fills-cover")) continue;
    applyFocusPaint(el);
  }
  for (const pref of focusPrefs) {
    svg.querySelectorAll(`.map-fills [data-pref="${pref}"]`).forEach((el) => {
      if (el.closest(".map-borders, .map-borders-inner, .map-borders-coast, .map-fills-cover")) return;
      el.classList.add("map-as-focus");
      el.classList.remove("map-as-dim");
      applyFocusPaint(el);
    });
  }
}

function dropOutOfFrameTris(svg, regionId) {
  const prefs = OUT_OF_FRAME_PREFS[canonicalRegion(regionId)];
  if (!svg || !prefs) return;
  for (const pref of prefs) {
    svg.querySelectorAll(`polygon[data-pref="${pref}"]`).forEach((el) => {
      const pts = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number);
      for (let i = 0; i < pts.length - 1; i += 2) {
        if (pts[i] < 0) {
          el.remove();
          return;
        }
      }
    });
  }
}

/** 県境だけを細い線で1本描く。古い二重線レイヤは削除する。 */
function prepareMapStrokes(svg, regionId = "national") {
  if (!svg) return;
  regionId = canonicalRegion(regionId);
  svg.querySelectorAll(":scope > .map-borders, :scope > .map-borders-coast, :scope > .map-fills-cover, :scope > .map-borders-inner, .map-land-tris")
    .forEach((el) => el.remove());
  const cached = borderHtmlByRegion.get(regionId);
  if (cached) {
    const wrap = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    wrap.innerHTML = cached;
    while (wrap.firstChild) svg.appendChild(wrap.firstChild);
    return;
  }
  addPrefectureBoundaries(svg, regionId);
  const inner = svg.querySelector(":scope > .map-borders-inner");
  if (inner) borderHtmlByRegion.set(regionId, inner.outerHTML);
}

function addPrefectureBoundaries(svg, screenRegion = "national") {
  screenRegion = canonicalRegion(screenRegion);
  const national = isNational(screenRegion);
  const items = [];
  for (const path of svg.querySelectorAll(".map-fills [data-pref]")) {
    if (path.getAttribute("display") === "none") continue;
    if (path.closest("[display='none']")) continue;
    const rings = pathRings(path.getAttribute("d") || "");
    if (!rings.length) continue;
    const dim = path.classList.contains("map-as-dim")
      || (!path.classList.contains("map-as-focus") && Boolean(path.closest(".map-dim")));
    items.push({
      kind: dim ? "dim" : "focus",
      rings,
      pref: path.getAttribute("data-pref"),
      region: path.closest("[data-region]")?.getAttribute("data-region") || ""
    });
  }
  if (!items.length) return;

  const innerFocus = svgEl("g", "map-borders-inner map-focus");
  // 隣県の頂点ずれに対する許容（高精度パス向け）。
  const maxDist = national ? 0.28 : 0.18;

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (items[i].kind !== "focus" || items[j].kind !== "focus") continue;
      // 全国は地方墁E��け。地方画面は対象県同士の県墁E��E
      if (national) {
        if (!items[i].region || items[i].region === items[j].region) continue;
      }
      const lines = sharedPolylines(items[i].rings, items[j].rings, maxDist);
      for (const line of lines) appendLine(innerFocus, line, national);
    }
  }

  if (!innerFocus.childElementCount) return;
  svg.appendChild(innerFocus);
}

function appendLine(parent, line, national = false) {
  if (line.length < 3) return;
  const first = line[0];
  const last = line[line.length - 1];
  const span = Math.hypot(last[0] - first[0], last[1] - first[1]);
  const minSpan = national ? 1.0 : 1.2;
  if (span < minSpan) return;
  if (line.length < 5 && span < (national ? 1.6 : 2.0)) return;
  const path = svgEl("path");
  path.setAttribute("d", `M${line.map((pt) => `${pt[0].toFixed(2)} ${pt[1].toFixed(2)}`).join("L")}`);
  parent.appendChild(path);
}

function svgEl(name, className) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  if (className) node.setAttribute("class", className);
  return node;
}

function pathRings(d) {
  const rings = [];
  for (const part of d.split(/(?=[MZ])/i)) {
    if (!part || /^[Zz]/.test(part)) continue;
    const nums = part.slice(1).trim().split(/[Ll\s,]+/).filter(Boolean).map(Number);
    const pts = [];
    for (let i = 0; i < nums.length - 1; i += 2) pts.push([nums[i], nums[i + 1]]);
    if (pts.length >= 2) rings.push(pts);
  }
  return rings;
}

function sharedPolylines(ringsA, ringsB, maxDist) {
  const lines = [];
  for (const ring of ringsA) {
    let run = [];
    const flush = () => {
      if (run.length >= 2) lines.push(run);
      run = [];
    };
    for (const [x, y] of ring) {
      const hit = nearestOnRings(x, y, ringsB);
      if (hit.dist <= maxDist) {
        run.push([(x + hit.x) / 2, (y + hit.y) / 2]);
      } else {
        flush();
      }
    }
    flush();
  }
  return lines;
}

function nearestOnRings(px, py, rings) {
  let dist = Infinity;
  let x = px;
  let y = py;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const q = closestOnSeg(px, py, a[0], a[1], b[0], b[1]);
      const d = Math.hypot(px - q[0], py - q[1]);
      if (d < dist) {
        dist = d;
        x = q[0];
        y = q[1];
      }
    }
  }
  return { dist, x, y };
}

function closestOnSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (!len2) return [ax, ay];
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return [ax + t * dx, ay + t * dy];
}


export function projectCity(city, projection, regionId = "national") {
  // 共通 japan.svg 座標系（全国 mainland / 沖縄inset）でピンを置く
  const extent = city.useOkinawaInset ? projection.okinawaInset : projection.mainland;
  const box = city.useOkinawaInset
    ? projection.okinawaInset.box
    : {
        x: projection.mainland.pad,
        y: projection.mainland.pad,
        w: projection.viewBox.width - projection.mainland.pad * 2,
        h: projection.viewBox.height - projection.mainland.pad * 2
      };
  const [x, y] = projectPoint(city.longitude, city.latitude, extent, box, projection.cosLat);
  return {
    pinX: (x / projection.viewBox.width) * 100,
    pinY: (y / projection.viewBox.height) * 100
  };
}

export function estimateCardSizePct(viewportOrRegion, regionId = "national") {
  if (viewportOrRegion && typeof viewportOrRegion === "object" && viewportOrRegion.width) {
    return cardSizePct(viewportOrRegion, regionId, "weather");
  }
  return isNational(canonicalRegion(viewportOrRegion) || regionId) ? { w: 22, h: 10 } : { w: 20, h: 11 };
}

/** 箱同士が被らない位置。ピンは観測地点のまま。 */
const CARD_SLOTS = {
  national: {
    sapporo: { x: 86, y: 14 },
    naha: { x: 13, y: 28 },
    niigata: { x: 64, y: 26 },
    sendai: { x: 88, y: 40 },
    hiroshima: { x: 13, y: 54 },
    nagoya: { x: 46, y: 50 },
    tokyo: { x: 88, y: 60 },
    fukuoka: { x: 8, y: 74 },
    osaka: { x: 40, y: 74 },
    kanazawa: { x: 34, y: 40 },
    kochi: { x: 30, y: 63 }
  },
  kinki: {
    kyoto: { x: 22, y: 38 },
    otsu: { x: 72, y: 18 },
    kobe: { x: 16, y: 50 },
    osaka: { x: 18, y: 66 },
    nara: { x: 78, y: 56 },
    wakayama: { x: 18, y: 82 },
    tsu: { x: 84, y: 78 }
  },
  kanto: {
    utsunomiya: { x: 84, y: 14 },
    maebashi: { x: 16, y: 46 },
    mito: { x: 84, y: 34 },
    saitama: { x: 16, y: 62 },
    tokyo: { x: 84, y: 52 },
    yokohama: { x: 40, y: 86 },
    chiba: { x: 84, y: 72 }
  },
  chubu: {
    niigata: { x: 82, y: 14 },
    sado: { x: 62, y: 10 },
    nagano: { x: 78, y: 28 },
    kofu: { x: 88, y: 46 },
    toyama: { x: 78, y: 38 },
    kanazawa: { x: 18, y: 36 },
    fukui: { x: 16, y: 50 },
    takayama: { x: 72, y: 52 },
    gifu: { x: 18, y: 64 },
    nagoya: { x: 78, y: 66 },
    shizuoka: { x: 82, y: 80 },
    tsu: { x: 48, y: 84 }
  },
  kyushu: {
    fukuoka: { x: 64, y: 16 },
    saga: { x: 16, y: 34 },
    oita: { x: 84, y: 28 },
    nagasaki: { x: 16, y: 52 },
    kumamoto: { x: 84, y: 48 },
    kagoshima: { x: 16, y: 72 },
    miyazaki: { x: 84, y: 70 }
  },
  tohoku: {
    aomori: { x: 70, y: 12 },
    akita: { x: 18, y: 28 },
    miyakoIwate: { x: 84, y: 28 },
    morioka: { x: 78, y: 42 },
    yamagata: { x: 18, y: 50 },
    sendai: { x: 80, y: 56 },
    aizuwakamatsu: { x: 18, y: 66 },
    fukushima: { x: 24, y: 80 },
    iwaki: { x: 78, y: 78 }
  },
  shikoku: {
    matsuyama: { x: 16, y: 42 },
    takamatsu: { x: 78, y: 18 },
    tokushima: { x: 84, y: 58 },
    kochi: { x: 48, y: 82 }
  },
  hokkaido: {
    wakkanai: { x: 28, y: 10 },
    abashiri: { x: 80, y: 12 },
    kitami: { x: 58, y: 18 },
    asahikawa: { x: 46, y: 28 },
    nemuro: { x: 88, y: 30 },
    otaru: { x: 12, y: 44 },
    sapporo: { x: 30, y: 54 },
    obihiro: { x: 62, y: 44 },
    kushiro: { x: 82, y: 46 },
    muroran: { x: 38, y: 66 },
    hakodate: { x: 16, y: 82 }
  },
  chugoku: {
    matsue: { x: 48, y: 24 },
    tottori: { x: 78, y: 16 },
    okayama: { x: 84, y: 56 },
    hiroshima: { x: 36, y: 78 },
    yamaguchi: { x: 16, y: 78 }
  },
  okinawa: {
    nago: { x: 80, y: 22 },
    naha: { x: 80, y: 48 },
    miyako: { x: 40, y: 28 },
    ishigaki: { x: 16, y: 52 }
  }
};

const CARD_SLOTS_POP = {
  national: {
    sapporo: { x: 86, y: 13 },
    naha: { x: 13, y: 28 },
    niigata: { x: 66, y: 26 },
    sendai: { x: 88, y: 40 },
    hiroshima: { x: 12, y: 52 },
    nagoya: { x: 46, y: 50 },
    tokyo: { x: 88, y: 60 },
    fukuoka: { x: 8, y: 74 },
    osaka: { x: 38, y: 76 },
    kanazawa: { x: 34, y: 40 },
    kochi: { x: 28, y: 63 }
  },
  kanto: {
    utsunomiya: { x: 80, y: 16 },
    maebashi: { x: 18, y: 52 },
    mito: { x: 80, y: 36 },
    saitama: { x: 18, y: 66 },
    tokyo: { x: 80, y: 54 },
    yokohama: { x: 46, y: 86 },
    chiba: { x: 80, y: 72 }
  },
  tohoku: {
    aomori: { x: 70, y: 12 },
    akita: { x: 18, y: 28 },
    miyakoIwate: { x: 84, y: 28 },
    morioka: { x: 78, y: 42 },
    yamagata: { x: 18, y: 50 },
    sendai: { x: 80, y: 56 },
    aizuwakamatsu: { x: 18, y: 66 },
    fukushima: { x: 24, y: 80 },
    iwaki: { x: 78, y: 78 }
  },
  hokkaido: {
    wakkanai: { x: 28, y: 10 },
    abashiri: { x: 80, y: 12 },
    kitami: { x: 58, y: 18 },
    asahikawa: { x: 46, y: 28 },
    nemuro: { x: 88, y: 30 },
    otaru: { x: 12, y: 44 },
    sapporo: { x: 30, y: 54 },
    obihiro: { x: 62, y: 44 },
    kushiro: { x: 82, y: 46 },
    muroran: { x: 38, y: 66 },
    hakodate: { x: 16, y: 82 }
  },
  chubu: {
    niigata: { x: 82, y: 14 },
    sado: { x: 62, y: 10 },
    nagano: { x: 78, y: 28 },
    kofu: { x: 88, y: 46 },
    toyama: { x: 78, y: 38 },
    kanazawa: { x: 18, y: 36 },
    fukui: { x: 16, y: 50 },
    takayama: { x: 72, y: 52 },
    gifu: { x: 18, y: 64 },
    nagoya: { x: 78, y: 66 },
    shizuoka: { x: 82, y: 80 },
    tsu: { x: 48, y: 84 }
  },
  kinki: {
    otsu: { x: 78, y: 16 },
    kyoto: { x: 18, y: 28 },
    kobe: { x: 14, y: 46 },
    osaka: { x: 16, y: 64 },
    nara: { x: 82, y: 52 },
    wakayama: { x: 18, y: 84 },
    tsu: { x: 84, y: 78 }
  },
  chugoku: {
    tottori: { x: 82, y: 14 },
    matsue: { x: 48, y: 16 },
    okayama: { x: 84, y: 48 },
    hiroshima: { x: 36, y: 72 },
    yamaguchi: { x: 14, y: 72 }
  },
  shikoku: {
    takamatsu: { x: 80, y: 16 },
    matsuyama: { x: 14, y: 40 },
    tokushima: { x: 84, y: 54 },
    kochi: { x: 48, y: 82 }
  },
  kyushu: {
    fukuoka: { x: 66, y: 14 },
    saga: { x: 14, y: 32 },
    oita: { x: 84, y: 26 },
    nagasaki: { x: 14, y: 50 },
    kumamoto: { x: 84, y: 48 },
    miyazaki: { x: 84, y: 70 },
    kagoshima: { x: 16, y: 74 }
  }
};

/**
 * 箱は観測地点�E�緯度経度のピン�E��E上へ置く。重なるときだけ少しずらす、E
 */
export function placeCardsAroundMap(items, cardSize, regionId = "national", variant = "weather") {
  regionId = canonicalRegion(regionId);
  const n = items.length;
  if (!n) return [];

  const cardW = Math.max(11, cardSize.w);
  const cardH = Math.max(4.8, cardSize.h);
  const halfW = cardW / 2 + 0.8;
  const halfH = cardH / 2 + 0.6;
  const topSafe = PRESET_CARD_SCREENS.has(regionId) ? halfH + 1.5 : halfH + 16;
  const footerClear = isNational(regionId) ? 16 : 16;
  const bottomSafe = 100 - halfH - footerClear;
  const leftSafe = 0;
  const rightSafe = 100;
  const slots = variant === "pop" && CARD_SLOTS_POP[regionId] ? CARD_SLOTS_POP : CARD_SLOTS;

  const placed = items.map((item) => {
    const pin = coreToStage(item.pinX, item.pinY);
    const nudge = stationNudge(item, regionId, halfW, halfH);
    const preset = slots[regionId]?.[item.cityId] || CARD_SLOTS[regionId]?.[item.cityId];
    const slot = preset
      ? {
          x: clamp(preset.x, leftSafe, rightSafe),
          y: clamp(preset.y, topSafe, bottomSafe)
        }
      : fitBesidePin(pin, nudge, halfW, topSafe, bottomSafe);
    const offMap = pin.x < -4 || pin.x > 104 || pin.y < -4 || pin.y > 104;
    return {
      ...item,
      hidePin: Boolean(item.hidePin || offMap),
      stagePinX: pin.x,
      stagePinY: pin.y,
      leaderX1: pin.x,
      leaderY1: pin.y,
      x: slot.x,
      y: slot.y
    };
  });

  if (variant === "pop" || !PRESET_CARD_SCREENS.has(regionId)) {
    const overlapW = regionId === "kinki" ? Math.max(cardW, 27) : cardW;
    const overlapH = regionId === "kinki" ? Math.max(cardH, 11) : cardH;
    resolveOverlaps(placed, overlapW, overlapH, {
      left: leftSafe,
      right: rightSafe,
      top: topSafe,
      bottom: bottomSafe
    });
  }

  for (const item of placed) {
    item.leaderPath = [];
    item.x2 = item.x;
    item.y2 = item.y;
  }
  // 全国のみ近接ピンを間引く。地方は地名カード上の赤い点をすべて出す
  if (isNational(regionId)) collapseClosePins(placed);
  return placed;
}

function collapseClosePins(placed) {
  const sorted = [...placed].sort((a, b) => a.priority - b.priority);
  const kept = [];
  for (const item of sorted) {
    if (item.hidePin) continue;
    const near = kept.find((other) => Math.hypot(other.stagePinX - item.stagePinX, other.stagePinY - item.stagePinY) < 3.4);
    if (near) item.hidePin = true;
    else kept.push(item);
  }
}

function stationNudge(item, regionId, halfW, halfH) {
  regionId = canonicalRegion(regionId);
  const ox = isNational(regionId) ? item.labelOffsetX : item.regionOffsetX;
  const oy = isNational(regionId) ? item.labelOffsetY : item.regionOffsetY;
  if (isNational(regionId)) {
    return { x: ox || halfW + 2, y: oy || 0 };
  }
  const pad = 2.1;
  if (Math.hypot(ox || 0, oy || 0) < 0.2) {
    return { x: halfW + pad, y: 0 };
  }
  const len = Math.hypot(ox, oy);
  const nx = ox / len;
  const ny = oy / len;
  const clearX = Math.abs(nx) > 0.01 ? (halfW + pad) / Math.abs(nx) : Infinity;
  const clearY = Math.abs(ny) > 0.01 ? (halfH + pad) / Math.abs(ny) : Infinity;
  const dist = Math.min(clearX, clearY);
  return { x: nx * dist, y: ny * dist };
}

function restorePreferredSide(placed, regionId, halfW, halfH, topSafe, bottomSafe) {
  regionId = canonicalRegion(regionId);
  for (const item of placed) {
    const ox = isNational(regionId) ? item.labelOffsetX : item.regionOffsetX;
    const oy = isNational(regionId) ? item.labelOffsetY : item.regionOffsetY;
    if (Math.abs(oy || 0) <= Math.abs(ox || 0) * 1.8 || Math.abs(oy || 0) < 4) continue;
    const pad = 2;
    item.x = item.stagePinX + Math.sign(ox || 0) * Math.min(2.2, Math.abs(ox || 0));
    item.y = item.stagePinY + Math.sign(oy) * (halfH + pad);
    item.x = clamp(item.x, halfW, 100 - halfW);
    item.y = clamp(item.y, topSafe, bottomSafe);
  }
}

function fitBesidePin(pin, nudge, halfW, topSafe, bottomSafe) {
  let x = pin.x + nudge.x;
  let y = pin.y + nudge.y;
  if (x > 100 - halfW - 0.4) x = pin.x - Math.abs(nudge.x);
  if (x < halfW + 0.4) x = pin.x + Math.abs(nudge.x);
  return {
    x: clamp(x, halfW, 100 - halfW),
    y: clamp(y, topSafe, bottomSafe)
  };
}

function keepPinVisible(placed, halfW, halfH) {
  const pad = 2;
  for (const item of placed) {
    const dx = item.x - item.stagePinX;
    const dy = item.y - item.stagePinY;
    if (Math.abs(dx) >= halfW + pad || Math.abs(dy) >= halfH + pad) continue;
    if (Math.abs(dx) >= Math.abs(dy)) {
      item.x = item.stagePinX + (dx === 0 ? 1 : Math.sign(dx)) * (halfW + pad);
    } else {
      item.y = item.stagePinY + Math.sign(dy) * (halfH + pad);
    }
  }
}

function keepNearStation(placed, maxDist, halfW, topSafe, bottomSafe) {
  for (const item of placed) {
    const dx = item.x - item.stagePinX;
    const dy = item.y - item.stagePinY;
    const dist = Math.hypot(dx, dy);
    if (dist > maxDist) {
      item.x = item.stagePinX + (dx / dist) * maxDist;
      item.y = item.stagePinY + (dy / dist) * maxDist;
    }
    item.x = clamp(item.x, halfW, 100 - halfW);
    item.y = clamp(item.y, topSafe, bottomSafe);
  }
}

function resolveOverlaps(placed, cardW, cardH, bounds = {}) {
  const minDx = cardW + 1.4;
  const minDy = cardH + 1.3;
  const halfW = cardW / 2 + 1;
  const halfH = cardH / 2 + 1;
  const left = bounds.left ?? halfW;
  const right = bounds.right ?? (100 - halfW);
  const topSafe = bounds.top ?? (halfH + 11);
  const bottomSafe = bounds.bottom ?? (100 - halfH - 8);
  for (let pass = 0; pass < 40; pass += 1) {
    let moved = false;
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const dx = placed[j].x - placed[i].x;
        const dy = placed[j].y - placed[i].y;
        if (Math.abs(dx) >= minDx || Math.abs(dy) >= minDy) continue;
        const overlapX = minDx - Math.abs(dx);
        const overlapY = minDy - Math.abs(dy);
        if (overlapX <= overlapY) {
          const dir = dx === 0 ? 1 : Math.sign(dx);
          const push = overlapX / 2 + 0.2;
          placed[i].x -= dir * push;
          placed[j].x += dir * push;
        } else {
          const dir = dy === 0 ? 1 : Math.sign(dy);
          const push = overlapY / 2 + 0.2;
          placed[i].y -= dir * push;
          placed[j].y += dir * push;
        }
        moved = true;
      }
      placed[i].x = clamp(placed[i].x, left, right);
      placed[i].y = clamp(placed[i].y, topSafe, bottomSafe);
    }
    if (!moved) break;
  }
}

function coreToStage(pinX, pinY) {
  return {
    x: MAP_CORE.left + (pinX / 100) * (MAP_CORE.right - MAP_CORE.left),
    y: MAP_CORE.top + (pinY / 100) * (MAP_CORE.bottom - MAP_CORE.top)
  };
}

function projectPoint(lon, lat, extent, box, cosLatDeg) {
  const rotateDeg = Number(extent.rotateDeg) || 0;
  if (rotateDeg) return projectPointRotated(lon, lat, extent, box, rotateDeg);
  const cos = Math.cos((cosLatDeg * Math.PI) / 180);
  const x0 = extent.lonMin * cos;
  const x1 = extent.lonMax * cos;
  const x = box.x + ((lon * cos - x0) / (x1 - x0)) * box.w;
  const y = box.y + ((extent.latMax - lat) / (extent.latMax - extent.latMin)) * box.h;
  return [x, y];
}

function projectPointRotated(lon, lat, extent, box, rotateDeg) {
  const lon0 = (extent.lonMin + extent.lonMax) / 2;
  const lat0 = (extent.latMin + extent.latMax) / 2;
  const cosLat = Math.cos((lat0 * Math.PI) / 180);
  const rad = (rotateDeg * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);
  const toLocal = (ln, lt) => {
    const x = (ln - lon0) * cosLat;
    const y = lt - lat0;
    return [x * cosR - y * sinR, x * sinR + y * cosR];
  };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i <= 8; i += 1) {
    const ln = extent.lonMin + (extent.lonMax - extent.lonMin) * (i / 8);
    for (let j = 0; j <= 8; j += 1) {
      const lt = extent.latMin + (extent.latMax - extent.latMin) * (j / 8);
      const [x, y] = toLocal(ln, lt);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const [x, y] = toLocal(lon, lat);
  return [
    box.x + ((x - minX) / (maxX - minX)) * box.w,
    box.y + ((maxY - y) / (maxY - minY)) * box.h
  ];
}

export function dodgePositions(items, minDx, minDy) {
  const placed = items.map((item) => ({ ...item }));
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      const dx = placed[i].x - placed[j].x;
      const dy = placed[i].y - placed[j].y;
      if (Math.abs(dx) >= minDx || Math.abs(dy) >= minDy) continue;
      const pushY = minDy - Math.abs(dy) + 1;
      placed[i].y += placed[i].y >= placed[j].y ? pushY : -pushY;
      placed[i].y = clamp(placed[i].y, 8, 92);
      if (Math.abs(placed[i].x - placed[j].x) < minDx && Math.abs(placed[i].y - placed[j].y) < minDy) {
        placed[i].x += placed[i].x >= placed[j].x ? minDx : -minDx;
        placed[i].x = clamp(placed[i].x, 8, 92);
      }
    }
  }
  return placed;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
