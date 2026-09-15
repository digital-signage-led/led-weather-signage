/**
 * 28コンテンツの参照。既存6の ID / kind は contents.json 先頭を正本とする。
 */
import { getContent, listContents } from "./catalog.js?v=pref426";

export const EXISTING_CONTENT_IDS = [
  "today_weather",
  "today_precip",
  "tomorrow_weather",
  "tomorrow_precip",
  "weekly_weather",
  "weekly_precip"
];

export const CATEGORY_LABELS = {
  forecast: "予報",
  hourly: "時間予報",
  graph: "グラフ",
  map: "雨・地図",
  kikikuru: "キキクル",
  disaster: "防災",
  observation: "観測"
};

export function isExistingContent(contentId) {
  return EXISTING_CONTENT_IDS.includes(contentId);
}

export function isV1Content(content) {
  const id = content?.id || content;
  return !isExistingContent(id);
}

export function locationScope(content) {
  return getContent(content)?.location_scope || "region";
}

export function contentStatus(content) {
  return getContent(content)?.status || "live";
}

export function studioControls(content) {
  return getContent(content)?.studio_controls || [];
}

export function groupedContents() {
  const groups = [];
  const seen = new Set();
  for (const item of listContents()) {
    const key = item.category || "forecast";
    if (!seen.has(key)) {
      seen.add(key);
      groups.push({ category: key, label: CATEGORY_LABELS[key] || key, items: [] });
    }
    groups.find((g) => g.category === key).items.push(item);
  }
  return groups;
}

export function capabilityForContent(contentId) {
  const id = contentId;
  if (id === "temperature_24h" || id === "hourly_temperature" || id === "amedas_temperature") {
    return "temperature_available";
  }
  if (id === "rainfall_trend" || id === "amedas_rainfall") return "rainfall_available";
  if (id === "wind_speed_trend" || id === "amedas_wind") return "wind_available";
  return null;
}
