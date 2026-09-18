/**
 * 天気カードとアイコン描画。気象JSONだけを受け取り、元データAPIには依存しない。
 */

import { loadIcon } from "./map-renderer.js?v=pref387";
import { popTone } from "./forecast.js?v=pref387";
import { isNightHours, jmaLabel, jmaRank, jmaTone } from "./jma-icons.js?v=pref387";

export function pickNoteWeather(points) {
  return points.reduce((best, point) => (
    jmaRank(point.weather) > jmaRank(best) ? point.weather : best
  ), "200");
}

export function weatherTone(weather) {
  return jmaTone(weather);
}

export async function renderNoteIcon(weather) {
  return loadIcon(weather, isNightHours());
}

export function formatStamp(iso, compact = false) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value || "";
  const weekday = pick("weekday").replace("曜日", "");
  // 表示は毎時0分（JST）。取得が遅れた場合も分は出さない。
  if (compact) return `${pick("month")}月${pick("day")}日 ${pick("hour")}:00更新`;
  return `${pick("month")}月${pick("day")}日(${weekday}) ${pick("hour")}:00更新`;
}

export function renderLeader(position) {
  const points = (position.leaderPath || [
    { x: position.leaderX1, y: position.leaderY1 },
    { x: position.x2, y: position.y2 }
  ]).map((point) => `${point.x} ${point.y}`).join(" ");
  return `
    <svg class="leader-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${points}" fill="none"/>
    </svg>
  `;
}

function formatCardNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.round(n)) : "--";
}

export function renderCityCardSkeleton(point, position, options = {}) {
  const name = point.cityName || "";
  const locked = position.locked ? " is-locked" : "";
  if (options.layout === "pop") {
    return `
    <article class="city-card is-pop is-vertical${locked}" data-city-id="${point.cityId}" style="left:${position.x}%;top:${position.y}%;">
      <span class="city-card-name">${name}</span>
      <span class="city-card-pops">
        <span class="pop-slot is-morning"><b>--</b></span>
        <span class="pop-slot is-noon"><b>--</b></span>
      </span>
    </article>`;
  }
  return `
    <article class="city-card is-vertical${locked}" data-city-id="${point.cityId}" style="left:${position.x}%;top:${position.y}%;">
      <span class="city-card-icon-stack">
        <span class="city-card-icon-box" aria-hidden="true"></span>
        <span class="wx-icon" aria-hidden="true"></span>
      </span>
      <span class="city-card-name">${name}</span>
      <span class="city-card-row">
        <span class="city-card-temps">
          <b class="temp-max">--</b><small>℃</small>
          <span class="temp-slash">/</span>
          <b class="temp-min">--</b><small>℃</small>
        </span>
      </span>
    </article>`;
}

export async function renderCityCard(point, position, options = {}) {
  const temps = `
        <span class="city-card-temps">
          <b class="temp-max">${formatCardNumber(point.tempMax)}</b><small>℃</small>
          <span class="temp-slash">/</span>
          <b class="temp-min">${formatCardNumber(point.tempMin)}</b><small>℃</small>
        </span>`;
  if (options.layout === "pop") {
    const morning = Number.isFinite(point.morning) ? point.morning : point.pop;
    const noon = Number.isFinite(point.noon) ? point.noon : point.pop;
    return `
    <article class="city-card is-pop is-vertical${position.locked ? " is-locked" : ""}" data-city-id="${point.cityId}" style="left:${position.x}%;top:${position.y}%;">
      <span class="city-card-name">${point.cityName}</span>
      <span class="city-card-pops">
        <span class="pop-slot is-morning ${popTone(morning)}"><b>${formatCardNumber(morning)}</b></span>
        <span class="pop-slot is-noon ${popTone(noon)}"><b>${formatCardNumber(noon)}</b></span>
      </span>
    </article>`;
  }
  const tone = weatherTone(point.weather);
  const label = point.weatherLabel || jmaLabel(point.weather);
  const night = isNightHours();
  const icon = await loadIcon(point.weather, night);
  const pop = options.showPop && Number.isFinite(point.pop)
    ? `<span class="city-card-pop">${Math.round(point.pop)}%</span>`
    : "";
  return `
    <article class="city-card is-vertical${options.showPop ? " is-national" : ""}${position.locked ? " is-locked" : ""}" data-city-id="${point.cityId}" style="left:${position.x}%;top:${position.y}%;">
      <span class="city-card-icon-stack">
        <span class="city-card-icon-box" aria-hidden="true"></span>
        <span class="wx-icon ${tone}" aria-label="${night ? "夜" : "昼"} ${label}">${icon}</span>
      </span>
      <span class="city-card-name">${point.cityName}</span>
      <span class="city-card-row">${temps}${pop}</span>
    </article>
  `;
}

