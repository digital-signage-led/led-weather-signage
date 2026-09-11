/**
 * モック予報の拡張。今日の地点データから明日・時間帯降水・週間を作る。
 * HTML は JMA API を呼ばない。
 */

import { canonicalContent, getContent as contentFromCatalog } from "./catalog.js?v=pref174";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const LABELS = {
  sunny: "晴れ",
  "sunny-cloudy": "晴れ時々曇り",
  cloudy: "曇り",
  rain: "雨",
  snow: "雪",
  thunder: "雷雨"
};

const NEXT = {
  sunny: "sunny-cloudy",
  "sunny-cloudy": "cloudy",
  cloudy: "rain",
  rain: "cloudy",
  thunder: "rain",
  snow: "cloudy"
};

export function getContent(contentId) {
  return contentFromCatalog(contentId);
}

export function expandForecast(point, updatedAt) {
  const start = new Date(updatedAt);
  const seed = hash(point.cityId || "");
  const tomorrowWx = NEXT[point.weather] || "cloudy";
  const tomorrow = {
    weather: tomorrowWx,
    weatherLabel: LABELS[tomorrowWx] || "曇り",
    tempMax: point.tempMax - 1,
    tempMin: point.tempMin,
    pop: clampPop(point.pop + (isWet(tomorrowWx) ? 25 : -10))
  };
  const periods = {
    morning: clampPop(point.pop - 10),
    noon: clampPop(point.pop),
    night: clampPop(point.pop + (isWet(point.weather) ? 15 : 5))
  };
  const weekly = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const weather = i === 0
      ? point.weather
      : i === 1
        ? tomorrowWx
        : weekWeather(point.weather, i, seed);
    weekly.push({
      date: formatDate(date),
      weekday: WEEKDAYS[date.getDay()],
      weekend: date.getDay() === 0 || date.getDay() === 6,
      today: i === 0,
      weather,
      weatherLabel: LABELS[weather] || "曇り",
      tempMax: point.tempMax - Math.min(i, 3) + (seed % 2),
      tempMin: point.tempMin - Math.min(i, 2),
      pop: i === 0
        ? point.pop
        : i === 1
          ? tomorrow.pop
          : clampPop((isWet(weather) ? 55 : 8) + i * 6 + (seed % 20))
    });
  }
  const tomorrowPeriods = {
    morning: clampPop(tomorrow.pop - 10),
    noon: clampPop(tomorrow.pop),
    night: clampPop(tomorrow.pop + (isWet(tomorrowWx) ? 15 : 5))
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
      ? `${prefix}雨の所が多くなります。傘をご用意ください。`
      : `${prefix}降水の可能性は低めです。`;
  }
  if (content === "tomorrow_weather") {
    const wet = points.some((item) => isWet(item.weather));
    return wet
      ? "明日は雨の所があります。傘をご用意ください。"
      : "明日はおおむね穏やかです。";
  }
  if (content === "weekly_precip") return "向こう一週間の降水確率です。";
  return "向こう一週間の天気です。";
}

export function popTone(pop) {
  if (pop >= 60) return "is-pop-high";
  if (pop >= 30) return "is-pop-mid";
  return "is-pop-low";
}

function weekWeather(today, dayIndex, seed) {
  const cycle = [today, NEXT[today] || "cloudy", "cloudy", "rain", "sunny-cloudy", "sunny", "cloudy"];
  return cycle[(dayIndex + (seed % 3)) % cycle.length];
}

function isWet(weather) {
  return weather === "rain" || weather === "thunder" || weather === "snow";
}

function clampPop(value) {
  return Math.max(0, Math.min(90, Math.round(value / 10) * 10));
}

function hash(text) {
  let n = 0;
  for (let i = 0; i < text.length; i += 1) n = (n * 31 + text.charCodeAt(i)) >>> 0;
  return n;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
