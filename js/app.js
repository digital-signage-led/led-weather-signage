/**
 * Studio / signage bootstrap. Studio drives the iframe viewport.
 */

import { APP_VERSION, DATA_VERSION, MAP_VERSION } from "./version.js?v=pref430";
import { applyResolvedDisplay, bindDisplayStudio, readDraft } from "./display-studio.js?v=pref430";
import { loadDisplayBundle, resolveDisplayConfig } from "./display-config.js?v=pref428";
import {
  canonicalContent,
  canonicalRegion,
  contentTitle,
  getContent,
  getRegion,
  isNational,
  listRegions,
  loadCatalog
} from "./catalog.js?v=pref426";
import { capabilityForContent, groupedContents, isV1Content, locationScope } from "./content-registry.js?v=pref426";
import { getPrefecture, getStation, listPrefectures, loadLocationMasters, stationsForPref } from "./location-masters.js?v=pref426";
import { generatePublicUrls } from "./public-urls.js?v=pref426";
import { adaptWeather, aggregateRegion } from "./weather-data.js?v=pref388";
import { loadMapSvg, mountMap, placeCardsAroundMap, projectCity, computeFocusMapTransform, regionalFallbackTransform } from "./map-renderer.js?v=pref422";
import { MAP_LAYOUT_GEN } from "./map-layout.js?v=pref391";
import { formatStamp, renderCityCard, renderPin, pinRadiusForViewBox, pinRadiusForMatchingScreen, pickNoteWeather, weatherTone, renderNoteIcon, renderPrecipTodLegend } from "./weather-renderer.js?v=pref396";
import { applyCardScale, applyLockedCards, applyMapTransform, applyPrecipLegend, applyTitleScale, autoPlacePrecipLegend, bindCardEditor, bindMapControls, bindMapEditor, bindOkinawaEditor, bindPrecipLegendEditor, CARD_POS_MAX, CARD_POS_MIN, CARD_SCALE_MAX, CARD_SCALE_MIN, TITLE_SCALE_MAX, TITLE_SCALE_MIN, centerCityCards, containMapInStage, describeLayoutShare, describeMapShare, freezeCardLayout, initLayoutDefaults, isCustomLayout, isManualMapTransform, legendStatusLabel, listCardPositions, loadCardScale, loadLayout, loadMapLayout, loadStampScale, loadTitleScale, moveLockedCard, saveStampScale, nudgeCardsAwayFromLegend, resetCardScale, resetLayout, resetTitleScale, runLegendCommand, saveCardScale, saveLayout, saveMapLayout, saveTitleScale, shouldAutoPlaceLegend, snapshotLayoutDefaults } from "./studio-layout.js?v=pref428";
import { expandForecast, formatNoteHtml, noteFor } from "./forecast.js?v=pref391";
import { renderWeeklyTable } from "./table-renderer.js?v=pref417";
import {
  DEFAULT_STUDIO_VIEWPORT,
  FIXED_DESIGN,
  VIEWPORT_PRESETS,
  applyTableLayout,
  applyViewport,
  cardBoxPx,
  cardSizePct,
  cityLimit,
  fitFixedScreen,
  fitTitleBars,
  fitCityCardNames,
  partitionTablePages,
  readViewport,
  showAuxiliary
} from "./viewport.js?v=pref419";
import { msUntilIconPhaseChange } from "./jma-icons.js?v=pref388";
import { fetchJmaWeather } from "./jma-live.js?v=pref388";
import { buildWeekPoints, fetchWeekAlert, renderWeekPointsHtml } from "./week-points.js?v=pref388";

/** 府県天気予報の発表時刻（JST）。発表反映待ちで +5 分後に取りに行く。 */
const JMA_PUBLISH_HOURS_JST = [5, 11, 17];
const JMA_PUBLISH_LAG_MS = 5 * 60 * 1000;
const LIVE_FETCH_TIMEOUT_MS = 12000;
let liveWeatherCache = { at: 0, doc: null };
let bundledWeatherDoc = null;
let livePullInFlight = null;
let jmaRefreshTimer = 0;

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((value) => {
      window.clearTimeout(timer);
      resolve(value);
    }, (error) => {
      window.clearTimeout(timer);
      reject(error);
    });
  });
}

/** Asia/Tokyo の壁時計部品を返す */
function jstParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

/** JST の年月日時分秒 → UTC Date（発表スロット計算用） */
function dateFromJst(year, month, day, hour = 0, minute = 0, second = 0) {
  const utc = Date.UTC(year, month - 1, day, hour - 9, minute, second);
  return new Date(utc);
}

function nextJmaRefreshAt(now = new Date()) {
  const jst = jstParts(now);
  const candidates = [];
  for (const hour of JMA_PUBLISH_HOURS_JST) {
    candidates.push(dateFromJst(jst.year, jst.month, jst.day, hour, 0, 0).getTime() + JMA_PUBLISH_LAG_MS);
  }
  const tomorrow = dateFromJst(jst.year, jst.month, jst.day, 0, 0, 0);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const t = jstParts(tomorrow);
  candidates.push(dateFromJst(t.year, t.month, t.day, JMA_PUBLISH_HOURS_JST[0], 0, 0).getTime() + JMA_PUBLISH_LAG_MS);
  const nowMs = now.getTime();
  const upcoming = candidates.filter((ms) => ms > nowMs).sort((a, b) => a - b);
  return upcoming[0] ?? (nowMs + 60 * 60 * 1000);
}

function msUntilNextJmaRefresh(now = new Date()) {
  return Math.max(1000, nextJmaRefreshAt(now) - now.getTime());
}

/** 直近の発表スロット（+lag）より前の取得なら取り直し */
function needsJmaRefresh(now = new Date()) {
  if (!liveWeatherCache.doc) return true;
  const jst = jstParts(now);
  const slots = JMA_PUBLISH_HOURS_JST.map(
    (hour) => dateFromJst(jst.year, jst.month, jst.day, hour, 0, 0).getTime() + JMA_PUBLISH_LAG_MS
  );
  const nowMs = now.getTime();
  const due = slots.filter((ms) => ms <= nowMs).pop();
  if (due == null) return false;
  return liveWeatherCache.at < due;
}

export { APP_VERSION };

const VIEWPORT_STORE = "led-signage-viewport";
const SITE_STORE = "led-signage-site";

const params = new URLSearchParams(window.location.search);
const studioFlag = String(params.get("studio") || "").toLowerCase();
let studioHop = false;
try {
  studioHop = sessionStorage.getItem("led-force-studio") === "1";
  if (studioHop) sessionStorage.removeItem("led-force-studio");
} catch {
  studioHop = false;
}
const isStudio = window.__LED_FORCE_STUDIO__ === true
  || studioFlag === "1" || studioFlag === "true" || studioFlag === "yes"
  || /studio\.html$/i.test(window.location.pathname)
  || window.location.hash === "#studio"
  || studioHop;
if (isStudio) window.__LED_FORCE_STUDIO__ = true;
const isDebug = params.get("debug") === "1";
const canEdit = params.get("edit") === "1";

const state = {
  regionId: canonicalRegion(params.get("region")),
  contentId: canonicalContent(params.get("content")),
  prefId: params.get("pref") || "tokyo",
  stationId: params.get("station") || "44132",
  viewport: readViewport(FIXED_DESIGN.width, FIXED_DESIGN.height)
};

let lastError = "ok";

document.documentElement.classList.toggle("is-studio", isStudio);
document.documentElement.classList.toggle("is-kiosk", !isStudio);
document.documentElement.classList.toggle("is-edit", canEdit);
document.documentElement.classList.toggle("is-debug", isDebug);
document.body.classList.toggle("is-studio", isStudio);
document.body.classList.toggle("is-kiosk", !isStudio);
document.getElementById("studio-root").hidden = !isStudio;
document.getElementById("app").hidden = isStudio;

if (isStudio) {
  // スタジオ親ページは読込オーバーレイ不要（iframe 側が独自に is-boot する）
  document.documentElement.classList.remove("is-boot");
  bootStudio().catch((error) => {
    console.error(error);
    document.documentElement.classList.remove("is-boot");
  });
} else {
  bootSignage().catch((error) => {
    console.error(error);
    document.documentElement.classList.remove("is-boot");
  });
}

