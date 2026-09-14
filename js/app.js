/**
 * Studio / signage bootstrap. Studio drives the iframe viewport.
 */

import { APP_VERSION, DATA_VERSION, MAP_VERSION } from "./version.js?v=pref350";
import {
  canonicalContent,
  canonicalRegion,
  contentTitle,
  getContent,
  getRegion,
  listContents,
  listRegions,
  loadCatalog
} from "./catalog.js?v=pref350";
import { adaptWeather, aggregateRegion } from "./weather-data.js?v=pref350";
import { loadMapSvg, mountMap, placeCardsAroundMap, projectCity } from "./map-renderer.js?v=pref350";
import { formatStamp, renderCityCard, renderPin, pinRadiusForViewBox, pinRadiusForMatchingScreen, pickNoteWeather, weatherTone, renderNoteIcon, renderPrecipTodLegend } from "./weather-renderer.js?v=pref350";
import { applyCardScale, applyLockedCards, applyMapTransform, applyPrecipLegend, applyTitleScale, bindCardEditor, bindMapControls, bindMapEditor, bindOkinawaEditor, bindPrecipLegendEditor, CARD_POS_MAX, CARD_POS_MIN, CARD_SCALE_MAX, CARD_SCALE_MIN, TITLE_SCALE_MAX, TITLE_SCALE_MIN, centerCityCards, containMapInStage, freezeCardLayout, initLayoutDefaults, isCustomLayout, listCardPositions, loadCardScale, loadLayout, loadTitleScale, moveLockedCard, resetCardScale, resetLayout, resetTitleScale, saveCardScale, saveLayout, saveTitleScale, snapshotLayoutDefaults } from "./studio-layout.js?v=pref350";
import { expandForecast, formatNoteHtml, noteFor } from "./forecast.js?v=pref350";
import { renderWeeklyTable } from "./table-renderer.js?v=pref350";
import {
  VIEWPORT_PRESETS,
  applyViewport,
  cardBoxPx,
  cardSizePct,
  cityLimit,
  fitTitleBars,
  fitCityCardNames,
  readViewport,
  showAuxiliary
} from "./viewport.js?v=pref350";
import { msUntilIconPhaseChange } from "./jma-icons.js?v=pref350";
import { fetchJmaWeather } from "./jma-live.js?v=pref350";
import { buildWeekPoints, fetchWeekAlert, renderWeekPointsHtml } from "./week-points.js?v=pref350";

const LIVE_WEATHER_TTL_MS = 10 * 60 * 1000;
let liveWeatherCache = { at: 0, doc: null };

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

export { APP_VERSION };

const VIEWPORT_STORE = "led-signage-viewport";
const SITE_STORE = "led-signage-site";

const params = new URLSearchParams(window.location.search);
const isStudio = params.get("studio") === "1";
const isDebug = params.get("debug") === "1";
const canEdit = params.get("edit") === "1";

