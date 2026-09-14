/**
 * 地点の今日データから明日・時間帯降水・週間を組み立てる。
 * HTML は JMA API を呼ばない。雪など季節外れのコードを循環させない。
 */

import { canonicalContent, getContent as contentFromCatalog } from "./catalog.js?v=pref364";
import { isWetWeather, jmaLabel, jmaTone, resolveWeatherCode } from "./jma-icons.js?v=pref364";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function getContent(contentId) {
  return contentFromCatalog(contentId);
}

export function expandForecast(point, updatedAt) {
  const start = new Date(updatedAt);
  const todayWx = resolveWeatherCode(point.weather);
  const storedTomorrow = point.tomorrow || {};
  const tomorrowWx = resolveWeatherCode(storedTomorrow.weather || todayWx);
  const tomorrow = {
    weather: tomorrowWx,
    weatherLabel: storedTomorrow.weatherLabel || jmaLabel(tomorrowWx),
    tempMax: storedTomorrow.tempMax ?? point.tempMax,
    tempMin: storedTomorrow.tempMin ?? point.tempMin,
    pop: clampPop(storedTomorrow.pop ?? point.pop)
  };
  const periods = {
    morning: clampPop(point.pop - 10),
    noon: clampPop(point.pop),
    night: clampPop(point.pop + (isWetWeather(todayWx) ? 15 : 5))
  };
  const tomorrowPeriods = {
    morning: clampPop(tomorrow.pop - 10),
    noon: clampPop(tomorrow.pop),
    night: clampPop(tomorrow.pop + (isWetWeather(tomorrowWx) ? 15 : 5))
  };
  const weekly = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const stored = point.weekly?.[i] || (i === 0 ? point : i === 1 ? tomorrow : point.weekly?.[point.weekly.length - 1]);
    const weather = resolveWeatherCode(stored?.weather || (i === 1 ? tomorrowWx : todayWx));
    const dayPop = clampPop(
      stored?.pop
      ?? (i === 0 ? point.pop : i === 1 ? tomorrow.pop : point.pop)
    );
    const popAm = clampPop(
      stored?.popAm
      ?? (i === 0 ? periods.morning : i === 1 ? tomorrowPeriods.morning : dayPop)
    );
    const popPm = clampPop(
      stored?.popPm
      ?? (i === 0 ? periods.noon : i === 1 ? tomorrowPeriods.noon : dayPop)
    );
    const dayPopMax = Math.max(popAm, popPm, dayPop);
    weekly.push({
      date: formatDate(date),
      weekday: WEEKDAYS[date.getDay()],
      weekend: date.getDay() === 0 || date.getDay() === 6,
      today: i === 0,
      weather,
      weatherLabel: stored?.weatherLabel || jmaLabel(weather),
      tempMax: stored && stored.tempMax !== undefined ? stored.tempMax : point.tempMax,
      tempMin: stored && stored.tempMin !== undefined ? stored.tempMin : point.tempMin,
      pop: dayPopMax,
      popAm,
      popPm,
      humidity: clampHumidity(
        stored?.humidity
        ?? point.humidity
        ?? estimateHumidity(dayPopMax, weather, hash(`${point.cityId || ""}:${i}`))
      )
    });
  }
  return { tomorrow, periods, tomorrowPeriods, weekly };
}

const LOCAL_CONDITIONS = "現在の気象状況　🌡 28.4℃　💨 北西 6.2m/s　☔ 1時間雨量 0.4mm";

/** ノート用。絵文字の風・傘アイコンを線画へ差し替える */
export function formatNoteHtml(text) {
  const raw = String(text || "");
  const escaped = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/💨/g, WIND_ICON_HTML)
    .replace(/☔/g, RAIN_ICON_HTML);
}

const WIND_ICON_HTML = `<span class="note-icon note-icon-wind" aria-label="風"><svg viewBox="0 0 32 24" width="1.15em" height="0.86em" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M3 7.5h16.5c2.6 0 4.5-1.7 4.5-3.6S22.1.5 19.5.5"/><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M3 12.5h21"/><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M3 17.5h13.5c2.4 0 4 1.5 4 3.2S18.9 24 16.5 24"/></svg></span>`;

const RAIN_ICON_HTML = `<span class="note-icon note-icon-rain" aria-label="雨"><svg viewBox="0 0 28 28" width="1.05em" height="1.05em" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" d="M9 3.5v3M14 2v3M19 3.5v3"/><path fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" d="M4.5 15c0-5.5 4.2-9.5 9.5-9.5S23.5 9.5 23.5 15H4.5z"/><path fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" d="M14 5.5V15"/><path fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" d="M14 15v8c0 1.8-1.3 3-2.8 3"/></svg></span>`;

export function noteFor(contentId, regionId, weather, points) {
  const content = canonicalContent(contentId);
  const fromFile = weather.contentNotes?.[content]?.[regionId]
    || weather.contentNotes?.[content]?.national;
  let base = "";
  if (fromFile) base = fromFile;
  else if (content === "today_weather") base = weather.notes?.[regionId] || "";
  else if (content === "today_precip" || content === "tomorrow_precip") {
    const maxPop = Math.max(0, ...points.map((item) => Number(item.pop) || 0));
    const prefix = content === "tomorrow_precip" ? "明日は" : "";
    base = maxPop >= 50
      ? `${prefix}降水の所が多くなります。傘をご用意ください。`
      : `${prefix}降水の可能性は低めです。`;
  } else if (content === "tomorrow_weather") {
    const tone = strongestTone(points);
    if (tone === "is-thunder") base = "明日は雷を伴う所があります。";
    else if (tone === "is-snow") base = "明日は雪の所があります。";
    else if (tone === "is-rain") base = "明日は雨の所があります。傘をご用意ください。";
    else base = "明日はおおむね穏やかです。";
  } else if (content === "weekly_precip") base = "向こう一週間の降水確率と湿度です。";
  else base = "向こう一週間の天気です。";
  return appendLocalConditions(base);
}

function appendLocalConditions(text) {
  const base = String(text || "").trim();
  if (!base) return LOCAL_CONDITIONS;
  if (base.includes("現在の気象状況")) return base;
  return `${base}　　${LOCAL_CONDITIONS}`;
}

function strongestTone(points) {
  return points.reduce((best, point) => {
    const tone = jmaTone(point.weather);
    const rank = { "is-thunder": 5, "is-snow": 4, "is-rain": 3, "is-cloudy": 2, "is-sunny": 1 };
    return (rank[tone] || 0) > (rank[best] || 0) ? tone : best;
  }, "is-cloudy");
}

export function popTone(pop) {
  if (pop >= 60) return "is-pop-high";
  if (pop >= 30) return "is-pop-mid";
  return "is-pop-low";
}

function clampPop(value) {
  return Math.max(0, Math.min(90, Math.round(Number(value) / 10) * 10));
}

function clampHumidity(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 60;
  return Math.max(20, Math.min(99, n));
}

/** 湿度の実測が無いときは降水・天気から推定（表示用） */
function estimateHumidity(pop, weather, seed = 0) {
  const wet = isWetWeather(weather);
  const base = wet ? 72 : 52;
  return clampHumidity(base + Math.round((Number(pop) || 0) * 0.18) + ((seed % 13) - 6));
}

function hash(text) {
  let n = 0;
  const s = String(text || "");
  for (let i = 0; i < s.length; i += 1) n = (n * 31 + s.charCodeAt(i)) >>> 0;
  return n;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