function productionUrl(regionId, contentId, extra = {}) {
  const next = new URL(window.location.href);
  let path = next.pathname === "/view" ? "/view" : next.pathname;
  if (/studio\.html$/i.test(path)) path = path.replace(/studio\.html$/i, "");
  if (path !== "/view" && !path.endsWith("/") && !/\.html$/i.test(path)) path += "/";
  next.pathname = path;
  next.search = "";
  const content = getContent(contentId) || { location_scope: "region" };
  const scope = content.location_scope || "region";
  next.searchParams.set("content", canonicalContent(contentId));
  if (scope === "region" || scope === "national" || !isV1Content(content)) {
    next.searchParams.set("region", canonicalRegion(regionId));
  } else if (regionId) {
    next.searchParams.set("region", canonicalRegion(regionId));
  }
  if (scope === "prefecture" && extra.pref) next.searchParams.set("pref", extra.pref);
  if (scope === "station") {
    if (extra.pref) next.searchParams.set("pref", extra.pref);
    if (extra.station) next.searchParams.set("station", extra.station);
  }
  if (extra.edit) next.searchParams.set("edit", "1");
  if (extra.debug) next.searchParams.set("debug", "1");
  if (extra.site) next.searchParams.set("site", extra.site);
  if (extra.vw) next.searchParams.set("vw", String(extra.vw));
  if (extra.vh) next.searchParams.set("vh", String(extra.vh));
  if (extra.preview === "draft") next.searchParams.set("preview", "draft");
  return next.pathname + next.search;
}

