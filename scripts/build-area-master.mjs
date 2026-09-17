import fs from "node:fs";

const loc = JSON.parse(fs.readFileSync(new URL("../data/locations.json", import.meta.url), "utf8"));
const defaults = JSON.parse(fs.readFileSync(new URL("../data/layout-defaults.json", import.meta.url), "utf8"));
const cities = loc.cities.map((city) => ({
  cityId: city.cityId,
  cityName: city.cityName,
  regionId: city.regionId,
  showOnNational: Boolean(city.showOnNational),
  showOnRegion: city.showOnRegion !== false,
  alsoOnRegions: city.alsoOnRegions || [],
  priority: city.priority || 9,
  latitude: city.latitude,
  longitude: city.longitude,
  cardX: city.cardX,
  cardY: city.cardY
}));

const src = `/** 地域・地点の同期マスター。通信不要。 */
export const REGION_MASTER = ${JSON.stringify({
  national: { id: "national", name: "全国" },
  hokkaido: { id: "hokkaido", name: "北海道" },
  tohoku: { id: "tohoku", name: "東北" },
  kanto: { id: "kanto", name: "関東" },
  chubu: { id: "chubu", name: "中部" },
  kinki: { id: "kinki", name: "近畿" },
  chugoku: { id: "chugoku", name: "中国" },
  shikoku: { id: "shikoku", name: "四国" },
  kyushu: { id: "kyushu", name: "九州" },
  okinawa: { id: "okinawa", name: "沖縄" }
}, null, 2)};

export const CONTENT_MASTER = ${JSON.stringify({
  today_weather: { id: "today_weather", name: "今日の天気", kind: "map", card: "weather" },
  today_precip: { id: "today_precip", name: "今日の降水確率", kind: "map", card: "pop" },
  tomorrow_weather: { id: "tomorrow_weather", name: "明日の天気", kind: "map", card: "weather" },
  tomorrow_precip: { id: "tomorrow_precip", name: "明日の降水確率", kind: "map", card: "pop" },
  weekly_weather: { id: "weekly_weather", name: "週間天気", kind: "table", card: "weather" },
  weekly_precip: { id: "weekly_precip", name: "週間降水確率", kind: "table", card: "pop" }
}, null, 2)};

export const CITY_MASTER = ${JSON.stringify(cities, null, 2)};

export const SCALE_MASTER = ${JSON.stringify({
  cardScales: defaults.cardScales || {},
  titleScales: defaults.titleScales || {}
})};

export function citiesForMaster(regionId) {
  if (regionId === "national") return CITY_MASTER.filter((city) => city.showOnNational);
  return CITY_MASTER.filter((city) => (
    (city.regionId === regionId && city.showOnRegion !== false)
    || (city.alsoOnRegions || []).includes(regionId)
  ));
}
`;

fs.writeFileSync(new URL("../js/area-master.js", import.meta.url), src);
console.log(`wrote ${cities.length} cities`);
