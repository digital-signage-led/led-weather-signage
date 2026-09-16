/**
 * 地域・コンテンツの Single Source of Truth。
 * 表示区分と気象内部区分を分ける。旧IDはエイリアスで受ける。
 */

const DATA_VERSION = "pref483";

const REGION_ALIASES = {
  NATIONAL: "national",
  HOKKAIDO: "hokkaido",
  TOHOKU: "tohoku",
  KANTO: "kanto",
  HOKURIKU: "chubu",
  TOKAI: "chubu",
  CHUBU: "chubu",
  KINKI: "kinki",
  CHUGOKU: "chugoku",
  SHIKOKU: "shikoku",
  KYUSHU: "kyushu",
  KYUSHU_NORTH: "kyushu",
  KYUSHU_SOUTH: "kyushu",
  OKINAWA: "okinawa"
};

const CONTENT_ALIASES = {
  today: "today_weather",
  pop: "today_precip",
  tomorrow: "tomorrow_weather",
  weekly: "weekly_weather",
  "weekly-pop": "weekly_precip"
};

const PROJECTION_KEYS = {
  national: "NATIONAL",
  hokkaido: "HOKKAIDO",
  tohoku: "TOHOKU",
  kanto: "KANTO",
  chubu: "CHUBU",
  kinki: "KINKI",
  chugoku: "CHUGOKU",
  shikoku: "SHIKOKU",
  kyushu: "KYUSHU",
  okinawa: "OKINAWA"
};

let regions = [];
let contents = [];

export async function loadCatalog() {
  const [regionDoc, contentDoc] = await Promise.all([
    fetch(`data/regions.json?v=${DATA_VERSION}`).then((res) => res.json()),
    fetch(`data/contents.json?v=${DATA_VERSION}`).then((res) => res.json())
  ]);
  regions = regionDoc.regions || [];
  contents = contentDoc.contents || [];
  return { regions, contents };
}

export function canonicalRegion(id) {
  if (!id) return "national";
  const raw = String(id);
  return REGION_ALIASES[raw] || REGION_ALIASES[raw.toUpperCase()] || raw.toLowerCase();
}

export function canonicalContent(id) {
  if (!id) return "today_weather";
  const raw = String(id);
  return CONTENT_ALIASES[raw] || raw;
}

export function getRegion(id) {
  const canon = canonicalRegion(id);
  return regions.find((item) => item.id === canon) || regions[0];
}

export function getContent(id) {
  const canon = canonicalContent(id);
  return contents.find((item) => item.id === canon) || contents[0];
}

export function listRegions() {
  return regions;
}

export function listContents() {
  return contents;
}

export function projectionKey(regionId) {
  return PROJECTION_KEYS[canonicalRegion(regionId)] || "CHUBU";
}

export function isNational(regionId) {
  return canonicalRegion(regionId) === "national";
}

export function isPrecip(content) {
  return (content?.card || content) === "pop"
    || ["today_precip", "tomorrow_precip", "weekly_precip"].includes(canonicalContent(content?.id || content));
}

export function citiesForRegion(cities, region) {
  if (!region || region.id === "national") {
    return cities.filter((city) => city.showOnNational);
  }
  return cities.filter((city) => (
    (city.regionId === region.id && city.showOnRegion !== false)
    || (Array.isArray(city.alsoOnRegions) && city.alsoOnRegions.includes(region.id))
  ));
}

export function contentTitle(region, content) {
  const name = content.title || content.name;
  return `${region.name}｜${name}`;
}