async function bootStudio() {
  try {
    await loadCatalog();
    await loadLocationMasters();
    await initLayoutDefaults();
    state.regionId = canonicalRegion(state.regionId);
    state.contentId = canonicalContent(state.contentId);
    state.prefId = getPrefecture(state.prefId).pref_id;
    state.stationId = getStation(state.stationId).station_id;

  const studioBar = document.getElementById("studio-bar");
  const regionSelect = document.getElementById("region-select");
  const contentSelect = document.getElementById("content-select");
  const prefSelect = document.getElementById("pref-select");
  const stationSelect = document.getElementById("station-select");
  const regionField = document.getElementById("region-field");
  const prefField = document.getElementById("pref-field");
  const stationField = document.getElementById("station-field");
  const widthInput = document.getElementById("viewport-width");
  const heightInput = document.getElementById("viewport-height");
  const presetHost = document.getElementById("viewport-presets");
  const previewStage = document.getElementById("preview-stage");
  const frame = document.getElementById("signage-frame");
  const metricsEl = document.getElementById("preview-metrics");
  let viewScale = 1;
  const syncLayoutShareUi = (saveFlash = "") => {
    if (!metricsEl) return;
    const mapInfo = describeMapShare(state.regionId, state.viewport.width, state.viewport.height);
    const flash = saveFlash ? `<div class="studio-layout-flash">${saveFlash}</div>` : "";
    metricsEl.innerHTML = `
      <div class="studio-layout-share" style="white-space:pre-line">${mapInfo.summary}</div>
      ${flash}
    `;
  };

  try {
    const saved = JSON.parse(sessionStorage.getItem(VIEWPORT_STORE) || "null");
    if (saved?.width && saved?.height) state.viewport = readViewport(saved.width, saved.height);
    else state.viewport = readViewport(DEFAULT_STUDIO_VIEWPORT.width, DEFAULT_STUDIO_VIEWPORT.height);
  } catch {
    state.viewport = readViewport(DEFAULT_STUDIO_VIEWPORT.width, DEFAULT_STUDIO_VIEWPORT.height);
  }
  const layout = loadLayout(state.regionId, state.contentId, state.viewport.width, state.viewport.height);
  const vpSize = () => ({
    w: state.viewport.width,
    h: state.viewport.height
  });
  const reloadLayoutForViewport = () => {
    const next = loadLayout(state.regionId, state.contentId, state.viewport.width, state.viewport.height);
    layout.map = next.map;
    layout.okinawa = next.okinawa;
    layout.cards = next.cards;
    layout.precipLegend = next.precipLegend;
    syncMapControls?.();
    syncLayoutShareUi();
  };

  regionSelect.innerHTML = listRegions()
    .map((item) => `<option value="${item.id}">${item.name}</option>`)
    .join("");
  contentSelect.innerHTML = groupedContents()
    .map((group) => `<optgroup label="${group.label}">${group.items.map((item) => `<option value="${item.id}">${item.name}</option>`).join("")}</optgroup>`)
    .join("");
  prefSelect.innerHTML = listPrefectures()
    .map((item) => `<option value="${item.pref_id}">${item.pref_name}</option>`)
    .join("");
  regionSelect.value = getRegion(state.regionId).id;
  contentSelect.value = getContent(state.contentId).id;
  prefSelect.value = state.prefId;
  state.regionId = regionSelect.value;
  state.contentId = contentSelect.value;
  widthInput.value = String(state.viewport.width);
  heightInput.value = String(state.viewport.height);
  presetHost.innerHTML = VIEWPORT_PRESETS.map((item) => (
    `<button type="button" data-w="${item.width}" data-h="${item.height}">${item.label}</button>`
  )).join("") + `<button type="button" data-live="1">このウィンドウ</button>`;

  const persistStudio = () => {
    const next = new URL(window.location.href);
    next.searchParams.delete("profile");
    next.searchParams.delete("resolution");
    next.searchParams.delete("inch");
    next.searchParams.set("studio", "1");
    next.searchParams.set("region", state.regionId);
    next.searchParams.set("content", state.contentId);
    if (locationScope(state.contentId) === "prefecture" || locationScope(state.contentId) === "station") {
      next.searchParams.set("pref", state.prefId);
    }
    if (locationScope(state.contentId) === "station") {
      next.searchParams.set("station", state.stationId);
    }
    if (isDebug) next.searchParams.set("debug", "1");
    window.history.replaceState({}, "", next);
  };

  const saveViewport = () => {
    state.viewport = readViewport(widthInput.value, heightInput.value);
    sessionStorage.setItem(VIEWPORT_STORE, JSON.stringify({
      width: state.viewport.width,
      height: state.viewport.height
    }));
  };

  const postToFrame = (payload) => {
    try {
      frame.contentWindow?.postMessage({ source: "led-studio", ...payload }, window.location.origin);
    } catch {
      /* ignore */
    }
  };

  const withFrameScreen = (fn) => {
    try {
      const win = frame.contentWindow;
      const doc = frame.contentDocument;
      const screenEl = doc?.getElementById("led-screen");
      if (!win || !doc || !screenEl) return false;
      fn(screenEl, doc, win);
      return true;
    } catch {
      return false;
    }
  };

  const fitFrame = () => {
    const vp = readViewport(widthInput.value, heightInput.value);
    state.viewport = vp;
    const stageW = previewStage.clientWidth || previewStage.offsetWidth || 0;
    const stageH = previewStage.clientHeight || previewStage.offsetHeight || 0;
    const availW = Math.max(120, stageW - 32);
    const availH = Math.max(120, stageH - 48);
    viewScale = Math.min(1, availW / vp.width, availH / vp.height);
    if (!Number.isFinite(viewScale) || viewScale <= 0) viewScale = 0.2;
    document.documentElement.style.setProperty("--viewport-width", `${vp.width}px`);
    document.documentElement.style.setProperty("--viewport-height", `${vp.height}px`);
    document.documentElement.style.setProperty("--slot-width", `${Math.round(vp.width * viewScale)}px`);
    document.documentElement.style.setProperty("--slot-height", `${Math.round(vp.height * viewScale)}px`);
    document.documentElement.style.setProperty("--view-scale", String(viewScale));
    // iframe 内ポインタは設計座標のため 1。親オーバーレイ計測時のみ viewScale を渡す想定。
    try {
      frame.contentDocument.documentElement.dataset.previewScale = "1";
    } catch {
      /* cross-origin / not ready */
    }
    frame.style.width = `${vp.width}px`;
    frame.style.height = `${vp.height}px`;
    frame.style.transform = viewScale < 0.999 ? `scale(${viewScale})` : "none";
    const region = getRegion(state.regionId);
    const content = getContent(state.contentId);
    metricsEl.textContent = `${contentTitle(region, content)} / ${vp.width}x${vp.height} / view ${viewScale.toFixed(2)} / ${productionUrl(state.regionId, state.contentId)}`;
  };

  const loadFrame = () => {
    if (getContent(state.contentId).kind !== "map") fillCardEditors([]);
    frame.src = productionUrl(state.regionId, state.contentId, {
      edit: true,
      debug: isDebug,
      site: params.get("site"),
      vw: state.viewport.width,
      vh: state.viewport.height,
      pref: state.prefId,
      station: state.stationId,
      preview: readDraft()?.content_id === state.contentId ? "draft" : ""
    });
    fitFrame();
  };

  studioBar.addEventListener("submit", (event) => event.preventDefault());
  const syncMapControls = bindMapControls(studioBar, layout, () => {
    const { w, h } = vpSize();
    // 親の layout.cards が空でも、保存済みカードを消さない
    const latest = loadLayout(state.regionId, state.contentId, w, h);
    if (!Object.keys(layout.cards || {}).length && Object.keys(latest.cards || {}).length) {
      layout.cards = { ...latest.cards };
    }
    if (!layout.precipLegend && latest.precipLegend) layout.precipLegend = { ...latest.precipLegend };
    saveLayout(state.regionId, layout, state.contentId, w, h);
    postToFrame({ type: "apply-map", map: layout.map, okinawa: layout.okinawa });
    syncLayoutShareUi(describeMapShare(state.regionId, w, h).saveMessage);
  });
  const cardScaleInput = document.getElementById("card-scale");
  const cardScaleOut = document.getElementById("card-scale-value");
  const cardSizePx = document.getElementById("card-size-px");
  const cardWidthInput = document.getElementById("card-width-px");
  const titleScaleInput = document.getElementById("title-scale");
  const titleScaleOut = document.getElementById("title-scale-value");
  const stampScaleInput = document.getElementById("stamp-scale");
  const stampScaleOut = document.getElementById("stamp-scale-value");
  // 地図4種は同じ外枠・同じ配置を使う（降水でも weather 枠）
  const cardVariant = () => (getContent(state.contentId).kind === "map" ? "weather" : (getContent(state.contentId).card === "pop" ? "pop" : "weather"));
  const applyManualCardScale = (scale) => {
    const next = Math.min(CARD_SCALE_MAX, Math.max(CARD_SCALE_MIN, Number(scale) || 1));
    const { w, h } = vpSize();
    saveCardScale(state.contentId, next, state.regionId, w, h);
    syncCardScaleUi(next);
    withFrameScreen((screenEl) => {
      applyCardScale(screenEl, next);
    });
    postToFrame({ type: "set-card-scale", scale: next });
  };
  const syncTitleScaleUi = (scale) => {
    const { w, h } = vpSize();
    const next = Number.isFinite(scale) ? scale : loadTitleScale(w, h, state.regionId, state.contentId);
    if (titleScaleInput && document.activeElement !== titleScaleInput) {
      titleScaleInput.value = String(next);
    }
    if (titleScaleOut) titleScaleOut.textContent = Number(next).toFixed(2);
  };
  const syncStampScaleUi = (scale) => {
    const { w, h } = vpSize();
    const next = Number.isFinite(scale) ? scale : loadStampScale(w, h, state.regionId, state.contentId);
    if (stampScaleInput && document.activeElement !== stampScaleInput) {
      stampScaleInput.value = String(next);
    }
    if (stampScaleOut) stampScaleOut.textContent = Number(next).toFixed(2);
  };
  const applyManualTitleScale = (scale) => {
    const next = Math.min(TITLE_SCALE_MAX, Math.max(TITLE_SCALE_MIN, Number(scale) || 1));
    const { w, h } = vpSize();
    saveTitleScale(next, w, h, state.regionId, state.contentId);
    syncTitleScaleUi(next);
    const stamp = loadStampScale(w, h, state.regionId, state.contentId);
    withFrameScreen((screenEl) => {
      applyTitleScale(screenEl, next, stamp);
      fitTitleBars(screenEl);
    });
    postToFrame({ type: "set-title-scale", scale: next, stampScale: stamp });
  };
  const applyManualStampScale = (scale) => {
    const next = Math.min(TITLE_SCALE_MAX, Math.max(TITLE_SCALE_MIN, Number(scale) || 1));
    const { w, h } = vpSize();
    saveStampScale(next, w, h, state.regionId, state.contentId);
    syncStampScaleUi(next);
    const title = loadTitleScale(w, h, state.regionId, state.contentId);
    withFrameScreen((screenEl) => {
      applyTitleScale(screenEl, title, next);
      fitTitleBars(screenEl);
    });
    postToFrame({ type: "set-title-scale", scale: title, stampScale: next });
  };
  const syncCardScaleUi = (scale) => {
    const next = Number.isFinite(scale)
      ? scale
      : loadCardScale(state.contentId, state.regionId, state.viewport.width, state.viewport.height);
    const box = cardBoxPx(state.viewport, cardVariant());
    const width = Math.round(box.w * next);
    const height = Math.round(box.h * next);
    if (cardScaleInput && document.activeElement !== cardScaleInput) {
      cardScaleInput.value = String(next);
    }
    if (cardScaleOut) cardScaleOut.textContent = Number(next).toFixed(2);
    if (cardSizePx) cardSizePx.textContent = `${width}x${height}`;
    if (cardWidthInput && document.activeElement !== cardWidthInput) {
      cardWidthInput.value = String(width);
    }
  };
  titleScaleInput?.addEventListener("input", () => {
    const scale = Number(titleScaleInput.value);
    if (!Number.isFinite(scale)) return;
    applyManualTitleScale(scale);
  });
  stampScaleInput?.addEventListener("input", () => {
    const scale = Number(stampScaleInput.value);
    if (!Number.isFinite(scale)) return;
    applyManualStampScale(scale);
  });
  cardScaleInput?.addEventListener("input", () => {
    const scale = Number(cardScaleInput.value);
    if (!Number.isFinite(scale)) return;
    applyManualCardScale(scale);
  });
  cardWidthInput?.addEventListener("input", () => {
    const width = Number(cardWidthInput.value);
    const base = cardBoxPx(state.viewport, cardVariant()).w;
    if (!Number.isFinite(width) || base <= 0) return;
    applyManualCardScale(width / base);
  });
  document.getElementById("layout-reset").addEventListener("click", () => {
    const { w, h } = vpSize();
    const next = resetLayout(state.regionId, state.contentId, w, h);
    layout.map = next.map;
    layout.okinawa = next.okinawa;
    layout.cards = next.cards;
    layout.precipLegend = next.precipLegend;
    syncCardScaleUi(resetCardScale(state.contentId, state.regionId, w, h));
    syncTitleScaleUi(resetTitleScale(w, h, state.regionId, state.contentId));
    syncMapControls();
    loadFrame();
  });
  document.getElementById("layout-commit")?.addEventListener("click", () => {
    postToFrame({ type: "freeze-layout" });
    const { w, h } = vpSize();
    syncLayoutShareUi(describeLayoutShare(state.contentId, state.regionId, w, h).saveMessage);
  });

  const postLegendCommand = (command) => {
    postToFrame({ type: "legend-command", command });
  };
  document.getElementById("legend-auto")?.addEventListener("click", () => postLegendCommand("auto"));
  document.getElementById("legend-fix")?.addEventListener("click", () => postLegendCommand("fix"));
  document.getElementById("legend-unfix")?.addEventListener("click", () => postLegendCommand("unfix"));
  document.getElementById("legend-reset")?.addEventListener("click", () => postLegendCommand("reset"));
  document.getElementById("layout-auto-all")?.addEventListener("click", () => {
    postToFrame({ type: "auto-layout-all" });
  });
  syncTitleScaleUi();
  regionSelect.addEventListener("change", () => {
    state.regionId = regionSelect.value;
    reloadLayoutForViewport();
    persistStudio();
    syncCardScaleUi();
    syncTitleScaleUi();
    loadFrame();
  });
  const fillStationSelect = () => {
    const cap = capabilityForContent(state.contentId);
    const list = stationsForPref(state.prefId, cap);
    const fallback = list.length ? list : stationsForPref(state.prefId);
    stationSelect.innerHTML = fallback
      .map((item) => `<option value="${item.station_id}">${item.station_name}</option>`)
      .join("");
    if (!fallback.some((item) => item.station_id === state.stationId)) {
      state.stationId = fallback[0]?.station_id || state.stationId;
    }
    stationSelect.value = state.stationId;
  };
  const syncScopeUi = () => {
    const scope = locationScope(state.contentId);
    if (regionField) regionField.hidden = scope === "prefecture" || scope === "station";
    if (prefField) prefField.hidden = scope !== "prefecture" && scope !== "station";
    if (stationField) stationField.hidden = scope !== "station";
    if (scope === "national") {
      state.regionId = "national";
      regionSelect.value = "national";
    }
    if (scope === "prefecture" || scope === "station") {
      const pref = getPrefecture(state.prefId);
      state.regionId = pref.region_id;
    }
    fillStationSelect();
  };
  fillStationSelect();
  contentSelect.addEventListener("change", () => {
    state.contentId = contentSelect.value;
    syncScopeUi();
    reloadLayoutForViewport();
    persistStudio();
    syncCardScaleUi();
    syncTitleScaleUi();
    loadFrame();
  });
  prefSelect?.addEventListener("change", () => {
    state.prefId = prefSelect.value;
    const pref = getPrefecture(state.prefId);
    state.regionId = pref.region_id;
    fillStationSelect();
    persistStudio();
    loadFrame();
  });
  stationSelect?.addEventListener("change", () => {
    state.stationId = stationSelect.value;
    persistStudio();
    loadFrame();
  });
  const onSizeLive = () => {
    saveViewport();
    reloadLayoutForViewport();
    fitFrame();
    syncCardScaleUi();
    syncTitleScaleUi();
  };
  const onSizeCommit = () => {
    onSizeLive();
    loadFrame();
  };
  widthInput.addEventListener("change", onSizeCommit);
  heightInput.addEventListener("change", onSizeCommit);
  widthInput.addEventListener("input", onSizeLive);
  heightInput.addEventListener("input", onSizeLive);
  presetHost.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.live) {
      widthInput.value = String(Math.max(160, previewStage.clientWidth));
      heightInput.value = String(Math.max(120, previewStage.clientHeight));
    } else {
      widthInput.value = button.dataset.w;
      heightInput.value = button.dataset.h;
    }
    onSizeCommit();
  });
  window.addEventListener("resize", fitFrame);
  if (window.ResizeObserver) new ResizeObserver(fitFrame).observe(previewStage);
  const mapTools = document.getElementById("studio-map-tools");
  const cardTools = document.getElementById("card-tools");
  const cardEditors = document.getElementById("card-editors");
  const hint = studioBar.querySelector(".studio-hint");
  const syncChrome = () => {
    const content = getContent(state.contentId);
    if (mapTools) mapTools.hidden = content.kind !== "map";
    if (cardTools && content.kind !== "map") cardTools.hidden = true;
    if (hint) hint.hidden = content.kind !== "map";
    const legendTools = document.getElementById("legend-tools");
    const isPrecip = content.id === "today_precip" || content.id === "tomorrow_precip";
    if (legendTools) legendTools.hidden = content.kind !== "map" || !isPrecip;
    syncScopeUi();
    syncLayoutShareUi();
    syncLegendStatusUi();
  };

  const catalogPanel = document.getElementById("url-catalog-panel");
  document.getElementById("url-catalog-toggle")?.addEventListener("click", async () => {
    if (!catalogPanel) return;
    catalogPanel.hidden = !catalogPanel.hidden;
    if (catalogPanel.hidden) return;
    const rows = generatePublicUrls();
    let versions = {};
    try {
      const bundle = await loadDisplayBundle(state.contentId);
      versions = bundle.manifest?.contents || {};
    } catch {
      versions = {};
    }
    const groups = ["既存 地方・全国", "都道府県", "観測地点", "全国防災"];
    catalogPanel.innerHTML = groups.map((group) => {
      const items = rows.filter((row) => row.group === group);
      if (!items.length) return "";
      return `<h3>${group}（${items.length}）</h3>
        <table class="studio-url-table">
          <thead><tr><th>表示名</th><th>content</th><th>scope</th><th>対象</th><th>URL</th><th>状態</th><th>version</th><th>最終公開</th></tr></thead>
          <tbody>${items.map((row) => `<tr>
            <td>${row.name}</td><td>${row.contentId}</td><td>${row.scope}</td><td>${row.target}</td>
            <td><button type="button" class="url-copy" data-url="${row.url}">コピー</button> <code>${row.url}</code></td>
            <td>${versions[row.contentId]?.status || row.status}</td>
            <td>v${versions[row.contentId]?.version || "—"}</td>
            <td>${versions[row.contentId]?.updated_at || "—"}</td>
          </tr>`).join("")}</tbody>
        </table>`;
    }).join("");
  });
  catalogPanel?.addEventListener("click", async (event) => {
    const btn = event.target.closest(".url-copy");
    if (!btn) return;
    const url = new URL(btn.dataset.url, location.href).href;
    try {
      await navigator.clipboard.writeText(url);
      btn.textContent = "コピー済";
    } catch {
      btn.textContent = "失敗";
    }
  });

  const syncLegendStatusUi = (legend) => {
    const statusEl = document.getElementById("legend-status");
    if (!statusEl) return;
    const pos = legend || layout.precipLegend;
    statusEl.textContent = legendStatusLabel(pos, pos?._warnings);
  };

  const fillCardEditors = (cards) => {
    if (!cardTools || !cardEditors) return;
    cardTools.hidden = !cards?.length;
    if (!cards?.length) {
      cardEditors.innerHTML = "";
      return;
    }
    const hasSame = cards.every((item) => cardEditors.querySelector(`[data-city="${item.cityId}"]`));
    if (hasSame && cardEditors.querySelectorAll("[data-city]").length === cards.length * 2) {
      for (const item of cards) {
        for (const axis of ["x", "y"]) {
          const input = cardEditors.querySelector(`[data-city="${item.cityId}"][data-axis="${axis}"]`);
          if (input && document.activeElement !== input) input.value = item[axis].toFixed(1);
        }
      }
      return;
    }
    cardEditors.innerHTML = cards.map((item) => `
      <label class="studio-card-item">
        <span>${item.cityName}</span>
        <input data-city="${item.cityId}" data-axis="x" type="number" min="${CARD_POS_MIN}" max="${CARD_POS_MAX}" step="0.5" value="${item.x.toFixed(1)}" aria-label="${item.cityName} ??">
        <input data-city="${item.cityId}" data-axis="y" type="number" min="${CARD_POS_MIN}" max="${CARD_POS_MAX}" step="0.5" value="${item.y.toFixed(1)}" aria-label="${item.cityName} ??">
      </label>
    `).join("");
  };

  cardEditors?.addEventListener("input", (event) => {
    const input = event.target.closest("input[data-city]");
    if (!input) return;
    const cityId = input.dataset.city;
    const x = Number(cardEditors.querySelector(`[data-city="${cityId}"][data-axis="x"]`)?.value);
    const y = Number(cardEditors.querySelector(`[data-city="${cityId}"][data-axis="y"]`)?.value);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    postToFrame({ type: "move-card", cityId, x, y });
  });

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.source !== "led-signage") return;
    if (event.data.type === "cards") {
      fillCardEditors(event.data.cards || []);
      if (event.data.cards?.length) {
        layout.cards = Object.fromEntries(
          event.data.cards.map((item) => [item.cityId, { x: item.x, y: item.y, locked: true }])
        );
        const { w, h } = vpSize();
        saveLayout(state.regionId, layout, state.contentId, w, h);
      }
      if (Number.isFinite(event.data.cardScale)) syncCardScaleUi(event.data.cardScale);
    }
    if (event.data.type === "legend" && event.data.legend) {
      layout.precipLegend = { ...event.data.legend };
      syncLegendStatusUi(layout.precipLegend);
      const { w, h } = vpSize();
      saveLayout(state.regionId, layout, state.contentId, w, h);
    }
    if (event.data.type === "auto-layout-all-done") {
      layout.cards = {};
      if (event.data.legend) layout.precipLegend = { ...event.data.legend };
      if (event.data.map) Object.assign(layout.map, event.data.map);
      const { w, h } = vpSize();
      saveLayout(state.regionId, layout, state.contentId, w, h, { clearCards: true });
      syncLegendStatusUi(layout.precipLegend);
      syncMapControls();
      loadFrame();
    }
    if (event.data.type === "map" && event.data.map) {
      Object.assign(layout.map, event.data.map);
      if (event.data.okinawa) Object.assign(layout.okinawa, event.data.okinawa);
      syncMapControls();
    }
    if (event.data.type === "layout-frozen" && event.data.layout) {
      Object.assign(layout, {
        map: event.data.layout.map,
        okinawa: event.data.layout.okinawa,
        precipLegend: event.data.layout.precipLegend,
        cards: event.data.layout.cards
      });
      const w = event.data.width || state.viewport.width;
      const h = event.data.height || state.viewport.height;
      saveLayout(state.regionId, layout, state.contentId, w, h);
      syncLayoutShareUi(describeMapShare(state.regionId, w, h).saveMessage);
      if (Number.isFinite(event.data.cardScale)) {
        saveCardScale(state.contentId, event.data.cardScale, state.regionId, w, h);
        syncCardScaleUi(event.data.cardScale);
      }
      if (Number.isFinite(event.data.titleScale)) {
        saveTitleScale(event.data.titleScale, w, h, state.regionId, state.contentId);
        syncTitleScaleUi(event.data.titleScale);
      }
      const snapshot = snapshotLayoutDefaults(
        state.regionId,
        layout,
        state.contentId,
        w,
        h,
        event.data.cardScale,
        event.data.titleScale
      );
      const hintEl = studioBar.querySelector(".studio-hint");
      const setHint = (text) => {
        if (hintEl) hintEl.textContent = text;
      };
      const downloadMerged = async () => {
        let current = { layouts: {}, cardScales: {}, titleScales: {} };
        try {
          const response = await fetch("data/layout-defaults.json", { cache: "no-store" });
          if (response.ok) current = await response.json();
        } catch {
          /* ignore */
        }
        const merged = {
          rev: Math.max(Number(current.rev) || 0, Number(snapshot.rev) || 0, Date.now()),
          layouts: { ...(current.layouts || {}) },
          cardScales: { ...(current.cardScales || {}) },
          titleScales: { ...(current.titleScales || {}) }
        };
        for (const [regionId, regionDef] of Object.entries(snapshot.layouts || {})) {
          const prev = merged.layouts[regionId] || { groups: {}, viewports: {} };
          const groups = { ...(prev.groups || {}) };
          for (const [group, pack] of Object.entries(regionDef.groups || {})) {
            groups[group] = {
              aspects: {
                ...(groups[group]?.aspects || {}),
                ...(pack.aspects || {})
              }
            };
          }
          merged.layouts[regionId] = {
            groups,
            viewports: {
              ...(prev.viewports || {}),
              ...(regionDef.viewports || {})
            }
          };
        }
        Object.assign(merged.cardScales, snapshot.cardScales || {});
        Object.assign(merged.titleScales, snapshot.titleScales || {});
        const blob = new Blob([`${JSON.stringify(merged, null, 2)}\n`], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "layout-defaults.json";
        a.click();
        URL.revokeObjectURL(url);
        return merged;
      };
      fetch("/api/layout-defaults", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(snapshot)
      }).then(async (response) => {
        if (!response.ok) throw new Error("save failed");
        setHint(`配置を固定しました（全国など ${w}x${h}）。今日/明日の天気・降水で共有されます。GitHub反映はコミット＆プッシュが必要です。`);
      }).catch(async () => {
        try {
          await downloadMerged();
          setHint(`ブラウザ内に固定し、layout-defaults.json をダウンロードしました。data/ に上書きしてからコミットしてください。`);
        } catch {
          setHint("ブラウザ内には固定しました。ファイル保存には npm start（プレビューサーバー）が必要です。");
        }
      });
      fillCardEditors(Object.entries(layout.cards || {}).map(([cityId, pos]) => ({
        cityId,
        cityName: cityId,
        x: pos.x,
        y: pos.y
      })));
      syncMapControls();
    }
  });

  persistStudio();
  syncChrome();
  syncCardScaleUi();
  syncStampScaleUi();
  contentSelect.addEventListener("change", syncChrome);
  const displayUi = bindDisplayStudio({
    root: studioBar,
    state,
    reloadPreview: (keepDraft) => {
      if (!keepDraft) {/* preview flag comes from draft store */}
      loadFrame();
      displayUi.refreshMeta();
    },
    applyLive: (layer) => {
      withFrameScreen((screenEl) => {
        applyResolvedDisplay(screenEl, layer);
        applyTitleScale(screenEl, layer.title_scale, layer.stamp_scale);
        fitTitleBars(screenEl);
      });
      postToFrame({ type: "apply-display", layer });
    }
  });
  contentSelect.addEventListener("change", () => displayUi.refreshMeta());
  prefSelect?.addEventListener("change", () => displayUi.refreshMeta());
  stationSelect?.addEventListener("change", () => displayUi.refreshMeta());
  loadFrame();
  } finally {
    document.documentElement.classList.remove("is-boot");
  }
}

