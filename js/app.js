/**
 * Studio / signage bootstrap. Studio drives the iframe viewport.
 */

import { APP_VERSION, DATA_VERSION, MAP_VERSION } from "./version.js?v=pref528";
import { isWeatherDoc, readWeatherLkg, writeWeatherLkg } from "./weather-cache.js?v=pref522";
import {
  canonicalContent,
  canonicalRegion,
  contentTitle,
  getContent,
  getRegion,
  listContents,
  listRegions,
  loadCatalog
} from "./catalog.js?v=pref485";
import { adaptWeather, aggregateRegion, assertRegionCoverage, emptyWeatherPoint } from "./weather-data.js?v=pref415";
import { existingMapLayers, fillMountedMap, loadMapSvg, mountMap, mountMapFrame, placeCardsAroundMap, projectCity } from "./map-renderer.js?v=pref525";
import { formatStamp, renderCityCard, renderCityCardSkeleton, renderPin, pinRadiusForViewBox, pinRadiusForMatchingScreen, pickNoteWeather, weatherTone, renderNoteIcon, renderPrecipTodLegend } from "./weather-renderer.js?v=pref527";
import { CONTENT_MASTER, REGION_MASTER, citiesForMaster } from "./area-master.js?v=pref525";
import { applyCardScale, applyLockedCards, applyMapTransform, applyPrecipLegend, applyTitleScale, bindCardEditor, bindMapControls, bindMapEditor, bindOkinawaEditor, bindPrecipLegendEditor, CARD_POS_MAX, CARD_POS_MIN, CARD_SCALE_MAX, CARD_SCALE_MIN, TITLE_SCALE_MAX, TITLE_SCALE_MIN, centerCityCards, hasLocalLayouts, initLayoutDefaults, listCardPositions, loadCardScale, loadLayout, loadTitleScale, moveLockedCard, resetCardScale, resetLayout, resetTitleScale, saveCardScale, saveLayout, saveTitleScale, snapshotAllLayoutDefaults, snapshotLayoutDefaults } from "./studio-layout.js?v=pref525";
import { expandForecast, formatNoteHtml, noteFor } from "./forecast.js?v=pref527";
import { renderWeeklyTable, renderWeeklyTableSkeleton, weeklyTableRows } from "./table-renderer.js?v=pref525";
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
} from "./viewport.js?v=pref506";
import { msUntilIconPhaseChange } from "./jma-icons.js?v=pref387";
import { fetchJmaWeather } from "./jma-live.js?v=pref527";
import { buildWeekPoints, fetchWeekAlert, renderWeekPointsHtml } from "./week-points.js?v=pref387";

/** 気象庁の定時発表（JST）。反映待ちで +5 分後にも取り直す。 */
const JMA_PUBLISH_HOURS_JST = [5, 11, 17];
const JMA_PUBLISH_LAG_MS = 5 * 60 * 1000;
/** 自前の毎時0分更新（12時を含む）。 */
const LIVE_REFRESH_MS = 60 * 60 * 1000;
const LIVE_FETCH_TIMEOUT_MS = 12000;
const storedLkg = readWeatherLkg();
let liveWeatherCache = storedLkg || { at: 0, doc: null };
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

function dateFromJst(year, month, day, hour = 0, minute = 0, second = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, second));
}

/** 毎時0分（JST）＋気象庁発表の5分後 */
function refreshSlotsOnJstDay(year, month, day) {
  const slots = [];
  for (let hour = 0; hour < 24; hour += 1) {
    slots.push(dateFromJst(year, month, day, hour, 0, 0).getTime());
  }
  for (const hour of JMA_PUBLISH_HOURS_JST) {
    slots.push(dateFromJst(year, month, day, hour, 0, 0).getTime() + JMA_PUBLISH_LAG_MS);
  }
  return [...new Set(slots)].sort((a, b) => a - b);
}

function nextRefreshAt(now = new Date()) {
  const nowMs = now.getTime();
  const jst = jstParts(now);
  const today = refreshSlotsOnJstDay(jst.year, jst.month, jst.day).find((ms) => ms > nowMs);
  if (today) return today;
  const nextDay = dateFromJst(jst.year, jst.month, jst.day, 0, 0, 0);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const t = jstParts(nextDay);
  return refreshSlotsOnJstDay(t.year, t.month, t.day)[0];
}

function msUntilNextRefresh(now = new Date()) {
  return Math.max(1000, nextRefreshAt(now) - now.getTime());
}

/** 未取得、1時間以上経過、毎時0分、または気象庁発表枠を過ぎていれば取り直し */
function needsJmaRefresh(now = new Date()) {
  if (!liveWeatherCache.doc) return true;
  const nowMs = now.getTime();
  if (nowMs - liveWeatherCache.at >= LIVE_REFRESH_MS) return true;
  return nextRefreshAt(new Date(liveWeatherCache.at)) <= nowMs;
}

export { APP_VERSION };

const VIEWPORT_STORE = "led-signage-viewport";
const SITE_STORE = "led-signage-site";

const params = new URLSearchParams(window.location.search);
const studioFlag = String(params.get("studio") || "").toLowerCase();
const isStudioPage = /studio\.html$/i.test(window.location.pathname)
  || window.location.hash === "#studio";
const isStudio = isStudioPage
  || (window.self === window.top && (
    window.__LED_FORCE_STUDIO__ === true
    || studioFlag === "1" || studioFlag === "true" || studioFlag === "yes"
  ));
