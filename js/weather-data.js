/**
 * 螟夜Κ豌苓ｱ｡ 竊・蜈ｱ騾壹Δ繝・Ν縲３enderer 縺ｯ縺薙％縺縺代ｒ隕九ｋ縲・
 */

import { citiesForRegion } from "./catalog.js?v=pref387";

export function adaptWeather(doc) {
  return {
    updatedAt: doc.updatedAt || "",
    notes: doc.notes || {},
    contentNotes: doc.contentNotes || {},
    pointsByCity: new Map((doc.points || []).map((point) => [point.cityId, point]))
  };
}

export function emptyWeatherPoint(cityId) {
  return {
    cityId,
    missing: true,
    weather: "",
    weatherLabel: "情報取得中",
    tempMax: null,
    tempMin: null,
    pop: null,
    weekly: []
  };
}

/** 地点マスターが正。気象データがなくても地点は落とさない。 */
export function aggregateRegion(cities, weather, region) {
  const list = citiesForRegion(cities, region).slice();
  if (region?.id === "national") {
    // 全国の表は北から：札幌 → 那覇
    return list.sort((a, b) => (
      (Number(b.latitude) || 0) - (Number(a.latitude) || 0)
      || String(a.cityId).localeCompare(String(b.cityId))
    ));
  }
  return list.sort((a, b) => (a.priority - b.priority) || String(a.cityId).localeCompare(String(b.cityId)));
}

export function assertRegionCoverage(region, expected, rendered) {
  const expIds = (expected || []).map((city) => city.cityId).filter(Boolean);
  const gotIds = (rendered || []).map((city) => city.cityId).filter(Boolean);
  const missing = expIds.filter((id) => !gotIds.includes(id));
  const dupes = gotIds.filter((id, index) => gotIds.indexOf(id) !== index);
  const extra = gotIds.filter((id) => !expIds.includes(id));
  if (!missing.length && !dupes.length) {
    return { ok: true, expected: expIds.length, rendered: gotIds.length, missing, dupes, extra };
  }
  const nameOf = (id) => {
    const hit = (expected || []).find((city) => city.cityId === id)
      || (rendered || []).find((city) => city.cityId === id);
    return hit?.cityName || id;
  };
  if (missing.length) {
    console.error(`${region?.name || region?.id || "地域"}：${missing.map(nameOf).join("、")}が未描画`);
  }
  if (dupes.length) {
    console.error(`${region?.name || region?.id || "地域"}：${[...new Set(dupes)].map(nameOf).join("、")}が重複`);
  }
  return { ok: false, expected: expIds.length, rendered: gotIds.length, missing, dupes, extra };
}
