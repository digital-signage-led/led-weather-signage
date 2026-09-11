/**
 * 天気カードとアイコン描画。気象JSONだけを受け取り、元データAPIには依存しない。
 */

import { loadIcon } from "./map-renderer.js?v=pref174";
import { popTone } from "./forecast.js?v=pref174";

const WEATHER_TONE = {
  sunny: "is-sunny",
  "sunny-cloudy": "is-sunny",
  cloudy: "is-cloudy",
  rain: "is-rain",
  snow: "is-snow",
  thunder: "is-thunder"
};

const WEATHER_RANK = {
  thunder: 5,
  snow: 4,
  rain: 3,
  cloudy: 2,
  "sunny-cloudy": 1,
  sunny: 0
};

export function pickNoteWeather(points) {
  return points.reduce((best, point) => (
    (WEATHER_RANK[point.weather] || 0) > (WEATHER_RANK[best] || 0) ? point.weather : best
  ), "cloudy");
}

export function weatherTone(weather) {
  return WEATHER_TONE[weather] || "is-cloudy";
}

const NOTE_ICONS = {
  rain: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="currentColor" d="M18 29.5c0-8.2 6.4-14.8 14.5-14.8 6.2 0 11.5 3.8 13.6 9.2A11 11 0 0 1 46 44.5H18.8A9.3 9.3 0 0 1 18 29.5z"/>
    <g fill="none" stroke="currentColor" stroke-width="4.2" stroke-linecap="round">
      <path d="M24 50.5v7.5M32 52.5v7.5M40 50.5v7.5"/>
    </g>
  </svg>`,
  cloudy: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="currentColor" d="M16 36.5c0-8.5 6.6-15.4 15-15.4 6.5 0 12 3.9 14.2 9.6A11.4 11.4 0 0 1 48 52H17.2A10.2 10.2 0 0 1 16 36.5z"/>
  </svg>`,
  sunny: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="32" cy="32" r="12" fill="currentColor"/>
    <g fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round">
      <path d="M32 8v7M32 49v7M8 32h7M49 32h7M14 14l5 5M45 45l5 5M14 50l5-5M45 19l5-5"/>
    </g>
  </svg>`,
  snow: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="currentColor" d="M18 28c0-8 6.4-14.5 14.4-14.5 6.1 0 11.4 3.7 13.5 9A10.6 10.6 0 0 1 45.5 43H19A8.8 8.8 0 0 1 18 28z"/>
    <g fill="currentColor"><circle cx="24" cy="52" r="2.6"/><circle cx="32" cy="56" r="2.6"/><circle cx="40" cy="52" r="2.6"/></g>
  </svg>`,
  thunder: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="currentColor" d="M18 27.5c0-8 6.4-14.5 14.4-14.5 6.1 0 11.4 3.7 13.5 9A10.6 10.6 0 0 1 45.5 42H19A8.8 8.8 0 0 1 18 27.5z"/>
    <path fill="currentColor" d="M35 41l-10 13h7l-3 10 12-15h-7z"/>
  </svg>`
};

export function renderNoteIcon(weather) {
  const key = weather === "sunny-cloudy" ? "sunny" : weather;
  return NOTE_ICONS[key] || NOTE_ICONS.cloudy;
}

export function formatStamp(iso, compact = false) {
  const date = new Date(iso);
  const week = "日月火水木金土"[date.getDay()];
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  if (compact) return `${date.getDate()}日 ${hh}:${mm}更新`;
  return `${date.getDate()}日(${week}) ${hh}:${mm}更新`;
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
  const icon = await loadIcon(point.weather);
  const tone = WEATHER_TONE[point.weather] || "is-cloudy";
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
  const pop = options.showPop && Number.isFinite(point.pop)
    ? `<span class="city-card-pop">${Math.round(point.pop)}%</span>`
    : "";
  return `
    <article class="city-card${options.showPop ? " is-national" : ""}${position.locked ? " is-locked" : ""}" data-city-id="${point.cityId}" style="left:${position.x}%;top:${position.y}%;">
      <span class="wx-icon ${tone}" aria-label="${point.weatherLabel}">${icon}</span>
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