if (isStudio) window.__LED_FORCE_STUDIO__ = true;
const isDebug = params.get("debug") === "1";
const canEdit = params.get("edit") === "1";

const state = {
  regionId: canonicalRegion(params.get("region")),
  contentId: canonicalContent(params.get("content")),
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
  document.documentElement.classList.remove("is-boot");
  const bootStatus = document.getElementById("boot-status");
  if (bootStatus) bootStatus.hidden = true;
  bootStudio().catch((error) => {
    console.error(error);
    document.documentElement.classList.remove("is-boot");
  });
} else {
  bootSignage();
}

function productionUrl(regionId, contentId, extra = {}) {
  const next = new URL(window.location.href);
  if (/studio\.html$/i.test(next.pathname)) {
    next.pathname = next.pathname.replace(/studio\.html$/i, "index.html");
  } else if (next.pathname !== "/view" && !/index\.html$/i.test(next.pathname)) {
    next.pathname = `${next.pathname.replace(/\/$/, "")}/index.html`;
  }
  next.search = "";
  next.hash = "";
  next.searchParams.set("region", canonicalRegion(regionId));
  next.searchParams.set("content", canonicalContent(contentId));
  if (extra.edit) next.searchParams.set("edit", "1");
  if (extra.debug) next.searchParams.set("debug", "1");
  if (extra.site) next.searchParams.set("site", extra.site);
  if (extra.vw) next.searchParams.set("vw", String(Math.round(Number(extra.vw) || FIXED_DESIGN.width)));
  if (extra.vh) next.searchParams.set("vh", String(Math.round(Number(extra.vh) || FIXED_DESIGN.height)));
  next.searchParams.set("v", DATA_VERSION);
  next.searchParams.set("mapv", MAP_VERSION);
  return next.pathname + next.search;
}

async function postStudioSnapshot(snapshot) {
  const body = JSON.stringify(snapshot || {});
  const targets = [
    "/api/layout-defaults",
    "http://127.0.0.1:5173/api/layout-defaults",
    "http://127.0.0.1:5174/api/layout-defaults"
  ];
  for (const url of targets) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body
      });
      if (response.ok) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

