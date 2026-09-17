/**
 * 国土地理院「地球地図日本」から生成した SVG をインライン描画し、
 * 緯度経度を同じ投影で地図上の位置へ変換する。
 */

import { canonicalRegion, isNational } from "./catalog.js?v=pref387";
import { cardSizePct } from "./viewport.js?v=pref387";
import { MAP_VERSION } from "./version.js?v=pref513";

import { jmaIconFile } from "./jma-icons.js?v=pref387";

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
    const mapv = new URLSearchParams(window.location.search).get("mapv") || MAP_VERSION;
    mapSvgTextPromise = fetch(`maps/${file}?v=${mapv}`)
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
    <div class="map-fit">
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
  hideInlandLakes(mapSvg);
  applyScreenFocus(mapSvg, regionId);
  prepareCommonMapLayers(mapSvg, regionId);
  dropOutOfFrameTris(mapSvg, regionId);
  paintNeighborLand(mapSvg, regionId);
  prepareMapStrokes(mapSvg, regionId);
  raiseBiwaLayer(mapSvg);
  fitRegionalView(mapSvg, stage.querySelector(".map-pins"), regionId);
  raiseBiwaLayer(mapSvg);
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

/** 表示枠に含める隣接地方（グレーの周辺陸地）。 */
const REGION_FRAME_NEIGHBORS = {
  hokkaido: ["tohoku"],
  tohoku: ["hokkaido", "kanto", "chubu"],
  kanto: ["tohoku", "chubu"],
  chubu: ["tohoku", "kanto", "kinki", "chugoku", "shikoku", "kyushu"],
  kinki: ["chubu", "chugoku", "shikoku"],
  chugoku: ["kinki", "shikoku", "kyushu"],
  shikoku: ["kinki", "chugoku", "kyushu"],
  kyushu: ["chugoku", "shikoku"],
  okinawa: []
};

const PRESET_CARD_SCREENS = new Set([
  "national", "hokkaido", "tohoku", "kanto", "chubu",
  "kinki", "chugoku", "shikoku", "kyushu", "okinawa"
]);

function focusPrefsFor(regionId) {
  return SCREEN_FOCUS_PREFS[canonicalRegion(regionId)] || [];
}

/** フォーカス県＋隣接県の pref 群（viewBox 用）。 */
function framePrefsFor(regionId) {
  regionId = canonicalRegion(regionId);
  const prefs = new Set(focusPrefsFor(regionId));
  for (const neighbor of REGION_FRAME_NEIGHBORS[regionId] || []) {
    for (const pref of focusPrefsFor(neighbor)) prefs.add(pref);
  }
  return prefs;
}

/** 琵琶湖以外の内陸の穴・湖は陸地色。琵琶湖だけ穴として残す。 */
function hideInlandLakes(svg) {
  if (!svg) return;
  svg.querySelectorAll(".map-land-patches").forEach((el) => el.remove());
  const lakePath = svg.querySelector(".map-biwa path, .map-lakes path");
  const lakeParts = (lakePath?.getAttribute("d") || "").match(/[Mm][^MmZz]*[Zz]/g) || [];
  const biwaD = lakeParts.reduce((best, part) => (part.length > best.length ? part : best), lakeParts[0] || "");
  svg.querySelectorAll(".map-fills path[data-pref]").forEach((el) => {
    const d = el.getAttribute("d") || "";
    const parts = d.match(/[Mm][^MmZz]*[Zz]/g);
    const outer = parts?.length
      ? parts.reduce((best, part) => (part.length > best.length ? part : best), parts[0])
      : d;
    if (el.getAttribute("data-pref") === "25" && biwaD) {
      el.setAttribute("d", `${outer}${biwaD}`);
      el.setAttribute("fill-rule", "evenodd");
      el.style.setProperty("fill-rule", "evenodd", "important");
      return;
    }
    if (parts && parts.length >= 2) el.setAttribute("d", outer);
  });
  svg.querySelectorAll(".map-lakes").forEach((el) => el.remove());
}

function raiseBiwaLayer(svg) {
  if (!svg) return;
  const src = svg.querySelector(".map-biwa path, .map-lakes path");
  const d = src?.getAttribute("d") || "";
  svg.querySelectorAll(".map-biwa, .map-lakes").forEach((el) => el.remove());
  if (!d) return;
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("class", "map-biwa");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "#c8ebff");
  path.setAttribute("stroke", "none");
  path.style.setProperty("fill", "#c8ebff", "important");
  g.appendChild(path);
  svg.appendChild(g);
}