export function renderPrecipTodLegend() {
  return `
    <aside class="precip-tod-legend" aria-label="降水確率・時間帯">
      <div class="precip-tod-legend-title">降水確率</div>
      <div class="precip-tod-legend-row">
        <div class="precip-tod-legend-box">
          <span class="is-morning">6〜12時</span>
          <span class="is-noon">12〜18時</span>
        </div>
      </div>
    </aside>
  `;
}

export function renderPin(position, radius = 0.28) {
  const r = Number.isFinite(radius) ? radius : 0.28;
  return `<circle class="map-pin" cx="${position.stagePinX.toFixed(2)}" cy="${position.stagePinY.toFixed(2)}" r="${r.toFixed(3)}"/>`;
}

/** 赤い点の画面上サイズ。地図の短辺に比例させ、小さい解像度で相対的に巨大化しない。 */
export function pinRadiusForViewBox(svg, { national = false } = {}) {
  const vb = svg?.viewBox?.baseVal;
  if (!vb || !(vb.width > 0) || !(vb.height > 0)) return national ? 0.14 : 0.22;
  const shortUser = Math.min(vb.width, vb.height);
  const rect = typeof svg.getBoundingClientRect === "function" ? svg.getBoundingClientRect() : null;
  if (rect && rect.width > 8 && rect.height > 8) {
    const shortPx = Math.min(rect.width, rect.height);
    // 直径（px）。短辺の一定割合。上限・下限で極端な解像度を抑える
    const targetPx = national
      ? Math.min(11, Math.max(6, shortPx * 0.02))
      : Math.min(14, Math.max(7, shortPx * 0.028));
    return Math.max(national ? 0.05 : 0.06, ((targetPx / shortPx) * shortUser) / 2);
  }
  return Math.max(national ? 0.1 : 0.14, shortUser * (national ? 0.0035 : 0.005));
}

/** 参照SVG上のピン半径が同じ画面ピクセルになるよう、対象SVGの半径へ換算する。 */
export function pinRadiusForMatchingScreen(svg, referenceSvg, referenceRadius) {
  const refVb = referenceSvg?.viewBox?.baseVal;
  const tgtVb = svg?.viewBox?.baseVal;
  if (!Number.isFinite(referenceRadius) || referenceRadius <= 0) {
    return pinRadiusForViewBox(svg, { national: true });
  }
  if (!refVb?.width || !tgtVb?.width) {
    const refShort = Math.min(refVb?.width || 100, refVb?.height || 100);
    const tgtShort = Math.min(tgtVb?.width || 20, tgtVb?.height || 22);
    return referenceRadius * (tgtShort / refShort);
  }
  const refRect = referenceSvg.getBoundingClientRect?.();
  const tgtRect = svg.getBoundingClientRect?.();
  const refShortUser = Math.min(refVb.width, refVb.height);
  const tgtShortUser = Math.min(tgtVb.width, tgtVb.height);
  const refShortPx = Math.min(refRect?.width || 0, refRect?.height || 0);
  const tgtShortPx = Math.min(tgtRect?.width || 0, tgtRect?.height || 0);
  if (refShortPx > 8 && tgtShortPx > 8) {
    const pinPx = 2 * referenceRadius * (refShortPx / refShortUser);
    return Math.max(0.02, ((pinPx / tgtShortPx) * tgtShortUser) / 2);
  }
  return referenceRadius * (tgtShortUser / refShortUser);
}
