/**
 * 天気カードとアイコン描画。気象JSONだけを受け取り、元データAPIには依存しない。
 */

import { loadIcon } from "./map-renderer.js?v=pref216";
import { popTone } from "./forecast.js?v=pref214";
import { isNightHours, jmaLabel, jmaRank, jmaTone } from "./jma-icons.js?v=pref214";

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
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value || "";
  const weekday = pick("weekday").replace("曜日", "");
  if (compact) return `${pick("day")}日 ${pick("hour")}:${pick("minute")}更新`;
  return `${pick("day")}日(${weekday}) ${pick("hour")}:${pick("minute")}更新`;
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

export async function renderCityCard(point, position, options = {}) {
  const temps = `
        <span class="city-card-temps">
          <b class="temp-max">${Math.round(point.tempMax)}</b><small>℃</small>
          <span class="temp-slash">/</span>
          <b class="temp-min">${Math.round(point.tempMin)}</b><small>℃</small>
        </span>`;
  if (options.layout === "pop") {
    const morning = Number.isFinite(point.morning) ? point.morning : point.pop;
    const noon = Number.isFinite(point.noon) ? point.noon : point.pop;
    const night = Number.isFinite(point.night) ? point.night : point.pop;
    return `
    <article class="city-card is-pop${position.locked ? " is-locked" : ""}" data-city-id="${point.cityId}" style="left:${position.x}%;top:${position.y}%;">
      <span class="city-card-name">${point.cityName}</span>
      <span class="city-card-pops">
        <span class="pop-slot ${popTone(morning)}"><i>朝</i><b>${Math.round(morning)}</b></span>
        <span class="pop-slot ${popTone(noon)}"><i>昼</i><b>${Math.round(noon)}</b></span>
        <span class="pop-slot ${popTone(night)}"><i>夜</i><b>${Math.round(night)}</b><small class="pop-unit">%</small></span>
      </span>
      <i class="card-resize" aria-hidden="true"></i>
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
    <article class="city-card${options.showPop ? " is-national" : ""}${position.locked ? " is-locked" : ""}" data-city-id="${point.cityId}" style="left:${position.x}%;top:${position.y}%;">
      <span class="wx-icon ${tone}" aria-label="${night ? "夜" : "昼"} ${label}">${icon}</span>
      <span class="city-card-meta">
        <span class="city-card-name">${point.cityName}</span>
        <span class="city-card-row">${temps}${pop}</span>
      </span>
      <i class="card-resize" aria-hidden="true"></i>
    </article>
  `;
}

export function renderPin(position) {
  return `<circle class="map-pin" cx="${position.stagePinX.toFixed(2)}" cy="${position.stagePinY.toFixed(2)}" r="1.25"/>`;
}