const state = {
  regionId: canonicalRegion(params.get("region")),
  contentId: canonicalContent(params.get("content")),
  viewport: readViewport(window.innerWidth, window.innerHeight)
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

if (isStudio) bootStudio();
else bootSignage();

function productionUrl(regionId, contentId, extra = {}) {
  const next = new URL(window.location.href);
  const path = next.pathname === "/view" ? "/view" : next.pathname;
  next.pathname = path;
  next.search = "";
  next.searchParams.set("region", canonicalRegion(regionId));
  next.searchParams.set("content", canonicalContent(contentId));
  if (extra.edit) next.searchParams.set("edit", "1");
  if (extra.debug) next.searchParams.set("debug", "1");
  if (extra.site) next.searchParams.set("site", extra.site);
  if (extra.vw) next.searchParams.set("vw", String(extra.vw));
  if (extra.vh) next.searchParams.set("vh", String(extra.vh));
  return next.pathname + next.search;
}

async function bootStudio() {
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
    else state.viewport = readViewport(576, 432);
  } catch {
    state.viewport = readViewport(576, 432);
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
    next.searchParams.set("studio", "1");
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
    const availW = Math.max(120, previewStage.clientWidth - 32);
    const availH = Math.max(120, previewStage.clientHeight - 32);
    viewScale = Math.min(1, availW / vp.width, availH / vp.height);
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
    saveLayout(state.regionId, layout, state.contentId, w, h);
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
    const next = Number.isFinite(scale) ? scale : loadTitleScale(w, h, state.regionId);
    if (titleScaleInput && document.activeElement !== titleScaleInput) {
      titleScaleInput.value = String(next);
    }
    if (titleScaleOut) titleScaleOut.textContent = Number(next).toFixed(2);
  };
  const applyManualTitleScale = (scale) => {
    const next = Math.min(TITLE_SCALE_MAX, Math.max(TITLE_SCALE_MIN, Number(scale) || 1));
    const { w, h } = vpSize();
    saveTitleScale(next, w, h, state.regionId);
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
    const { w, h } = vpSize();
    const next = resetLayout(state.regionId, state.contentId, w, h);
    layout.map = next.map;
    layout.okinawa = next.okinawa;
    layout.cards = next.cards;
    layout.precipLegend = next.precipLegend;
    syncCardScaleUi(resetCardScale(state.contentId, state.regionId, w, h));
    syncTitleScaleUi(resetTitleScale(w, h, state.regionId));
    syncMapControls();
    loadFrame();
  });
  document.getElementById("layout-commit")?.addEventListener("click", () => {
    postToFrame({ type: "freeze-layout" });
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
  contentSelect.addEventListener("change", () => {
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
      if (Number.isFinite(event.data.cardScale)) {
        saveCardScale(state.contentId, event.data.cardScale, state.regionId, w, h);
        syncCardScaleUi(event.data.cardScale);
      }
      if (Number.isFinite(event.data.titleScale)) {
        saveTitleScale(event.data.titleScale, w, h, state.regionId);
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
  contentSelect.addEventListener("change", syncChrome);
  loadFrame();
}

async function bootSignage() {
  window.setTimeout(() => document.documentElement.classList.remove("is-boot"), 6000);
  await loadCatalog();
  await initLayoutDefaults();
  state.regionId = getRegion(state.regionId).id;
  state.contentId = getContent(state.contentId).id;

  const screen = document.getElementById("led-screen");
  const stage = document.getElementById("map-stage");
  const titleEl = document.getElementById("led-title");
  const stampEl = document.getElementById("led-stamp");
  const noteEl = document.getElementById("led-note");
  const noteIconEl = document.getElementById("led-note-icon");
  const attributionEl = document.getElementById("map-attribution");
  const measure = () => {
    const fromW = Number(params.get("vw"));
    const fromH = Number(params.get("vh"));
    if (fromW > 0 && fromH > 0) return readViewport(fromW, fromH);
    return readViewport(
      window.innerWidth || document.documentElement.clientWidth,
      window.innerHeight || document.documentElement.clientHeight
    );
  };
  const initialVp = measure();
  state.viewport = initialVp;
  const layout = loadLayout(state.regionId, state.contentId, initialVp.width, initialVp.height);
  let renderTimer = 0;
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
    track.style.setProperty("--ticker-duration", `${Math.max(10, distance / 68).toFixed(2)}s`);
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
    applyViewport(screen, vp, region.id, content);
    if (content.id !== "weekly_weather") hideWeekPoints();

    // 解像度ごとの保存レイアウトを読み直す
    const savedLayout = loadLayout(region.id, content.id, vp.width, vp.height);
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

      const candidates = aggregateRegion(locations.cities, weather, region);
      const pageSize = cityLimit(vp, region.id, content, candidates.length);
      const pageKey = `${region.id}:${content.id}:${pageSize}`;
      if (pageKey !== tablePageKey) {
        tablePageKey = pageKey;
        tablePageIndex = 0;
      }
      const pageCount = Math.max(1, Math.ceil(Math.max(1, candidates.length) / Math.max(1, pageSize)));
      if (tablePageIndex >= pageCount) tablePageIndex = 0;
      const pageStart = content.kind === "table" ? tablePageIndex * pageSize : 0;
      const pageCities = content.kind === "table"
        ? candidates.slice(pageStart, pageStart + pageSize)
        : candidates.slice(0, pageSize);
      const selected = pageCities
        .map((city) => attachForecast(city, weather.pointsByCity.get(city.cityId), content, weather.updatedAt));

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
      applyTitleScale(screen, loadTitleScale(vp.width, vp.height, region.id));
      fitTitleBars(screen);
      layoutNoteTicker();
      if (document.fonts?.ready) {
        document.fonts.ready.then(() => {
          fitTitleBars(screen);
          layoutNoteTicker();
        }).catch(() => {});
      }

      if (content.kind === "table") {
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
      const layers = mountMap(stage, svgText, region.id);
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
      if (freezeCardLayout(laidOut, layout, {
        force: Math.abs((cardScale || 1) - 1) > 0.01 || isCustomLayout(layout)
      })) {
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
      const custom = isCustomLayout(layout);
      if (!custom) {
        containMapInStage(screen, layout, { recenter: true });
        paintMapPins();
      } else {
        paintMapPins();
      }
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
      if (!isCustomLayout(layout)) {
        containMapInStage(screen, layout, { recenter: false });
      }
    }
    if (event.data.type === "set-title-scale") {
      const scale = Number(event.data.scale);
      if (!Number.isFinite(scale)) return;
      const vp = measure();
      saveTitleScale(scale, vp.width, vp.height, state.regionId);
      applyTitleScale(screen, scale);
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
      const titleScale = loadTitleScale(vp.width, vp.height, state.regionId);
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
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(() => render(), 80);
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
  try {
    await render();
  } finally {
    document.documentElement.classList.remove("is-boot");
  }
  window.setInterval(() => {
    liveWeatherCache = { at: 0, doc: null };
    render();
  }, LIVE_WEATHER_TTL_MS);
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
function syncPrecipTodLegend(content, stage, layout, regionId, canEdit) {
  const host = stage?.closest(".led-body") || document.querySelector(".led-body");
  if (!host) return;
  host.querySelectorAll(".precip-tod-legend").forEach((node) => node.remove());
  const show = content.id === "today_precip" || content.id === "tomorrow_precip";
  if (!show) return;
  host.insertAdjacentHTML("beforeend", renderPrecipTodLegend());
  if (layout) applyPrecipLegend(host, layout);
  if (canEdit && layout && regionId) {
    bindPrecipLegendEditor(layout, regionId, content.id);
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

async function loadWeatherDoc(locations) {
  const now = Date.now();
  if (liveWeatherCache.doc && now - liveWeatherCache.at < LIVE_WEATHER_TTL_MS) {
    return liveWeatherCache.doc;
  }
  try {
    const live = await withTimeout(fetchJmaWeather(locations.cities), 8000);
    liveWeatherCache = { at: now, doc: live };
    return live;
  } catch {
    return fetchJson("data/weather.json");
  }
}

async function fetchJson(url) {
  const response = await fetch(`${url}?v=${DATA_VERSION}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} fetch failed`);
  return response.json();
}
