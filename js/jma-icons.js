/**
 * 気象庁天気コード118種。アイコンファイルと名称の対応。
 */

import { JMA_WEATHER_CODES } from "./jma-codes.js?v=pref208";

export const JMA_CODE_LIST = Object.keys(JMA_WEATHER_CODES);

const CATEGORY_TO_CODE = {
  sunny: "100",
  "sunny-cloudy": "101",
  cloudy: "200",
  rain: "300",
  snow: "400",
  thunder: "308"
};

export function resolveWeatherCode(weather) {
  const key = String(weather ?? "").trim();
  if (JMA_WEATHER_CODES[key]) return key;
  return CATEGORY_TO_CODE[key] || "200";
}

export function jmaEntry(weather) {
  return JMA_WEATHER_CODES[resolveWeatherCode(weather)];
}

export function jmaLabel(weather) {
  return jmaEntry(weather)?.labelJa || "曇";
}

export function jmaIconFile(weather, night = false) {
  const entry = jmaEntry(weather);
  const file = night
    ? (entry?.officialNight || "200.svg")
    : (entry?.officialDay || "200.svg");
  return `icons/jma/${file}`;
}

export function isNightHours(date = new Date()) {
  const params = typeof location === "undefined" ? null : new URLSearchParams(location.search);
  const forced = params?.get("icon")
    || (params?.get("night") === "1" ? "night" : "")
    || (params?.get("day") === "1" ? "day" : "");
  if (forced === "night") return true;
  if (forced === "day") return false;
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone: "Asia/Tokyo"
  }).format(date));
  return hour < 6 || hour >= 18;
}

export function msUntilIconPhaseChange(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23"
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  const second = Number(parts.find((part) => part.type === "second")?.value || 0);
  const nowSec = hour * 3600 + minute * 60 + second;
  const morning = 6 * 3600;
  const evening = 18 * 3600;
  const day = 24 * 3600;
  const target = nowSec < morning ? morning : nowSec < evening ? evening : morning + day;
  return Math.max(1000, (target - nowSec) * 1000 + 80);
}

export function jmaTone(weather) {
  const entry = jmaEntry(weather);
  const label = entry?.labelJa || "";
  const code = resolveWeatherCode(weather);
  if (/雷/.test(label)) return "is-thunder";
  if (/雪/.test(label) && !/雨/.test(label)) return "is-snow";
  if (/雨|霧雨/.test(label)) return "is-rain";
  if (code.startsWith("1") || entry?.baseCode === "100") return "is-sunny";
  return "is-cloudy";
}

export function jmaRank(weather) {
  return {
    "is-thunder": 5,
    "is-snow": 4,
    "is-rain": 3,
    "is-cloudy": 2,
    "is-sunny": 1
  }[jmaTone(weather)] || 0;
}

export function isWetWeather(weather) {
  const tone = jmaTone(weather);
  return tone === "is-rain" || tone === "is-snow" || tone === "is-thunder";
}
