/**
 * 地点の今日データから明日・時間帯降水・週間を組み立てる。
 * HTML は JMA API を呼ばない。雪など季節外れのコードを循環させない。
 */

import { canonicalContent, getContent as contentFromCatalog } from "./catalog.js?v=pref174";
import { isWetWeather, jmaLabel, jmaTone, resolveWeatherCode } from "./jma-icons.js?v=pref214";

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
  const weekly = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const stored = point.weekly?.[i] || (i === 0 ? point : i === 1 ? tomorrow : point.weekly?.[point.weekly.length - 1]);
    const weather = resolveWeatherCode(stored?.weather || (i === 1 ? tomorrowWx : todayWx));
    weekly.push({
      date: formatDate(date),
      weekday: WEEKDAYS[date.getDay()],
      weekend: date.getDay() === 0 || date.getDay() === 6,
      today: i === 0,
      weather,
      weatherLabel: stored?.weatherLabel || jmaLabel(weather),
      tempMax: stored?.tempMax ?? point.tempMax,
      tempMin: stored?.tempMin ?? point.tempMin,
      pop: clampPop(
        stored?.pop
        ?? (i === 0 ? point.pop : i === 1 ? tomorrow.pop : point.pop)
      )
    });
  }
  const tomorrowPeriods = {
    morning: clampPop(tomorrow.pop - 10),
    noon: clampPop(tomorrow.pop),
    night: clampPop(tomorrow.pop + (isWetWeather(tomorrowWx) ? 15 : 5))
  };
  return { tomorrow, periods, tomorrowPeriods, weekly };
}

export function noteFor(contentId, regionId, weather, points) {
  const content = canonicalContent(contentId);
  const fromFile = weather.contentNotes?.[content]?.[regionId]
    || weather.contentNotes?.[content]?.national;
  if (fromFile) return fromFile;
  if (content === "today_weather") return weather.notes?.[regionId] || "";
  if (content === "today_precip" || content === "tomorrow_precip") {
    const maxPop = Math.max(0, ...points.map((item) => Number(item.pop) || 0));
    const prefix = content === "tomorrow_precip" ? "明日は" : "";
    return maxPop >= 50
      ? `${prefix}降水の所が多くなります。傘をご用意ください。`
      : `${prefix}降水の可能性は低めです。`;
  }
  if (content === "tomorrow_weather") {
    const tone = strongestTone(points);
    if (tone === "is-thunder") return "明日は雷を伴う所があります。";
    if (tone === "is-snow") return "明日は雪の所があります。";
    if (tone === "is-rain") return "明日は雨の所があります。傘をご用意ください。";
    return "明日はおおむね穏やかです。";
  }
  if (content === "weekly_precip") return "向こう一週間の降水確率です。";
  return "向こう一週間の天気です。";
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
  return Math.max(0, Math.min(90, Math.round(value / 10) * 10));
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
