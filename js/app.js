/**
 * 本番サイネージと管理プレビューは同じ HTML / 同じレンダラー。
 * 管理画面は本番URLを iframe の実viewportで開く。
 */

import { APP_VERSION, DATA_VERSION, MAP_VERSION } from "./version.js?v=pref196";
import {
  canonicalContent,
  canonicalRegion,
  contentTitle,
  getContent,
  getRegion,
  listContents,
  listRegions,
  loadCatalog
} from "./catalog.js?v=pref194";
import { adaptWeather, aggregateRegion } from "./weather-data.js?v=pref194";
import { loadMapSvg, mountMap, placeCardsAroundMap, projectCity } from "./map-renderer.js?v=pref203";
import { formatStamp, renderCityCard, renderPin, pickNoteWeather, weatherTone, renderNoteIcon } from "./weather-renderer.js?v=pref185";
import { applyCardScale, applyLockedCards, applyMapTransform, bindCardEditor, bindMapControls, bindMapEditor, bindOkinawaEditor, CARD_POS_MAX, CARD_POS_MIN, CARD_SCALE_MAX, CARD_SCALE_MIN, centerCityCards, listCardPositions, loadCardScale, loadLayout, moveLockedCard, resetCardScale, resetLayout, saveCardScale, saveLayout } from "./studio-layout.js?v=pref203";
import { expandForecast, noteFor } from "./forecast.js?v=pref174";
import { renderWeeklyTable } from "./table-renderer.js?v=pref174";
import {
  VIEWPORT_PRESETS,
  applyViewport,
  cardBoxPx,
  cardSizePct,
  cityLimit,
  fitTitleBars,
  readViewport,
  showAuxiliary
} from "./viewport.js?v=pref193";

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
  return next.pathname + next.search;
}

async function bootStudio() {
  await loadCatalog();
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
  const layout = loadLayout(state.regionId, state.contentId);
  let viewScale = 1;

  try {
    const saved = JSON.parse(sessionStorage.getItem(VIEWPORT_STORE) || "null");
    if (saved?.width && saved?.height) state.viewport = readViewport(saved.width, saved.height);
    else state.viewport = readViewport(576, 432);
  } catch {
    state.viewport = readViewport(576, 432);
  }

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
    metricsEl.textContent = `${contentTitle(region, content)} / ${vp.width}×${vp.height} / 表示 ${viewScale.toFixed(2)} / ${productionUrl(state.regionId, state.contentId)}`;
  };

  const loadFrame = () => {
    if (getContent(state.contentId).kind !== "map") fillCardEditors([]);
    frame.src = productionUrl(state.regionId, state.contentId, {
      edit: true,
      debug: isDebug,
      site: params.get("site")
    });
    fitFrame();
  };

  studioBar.addEventListener("submit", (event) => event.preventDefault());
  bindMapControls(studioBar, layout, () => {
    saveLayout(state.regionId, layout, state.contentId);
    postToFrame({ type: "apply-map", map: layout.map, okinawa: layout.okinawa });
  });
  const cardScaleInput = document.getElementById("card-scale");
  const cardScaleOut = document.getElementById("card-scale-value");
  const cardSizePx = document.getElementById("card-size-px");
  const cardWidthInput = document.getElementById("card-width-px");
  const cardVariant = () => (getContent(state.contentId).card === "pop" ? "pop" : "weather");
  const applyManualCardScale = (scale) => {
    const next = Math.min(CARD_SCALE_MAX, Math.max(CARD_SCALE_MIN, Number(scale) || 1));
    saveCardScale(state.contentId, next);
    syncCardScaleUi(next);
    postToFrame({ type: "set-card-scale", scale: next });
  };
  const syncCardScaleUi = (scale) => {
    const next = Number.isFinite(scale)
      ? scale
      : loadCardScale(state.contentId);
    const box = cardBoxPx(state.viewport, cardVariant());
    const width = Math.round(box.w * next);
    const height = Math.round(box.h * next);
    if (cardScaleInput && document.activeElement !== cardScaleInput) {
      cardScaleInput.value = String(next);
    }
    if (cardScaleOut) cardScaleOut.textContent = Number(next).toFixed(2);
    if (cardSizePx) cardSizePx.textContent = `${width}×${height}`;
    if (cardWidthInput && document.activeElement !== cardWidthInput) {
      cardWidthInput.value = String(width);
    }
  };
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
    const next = resetLayout(state.regionId, state.contentId);
    layout.map = next.map;
    layout.okinawa = next.okinawa;
    layout.cards = next.cards;
    syncCardScaleUi(resetCardScale(state.contentId));
    loadFrame();
  });
  regionSelect.addEventListener("change", () => {
    state.regionId = regionSelect.value;
    persistStudio();
    loadFrame();
  });
  contentSelect.addEventListener("change", () => {
    state.contentId = contentSelect.value;
    persistStudio();
    syncCardScaleUi();
    loadFrame();
  });
  const onSize = () => {
    saveViewport();
    fitFrame();
    syncCardScaleUi();
  };
  widthInput.addEventListener("change", onSize);
  heightInput.addEventListener("change", onSize);
  widthInput.addEventListener("input", onSize);
  heightInput.addEventListener("input", onSize);
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
    onSize();
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
        <input data-city="${item.cityId}" data-axis="x" type="number" min="${CARD_POS_MIN}" max="${CARD_POS_MAX}" step="0.5" value="${item.x.toFixed(1)}" aria-label="${item.cityName} 左右">
        <input data-city="${item.cityId}" data-axis="y" type="number" min="${CARD_POS_MIN}" max="${CARD_POS_MAX}" step="0.5" value="${item.y.toFixed(1)}" aria-label="${item.cityName} 上下">
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
      if (Number.isFinite(event.data.cardScale)) syncCardScaleUi(event.data.cardScale);
    }
  });

  persistStudio();
  syncChrome();
  syncCardScaleUi();
  contentSelect.addEventListener("change", syncChrome);
  loadFrame();
}