async function bootStudio() {
  try {
    await loadCatalog();
    await initLayoutDefaults();
    state.regionId = canonicalRegion(state.regionId);
    state.contentId = canonicalContent(state.contentId);

  const studioBar = document.getElementById("studio-bar");
  const regionSelect = document.getElementById("region-select");
  const contentSelect = document.getElementById("content-select");
  const widthInput = document.getElementById("viewport-width");
  const heightInput = document.getElementById("viewport-height");
  const presetHost = document.getElementById("viewport-presets");
  const previewStage = document.getElementById("preview-stage");
  const frame = document.getElementById("signage-frame");
  const metricsEl = document.getElementById("preview-metrics");
  let viewScale = 1;

  try {
    const saved = JSON.parse(sessionStorage.getItem(VIEWPORT_STORE) || "null");
    if (saved?.width && saved?.height) state.viewport = readViewport(saved.width, saved.height);
    else state.viewport = readViewport(DEFAULT_STUDIO_VIEWPORT.width, DEFAULT_STUDIO_VIEWPORT.height);
  } catch {
    state.viewport = readViewport(DEFAULT_STUDIO_VIEWPORT.width, DEFAULT_STUDIO_VIEWPORT.height);
  }
  const layout = loadLayout(state.regionId, state.contentId, state.viewport.width, state.viewport.height);
  const UNDO_KEY = "led-weather-studio-undo-v1";
  const readUndoStack = () => {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(UNDO_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const captureStudioLayout = () => ({
    regionId: state.regionId,
    contentId: state.contentId,
    w: state.viewport.width,
    h: state.viewport.height,
    layout: {
      map: { ...layout.map },
      okinawa: { ...layout.okinawa },
      precipLegend: layout.precipLegend ? { ...layout.precipLegend } : null,
      cards: JSON.parse(JSON.stringify(layout.cards || {}))
    },
    cardScale: loadCardScale(state.contentId, state.regionId, state.viewport.width, state.viewport.height),
    titleScale: loadTitleScale(state.viewport.width, state.viewport.height, state.regionId, state.contentId)
  });
  const syncUndoButton = () => {
    const button = document.getElementById("layout-undo");
    if (button) button.disabled = readUndoStack().length === 0;
  };
  const pushUndo = () => {
    const stack = readUndoStack();
    stack.push(captureStudioLayout());
    sessionStorage.setItem(UNDO_KEY, JSON.stringify(stack.slice(-20)));
    syncUndoButton();
  };
  const applyUndo = () => {
    const stack = readUndoStack();
    const prev = stack.pop();
    if (!prev) return;
    sessionStorage.setItem(UNDO_KEY, JSON.stringify(stack));
    state.regionId = prev.regionId;
    state.contentId = prev.contentId;
    regionSelect.value = prev.regionId;
    contentSelect.value = prev.contentId;
    Object.assign(layout, {
      map: { ...prev.layout.map },
      okinawa: { ...prev.layout.okinawa },
      precipLegend: prev.layout.precipLegend ? { ...prev.layout.precipLegend } : layout.precipLegend,
      cards: { ...prev.layout.cards }
    });
    saveLayout(state.regionId, layout, state.contentId, prev.w, prev.h);
    if (Number.isFinite(prev.cardScale)) saveCardScale(state.contentId, prev.cardScale, state.regionId, prev.w, prev.h);
    if (Number.isFinite(prev.titleScale)) saveTitleScale(prev.titleScale, prev.w, prev.h, state.regionId, state.contentId);
    persistStudio();
    syncMapControls?.();
    syncCardScaleUi(prev.cardScale);
    syncTitleScaleUi(prev.titleScale);
    syncChrome();
    loadFrame();
    syncUndoButton();
  };
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
  };

  regionSelect.innerHTML = listRegions()
    .map((item) => `<option value="${item.id}">${item.name}</option>`)
    .join("");
  contentSelect.innerHTML = listContents()
    .map((item) => `<option value="${item.id}">${item.name}</option>`)
    .join("");
  regionSelect.value = getRegion(state.regionId).id;
  contentSelect.value = getContent(state.contentId).id;
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
    if (!/studio\.html$/i.test(next.pathname)) next.searchParams.set("studio", "1");
    next.searchParams.set("region", state.regionId);
    next.searchParams.set("content", state.contentId);
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
    const availH = Math.max(120, stageH - 32);
    viewScale = Math.min(1, availW / vp.width, availH / vp.height);
    if (!Number.isFinite(viewScale) || viewScale <= 0) viewScale = 0.2;
    document.documentElement.style.setProperty("--viewport-width", `${vp.width}px`);
    document.documentElement.style.setProperty("--viewport-height", `${vp.height}px`);
    document.documentElement.style.setProperty("--slot-width", `${Math.round(vp.width * viewScale)}px`);
    document.documentElement.style.setProperty("--slot-height", `${Math.round(vp.height * viewScale)}px`);
    document.documentElement.style.setProperty("--view-scale", String(viewScale));
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
      vh: state.viewport.height
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
    saveLayout(state.regionId, layout, state.contentId, w, h, { mapOnly: true });
    postToFrame({ type: "apply-map", map: layout.map, okinawa: layout.okinawa });
  });
  const cardScaleInput = document.getElementById("card-scale");
  const cardScaleOut = document.getElementById("card-scale-value");
  const cardSizePx = document.getElementById("card-size-px");
  const cardWidthInput = document.getElementById("card-width-px");
  const titleScaleInput = document.getElementById("title-scale");
  const titleScaleOut = document.getElementById("title-scale-value");
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
  const applyManualTitleScale = (scale) => {
    const next = Math.min(TITLE_SCALE_MAX, Math.max(TITLE_SCALE_MIN, Number(scale) || 1));
    const { w, h } = vpSize();
    saveTitleScale(next, w, h, state.regionId, state.contentId);
    syncTitleScaleUi(next);
    withFrameScreen((screenEl) => {
      applyTitleScale(screenEl, next);
      fitTitleBars(screenEl);
    });
    postToFrame({ type: "set-title-scale", scale: next });
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
    pushUndo();
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
    pushUndo();
    postToFrame({ type: "freeze-layout" });
  });
  document.getElementById("layout-undo")?.addEventListener("click", () => {
    applyUndo();
  });
  studioBar.addEventListener("pointerdown", (event) => {
    if (event.target.closest("#map-scale, #map-rotate, #map-x, #map-y, #title-scale, #card-scale, #card-width-px")) {
      pushUndo();
    }
  });
  syncTitleScaleUi();
  regionSelect.addEventListener("change", () => {
    const { w, h } = vpSize();
    saveLayout(state.regionId, layout, state.contentId, w, h, { mapOnly: true });
    state.regionId = regionSelect.value;
    reloadLayoutForViewport();
    persistStudio();
    syncCardScaleUi();
    syncTitleScaleUi();
    loadFrame();
  });
  contentSelect.addEventListener("change", () => {
    const { w, h } = vpSize();
    saveLayout(state.regionId, layout, state.contentId, w, h);
    state.contentId = contentSelect.value;
    reloadLayoutForViewport();
    persistStudio();
    syncCardScaleUi();
    syncTitleScaleUi();
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
      const live = readViewport(previewStage.clientWidth, previewStage.clientHeight);
      widthInput.value = String(live.width);
      heightInput.value = String(live.height);
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
      if (!studioBar.dataset.cardUndoLock) {
        studioBar.dataset.cardUndoLock = "1";
        pushUndo();
        window.setTimeout(() => {
          delete studioBar.dataset.cardUndoLock;
        }, 800);
      }
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
    if (event.data.type === "map" && event.data.map) {
      Object.assign(layout.map, event.data.map);
      if (event.data.okinawa) Object.assign(layout.okinawa, event.data.okinawa);
      if (event.data.precipLegend) layout.precipLegend = { ...event.data.precipLegend };
      const { w, h } = vpSize();
      saveLayout(state.regionId, layout, state.contentId, w, h);
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
      if (Number.isFinite(event.data.cardScale)) {
        saveCardScale(state.contentId, event.data.cardScale, state.regionId, w, h);
        syncCardScaleUi(event.data.cardScale);
      }
      if (Number.isFinite(event.data.titleScale)) {
        saveTitleScale(event.data.titleScale, w, h, state.regionId, state.contentId);
        syncTitleScaleUi(event.data.titleScale);
      }
      const currentSnap = snapshotLayoutDefaults(
        state.regionId,
        layout,
        state.contentId,
        w,
        h,
        event.data.cardScale,
        event.data.titleScale
      );
      const allSnap = snapshotAllLayoutDefaults();
      const snapshot = {
        rev: Math.max(Number(currentSnap.rev) || 0, Number(allSnap.rev) || 0, Date.now()),
        layouts: { ...(allSnap.layouts || {}), ...(currentSnap.layouts || {}) },
        cardScales: { ...(allSnap.cardScales || {}), ...(currentSnap.cardScales || {}) },
        titleScales: { ...(allSnap.titleScales || {}), ...(currentSnap.titleScales || {}) }
      };
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
          const prev = merged.layouts[regionId] || { viewports: {} };
          merged.layouts[regionId] = {
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
      postStudioSnapshot(snapshot).then(async (ok) => {
        if (!ok) throw new Error("save failed");
        setHint(`配置を固定しました（${w}x${h}）。この地域の今日/明日の天気・降水が同じ地図を使います。GitHub反映はコミット＆プッシュが必要です。`);
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
  syncUndoButton();
  contentSelect.addEventListener("change", syncChrome);
  loadFrame();
  postStudioSnapshot(snapshotAllLayoutDefaults()).catch(() => {});
  } finally {
    document.documentElement.classList.remove("is-boot");
  }
}

async function bootSignage() {
  document.documentElement.classList.remove("is-boot");
  const bootStatus = document.getElementById("boot-status");
  if (bootStatus) bootStatus.hidden = true;

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
  const layout = loadLayout(state.regionId, state.contentId, initialVp.width, initialVp.height);

  function paintKnownSync() {
    const regionMeta = REGION_MASTER[canonicalRegion(state.regionId)] || REGION_MASTER.national;
    const contentMeta = CONTENT_MASTER[canonicalContent(state.contentId)] || CONTENT_MASTER.today_weather;
    applyViewport(screen, initialVp, regionMeta.id, contentMeta, { fixedScale: useFixedScale });
    applyMapTransform(screen, layout);
    applyTitleScale(screen, loadTitleScale(initialVp.width, initialVp.height, regionMeta.id, contentMeta.id));
    titleEl.textContent = `${regionMeta.name}｜${contentMeta.name}`;
    document.title = titleEl.textContent;
    syncTitleMark(contentMeta);
    const cities = citiesForMaster(regionMeta.id).slice().sort((a, b) => (
      regionMeta.id === "national"
        ? ((Number(b.latitude) || 0) - (Number(a.latitude) || 0))
        : ((a.priority - b.priority) || String(a.cityId).localeCompare(String(b.cityId)))
    ));
    if (contentMeta.kind === "table") {
      const page = cities.slice(0, 4).map((city) => ({ cityId: city.cityId, cityName: city.cityName }));
      applyTableLayout(screen, initialVp, weeklyTableRows(page));
      stage.innerHTML = renderWeeklyTableSkeleton(page, contentMeta.id);
      return;
    }
    const layers = mountMapFrame(stage, regionMeta.id);
    const cardScale = loadCardScale("today_weather", regionMeta.id, initialVp.width, initialVp.height);
    applyCardScale(screen, cardScale);
    const cards = layout.cards || {};
    layers.cards.innerHTML = cities.map((city) => {
      const pos = cards[city.cityId] || { x: city.cardX, y: city.cardY, locked: true };
      return renderCityCardSkeleton(city, pos, { layout: contentMeta.card === "pop" ? "pop" : "pill" });
    }).join("");
    if (contentMeta.id === "today_precip" || contentMeta.id === "tomorrow_precip") {
      syncPrecipTodLegend(contentMeta, stage, layout, regionMeta.id, false);
    }
  }

  paintKnownSync();
  loadMapSvg().then((svg) => {
    fillMountedMap(stage, svg, state.regionId);
    applyMapTransform(screen, layout);
  }).catch(() => {});

  const layoutReady = initLayoutDefaults();

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
  const PLAYER_CONTENTS = ["today_weather", "today_precip", "tomorrow_weather", "tomorrow_precip", "weekly_weather", "weekly_precip"];
  const playerOn = !canEdit && params.get("loop") !== "0";
  const playerMs = Number(params.get("loop")) > 1000 ? Number(params.get("loop")) : 30000;
  const player = {
    cards: new Map(),
    tables: new Map(),
    meta: new Map(),
    layers: null,
    ready: false
  };
  let playerTimer = 0;

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
    const items = [...noteEl.querySelectorAll(".led-note-item")];
    if (!track || !items.length) return;
    const viewport = noteEl.clientWidth;
    items.forEach((item) => {
      item.style.paddingRight = "0px";
    });
    const textWidth = items[0].getBoundingClientRect().width;
    const gap = Math.max(viewport, Math.round(textWidth * 0.35), 96);
    items.forEach((item) => {
      item.style.paddingRight = `${gap}px`;
    });
    const distance = Math.max(1, textWidth + gap);
    track.style.setProperty("--ticker-distance", `${distance}px`);
    track.style.setProperty("--ticker-duration", `${Math.max(6, distance / 118).toFixed(2)}s`);
  }

  function setNoteTicker(text) {
    const next = String(text || "");
    if (noteEl.dataset.note === next && noteEl.querySelector(".led-note-track")) {
      layoutNoteTicker();
      return;
    }
    noteEl.dataset.note = next;
    if (next) noteEl.setAttribute("aria-label", next);
    else noteEl.removeAttribute("aria-label");
    noteEl.replaceChildren();
    if (!next) return;
    const track = document.createElement("div");
    track.className = "led-note-track";
    for (let i = 0; i < 2; i += 1) {
      const item = document.createElement("span");
      item.className = "led-note-item";
      item.innerHTML = formatNoteHtml(next);
      if (i > 0) item.setAttribute("aria-hidden", "true");
      track.append(item);
    }
    noteEl.append(track);
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

    // 解像度ごとの保存レイアウトを読み直す
    const savedLayout = loadLayout(region.id, content.id, vp.width, vp.height);
    layout.map = { ...savedLayout.map };
    layout.okinawa = { ...savedLayout.okinawa };
    layout.cards = { ...savedLayout.cards };
    layout.precipLegend = { ...savedLayout.precipLegend };

    try {
      const [attribution, locations, projection, weatherDoc] = await Promise.all([
        fetchJson("data/attribution.json"),
        fetchJson("data/locations.json"),
        fetchJson("data/map-projection.json"),
        loadWeatherDoc()
      ]);
      const weather = adaptWeather(weatherDoc);
      const stampIso = liveWeatherCache.at
        ? new Date(liveWeatherCache.at).toISOString()
        : weather.updatedAt;
      weatherStamp = stampIso;

      const candidates = aggregateRegion(locations.cities, weather, region);
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
          weather.pointsByCity.get(city.cityId) || emptyWeatherPoint(city.cityId),
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
      stampEl.textContent = formatStamp(stampIso, !showAuxiliary(vp, "stampWeek"));
      setNoteTicker(noteFor(content.id, region.id, weather, selected));
      attributionEl.textContent = attribution.text;
      attributionEl.hidden = content.kind !== "map" || !showAuxiliary(vp, "attribution");
      syncTitleMark(content);
      const weekPoints = content.id === "weekly_weather" ? paintWeekPoints(selected) : (hideWeekPoints(), null);
      applyTitleScale(screen, loadTitleScale(vp.width, vp.height, region.id, content.id));
      fitTitleBars(screen);
      layoutNoteTicker();
      if (canEdit && document.fonts?.ready) {
        document.fonts.ready.then(() => {
          fitTitleBars(screen);
          layoutNoteTicker();
        }).catch(() => {});
      }

      if (content.kind === "table") {
        applyTableLayout(screen, vp, weeklyTableRows(selected));
        delete stage.dataset.mapRegion;
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
      const layers = existingMapLayers(stage, region.id) || mountMap(stage, svgText, region.id);
      const pins = selected.map((city) => {
        const pos = projectCity(city, projection, region.id);
        return { ...city, ...pos };
      });
      const cardScale = loadCardScale(content.id, region.id, vp.width, vp.height);
      applyCardScale(screen, cardScale);
      // 今日/明日×天気/降水は地図・ボックス配置を共有（自動配置スロットも weather 側に統一）
      const variant = "weather";
      const baseSize = cardSizePct(vp, region.id, variant);
      const cardBox = { w: baseSize.w * cardScale, h: baseSize.h * cardScale };
      const laidOut = applyLockedCards(
        placeCardsAroundMap(pins, cardBox, region.id, variant),
        layout
      );

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
      assertRegionCoverage(region, candidates, laidOut);
      syncPrecipTodLegend(content, stage, layout, region.id, canEdit, () => {
        notifyStudio({
          type: "map",
          map: { ...layout.map },
          okinawa: { ...layout.okinawa },
          precipLegend: { ...layout.precipLegend }
        });
      });
      centerCityCards(layers.cards);
      fitCityCardNames(layers.cards);
      if (canEdit && document.fonts?.ready) {
        document.fonts.ready.then(() => {
          centerCityCards(layers.cards);
          fitCityCardNames(layers.cards);
        }).catch(() => {});
      }
      if (canEdit) {
        bindCardEditor(layers.cards, layout, region.id, content.id, (next, nextScale) => {
          notifyStudio({ type: "cards", cards: next, cardScale: nextScale ?? cardScale });
        }, screen);
        bindMapEditor(layers.fit, layout, () => {
          applyMapTransform(screen, layout);
          paintMapPins();
          const size = measure();
          saveLayout(region.id, layout, content.id, size.width, size.height, { mapOnly: true });
          notifyStudio({ type: "map", map: { ...layout.map }, okinawa: { ...layout.okinawa } });
        });
        bindOkinawaEditor(layers.okinawaDock, layout, () => {
          applyMapTransform(screen, layout);
          paintMapPins();
          const size = measure();
          saveLayout(region.id, layout, content.id, size.width, size.height, { mapOnly: true });
        });
        notifyStudio({ type: "cards", cards: listCardPositions(layers.cards), cardScale });
      }
      applyMapTransform(screen, layout);
      centerCityCards(layers.cards);
      paintMapPins();
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
    }
    if (event.data.type === "set-title-scale") {
      const scale = Number(event.data.scale);
      if (!Number.isFinite(scale)) return;
      const vp = measure();
      saveTitleScale(scale, vp.width, vp.height, state.regionId, state.contentId);
      applyTitleScale(screen, scale);
      fitTitleBars(screen);
      const table = screen.querySelector(".forecast-table");
      if (table) {
        applyTableLayout(screen, vp, Number(table.getAttribute("data-rows")) || weeklyTableRows([]));
      }
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
    new ResizeObserver(() => {
      window.clearTimeout(tickerLayoutTimer);
      tickerLayoutTimer = window.setTimeout(() => layoutNoteTicker(), 40);
    }).observe(noteEl);
  }

  function scheduleIconPhase() {
    window.clearTimeout(iconPhaseTimer);
    iconPhaseTimer = window.setTimeout(() => render(), msUntilIconPhaseChange());
  }

  persistView();
  async function loadPlayerPack() {
    const [attribution, locations, projection, weatherDoc] = await Promise.all([
      fetchJson("data/attribution.json"),
      fetchJson("data/locations.json"),
      fetchJson("data/map-projection.json"),
      loadWeatherDoc()
    ]);
    const weather = adaptWeather(weatherDoc);
    const stampIso = liveWeatherCache.at
      ? new Date(liveWeatherCache.at).toISOString()
      : weather.updatedAt;
    weatherStamp = stampIso;
    return { attribution, locations, projection, weather, stampIso };
  }

  function selectedFor(content, pack, pageIndex = 0) {
    const region = getRegion(state.regionId);
    const candidates = aggregateRegion(pack.locations.cities, pack.weather, region);
    const tablePages = content.kind === "table"
      ? partitionTablePages(candidates, tablePageSize(region.id))
      : [candidates.slice(0, cityLimit(measure(), region.id, content, candidates.length))];
    const page = tablePages[Math.min(pageIndex, Math.max(0, tablePages.length - 1))] || [];
    return page.map((city) => attachForecast(
      city,
      pack.weather.pointsByCity.get(city.cityId) || emptyWeatherPoint(city.cityId),
      content,
      pack.weather.updatedAt
    ));
  }

  async function chromeFor(content, pack, selected) {
    const region = getRegion(state.regionId);
    const noteWeather = content.kind === "table"
      ? pickNoteWeather(selected.flatMap((city) => city.weekly || [city]))
      : pickNoteWeather(selected);
    return {
      title: contentTitle(region, content),
      stamp: formatStamp(pack.stampIso, !showAuxiliary(measure(), "stampWeek")),
      note: noteFor(content.id, region.id, pack.weather, selected),
      noteClass: `wx-icon ${weatherTone(noteWeather)}`,
      noteIcon: await renderNoteIcon(noteWeather),
      kind: content.kind
    };
  }

  async function fillMapLayer(content, pack) {
    const region = getRegion(state.regionId);
    const vp = measure();
    const selected = selectedFor(content, pack);
    const pins = selected.map((city) => ({ ...city, ...projectCity(city, pack.projection, region.id) }));
    const cardScale = loadCardScale("today_weather", region.id, vp.width, vp.height);
    applyCardScale(screen, cardScale);
    const baseSize = cardSizePct(vp, region.id, "weather");
    const laidOut = applyLockedCards(
      placeCardsAroundMap(pins, { w: baseSize.w * cardScale, h: baseSize.h * cardScale }, region.id, "weather"),
      layout
    );
    const html = (await Promise.all(laidOut.map((item) => renderCityCard(item, item, {
      layout: content.card === "pop" ? "pop" : "pill",
      showPop: false
    })))).join("");
    return { html, laidOut, selected };
  }

  function showPlayerContent(contentId) {
    state.contentId = getContent(contentId).id;
    const content = getContent(state.contentId);
    const vp = measure();
    applyViewport(screen, vp, state.regionId, content, { fixedScale: useFixedScale });
    applyTitleScale(screen, loadTitleScale(vp.width, vp.height, state.regionId, content.id));
    const isTable = content.kind === "table";
    if (player.layers?.fit) player.layers.fit.hidden = isTable;
    for (const [id, el] of player.cards) el.hidden = isTable || id !== content.id;
    for (const [id, el] of player.tables) el.hidden = !isTable || id !== content.id;
    const legend = screen.querySelector(".precip-tod-legend");
    if (legend) legend.hidden = content.id !== "today_precip" && content.id !== "tomorrow_precip";
    attributionEl.hidden = isTable || !showAuxiliary(vp, "attribution");
    const meta = player.meta.get(content.id);
    if (meta) {
      titleEl.textContent = meta.title;
      document.title = meta.title;
      stampEl.textContent = meta.stamp;
      setNoteTicker(meta.note);
      noteIconEl.className = meta.noteClass;
      noteIconEl.innerHTML = meta.noteIcon;
    }
    syncTitleMark(content);
    fitTitleBars(screen);
    if (player.layers) applyMapTransform(screen, layout);
    if (content.id === "weekly_weather") {
      const wrap = player.tables.get(content.id);
      const first = wrap?.querySelector(".player-table-page:not([hidden])") || wrap?.querySelector(".player-table-page");
      /* week points stay as previously painted */
    } else {
      hideWeekPoints();
    }
    window.clearTimeout(tablePageTimer);
    if (isTable && !tableRotateOff) {
      const pages = [...(player.tables.get(content.id)?.querySelectorAll(".player-table-page") || [])];
      if (pages.length > 1) {
        tablePageTimer = window.setTimeout(() => {
          const cur = pages.findIndex((page) => !page.hidden);
          const next = (cur + 1 + pages.length) % pages.length;
          pages.forEach((page, idx) => { page.hidden = idx !== next; });
          showPlayerContent(content.id);
        }, TABLE_PAGE_MS);
      }
    }
    layoutNoteTicker();
  }

  async function preparePlayer(pack) {
    const region = getRegion(state.regionId);
    const vp = measure();
    applyViewport(screen, vp, region.id, getContent(state.contentId), { fixedScale: useFixedScale });
    const savedLayout = loadLayout(region.id, "today_weather", vp.width, vp.height);
    layout.map = { ...savedLayout.map };
    layout.okinawa = { ...savedLayout.okinawa };
    layout.cards = { ...savedLayout.cards };
    layout.precipLegend = { ...savedLayout.precipLegend };
    const svgText = await loadMapSvg(region.mapFile);
    player.layers = existingMapLayers(stage, region.id) || mountMap(stage, svgText, region.id);
    if (player.layers.cards) {
      player.layers.cards.dataset.defaultCards = "1";
      player.layers.cards.hidden = true;
    }
    applyMapTransform(screen, layout);
    attributionEl.textContent = pack.attribution.text;
    const weatherContent = getContent("today_weather");
    const mapBuilt = await fillMapLayer(weatherContent, pack);
    const pinOpts = { national: region.id === "national" };
    const visiblePins = mapBuilt.laidOut.filter((item) => !item.hidePin);
    const insetPins = player.layers.okinawaPins
      ? visiblePins.filter((item) => item.useOkinawaInset)
      : [];
    const mainPins = player.layers.okinawaPins
      ? visiblePins.filter((item) => !item.useOkinawaInset)
      : visiblePins;
    const paintMapPins = () => {
      const mainR = pinRadiusForViewBox(player.layers.pins, pinOpts);
      player.layers.pins.innerHTML = mainPins.map((item) => renderPin(item, mainR)).join("");
      if (player.layers.okinawaPins) {
        const okiSvg = player.layers.okinawaPins.ownerSVGElement || player.layers.okinawaPins;
        const okiR = pinRadiusForMatchingScreen(okiSvg, player.layers.pins, mainR);
        player.layers.okinawaPins.innerHTML = insetPins.map((item) => renderPin(item, okiR)).join("");
      }
    };
    paintMapPins();
    repaintPins = paintMapPins;
    for (const id of PLAYER_CONTENTS) {
      const content = getContent(id);
      if (content.kind === "table") {
        let wrap = player.tables.get(id);
        if (!wrap) {
          wrap = document.createElement("div");
          wrap.className = "player-table-panel";
          wrap.dataset.playerContent = id;
          wrap.hidden = true;
          stage.appendChild(wrap);
          player.tables.set(id, wrap);
        }
        wrap.replaceChildren();
        const candidates = aggregateRegion(pack.locations.cities, pack.weather, region);
        const pages = partitionTablePages(candidates, tablePageSize(region.id));
        for (let i = 0; i < pages.length; i += 1) {
          const selected = pages[i].map((city) => attachForecast(
            city,
            pack.weather.pointsByCity.get(city.cityId) || emptyWeatherPoint(city.cityId),
            content,
            pack.weather.updatedAt
          ));
          const page = document.createElement("div");
          page.className = "player-table-page";
          page.hidden = i !== 0;
          if (i === 0) applyTableLayout(screen, vp, weeklyTableRows(selected));
          page.innerHTML = await renderWeeklyTable(selected, id);
          wrap.appendChild(page);
        }
        const firstSelected = selectedFor(content, pack, 0);
        player.meta.set(id, await chromeFor(content, pack, firstSelected));
        continue;
      }
      const built = id === "today_weather" ? mapBuilt : await fillMapLayer(content, pack);
      let layer = player.cards.get(id);
      if (!layer) {
        layer = document.createElement("div");
        layer.className = "map-cards";
        layer.dataset.playerContent = id;
        layer.hidden = true;
        player.layers.fit.appendChild(layer);
        player.cards.set(id, layer);
      }
      layer.innerHTML = built.html;
      centerCityCards(layer);
      fitCityCardNames(layer);
      player.meta.set(id, await chromeFor(content, pack, built.selected));
    }
    syncPrecipTodLegend(getContent("today_precip"), stage, layout, region.id, false);
    player.ready = true;
    showPlayerContent(state.contentId);
  }

  try {
    await loadCatalog();
    state.regionId = getRegion(state.regionId).id;
    state.contentId = getContent(state.contentId).id;
    if (!hasLocalLayouts()) await layoutReady;
    else layoutReady.catch(() => {});
    if (playerOn) {
      const pack = await loadPlayerPack();
      await preparePlayer(pack);
    } else {
      await render();
    }
  } finally {
    document.documentElement.classList.remove("is-boot");
  }
  unregisterSignageWorkers();
  if (playerOn) {
    window.clearInterval(playerTimer);
    playerTimer = window.setInterval(() => {
      if (!player.ready) return;
      const idx = Math.max(0, PLAYER_CONTENTS.indexOf(state.contentId));
      showPlayerContent(PLAYER_CONTENTS[(idx + 1) % PLAYER_CONTENTS.length]);
    }, playerMs);
  }
  const refreshLive = () => pullLiveWeatherAndRender(async () => {
    if (playerOn && player.ready) {
      const pack = await loadPlayerPack();
      await preparePlayer(pack);
      return;
    }
    await render();
  });
  window.setTimeout(refreshLive, 4000);
  scheduleJmaRefresh(refreshLive);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && needsJmaRefresh()) {
      refreshLive();
    }
  });
}

function attachForecast(city, todayPoint, content, updatedAt) {
  const forecast = expandForecast({ ...todayPoint, cityId: city.cityId }, updatedAt);
  const missing = Boolean(todayPoint?.missing);
  if (content.id === "tomorrow_weather") {
    return { ...city, ...todayPoint, ...forecast.tomorrow, weekly: forecast.weekly, missing };
  }
  if (content.id === "tomorrow_precip") {
    return { ...city, ...todayPoint, ...forecast.tomorrow, ...forecast.tomorrowPeriods, weekly: forecast.weekly, missing };
  }
  if (content.id === "today_precip" || content.id === "weekly_precip") {
    return { ...city, ...todayPoint, ...forecast.periods, weekly: forecast.weekly, missing };
  }
  return { ...city, ...todayPoint, weekly: forecast.weekly, missing };
}

/** 週間表の1ページ都市数。全国・北海道・中部・近畿・関東・九州は4都市ずつ（九州7地点は 4+3）。 */
function tablePageSize(regionId) {
  const id = String(regionId || "").toLowerCase();
  if (id === "national" || id === "hokkaido" || id === "chubu" || id === "kinki" || id === "kanto" || id === "kyushu") return 4;
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

/** ????????????? */
function syncPrecipTodLegend(content, stage, layout, regionId, canEdit, onLegendChange) {
  const host = stage?.closest(".led-body") || document.querySelector(".led-body");
  if (!host) return;
  host.querySelectorAll(".precip-tod-legend").forEach((node) => node.remove());
  const show = content.id === "today_precip" || content.id === "tomorrow_precip";
  if (!show) return;
  host.insertAdjacentHTML("beforeend", renderPrecipTodLegend());
  if (layout) applyPrecipLegend(host, layout);
  if (canEdit && layout && regionId) {
    bindPrecipLegendEditor(layout, regionId, content.id, onLegendChange);
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
  jmaRefreshTimer = window.setTimeout(async () => {
    try {
      await onRefresh();
    } finally {
      scheduleJmaRefresh(onRefresh);
    }
  }, msUntilNextRefresh());
}

async function pullLiveWeatherAndRender(renderFn) {
  if (livePullInFlight) return livePullInFlight;
  livePullInFlight = (async () => {
    try {
      const locations = await fetchJson("data/locations.json");
      const cities = (locations.cities || []).filter((city) => {
        if (state.regionId === "national") return city.showOnNational !== false && city.showOnNational;
        return city.regionId === state.regionId;
      });
      const live = await withTimeout(fetchJmaWeather(cities.length ? cities : locations.cities), LIVE_FETCH_TIMEOUT_MS);
      if (!isWeatherDoc(live)) return;
      const at = Date.now();
      const merged = mergeWeatherDocs(liveWeatherCache.doc, live);
      liveWeatherCache = { at, doc: merged };
      writeWeatherLkg(merged, at);
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
  if (isWeatherDoc(liveWeatherCache.doc)) return liveWeatherCache.doc;
  const lkg = readWeatherLkg();
  if (lkg) {
    liveWeatherCache = lkg;
    return lkg.doc;
  }
  if (!bundledWeatherDoc) {
    bundledWeatherDoc = await fetchJson("data/weather.json");
  }
  return bundledWeatherDoc;
}

function keepPop(next, prev) {
  return Number.isFinite(Number(next)) ? Number(next) : (Number.isFinite(Number(prev)) ? Number(prev) : next);
}

function mergeWeatherDocs(base, live) {
  if (!isWeatherDoc(live)) return base;
  if (!isWeatherDoc(base)) return live;
  const prevById = new Map((base.points || []).map((point) => [point.cityId, point]));
  const byId = new Map((base.points || []).map((point) => [point.cityId, point]));
  for (const point of live.points) {
    const prev = prevById.get(point.cityId);
    if (!prev) {
      byId.set(point.cityId, point);
      continue;
    }
    const weekly = (point.weekly || []).map((day, index) => {
      const before = prev.weekly?.[index];
      if (!day || !before) return day;
      return {
        ...day,
        popAm: keepPop(day.popAm, before.popAm),
        popPm: keepPop(day.popPm, before.popPm)
      };
    });
    byId.set(point.cityId, {
      ...point,
      morning: keepPop(point.morning, prev.morning),
      noon: keepPop(point.noon, prev.noon),
      tomorrow: {
        ...(point.tomorrow || {}),
        morning: keepPop(point.tomorrow?.morning, prev.tomorrow?.morning),
        noon: keepPop(point.tomorrow?.noon, prev.tomorrow?.noon)
      },
      weekly
    });
  }
  return {
    ...base,
    ...live,
    points: [...byId.values()],
    notes: { ...(base.notes || {}), ...(live.notes || {}) }
  };
}

function unregisterSignageWorkers() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.getRegistrations()
    .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
    .catch(() => {});
  if (typeof caches === "undefined") return;
  caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))).catch(() => {});
}

const jsonCache = new Map();

async function fetchJson(url) {
  if (jsonCache.has(url)) return jsonCache.get(url);
  const pending = fetch(`${url}?v=${DATA_VERSION}`, { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`${url} fetch failed`);
      return response.json();
    })
    .catch((error) => {
      jsonCache.delete(url);
      throw error;
    });
  jsonCache.set(url, pending);
  return pending;
}
