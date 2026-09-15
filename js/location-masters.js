/**
 * 都道府県・観測地点マスター。既存 locations.json は変更しない。
 */
const DATA_VERSION = "pref426";

let prefectures = [];
let stations = [];

export async function loadLocationMasters() {
  if (prefectures.length && stations.length) return { prefectures, stations };
  const base = window.__LED_BASE__ || "";
  const [prefDoc, stDoc] = await Promise.all([
    fetch(`${base}data/prefectures.json?v=${DATA_VERSION}`).then((r) => r.json()),
    fetch(`${base}data/stations.json?v=${DATA_VERSION}`).then((r) => r.json())
  ]);
  prefectures = (prefDoc.prefectures || []).filter((item) => item.enabled !== false);
  stations = (stDoc.stations || []).filter((item) => item.enabled !== false);
  return { prefectures, stations };
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
  return stations.find((item) => item.station_id === String(id))
    || stations.find((item) => item.city_id === "tokyo")
    || stations[0];
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