async function bootSignage() {
  // 公開URLは同梱データで即描画。気象庁は裏で取り、来たら差し替える（待たせない）
  const liveReady = pullLiveWeatherAndRender();
  window.setTimeout(() => document.documentElement.classList.remove("is-boot"), 4000);
  await loadCatalog();
  await loadLocationMasters();
  await initLayoutDefaults();
  state.regionId = getRegion(state.regionId).id;
  state.contentId = getContent(state.contentId).id;
  state.prefId = getPrefecture(state.prefId).pref_id;
  state.stationId = getStation(state.stationId).station_id;

  const screen = document.getElementById("led-screen");
  const stage = document.getElementById("map-stage");
  const titleEl = document.getElementById("led-title");
  const stampEl = document.getElementById("led-stamp");
  const noteEl = document.getElementById("led-note");
  const noteIconEl = document.getElementById("led-note-icon");
  const attributionEl = document.getElementById("map-attribution");
  // スタジオ iframe（?vw/?vh）以外は設計解像度で固定。実窓サイズには追従しない。
  const measure = () => {
    const fromW = Number(params.get("vw"));
    const fromH = Number(params.get("vh"));
    if (fromW > 0 && fromH > 0) return readViewport(fromW, fromH);
    return readViewport(FIXED_DESIGN.width, FIXED_DESIGN.height);
  };
  const useFixedScale = !(Number(params.get("vw")) > 0 && Number(params.get("vh")) > 0);
  const initialVp = measure();
  state.viewport = initialVp;
  const layout = loadLayout(state.regionId, state.contentId, initialVp.width, initialVp.height, {
    preferShipped: !canEdit
  });
  let iconPhaseTimer = 0;
  let tablePageTimer = 0;
  let tablePageIndex = Math.max(0, Number.parseInt(params.get("page") || "0", 10) || 0);
  let tablePageKey = "";
  let weatherStamp = "";
  let cardsLayer = null;
  let tickerLayoutTimer = 0;
  let weekPointsToken = 0;
  let repaintPins = () => {};
  const weekPointsEl = document.getElementById("week-points");
  const TABLE_PAGE_MS = 10 * 1000;
  const tableRotateOff = params.get("rotate") === "0";

  function hideWeekPoints() {
    weekPointsToken += 1;
    if (!weekPointsEl) return;
    weekPointsEl.hidden = true;
    weekPointsEl.innerHTML = "";
    weekPointsEl.classList.remove("is-alert");
  }

  function paintWeekPoints(cities) {
    if (!weekPointsEl) return null;
    const token = ++weekPointsToken;
    const points = buildWeekPoints(cities);
    const html = renderWeekPointsHtml(points, null);
    if (!html) {
      hideWeekPoints();
      return null;
    }
    weekPointsEl.classList.remove("is-alert");
    weekPointsEl.innerHTML = html;
    weekPointsEl.hidden = false;
    return { points, token };
  }

  async function refreshWeekAlert(cities, session) {
    if (!weekPointsEl || !session) return;
    let alert = null;
    try {
      alert = await withTimeout(fetchWeekAlert(cities), 5000);
    } catch {
      alert = null;
    }
    if (session.token !== weekPointsToken || !alert) return;
    weekPointsEl.classList.add("is-alert");
    weekPointsEl.innerHTML = renderWeekPointsHtml(session.points, alert);
  }

  function layoutNoteTicker() {
    const track = noteEl.querySelector(".led-note-track");
    const item = track?.querySelector(".led-note-item");
    if (!track || !item) return;
    const textWidth = item.scrollWidth || item.offsetWidth || 480;
    const duration = `${Math.max(10, Math.round(textWidth / 95))}s`;
    if (track.style.getPropertyValue("--ticker-duration") === duration) return;
    track.style.setProperty("--ticker-duration", duration);
  }

  function setNoteTicker(text) {
    const next = String(text || "").trim() || "気象庁の天気予報です。";
    if (noteEl.dataset.note === next && noteEl.querySelector(".led-note-track")) {
      layoutNoteTicker();
      return;
    }
    noteEl.dataset.note = next;
    noteEl.setAttribute("aria-label", next);
    const html = formatNoteHtml(next);
    const track = document.createElement("div");
    track.className = "led-note-track";
    track.innerHTML = `<span class="led-note-item">${html}</span><span class="led-note-item" aria-hidden="true">${html}</span>`;
    noteEl.replaceChildren(track);
    window.requestAnimationFrame(() => layoutNoteTicker());
  }

  const notifyStudio = (payload) => {
    if (!canEdit || window.parent === window) return;
    try {
      window.parent.postMessage({ source: "led-signage", ...payload }, window.location.origin);
    } catch {
      /* ignore */
    }
  };

  const persistView = () => {
    const next = new URL(window.location.href);
    next.searchParams.delete("profile");
    next.searchParams.delete("resolution");
    next.searchParams.delete("inch");
    next.searchParams.delete("studio");
    next.searchParams.set("region", state.regionId);
    next.searchParams.set("content", state.contentId);
    if (locationScope(state.contentId) === "prefecture" || locationScope(state.contentId) === "station") {
      next.searchParams.set("pref", state.prefId);
    }
    if (locationScope(state.contentId) === "station") {
      next.searchParams.set("station", state.stationId);
    }
    if (canEdit) next.searchParams.set("edit", "1");
    if (isDebug) next.searchParams.set("debug", "1");
    const icon = params.get("icon");
    if (icon === "night" || icon === "day") next.searchParams.set("icon", icon);
    if (params.get("night") === "1") next.searchParams.set("night", "1");
    if (params.get("day") === "1") next.searchParams.set("day", "1");
    window.history.replaceState({}, "", next);
  };

  async function render() {
    const region = getRegion(state.regionId);
    const content = getContent(state.contentId);
    const vp = measure();
    state.viewport = vp;
    applyViewport(screen, vp, region.id, content, { fixedScale: useFixedScale });
    if (content.id !== "weekly_weather") hideWeekPoints();

    if (isV1Content(content)) {
      const pref = getPrefecture(state.prefId);
      const station = getStation(state.stationId);
      const extraTitle = content.location_scope === "station"
        ? { stationName: station.station_name }
        : content.location_scope === "prefecture"
          ? { prefName: pref.pref_name }
          : {};
      titleEl.textContent = contentTitle(region, content, extraTitle);
      document.title = titleEl.textContent;
      syncTitleMark(content);
      let displayResolved = null;
      try {
        const bundle = await loadDisplayBundle(content.id);
        const draft = params.get("preview") === "draft" ? readDraft() : null;
        displayResolved = resolveDisplayConfig({
          contentDoc: bundle.contentDoc,
          defaultsDoc: bundle.defaultsDoc,
          prefId: pref.pref_id,
          stationId: station.station_id,
          draftLayer: draft?.content_id === content.id ? draft.layer : null
        });
        applyResolvedDisplay(screen, displayResolved);
        applyTitleScale(screen, displayResolved.title_scale, displayResolved.stamp_scale);
      } catch {
        applyTitleScale(
          screen,
          loadTitleScale(vp.width, vp.height, region.id, content.id),
          loadStampScale(vp.width, vp.height, region.id, content.id)
        );
      }
      fitTitleBars(screen);
      attributionEl.hidden = true;
      hideWeekPoints();
      screen.classList.remove("is-map-pending");
      const { renderV1Content } = await import(`./renderers/v1-content.js?v=${DATA_VERSION}`);
      const result = await renderV1Content({
        content,
        prefId: pref.pref_id,
        stationId: station.station_id,
        setNote: setNoteTicker
      });
      weatherStamp = result?.stamp || "";
      stampEl.textContent = weatherStamp ? formatStamp(weatherStamp, !showAuxiliary(vp, "stampWeek")) : "";
      layoutNoteTicker();
      lastError = "ok";
      updateDebug(vp, region, content, weatherStamp);
      recordSite();
      persistView();
      return;
    }

    // 解像度ごとの保存レイアウトを読み直す
    const savedLayout = loadLayout(region.id, content.id, vp.width, vp.height, {
      preferShipped: !canEdit
    });
    layout.map = { ...savedLayout.map };
    layout.okinawa = { ...savedLayout.okinawa };
    layout.cards = { ...savedLayout.cards };
    layout.precipLegend = { ...savedLayout.precipLegend };

    try {
      const [attribution, locations, projection] = await Promise.all([
        fetchJson("data/attribution.json"),
        fetchJson("data/locations.json"),
        fetchJson("data/map-projection.json")
      ]);
      const weatherDoc = await loadWeatherDoc(locations);
      const weather = adaptWeather(weatherDoc);
      weatherStamp = weather.updatedAt;

      const candidates = aggregateRegion(locations.cities, weather, region, {
        // 週間表は地域の全地点を出す（欠測でも行を落とさない）
        requirePoint: content.kind !== "table"
      });
      const tablePages = content.kind === "table"
        ? partitionTablePages(candidates, tablePageSize(region.id))
        : [candidates.slice(0, cityLimit(vp, region.id, content, candidates.length))];
      const pageKey = `${region.id}:${content.id}:p${tablePages.map((p) => p.length).join("-")}`;
      if (pageKey !== tablePageKey) {
        tablePageKey = pageKey;
        tablePageIndex = 0;
      }
      const pageCount = Math.max(1, tablePages.length);
      if (tablePageIndex >= pageCount) tablePageIndex = 0;
      const pageCities = tablePages[tablePageIndex] || [];
      const selected = pageCities
        .map((city) => attachForecast(
          city,
          weather.pointsByCity.get(city.cityId) || { cityId: city.cityId, weather: "100", pop: 0, weekly: [] },
          content,
          weather.updatedAt
        ));

      window.clearTimeout(tablePageTimer);
      if (content.kind === "table" && pageCount > 1 && !tableRotateOff) {
        tablePageTimer = window.setTimeout(() => {
          tablePageIndex = (tablePageIndex + 1) % pageCount;
          render();
        }, TABLE_PAGE_MS);
      }

      titleEl.textContent = contentTitle(region, content);
      document.title = contentTitle(region, content);
      stampEl.textContent = formatStamp(weather.updatedAt, !showAuxiliary(vp, "stampWeek"));
      setNoteTicker(noteFor(content.id, region.id, weather, selected));
      attributionEl.textContent = attribution.text;
      attributionEl.hidden = content.kind !== "map" || !showAuxiliary(vp, "attribution");
      syncTitleMark(content);
      const weekPoints = content.id === "weekly_weather" ? paintWeekPoints(selected) : (hideWeekPoints(), null);
      applyTitleScale(
        screen,
        loadTitleScale(vp.width, vp.height, region.id, content.id),
        loadStampScale(vp.width, vp.height, region.id, content.id)
      );
      fitTitleBars(screen);
      layoutNoteTicker();
      if (document.fonts?.ready) {
        document.fonts.ready.then(() => {
          fitTitleBars(screen);
          layoutNoteTicker();
        }).catch(() => {});
      }

      if (content.kind === "table") {
        applyTableLayout(screen, vp, Math.max(selected.length, selected.length === 1 ? 2 : selected.length || 5));
        stage.innerHTML = await renderWeeklyTable(selected, content.id);
        syncPrecipTodLegend(content, stage, layout, region.id, false);
        if (content.id === "weekly_weather") refreshWeekAlert(selected, weekPoints);
        else hideWeekPoints();
        const noteWeather = pickNoteWeather(selected.flatMap((city) => city.weekly || [city]));
        noteIconEl.className = `wx-icon ${weatherTone(noteWeather)}`;
        noteIconEl.innerHTML = await renderNoteIcon(noteWeather);
        lastError = "ok";
        updateDebug(vp, region, content, weatherStamp);
        recordSite();
        scheduleIconPhase();
        return;
      }

      const svgText = await loadMapSvg(region.mapFile);
      screen.classList.add("is-map-pending");
      const layers = mountMap(stage, svgText, region.id);
      const mapSvg = stage.querySelector(".map-svg svg");
      const autofit = computeFocusMapTransform(mapSvg, region.id);
      const fill = regionalFallbackTransform(region.id);
      const shared = loadMapLayout(region.id, vp.width, vp.height);
      if (shared.fromStore && Number.isFinite(Number(shared.map?.scale))) {
        Object.assign(layout.map, shared.map);
        if (shared.okinawa) Object.assign(layout.okinawa, shared.okinawa);
      } else if (!isNational(region.id) && region.id !== "okinawa") {
        Object.assign(layout.map, Number(autofit.scale) >= Number(fill.scale) ? autofit : fill);
        if (shared.okinawa) Object.assign(layout.okinawa, shared.okinawa);
        saveMapLayout(region.id, layout.map, layout.okinawa, vp.width, vp.height);
      } else if (shared.okinawa) {
        Object.assign(layout.okinawa, shared.okinawa);
      }
      layout.map.gen = MAP_LAYOUT_GEN;
      const pins = selected.map((city) => {
        const pos = projectCity(city, projection, region.id);
        return { ...city, ...pos };
      });
      const cardScale = loadCardScale(content.id, region.id, vp.width, vp.height);
      applyCardScale(screen, cardScale);
      // 今日/明日×天気/降水は地図・ボックス配置を共有（自動配置スロットも weather 側に統一）
      const variant = "weather";
      const baseSize = cardSizePct(vp, region.id, variant);
      const laidOut = applyLockedCards(
        placeCardsAroundMap(
          pins,
          { w: baseSize.w * cardScale, h: baseSize.h * cardScale },
          region.id,
          variant
        ),
        layout
      );
      if (canEdit
        && !Object.keys(savedLayout.cards || {}).length
        && freezeCardLayout(laidOut, layout, { force: false })) {
        saveLayout(region.id, layout, content.id, vp.width, vp.height);
      }

      const noteWeather = pickNoteWeather(laidOut);
      noteIconEl.className = `wx-icon ${weatherTone(noteWeather)}`;
      noteIconEl.innerHTML = await renderNoteIcon(noteWeather);
      layers.leaders.innerHTML = "";
      const visiblePins = laidOut.filter((item) => !item.hidePin);
      const insetPins = layers.okinawaPins
        ? visiblePins.filter((item) => item.useOkinawaInset)
        : [];
      const mainPins = layers.okinawaPins
        ? visiblePins.filter((item) => !item.useOkinawaInset)
        : visiblePins;
      const pinOpts = { national: region.id === "national" };
      const paintMapPins = () => {
        const mainR = pinRadiusForViewBox(layers.pins, pinOpts);
        layers.pins.innerHTML = mainPins.map((item) => renderPin(item, mainR)).join("");
        if (layers.okinawaPins) {
          const okiSvg = layers.okinawaPins.ownerSVGElement || layers.okinawaPins;
          const okiR = pinRadiusForMatchingScreen(okiSvg, layers.pins, mainR);
          layers.okinawaPins.innerHTML = insetPins.map((item) => renderPin(item, okiR)).join("");
        }
      };
      paintMapPins();
      repaintPins = paintMapPins;
      const cards = await Promise.all(laidOut.map((item) => renderCityCard(item, item, {
        layout: content.card === "pop" ? "pop" : "pill",
        showPop: false
      })));
      layers.cards.innerHTML = cards.join("");
      cardsLayer = layers.cards;
      syncPrecipTodLegend(content, stage, layout, region.id, canEdit);
      centerCityCards(layers.cards);
      fitCityCardNames(layers.cards);
      if (document.fonts?.ready) {
        await document.fonts.ready.catch(() => {});
        centerCityCards(layers.cards);
        fitCityCardNames(layers.cards);
      }
      if (canEdit) {
        bindCardEditor(layers.cards, layout, region.id, content.id, (next, nextScale) => {
          notifyStudio({ type: "cards", cards: next, cardScale: nextScale ?? cardScale });
        }, screen);
        bindMapEditor(layers.fit, layout, () => {
          applyMapTransform(screen, layout);
          paintMapPins();
          const size = measure();
          saveLayout(region.id, layout, content.id, size.width, size.height);
          notifyStudio({ type: "map", map: { ...layout.map }, okinawa: { ...layout.okinawa } });
        });
        bindOkinawaEditor(layers.okinawaDock, layout, () => {
          applyMapTransform(screen, layout);
          paintMapPins();
          const size = measure();
          saveLayout(region.id, layout, content.id, size.width, size.height);
        });
        notifyStudio({ type: "cards", cards: listCardPositions(layers.cards), cardScale });
      }
      applyMapTransform(screen, layout);
      centerCityCards(layers.cards);
      paintMapPins();
      screen.classList.remove("is-map-pending");
      if (canEdit) {
        notifyStudio({ type: "map", map: { ...layout.map }, okinawa: { ...layout.okinawa } });
        notifyStudio({ type: "cards", cards: listCardPositions(layers.cards), cardScale });
      }
      lastError = "ok";
      updateDebug(vp, region, content, weatherStamp);
      recordSite();
      scheduleIconPhase();
    } catch (error) {
      lastError = error?.message || String(error);
      console.error(error);
      hideWeekPoints();
      screen.classList.remove("is-map-pending");
      updateDebug(vp, region, content, weatherStamp);
    }
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.source !== "led-studio") return;
    if (event.data.type === "apply-map") {
      if (event.data.map) Object.assign(layout.map, event.data.map);
      if (event.data.okinawa) Object.assign(layout.okinawa, event.data.okinawa);
      applyMapTransform(screen, layout);
      // 手動の列島拡大を自動フィットで戻さない
      repaintPins();
      notifyStudio({ type: "map", map: { ...layout.map }, okinawa: { ...layout.okinawa } });
    }
    if (event.data.type === "move-card" && event.data.cityId) {
      moveLockedCard(
        cardsLayer,
        layout,
        state.regionId,
        state.contentId,
        event.data.cityId,
        Number(event.data.x),
        Number(event.data.y)
      );
    }
    if (event.data.type === "set-card-scale") {
      const scale = Number(event.data.scale);
      if (!Number.isFinite(scale)) return;
      const vp = measure();
      saveCardScale(state.contentId, scale, state.regionId, vp.width, vp.height);
      applyCardScale(screen, scale);
      centerCityCards(cardsLayer);
      fitCityCardNames(cardsLayer);
      if (!isCustomLayout(layout)) {
        containMapInStage(screen, layout, { recenter: false });
      }
    }
    if (event.data.type === "set-title-scale") {
      const scale = Number(event.data.scale);
      if (!Number.isFinite(scale)) return;
      const vp = measure();
      saveTitleScale(scale, vp.width, vp.height, state.regionId, state.contentId);
      const stamp = Number(event.data.stampScale);
      if (Number.isFinite(stamp)) {
        saveStampScale(stamp, vp.width, vp.height, state.regionId, state.contentId);
      }
      applyTitleScale(screen, scale, Number.isFinite(stamp) ? stamp : loadStampScale(vp.width, vp.height, state.regionId, state.contentId));
      fitTitleBars(screen);
      layoutNoteTicker();
    }
    if (event.data.type === "apply-display") {
      applyResolvedDisplay(screen, event.data.layer || {});
      applyTitleScale(screen, event.data.layer?.title_scale, event.data.layer?.stamp_scale);
      fitTitleBars(screen);
      layoutNoteTicker();
    }
    if (event.data.type === "freeze-layout") {
      const vp = measure();
      const cards = listCardPositions(cardsLayer);
      for (const item of cards) {
        layout.cards[item.cityId] = { x: item.x, y: item.y, locked: true };
      }
      saveLayout(state.regionId, layout, state.contentId, vp.width, vp.height);
      const cardScale = loadCardScale(state.contentId, state.regionId, vp.width, vp.height);
      const titleScale = loadTitleScale(vp.width, vp.height, state.regionId, state.contentId);
      notifyStudio({
        type: "layout-frozen",
        regionId: state.regionId,
        contentId: state.contentId,
        width: vp.width,
        height: vp.height,
        layout: {
          map: { ...layout.map },
          okinawa: { ...layout.okinawa },
          precipLegend: { ...layout.precipLegend },
          cards: { ...layout.cards }
        },
        cardScale,
        titleScale
      });
    }
    if (event.data.type === "legend-command") {
      const vp = measure();
      const legend = runLegendCommand(
        screen,
        layout,
        event.data.command,
        state.regionId,
        state.contentId,
        vp.width,
        vp.height
      );
      notifyStudio({ type: "legend", legend });
    }
    if (event.data.type === "auto-layout-all") {
      const vp = measure();
      layout.cards = {};
      if (layout.precipLegend) {
        layout.precipLegend.manuallyFixed = false;
        layout.precipLegend.anchor = "bottom-right";
      }
      runLegendCommand(screen, layout, "reset", state.regionId, state.contentId, vp.width, vp.height);
      containMapInStage(screen, layout, { recenter: true });
      saveLayout(state.regionId, layout, state.contentId, vp.width, vp.height, { clearCards: true });
      notifyStudio({
        type: "auto-layout-all-done",
        legend: layout.precipLegend,
        map: { ...layout.map },
        cards: {}
      });
    }
  });

  window.addEventListener("resize", () => {
    // 設計解像度は変えず、表示スケールだけ合わせる（累積しない）
    if (useFixedScale) {
      fitFixedScreen(screen, state.viewport.width, state.viewport.height);
    }
    window.clearTimeout(tickerLayoutTimer);
    tickerLayoutTimer = window.setTimeout(() => layoutNoteTicker(), 40);
  });
  if (typeof ResizeObserver === "function") {
    let lastNoteWidth = 0;
    new ResizeObserver(() => {
      const width = noteEl.clientWidth || noteEl.offsetWidth;
      if (Math.abs(width - lastNoteWidth) < 2) return;
      lastNoteWidth = width;
      window.clearTimeout(tickerLayoutTimer);
      tickerLayoutTimer = window.setTimeout(() => layoutNoteTicker(), 40);
    }).observe(noteEl);
  }

  function scheduleIconPhase() {
    window.clearTimeout(iconPhaseTimer);
    iconPhaseTimer = window.setTimeout(() => render(), msUntilIconPhaseChange());
  }

  persistView();
  try {
    await render();
  } finally {
    document.documentElement.classList.remove("is-boot");
  }
  const refreshLive = () => pullLiveWeatherAndRender(render);
  liveReady.then(() => {
    if (liveWeatherCache.doc) render();
  }).catch(() => {});
  scheduleJmaRefresh(refreshLive);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && needsJmaRefresh()) {
      refreshLive();
    }
  });
}

