/**
 * 外部気象 → 共通モデル。Renderer はここだけを見る。
 */

import { citiesForRegion } from "./catalog.js?v=pref194";

export function adaptWeather(doc) {
  return {
    updatedAt: doc.updatedAt || "",
    notes: doc.notes || {},
    contentNotes: doc.contentNotes || {},
    pointsByCity: new Map((doc.points || []).map((point) => [point.cityId, point]))
  };
}

export function aggregateRegion(cities, weather, region) {
  return citiesForRegion(cities, region)
    .filter((city) => weather.pointsByCity.has(city.cityId))
    .sort((a, b) => a.priority - b.priority);
}
