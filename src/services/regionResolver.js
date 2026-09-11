/**
 * 現場設定から地方・予報区域・代表地点を自動判定する。
 */

import { getRegion } from "../data/regions/regions.js";
import { resolvePrefecture } from "./geocodingService.js";

export function resolveSiteLocation(siteInput) {
  const { prefecture, method, error } = resolvePrefecture(siteInput);
  if (!prefecture) {
    return {
      ok: false,
      error: error || "地域を判定できませんでした",
      siteInput
    };
  }

  const region = getRegion(prefecture.regionId);
  const city = extractCity(siteInput.address || "") || region.displayPoints[0].name;
  const point = pickDisplayPoint(region, prefecture.id, city);
  const forecastArea =
    region.forecastAreas.find((area) => area.id === point.forecastAreaId) ||
    region.forecastAreas.find((area) => area.prefectureId === prefecture.id);

  return {
    ok: true,
    method,
    site: {
      id: siteInput.id,
      name: siteInput.name,
      postalCode: siteInput.postalCode,
      address: siteInput.address,
      lat: siteInput.lat,
      lng: siteInput.lng,
      pitch: siteInput.pitch,
      inches: siteInput.inches,
      templates: siteInput.templates || [],
      active: siteInput.active !== false,
      prefecture: prefecture.name,
      prefectureId: prefecture.id,
      city,
      region: region.id,
      regionName: region.name,
      forecastAreaId: forecastArea?.id || point.forecastAreaId,
      forecastAreaName: forecastArea?.name || prefecture.name,
      pointId: point.id,
      pointName: point.name
    },
    region
  };
}

function pickDisplayPoint(region, prefectureId, city) {
  const byCity = region.displayPoints.find((point) => city.includes(point.name) || point.name.includes(city));
  if (byCity) return byCity;
  const byPref = region.displayPoints
    .filter((point) => point.prefectureId === prefectureId)
    .sort((a, b) => a.priority - b.priority);
  return byPref[0] || region.displayPoints[0];
}

function extractCity(address) {
  const afterPref = address.replace(/^.*?[都道府県]/, "");
  const city = afterPref.match(/([^\s]+?[市])/) || afterPref.match(/([^\s]+?[区町村])/);
  return city ? city[1] : "";
}
