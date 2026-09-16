/**
 * 都道府県・観測地点マスター。既存 locations.json は変更しない。
 */
import { requiredStationElements, stationMatchesContent, STATION_TYPE_GROUPS } from "./content-registry.js?v=pref434";

const DATA_VERSION = "pref432";

let prefectures = [];
let stations = [];
let meta = {};

export async function loadLocationMasters() {
  if (prefectures.length && stations.length) return { prefectures, stations, meta };
  const base = window.__LED_BASE__ || "";
  const [prefDoc, stDoc] = await Promise.all([
    fetch(`${base}data/prefectures.json?v=${DATA_VERSION}`).then((r) => r.json()),
    fetch(`${base}data/stations.json?v=${DATA_VERSION}`).then((r) => r.json())
  ]);
  prefectures = (prefDoc.prefectures || []).filter((item) => item.enabled !== false);
  stations = (stDoc.stations || []).filter((item) => item.enabled !== false);
  meta = {
    source: stDoc.source,
    source_date: stDoc.source_date,
    generated_at: stDoc.generated_at,
    counts: stDoc.counts,
    station_types: stDoc.station_types
  };
  return { prefectures, stations, meta };
}

export function listPrefectures() {
  return prefectures;
}

export function listStations() {
  return stations;
}

export function getPrefecture(id) {
  return prefectures.find((item) => item.pref_id === id) || prefectures.find((item) => item.pref_id === "tokyo") || prefectures[0];
}

export function getStation(id) {
  return stations.find((item) => item.station_id === String(id)) || null;
}

export function stationTypeLabel(station) {
  return STATION_TYPE_GROUPS[station?.jma_station_type] || station?.jma_station_type || "観測地点";
}

export function stationElementHint(station) {
  const bits = [];
  if (station?.temperature_available) bits.push("気温");
  if (station?.rainfall_available) bits.push("雨");
  if (station?.wind_available || station?.wind_speed_available) bits.push("風");
  if (station?.snow_available) bits.push("雪");
  return bits.join("・") || "要素なし";
}

export function getAvailableStations({ prefId, contentId } = {}) {
  return stations.filter((item) => (
    (!prefId || item.pref_id === prefId)
    && stationMatchesContent(item, contentId)
  ));
}

export function resolveStationForContent(stationId, { prefId, contentId, allowFirst = false } = {}) {
  const available = getAvailableStations({ prefId, contentId });
  const exact = available.find((item) => item.station_id === String(stationId));
  if (exact) return { station: exact, matched: true, substituted: false, reason: "" };
  const raw = getStation(stationId);
  if (raw && !stationMatchesContent(raw, contentId)) {
    const first = allowFirst ? available[0] || null : null;
    return {
      station: first,
      matched: false,
      substituted: Boolean(first),
      reason: `この観測地点では必要な観測（${requiredStationElements(contentId).join("・") || "指定要素"}）をしていません`
    };
  }
  if (!raw) {
    const first = allowFirst ? available[0] || null : null;
    return {
      station: first,
      matched: false,
      substituted: Boolean(first),
      reason: "指定の観測地点はマスターにありません"
    };
  }
  return { station: null, matched: false, substituted: false, reason: "利用できる観測地点がありません" };
}

export function stationsForPref(prefId, capability = null) {
  return stations.filter((item) => (
    item.pref_id === prefId
    && (!capability || item[capability] === true)
  ));
}

export function stationsForContent(capability = null) {
  return stations.filter((item) => !capability || item[capability] === true);
}
