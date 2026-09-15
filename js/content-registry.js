/**
 * 27コンテンツの参照。既存6の ID / kind は contents.json 先頭を正本とする。
 * rain_nowcast は rain_forecast の legacy alias（catalog.canonicalContent）。
 */
import { getContent, listContents } from "./catalog.js?v=pref426";

export const LEGACY_CONTENT_ALIASES = {
  rain_nowcast: "rain_forecast"
};

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
    if (item.hidden_from_studio || item.legacy || item.alias_of) continue;
    const key = item.category || "forecast";
    if (!seen.has(key)) {
      seen.add(key);
      groups.push({ category: key, label: CATEGORY_LABELS[key] || key, items: [] });
    }
    groups.find((g) => g.category === key).items.push(item);
  }
  return groups;
}

export const REQUIRED_STATION_ELEMENTS = {
  hourly_temperature: ["temperature"],
  temperature_24h: ["temperature"],
  amedas_temperature: ["temperature"],
  rainfall_trend: ["rainfall"],
  amedas_rainfall: ["rainfall"],
  wind_speed_trend: ["wind_speed"],
  amedas_wind: ["wind_direction", "wind_speed"]
};

export const STATION_TYPE_GROUPS = {
  官: "気象台等",
  四: "アメダス（気温・雨・風）",
  三: "アメダス（複数要素）",
  雨: "雨量観測所",
  雪: "積雪観測所"
};

export function requiredStationElements(contentId) {
  return REQUIRED_STATION_ELEMENTS[contentId] || getContent(contentId)?.required_station_elements || [];
}

export function stationHasElements(station, elements) {
  if (!station || !elements?.length) return true;
  return elements.every((key) => (
    station.elements?.[key] === true
    || station[`${key}_available`] === true
    || (key === "wind_speed" && station.wind_available === true)
  ));
}

export function stationMatchesContent(station, contentId) {
  return stationHasElements(station, requiredStationElements(contentId));
}

export function capabilityForContent(contentId) {
  const req = requiredStationElements(contentId);
  if (req.includes("temperature")) return "temperature_available";
  if (req.includes("rainfall")) return "rainfall_available";
  if (req.includes("wind_speed") || req.includes("wind_direction")) return "wind_available";
  return null;
}
