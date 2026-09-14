/**
 * Weekly weather / precip table renderer.
 */

import { canonicalContent } from "./catalog.js?v=pref366";
import { loadIcon } from "./map-renderer.js?v=pref366";
import { weatherTone } from "./weather-renderer.js?v=pref366";
import { popTone } from "./forecast.js?v=pref366";
import { isNightHours, jmaLabel } from "./jma-icons.js?v=pref366";

/** 1ページの上限行。ページ都市数がこれ未満ならその数で描く（1行だけは避ける） */
const TABLE_ROW_MAX = 5;

export async function renderWeeklyTable(cities, contentId) {
  const list = Array.isArray(cities) ? cities.slice(0, TABLE_ROW_MAX) : [];
  let slots = list.length;
  if (slots === 0) slots = TABLE_ROW_MAX;
  else if (slots === 1) slots = 2; // 1都市だけの縦伸びを防ぐ
  const days = list[0]?.weekly || list.find((c) => c?.weekly?.length)?.weekly || [];
  const dayCount = Math.max(7, days.length || 7);
  const head = [
    `<span class="forecast-city-h" aria-hidden="true"></span>`,
    ...days.map((day) => `
      <span class="forecast-day-h${day.weekend ? " is-weekend" : ""}${day.today ? " is-today" : ""}${weekdayClass(day.weekday)}">${day.weekday}</span>
    `)
  ];

  const body = [];
  for (let row = 0; row < slots; row += 1) {
    const city = list[row];
    if (!city) {
      body.push(`<span class="forecast-city is-empty" aria-hidden="true"></span>`);
      for (let i = 0; i < dayCount; i += 1) {
        body.push(`<div class="forecast-cell is-empty" aria-hidden="true"></div>`);
      }
      continue;
    }
    body.push(`<span class="forecast-city">${city.cityName}</span>`);
    const cells = await Promise.all((city.weekly || days).map((day) => (
      canonicalContent(contentId) === "weekly_precip"
        ? Promise.resolve(renderPopCell(day))
        : renderWeatherCell(day)
    )));
    body.push(...cells);
  }

  return `
    <div class="forecast-table" data-content="${contentId}" style="--forecast-rows:${slots}">
      <div class="forecast-grid">
        ${head.join("")}
        ${body.join("")}
      </div>
    </div>
  `;
}

function weekdayClass(label) {
  if (label === "\u65e5") return " is-sunday";
  if (label === "\u571f") return " is-saturday";
  return "";
}

async function renderWeatherCell(day) {
  const night = Boolean(day.today) && isNightHours();
  const icon = await loadIcon(day.weather, night);
  const when = night ? "\u591c" : "\u663c";
  return `
    <div class="forecast-cell is-weather${day.today ? " is-today" : ""}">
      <span class="wx-icon ${weatherTone(day.weather)}" aria-label="${when} ${day.weatherLabel || jmaLabel(day.weather)}">${icon}</span>
      <span class="forecast-temps">
        <b class="temp-max">${formatTemp(day.tempMax)}</b>
        <span class="temp-slash">/</span>
        <b class="temp-min">${formatTemp(day.tempMin)}</b>
      </span>
    </div>
  `;
}

function formatTemp(value) {
  if (value === "" || value == null) return "--";
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.round(n)) : "--";
}

function renderPopCell(day) {
  const pop = Math.round(Number(day.pop) || 0);
  const humidity = Math.round(Number(day.humidity) || 0);
  return `
    <div class="forecast-cell is-pop is-pop-metrics ${popTone(pop)}${day.today ? " is-today" : ""}">
      <span class="pop-metric-label is-pop-chance">\u964d\u6c34</span>
      <span class="pop-metric-value is-pop-chance"><b>${pop}</b><small>%</small></span>
      <span class="pop-metric-label is-humidity">\u6e7f\u5ea6</span>
      <span class="pop-metric-value is-humidity"><b>${humidity}</b><small>%</small></span>
    </div>
  `;
}
