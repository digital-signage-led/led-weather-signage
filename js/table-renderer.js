/**
 * 週間天気 / 週間降水確率の表。地図の上には7日分を置けないので表にする。
 */

import { canonicalContent } from "./catalog.js?v=pref348";
import { loadIcon } from "./map-renderer.js?v=pref348";
import { weatherTone } from "./weather-renderer.js?v=pref348";
import { popTone } from "./forecast.js?v=pref348";
import { isNightHours, jmaLabel } from "./jma-icons.js?v=pref348";

export async function renderWeeklyTable(cities, contentId) {
  const days = cities[0]?.weekly || [];
  const head = [
    `<span class="forecast-city-h" aria-hidden="true"></span>`,
    ...days.map((day) => `
      <span class="forecast-day-h${day.weekend ? " is-weekend" : ""}${day.today ? " is-today" : ""}${weekdayClass(day.weekday)}">${day.weekday}</span>
    `)
  ];

  const body = [];
  for (const city of cities) {
    body.push(`<span class="forecast-city">${city.cityName}</span>`);
    const cells = await Promise.all((city.weekly || []).map((day) => (
      canonicalContent(contentId) === "weekly_precip"
        ? Promise.resolve(renderPopCell(day))
        : renderWeatherCell(day)
    )));
    body.push(...cells);
  }

  return `
    <div class="forecast-table" data-content="${contentId}" style="--forecast-rows:${Math.max(1, cities.length)}">
      <div class="forecast-grid">
        ${head.join("")}
        ${body.join("")}
      </div>
    </div>
  `;
}

function weekdayClass(label) {
  if (label === "日") return " is-sunday";
  if (label === "土") return " is-saturday";
  return "";
}

async function renderWeatherCell(day) {
  const night = Boolean(day.today) && isNightHours();
  const icon = await loadIcon(day.weather, night);
  const when = night ? "夜" : "昼";
  return `
    <div class="forecast-cell is-weather${day.today ? " is-today" : ""}">
      <span class="wx-icon ${weatherTone(day.weather)}" aria-label="${when} ${day.weatherLabel || jmaLabel(day.weather)}">${icon}</span>
      <span class="forecast-temps">
        <b class="temp-max">${Math.round(day.tempMax)}</b>
        <span class="temp-slash">/</span>
        <b class="temp-min">${Math.round(day.tempMin)}</b>
      </span>
    </div>
  `;
}

function renderPopCell(day) {
  return `
    <div class="forecast-cell is-pop ${popTone(day.pop)}${day.today ? " is-today" : ""}">
      <b>${Math.round(day.pop)}</b><small>%</small>
    </div>
  `;
}
