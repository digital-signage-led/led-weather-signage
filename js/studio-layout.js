/**
 * スタジオ用の配置編集。
 * 列島はドラッグで移動、ホイール／ハンドルで拡大。
 * カードはドラッグで移動。大きさは解像度に合わせて自動、倍率は全市・全解像度で共通。
 * 地域ごとに localStorage へ残す。
 */

import { canonicalContent, canonicalRegion, isNational } from "./catalog.js?v=pref174";

const STORAGE_KEY = "led-weather-layout-v3";
const CARD_SIZE_KEY = "led-weather-card-size-v2";
export const CARD_SCALE_MIN = 0.5;
export const CARD_SCALE_MAX = 3;
export const CARD_POS_MIN = -40;
export const CARD_POS_MAX = 140;

function emptyLayout(regionId = "national") {
  regionId = canonicalRegion(regionId);
  return {
    map: isNational(regionId)
      ? { scale: 1.12, rotate: 0, x: 2, y: 0 }
      : { scale: 1, rotate: 0, x: 0, y: 0 },
    okinawa: { x: 20, y: 38, scale: 1 },
    cards: {}
  };
}

function cardBucket(contentId = "today_weather") {
  const id = canonicalContent(contentId);
  return id === "today_precip" || id === "tomorrow_precip" ? "cardsPop" : "cards";
}

function layoutStoreKeys(regionId) {
  const id = canonicalRegion(regionId);
  return [id, id.toUpperCase(), id === "chubu" ? "HOKURIKU" : "", id === "chubu" ? "TOKAI" : ""]
    .filter(Boolean);
}

export function loadLayout(regionId, contentId = "today_weather") {
  regionId = canonicalRegion(regionId);
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const saved = layoutStoreKeys(regionId).map((key) => all[key]).find(Boolean);
    if (!saved) return emptyLayout(regionId);
    return {
      map: { ...emptyLayout(regionId).map, ...saved.map },
      okinawa: { ...emptyLayout(regionId).okinawa, ...saved.okinawa },
      cards: { ...(saved[cardBucket(contentId)] || {}) }
    };
  } catch {
    return emptyLayout(regionId);
  }
}

export function saveLayout(regionId, layout, contentId = "today_weather") {
  regionId = canonicalRegion(regionId);
  const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  const prev = layoutStoreKeys(regionId).map((key) => all[key]).find(Boolean) || {};
  all[regionId] = {
    map: layout.map,
    okinawa: layout.okinawa,
    cards: prev.cards || {},
    cardsPop: prev.cardsPop || {},
    [cardBucket(contentId)]: layout.cards
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

export function viewportSizeKey(width, height) {
  return `${Math.round(Number(width) || 0)}x${Math.round(Number(height) || 0)}`;
}

function cardScaleVariant(contentId = "today_weather") {
  return cardBucket(contentId) === "cardsPop" ? "pop" : "weather";
}

export function loadCardScale(contentId = "today_weather") {
  try {
    const all = JSON.parse(localStorage.getItem(CARD_SIZE_KEY) || "{}");
    return clamp(Number(all[cardScaleVariant(contentId)]) || 1, CARD_SCALE_MIN, CARD_SCALE_MAX);
  } catch {
    return 1;
  }
}

export function saveCardScale(contentId, scale) {
  const variant = cardScaleVariant(contentId);
  const all = JSON.parse(localStorage.getItem(CARD_SIZE_KEY) || "{}");
  all[variant] = clamp(scale, CARD_SCALE_MIN, CARD_SCALE_MAX);
  localStorage.setItem(CARD_SIZE_KEY, JSON.stringify(all));
}

export function resetCardScale(contentId = "today_weather") {
  saveCardScale(contentId, 1);
  return 1;
}

export function applyCardScale(screen, scale) {
  if (!screen) return;
  screen.style.setProperty("--card-scale", String(clamp(scale, CARD_SCALE_MIN, CARD_SCALE_MAX)));
}

export function applyLockedCards(placed, layout) {
  for (const item of placed) {
    const locked = layout.cards[item.cityId];
    if (!locked?.locked) continue;
    item.x = locked.x;
    item.y = locked.y;
    item.locked = true;
  }
  return placed;
}

export function centerCityCards(cardsEl) {
  if (!cardsEl) return;
  for (const card of cardsEl.querySelectorAll(".city-card")) {
    card.style.marginLeft = "0";
    card.style.marginTop = "0";
  }
}

export function resetLayout(regionId, contentId = "today_weather") {
  regionId = canonicalRegion(regionId);
  const layout = emptyLayout(regionId);
  const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  all[regionId] = {
    map: layout.map,
    okinawa: layout.okinawa,
    cards: {},
    cardsPop: {}
  };
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
    const factor = event.deltaY < 0 ? 1.08 : 0.93;
    layout.map.scale *= factor;
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
  saveLayout(regionId, layout, contentId);
}

export function bindCardEditor(cardsEl, layout, regionId, contentId = "today_weather", onChange, screen) {
  const layer = cardsEl;

  const persist = () => {
    saveLayout(regionId, layout, contentId);
    onChange?.(listCardPositions(layer), loadCardScale(contentId));
  };

  const currentScale = () => loadCardScale(contentId);

  const applySharedScale = (scale) => {
    const next = clamp(scale, CARD_SCALE_MIN, CARD_SCALE_MAX);
    saveCardScale(contentId, next);
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

    const resizing = Boolean(event.target.closest(".card-resize"));
    const box = () => layer.getBoundingClientRect();
    const start = {
      x: event.clientX,
      y: event.clientY,
      moved: false,
      scale: currentScale(),
      left: parseFloat(card.style.left),
      top: parseFloat(card.style.top)
    };
    const cardBox = card.getBoundingClientRect();
    const center = {
      x: cardBox.left + cardBox.width / 2,
      y: cardBox.top + cardBox.height / 2
    };
    const startDist = Math.max(12, Math.hypot(event.clientX - center.x, event.clientY - center.y));

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      if (!start.moved && dx * dx + dy * dy < 16) return;
      start.moved = true;
      card.classList.add("is-dragging");
      if (resizing) {
        const dist = Math.hypot(moveEvent.clientX - center.x, moveEvent.clientY - center.y);
        applySharedScale(start.scale * (dist / startDist));
        return;
      }
      const area = box();
      const x = start.left + ((moveEvent.clientX - start.x) / area.width) * 100;
      const y = start.top + ((moveEvent.clientY - start.y) / area.height) * 100;
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