function attachForecast(city, todayPoint, content, updatedAt) {
  const forecast = expandForecast({ ...todayPoint, cityId: city.cityId }, updatedAt);
  if (content.id === "tomorrow_weather") {
    return { ...city, ...todayPoint, ...forecast.tomorrow, weekly: forecast.weekly };
  }
  if (content.id === "tomorrow_precip") {
    return { ...city, ...todayPoint, ...forecast.tomorrow, ...forecast.tomorrowPeriods, weekly: forecast.weekly };
  }
  if (content.id === "today_precip" || content.id === "weekly_precip") {
    return { ...city, ...todayPoint, ...forecast.periods, weekly: forecast.weekly };
  }
  return { ...city, ...todayPoint, weekly: forecast.weekly };
}

/** 週間表の1ページ都市数。全国・中部は4都市ずつ（全国11地点は 4+4+3）。九州7地点は 4+3。 */
function tablePageSize(regionId) {
  const id = String(regionId || "").toLowerCase();
  if (id === "national" || id === "chubu" || id === "kyushu") return 4;
  return 5;
}

function syncTitleMark(content) {
  const mark = document.querySelector(".led-title-mark");
  if (!mark) return;
  mark.dataset.kind = content.card;
  if (content.card === "pop") {
    mark.innerHTML = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="currentColor" d="M32 8c10 16 18 26 18 36a18 18 0 1 1-36 0C14 34 22 24 32 8z"/>
    </svg>`;
    return;
  }
  mark.innerHTML = `<svg viewBox="-6 -6 76 76" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="12" fill="currentColor"/>
    <g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round">
      <path d="M32 6v8M32 50v8M6 32h8M50 32h8M12 12l6 6M46 46l6 6M12 52l6-6M46 18l6-6"/>
    </g>
  </svg>`;
}

function syncPrecipTodLegend(content, stage, layout, regionId, canEdit) {
  const host = stage?.closest(".led-body") || document.querySelector(".led-body");
  const screen = host?.closest(".led-screen") || document.getElementById("led-screen");
  if (!host) return;
  host.querySelectorAll(".precip-tod-legend").forEach((node) => node.remove());
  const show = content.id === "today_precip" || content.id === "tomorrow_precip";
  if (!show) return;
  host.insertAdjacentHTML("beforeend", renderPrecipTodLegend());
  const w = Number.parseFloat(screen?.style?.getPropertyValue("--led-width")) || screen?.clientWidth || 0;
  const h = Number.parseFloat(screen?.style?.getPropertyValue("--led-height")) || screen?.clientHeight || 0;
  if (layout && screen) {
    if (shouldAutoPlaceLegend(layout.precipLegend)) {
      autoPlacePrecipLegend(screen, layout, { width: w, height: h });
    }
    applyPrecipLegend(host, layout, w, h);
    const layer = host.querySelector(".map-cards");
    if (layer && nudgeCardsAwayFromLegend(layer, layout, screen)) {
      if (shouldAutoPlaceLegend(layout.precipLegend)) {
        autoPlacePrecipLegend(screen, layout, { force: true, width: w, height: h });
        applyPrecipLegend(host, layout, w, h);
      }
    }
  }
  if (canEdit && layout && regionId) {
    bindPrecipLegendEditor(layout, regionId, content.id, (pos) => {
      if (window.parent !== window) {
        window.parent.postMessage({ source: "led-signage", type: "legend", legend: pos }, window.location.origin);
      }
    });
  }
}

function updateDebug(vp, region, content, weatherStamp) {
  const box = document.getElementById("debug-overlay");
  if (!box) return;
  box.hidden = !isDebug;
  if (!isDebug) return;
  box.innerHTML = [
    `App Version ${APP_VERSION}`,
    `Region ID ${region.id}`,
    `Content ID ${content.id}`,
    `Viewport Width ${vp.width}`,
    `Viewport Height ${vp.height}`,
    `Aspect Ratio ${vp.aspect.toFixed(3)}`,
    `Device Pixel Ratio ${window.devicePixelRatio || 1}`,
    `Layout Mode ${vp.shape}/${vp.size}/${vp.density}`,
    `Weather Data Update Time ${weatherStamp || "-"}`,
    `Map Version ${MAP_VERSION}`,
    `Error Status ${lastError}`
  ].map((line) => `<div>${line}</div>`).join("");
}

function recordSite() {
  try {
    localStorage.setItem(SITE_STORE, JSON.stringify({
      siteId: params.get("site") || "local",
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      browserVersion: navigator.userAgent,
      appVersion: APP_VERSION,
      lastLoadedAt: new Date().toISOString()
    }));
  } catch {
    /* ignore */
  }
}

function scheduleJmaRefresh(onRefresh) {
  window.clearTimeout(jmaRefreshTimer);
  const wait = msUntilNextJmaRefresh();
  jmaRefreshTimer = window.setTimeout(async () => {
    try {
      await onRefresh();
    } finally {
      scheduleJmaRefresh(onRefresh);
    }
  }, wait);
}

async function pullLiveWeatherAndRender(renderFn) {
  if (livePullInFlight) return livePullInFlight;
  livePullInFlight = (async () => {
    try {
      const locations = await fetchJson("data/locations.json");
      const live = await withTimeout(fetchJmaWeather(locations.cities), LIVE_FETCH_TIMEOUT_MS);
      liveWeatherCache = { at: Date.now(), doc: live };
      if (typeof renderFn === "function") await renderFn();
    } catch {
      /* 同梱データまたは前回キャッシュのまま */
    } finally {
      livePullInFlight = null;
    }
  })();
  return livePullInFlight;
}

async function loadWeatherDoc() {
  if (liveWeatherCache.doc) return liveWeatherCache.doc;
  if (!bundledWeatherDoc) {
    bundledWeatherDoc = await fetchJson("data/weather.json");
  }
  return bundledWeatherDoc;
}

async function fetchJson(url) {
  const base = window.__LED_BASE__ || "";
  const response = await fetch(`${base}${url}?v=${DATA_VERSION}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} fetch failed`);
  return response.json();
}
