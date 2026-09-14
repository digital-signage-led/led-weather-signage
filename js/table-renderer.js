/**
 * Weekly weather / precip table renderer.
 */

import { canonicalContent } from "./catalog.js?v=pref353";
import { loadIcon } from "./map-renderer.js?v=pref353";
import { weatherTone } from "./weather-renderer.js?v=pref353";
import { popTone } from "./forecast.js?v=pref353";
import { isNightHours, jmaLabel } from "./jma-icons.js?v=pref353";

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
        <b class="temp-max">${Math.round(day.tempMax)}</b>
        <span class="temp-slash">/</span>
        <b class="temp-min">${Math.round(day.tempMin)}</b>
      </span>
    </div>
  `;
}

function renderPopCell(day) {
  const pop = Math.round(Number(day.pop) || 0);
  const humidity = Math.round(Number(day.humidity) || 0);
  return `
    <div class="forecast-cell is-pop is-pop-metrics ${popTone(pop)}${day.today ? " is-today" : ""}">
      <div class="pop-metric is-pop-chance">
        <span class="pop-metric-label is-two-line"><span>\u964d\u6c34</span><span>\u78ba\u7387</span></span>
        <span class="pop-metric-value"><b>${pop}</b><small>%</small></span>
      </div>
      <div class="pop-metric is-humidity">
        <span class="pop-metric-label">\u6e7f\u5ea6</span>
        <span class="pop-metric-value"><b>${humidity}</b><small>%</small></span>
      </div>
    </div>
  `;
}