/** 共通地図を地方表示向けに整える（沖縄枠の扱い・遠方県の抑制）。 */
function prepareCommonMapLayers(svg, regionId) {
  if (!svg) return;
  regionId = canonicalRegion(regionId);
  if (isNational(regionId)) {
    svg.querySelectorAll(".map-okinawa-inset > rect").forEach((el) => el.setAttribute("display", "none"));
    return;
  }
  if (regionId === "okinawa") {
    svg.querySelectorAll(":scope > .map-fills, :scope > .map-borders, :scope > .map-fills-cover, :scope > .map-lakes")
      .forEach((el) => el.setAttribute("display", "none"));
    // 地方沖縄は全国図用の白いインセット枠は不要
    svg.querySelectorAll(".map-okinawa-inset > rect").forEach((el) => el.setAttribute("display", "none"));
    return;
  }
  const inset = svg.querySelector(".map-okinawa-inset");
  if (inset) inset.setAttribute("display", "none");
  const keep = framePrefsFor(regionId);
  svg.querySelectorAll("[data-pref]").forEach((el) => {
    const id = el.getAttribute("data-pref");
    if (id && !keep.has(id)) el.setAttribute("display", "none");
    else el.removeAttribute("display");
  });
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

/** 枠内の県だけが見えるよう、土地の範囲へ viewBox を合わせる。 */
function fitRegionalView(svg, pinsSvg, regionId) {
  if (!svg) return;
  regionId = canonicalRegion(regionId);
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

  const addBox = (el) => {
    const bounds = elementBoxInSvg(el);
    if (!bounds) return;
    if (!pathInFitCore(regionId, bounds)) return;
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  };

  if (isNational(regionId)) {
    svg.querySelectorAll(".map-fills path[data-pref], .map-okinawa-inset path").forEach(addBox);
  } else if (regionId === "okinawa") {
    // 島の path だけを、inset の transform 後座標で枠に入れる�E�枠 rect は含めなぁE��E
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
    } else if (inset) {
      addBox(inset);
    }
  } else {
    const keep = new Set(focusPrefsFor(regionId));
    // 中部は西の隣接（中国・四国・九州北部）も枠に入れ、灰色の陸地が見えるようにする
    if (regionId === "chubu") {
      for (const id of [...SCREEN_FOCUS_PREFS.chugoku, ...SCREEN_FOCUS_PREFS.shikoku, "40", "41", "43"]) {
        keep.add(id);
      }
    }
    svg.querySelectorAll(".map-fills [data-pref]").forEach((el) => {
      if (el.closest(".map-fills-cover")) return;
      const pref = el.getAttribute("data-pref");
      if (!pref || !keep.has(pref)) return;
      addBox(el);
    });
  }

  if (!Number.isFinite(minX) || maxX - minX < 4 || maxY - minY < 4) {
    // 沖縄inset の transform 後おおよその枠（全国ドックと同系統）。
    const fallback = isNational(regionId)
      ? "-2 -1.5 104.5 103"
      : regionId === "okinawa"
        ? OKINAWA_DOCK_VIEWBOX
        : "0 0 100 100";
    svg.setAttribute("viewBox", fallback);
    if (pinsSvg) pinsSvg.setAttribute("viewBox", fallback);
    viewBoxByRegion.set(regionId, fallback);
    return;
  }
  const pad = isNational(regionId)
    ? 1.8
    : regionId === "okinawa"
      ? 1.2
      : regionId === "kyushu"
        ? 1.1
        : regionId === "chubu"
          ? 2.4
          : regionId === "tohoku"
          ? 3.2
          : 1.5;
  // 中部は枠を西・南へ広げ、中国・四国・九州の灰色陸地を見せる（本州全体には広げない）
  const padL = regionId === "chubu" ? 16 : pad;
  const padB = regionId === "chubu" ? 8 : pad;
  const view = `${minX - padL} ${minY - pad} ${maxX - minX + pad + padL} ${maxY - minY + pad + padB}`;
  svg.setAttribute("viewBox", view);
  if (pinsSvg) pinsSvg.setAttribute("viewBox", view);
  viewBoxByRegion.set(regionId, view);
}

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
  if (national) {
    // 全国は CSS の地方色を使う。灰色で上書きしない。
    svg.querySelectorAll("[data-pref]").forEach((el) => {
      el.classList.remove("map-as-dim", "map-as-focus");
      el.removeAttribute("fill");
      el.style.removeProperty("fill");
      el.style.removeProperty("stroke");
      el.style.removeProperty("stroke-width");
    });
    return;
  }
  const focusPrefs = new Set(focusPrefsFor(regionId));
  const focusFill = "#76c85a";
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
    .map-fills.map-focus > path[data-pref="25"],
    .map-fills .map-as-focus[data-pref="25"] {
      fill-rule: evenodd !important;
    }
    .map-fills.map-dim > path,
    .map-fills .map-as-dim {
      fill: #b4b8bf !important;
      fill-rule: nonzero !important;
      stroke: #9aa0a8 !important;
      stroke-width: 0.08 !important;
    }
  `;
  svg.insertBefore(style, svg.firstChild);
  const applyFocusPaint = (el) => {
    el.setAttribute("fill", focusFill);
    const holeRule = el.getAttribute("data-pref") === "25" ? "evenodd" : "nonzero";
    el.setAttribute("fill-rule", holeRule);
    el.style.setProperty("fill", focusFill, "important");
    el.style.setProperty("fill-rule", holeRule, "important");
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
  const nodes = svg.querySelectorAll(".map-fills [data-pref]");
  for (const el of nodes) {
    if (el.closest(".map-borders, .map-borders-inner, .map-borders-coast, .map-fills-cover")) continue;
    const pref = el.getAttribute("data-pref");
    if (!pref || focusPrefs.has(pref)) continue;
    el.classList.add("map-as-dim");
    el.classList.remove("map-as-focus");
    el.setAttribute("fill", "#b4b8bf");
    el.setAttribute("fill-rule", "nonzero");
    el.style.setProperty("fill", "#b4b8bf", "important");
    el.style.setProperty("fill-rule", "nonzero", "important");
    el.style.setProperty("stroke", "#9aa0a8", "important");
    el.style.setProperty("stroke-width", "0.08", "important");
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
    sapporo: { x: 95.0564, y: 11.4879 },
    sendai: { x: 81.3, y: 33.7 },
    niigata: { x: 46.4509, y: 31.1949 },
    kanazawa: { x: 29.2319, y: 38.3736 },
    tokyo: { x: 73.1388, y: 57.01 },
    nagoya: { x: 55.3398, y: 74.4348 },
    osaka: { x: 38.5, y: 74.3957 },
    hiroshima: { x: 11.0776, y: 44.2893 },
    fukuoka: { x: 0.3, y: 69.8 },
    kochi: { x: 22.1, y: 74.3957 },
    naha: { x: -25.3784, y: 36.5659 }
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
    utsunomiya: { x: 84, y: 12 },
    maebashi: { x: 13, y: 26 },
    mito: { x: 84, y: 33 },
    saitama: { x: 13, y: 50 },
    tokyo: { x: 84, y: 54 },
    yokohama: { x: 42, y: 84 },
    chiba: { x: 84, y: 74 }
  },
  chubu: {
    sado: { x: 50, y: 10 },
    kanazawa: { x: 16, y: 26 },
    fukui: { x: 16, y: 48 },
    gifu: { x: 16, y: 70 },
    niigata: { x: 84, y: 16 },
    nagano: { x: 84, y: 36 },
    kofu: { x: 84, y: 56 },
    shizuoka: { x: 84, y: 76 },
    toyama: { x: 64, y: 32 },
    takayama: { x: 64, y: 52 },
    nagoya: { x: 66, y: 72 },
    tsu: { x: 40, y: 78 }
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
    fukushima: { x: 24, y: 74.3957 },
    iwaki: { x: 78, y: 74.3957 }
  },
  shikoku: {
    matsuyama: { x: 16, y: 42 },
    takamatsu: { x: 78, y: 18 },
    tokushima: { x: 84, y: 58 },
    kochi: { x: 48, y: 82 }
  },
  hokkaido: {
    wakkanai: { x: 53.3623, y: 11.2331 },
    kitami: { x: 66.0435, y: 28.1772 },
    asahikawa: { x: 54.9855, y: 33.926 },
    abashiri: { x: 74.855, y: 33.6425 },
    otaru: { x: 25.0435, y: 43.6135 },
    sapporo: { x: 42.3752, y: 39.0563 },
    muroran: { x: 43.8696, y: 64.5829 },
    hakodate: { x: 20.4203, y: 74.2669 },
    obihiro: { x: 55.7681, y: 71.3108 },
    kushiro: { x: 68.4492, y: 73.182 },
    nemuro: { x: 79.9565, y: 69.1626 }
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

/** 降水も天気と同じ親スロット（地域地図の子）。 */
const CARD_SLOTS_POP = CARD_SLOTS;

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
    const regionSlot = slots[regionId]?.[item.cityId] || CARD_SLOTS[regionId]?.[item.cityId];
    const citySlot = Number.isFinite(Number(item.cardX)) && Number.isFinite(Number(item.cardY))
      ? { x: Number(item.cardX), y: Number(item.cardY) }
      : null;
    const preset = regionSlot || citySlot;
    const slot = preset
      ? { x: Number(preset.x), y: Number(preset.y) }
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

export function evenRowGaps(placed, cardW, cardH, bounds = {}) {
  const minGap = cardW + 1.8;
  const yTol = Math.max(cardH * 0.4, 6);
  const left = bounds.left ?? 0;
  const right = bounds.right ?? 100;
  const used = new Set();
  const sorted = [...placed].sort((a, b) => a.x - b.x);
  for (const seed of sorted) {
    if (used.has(seed.cityId)) continue;
    const row = sorted.filter((item) => !used.has(item.cityId) && Math.abs(item.y - seed.y) <= yTol);
    if (row.length < 2) continue;
    const span = row[row.length - 1].x - row[0].x;
    if (span > 58) continue;
    const midY = row.reduce((sum, item) => sum + item.y, 0) / row.length;
    const need = minGap * (row.length - 1);
    const midX = (row[0].x + row[row.length - 1].x) / 2;
    let start = midX - need / 2;
    start = clamp(start, left, right - need);
    row.forEach((item, index) => {
      item.x = clamp(start + index * minGap, left, right);
      item.y = midY;
      used.add(item.cityId);
    });
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
