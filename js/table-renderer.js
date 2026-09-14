/**
 * 週間天気 / 週間降水確率の表。地図の上には7日分を置けないので表にする。
 */

import { canonicalContent } from "./catalog.js?v=pref320";
import { loadIcon } from "./map-renderer.js?v=pref320";
import { weatherTone } from "./weather-renderer.js?v=pref320";
import { popTone } from "./forecast.js?v=pref320";
import { isNightHours, jmaLabel } from "./jma-icons.js?v=pref320";

export async function renderWeeklyTable(cities, contentId) {
  const days = cities[0]?.weekly || [];
  const head = `
    <div class="forecast-head">
      <span class="forecast-city-h"></span>
      ${days.map((day) => `
        <span class="forecast-day-h${day.weekend ? " is-weekend" : ""}${day.today ? " is-today" : ""}">${day.weekday}</span>
      `).join("")}
    </div>
  `;
  const rows = await Promise.all(cities.map((city) => renderRow(city, contentId)));
  return `
    <div class="forecast-table" data-content="${contentId}">
      ${head}
      <div class="forecast-body">${rows.join("")}</div>
    </div>
  `;
}

async function renderRow(city, contentId) {
  const cells = await Promise.all((city.weekly || []).map((day) => (
    canonicalContent(contentId) === "weekly_precip" ? Promise.resolve(renderPopCell(day)) : renderWeatherCell(day)
  )));
  return `
    <div class="forecast-row">
      <span class="forecast-city">${city.cityName}</span>
      ${cells.join("")}
    </div>
  `;
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
