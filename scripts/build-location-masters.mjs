/**
 * 47都道府県と、既存地点に対応するアメダス観測点マスターを生成する。
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PREFS = [
  ["hokkaido", "北海道", "hokkaido", 43.0642, 141.3469, "016000"],
  ["aomori", "青森県", "tohoku", 40.8244, 140.74, "020000"],
  ["iwate", "岩手県", "tohoku", 39.7036, 141.1527, "030000"],
  ["miyagi", "宮城県", "tohoku", 38.2688, 140.8721, "040000"],
  ["akita", "秋田県", "tohoku", 39.7186, 140.1024, "050000"],
  ["yamagata", "山形県", "tohoku", 38.2404, 140.3633, "060000"],
  ["fukushima", "福島県", "tohoku", 37.7503, 140.4676, "070000"],
  ["ibaraki", "茨城県", "kanto", 36.3418, 140.4468, "080000"],
  ["tochigi", "栃木県", "kanto", 36.5658, 139.8836, "090000"],
  ["gunma", "群馬県", "kanto", 36.3911, 139.0608, "100000"],
  ["saitama", "埼玉県", "kanto", 35.8569, 139.6489, "110000"],
  ["chiba", "千葉県", "kanto", 35.6046, 140.1233, "120000"],
  ["tokyo", "東京都", "kanto", 35.6895, 139.6917, "130000"],
  ["kanagawa", "神奈川県", "kanto", 35.4478, 139.6425, "140000"],
  ["niigata", "新潟県", "chubu", 37.9024, 139.0232, "150000"],
  ["toyama", "富山県", "chubu", 36.6953, 137.2113, "160000"],
  ["ishikawa", "石川県", "chubu", 36.5947, 136.6256, "170000"],
  ["fukui", "福井県", "chubu", 36.0652, 136.2216, "180000"],
  ["yamanashi", "山梨県", "chubu", 35.6642, 138.5684, "190000"],
  ["nagano", "長野県", "chubu", 36.6513, 138.181, "200000"],
  ["gifu", "岐阜県", "chubu", 35.3912, 136.7223, "210000"],
  ["shizuoka", "静岡県", "chubu", 34.9769, 138.3831, "220000"],
  ["aichi", "愛知県", "chubu", 35.1802, 136.9066, "230000"],
  ["mie", "三重県", "chubu", 34.7303, 136.5086, "240000"],
  ["shiga", "滋賀県", "kinki", 35.0045, 135.8686, "250000"],
  ["kyoto", "京都府", "kinki", 35.0212, 135.7556, "260000"],
  ["osaka", "大阪府", "kinki", 34.6863, 135.52, "270000"],
  ["hyogo", "兵庫県", "kinki", 34.6913, 135.183, "280000"],
  ["nara", "奈良県", "kinki", 34.6851, 135.8329, "290000"],
  ["wakayama", "和歌山県", "kinki", 34.226, 135.1675, "300000"],
  ["tottori", "鳥取県", "chugoku", 35.5039, 134.2377, "310000"],
  ["shimane", "島根県", "chugoku", 35.4723, 133.0505, "320000"],
  ["okayama", "岡山県", "chugoku", 34.6618, 133.9344, "330000"],
  ["hiroshima", "広島県", "chugoku", 34.3963, 132.4596, "340000"],
  ["yamaguchi", "山口県", "chugoku", 34.1859, 131.4706, "350000"],
  ["tokushima", "徳島県", "shikoku", 34.0658, 134.5594, "360000"],
  ["kagawa", "香川県", "shikoku", 34.3401, 134.0434, "370000"],
  ["ehime", "愛媛県", "shikoku", 33.8416, 132.7657, "380000"],
  ["kochi", "高知県", "shikoku", 33.5597, 133.5311, "390000"],
  ["fukuoka", "福岡県", "kyushu", 33.6064, 130.4181, "400000"],
  ["saga", "佐賀県", "kyushu", 33.2494, 130.2988, "410000"],
  ["nagasaki", "長崎県", "kyushu", 32.7448, 129.8737, "420000"],
  ["kumamoto", "熊本県", "kyushu", 32.7898, 130.7417, "430000"],
  ["oita", "大分県", "kyushu", 33.2382, 131.6126, "440000"],
  ["miyazaki", "宮崎県", "kyushu", 31.9111, 131.4239, "450000"],
  ["kagoshima", "鹿児島県", "kyushu", 31.5602, 130.5581, "460000"],
  ["okinawa", "沖縄県", "okinawa", 26.2124, 127.6809, "471000"]
];

const CITY_PREF = {
  wakkanai: "hokkaido", asahikawa: "hokkaido", abashiri: "hokkaido", kitami: "hokkaido",
  nemuro: "hokkaido", kushiro: "hokkaido", obihiro: "hokkaido", sapporo: "hokkaido",
  otaru: "hokkaido", muroran: "hokkaido", hakodate: "hokkaido",
  aomori: "aomori", akita: "akita", morioka: "iwate", miyakoIwate: "iwate",
  yamagata: "yamagata", sendai: "miyagi", fukushima: "fukushima",
  aizuwakamatsu: "fukushima", iwaki: "fukushima",
  nagano: "nagano", kofu: "yamanashi", maebashi: "gunma", utsunomiya: "tochigi",
  mito: "ibaraki", saitama: "saitama", tokyo: "tokyo", yokohama: "kanagawa",
  chiba: "chiba", sado: "niigata", niigata: "niigata", toyama: "toyama",
  kanazawa: "ishikawa", fukui: "fukui", takayama: "gifu", gifu: "gifu",
  nagoya: "aichi", shizuoka: "shizuoka", tsu: "mie",
  otsu: "shiga", kyoto: "kyoto", nara: "nara", osaka: "osaka", kobe: "hyogo",
  wakayama: "wakayama", tottori: "tottori", matsue: "shimane", okayama: "okayama",
  hiroshima: "hiroshima", yamaguchi: "yamaguchi",
  tokushima: "tokushima", takamatsu: "kagawa", matsuyama: "ehime", kochi: "kochi",
  fukuoka: "fukuoka", saga: "saga", oita: "oita", nagasaki: "nagasaki",
  kumamoto: "kumamoto", miyazaki: "miyazaki", kagoshima: "kagoshima", naze: "kagoshima",
  nago: "okinawa", naha: "okinawa", miyako: "okinawa", ishigaki: "okinawa"
};

function dmsToDeg(pair) {
  return Number(pair[0]) + Number(pair[1]) / 60;
}

function dist2(aLat, aLon, bLat, bLon) {
  const dy = aLat - bLat;
  const dx = (aLon - bLon) * Math.cos((aLat * Math.PI) / 180);
  return dy * dy + dx * dx;
}

const locations = JSON.parse(readFileSync(path.join(root, "data/locations.json"), "utf8"));
const table = await fetch("https://www.jma.go.jp/bosai/amedas/const/amedastable.json").then((r) => r.json());

const stationsRaw = Object.entries(table).map(([id, row]) => ({
  id,
  name: row.kjName,
  lat: dmsToDeg(row.lat),
  lon: dmsToDeg(row.lon),
  elems: String(row.elems || "")
}));

const used = new Set();
const stations = [];
for (const city of locations.cities) {
  const prefId = CITY_PREF[city.cityId];
  if (!prefId) continue;
  let best = null;
  let bestD = Infinity;
  for (const st of stationsRaw) {
    const d = dist2(city.latitude, city.longitude, st.lat, st.lon);
    if (d < bestD) {
      best = st;
      bestD = d;
    }
  }
  if (!best || used.has(best.id)) continue;
  used.add(best.id);
  const elems = best.elems.padEnd(8, "0");
  stations.push({
    station_id: best.id,
    station_name: city.cityName,
    jma_name: best.name,
    city_id: city.cityId,
    pref_id: prefId,
    region_id: city.regionId,
    latitude: city.latitude,
    longitude: city.longitude,
    temperature_available: elems[1] === "1",
    rainfall_available: elems[0] === "1",
    wind_available: elems[2] === "1",
    enabled: true
  });
}

const prefectures = PREFS.map(([pref_id, pref_name, region_id, center_lat, center_lon, jma_office]) => ({
  pref_id,
  pref_name,
  region_id,
  center_lat,
  center_lon,
  jma_office,
  enabled: true
}));

writeFileSync(path.join(root, "data/prefectures.json"), `${JSON.stringify({ prefectures }, null, 2)}\n`);
writeFileSync(path.join(root, "data/stations.json"), `${JSON.stringify({ stations }, null, 2)}\n`);
console.log(`wrote ${prefectures.length} prefs, ${stations.length} stations`);
