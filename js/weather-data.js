/**
 * 螟夜Κ豌苓ｱ｡ 竊・蜈ｱ騾壹Δ繝・Ν縲３enderer 縺ｯ縺薙％縺縺代ｒ隕九ｋ縲・
 */

import { citiesForRegion } from "./catalog.js?v=pref368";

export function adaptWeather(doc) {
  return {
    updatedAt: doc.updatedAt || "",
    notes: doc.notes || {},
    contentNotes: doc.contentNotes || {},
    pointsByCity: new Map((doc.points || []).map((point) => [point.cityId, point]))
  };
}

export function aggregateRegion(cities, weather, region, options = {}) {
  const requirePoint = options.requirePoint !== false;
  return citiesForRegion(cities, region)
    .filter((city) => !requirePoint || weather.pointsByCity.has(city.cityId))
    .sort((a, b) => a.priority - b.priority);
}