async function bootSignage() {
  await loadCatalog();
  state.regionId = getRegion(state.regionId).id;
  state.contentId = getContent(state.contentId).id;

  const screen = document.getElementById("led-screen");
  const stage = document.getElementById("map-stage");
  const titleEl = document.getElementById("led-title");
  const stampEl = document.getElementById("led-stamp");
  const noteEl = document.getElementById("led-note");
  const noteIconEl = document.getElementById("led-note-icon");
  const attributionEl = document.getElementById("map-attribution");
  const layout = loadLayout(state.regionId, state.contentId);
  let renderTimer = 0;
  let weatherStamp = "";
  let cardsLayer = null;

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
    window.history.replaceState({}, "", next);
  };

  const measure = () => readViewport(
    window.innerWidth || document.documentElement.clientWidth,
    window.innerHeight || document.documentElement.clientHeight
  );

  async function render() {
    const region = getRegion(state.regionId);
    const content = getContent(state.contentId);
    const vp = measure();
    state.viewport = vp;
    applyViewport(screen, vp, region.id, content);

    try {
      const [attribution, locations, weatherDoc, projection] = await Promise.all([
        fetchJson("data/attribution.json"),
        fetchJson("data/locations.json"),
        fetchJson("data/weather.json"),
        fetchJson("data/map-projection.json")
      ]);
      const weather = adaptWeather(weatherDoc);
      weatherStamp = weather.updatedAt;

      const candidates = aggregateRegion(locations.cities, weather, region);
      const selected = candidates
        .slice(0, cityLimit(vp, region.id, content, candidates.length))
        .map((city) => attachForecast(city, weather.pointsByCity.get(city.cityId), content, weather.updatedAt));

      titleEl.textContent = contentTitle(region, content);
      document.title = contentTitle(region, content);
      stampEl.textContent = formatStamp(weather.updatedAt, !showAuxiliary(vp, "stampWeek"));
      noteEl.textContent = noteFor(content.id, region.id, weather, selected);
      attributionEl.textContent = attribution.text;
      attributionEl.hidden = content.kind !== "map" || !showAuxiliary(vp, "attribution");
      syncTitleMark(content);
      fitTitleBars(screen);
      if (document.fonts?.ready) {
        document.fonts.ready.then(() => fitTitleBars(screen)).catch(() => {});
      }

      if (content.kind === "table") {
        stage.innerHTML = await renderWeeklyTable(selected, content.id);
        const noteWeather = pickNoteWeather(selected.flatMap((city) => city.weekly || [city]));
        noteIconEl.className = `wx-icon ${weatherTone(noteWeather)}`;
        noteIconEl.innerHTML = renderNoteIcon(noteWeather);
        lastError = "ok";
        updateDebug(vp, region, content, weatherStamp);
        recordSite();
        return;
      }

      const svgText = await loadMapSvg(region.mapFile);
      const layers = mountMap(stage, svgText, region.id);
      const pins = selected.map((city) => {
        const pos = projectCity(city, projection, region.id);
        return { ...city, ...pos };
      });
      const cardScale = loadCardScale(content.id);
      applyCardScale(screen, cardScale);
      const variant = content.card === "pop" ? "pop" : "weather";
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

      const noteWeather = pickNoteWeather(laidOut);
      noteIconEl.className = `wx-icon ${weatherTone(noteWeather)}`;
      noteIconEl.innerHTML = renderNoteIcon(noteWeather);
      layers.leaders.innerHTML = "";
      const visiblePins = laidOut.filter((item) => !item.hidePin);
      const insetPins = layers.okinawaPins
        ? visiblePins.filter((item) => item.useOkinawaInset)
        : [];
      const mainPins = layers.okinawaPins
        ? visiblePins.filter((item) => !item.useOkinawaInset)
        : visiblePins;
      layers.pins.innerHTML = mainPins.map((item) => renderPin(item)).join("");
      if (layers.okinawaPins) {
        layers.okinawaPins.innerHTML = insetPins.map((item) => renderPin(item)).join("");
      }
      const cards = await Promise.all(laidOut.map((item) => renderCityCard(item, item, {
        layout: content.card === "pop" ? "pop" : "pill",
        showPop: content.id === "today_weather" && region.id === "national" && showAuxiliary(vp, "pop")
      })));
      layers.cards.innerHTML = cards.join("");
      cardsLayer = layers.cards;
      centerCityCards(layers.cards);
      if (document.fonts?.ready) {
        await document.fonts.ready.catch(() => {});
        centerCityCards(layers.cards);
      }
      if (canEdit) {
        bindCardEditor(layers.cards, layout, region.id, content.id, (next, nextScale) => {
          notifyStudio({ type: "cards", cards: next, cardScale: nextScale ?? cardScale });
        }, screen);
        bindMapEditor(layers.fit, layout, () => {
          applyMapTransform(screen, layout);
          saveLayout(region.id, layout, content.id);
        });
        bindOkinawaEditor(layers.okinawaDock, layout, () => {
          applyMapTransform(screen, layout);
          saveLayout(region.id, layout, content.id);
        });
        notifyStudio({ type: "cards", cards: listCardPositions(layers.cards), cardScale });
      }
      applyMapTransform(screen, layout);
      lastError = "ok";
      updateDebug(vp, region, content, weatherStamp);
      recordSite();
    } catch (error) {
      lastError = error?.message || String(error);
      console.error(error);
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
      saveCardScale(state.contentId, scale);
      applyCardScale(screen, scale);
      centerCityCards(cardsLayer);
    }
  });

  window.addEventListener("resize", () => {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(() => render(), 80);
  });

  persistView();
  if (document.fonts?.ready) await document.fonts.ready.catch(() => {});
  await render();
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

async function fetchJson(url) {
  const response = await fetch(`${url}?v=${DATA_VERSION}`);
  if (!response.ok) throw new Error(`${url} を読み込めません`);
  return response.json();
}
