/**
 * 気象庁「地域気象観測所一覧」ZIP から station master を再生成する。
 * 地点は公式CSVのみ。推測で地点を足さない。
 */
import { execFileSync } from "node:child_process";
import { createWriteStream, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AME_ZIP = "https://www.jma.go.jp/jma/kishou/know/amedas/ame_master.zip";
const SNOW_ZIP = "https://www.jma.go.jp/jma/kishou/know/amedas/snow_master.zip";
const SOURCE_DATE = "2026-03-24";

const HOKKAIDO_BUREAUS = new Set([
  "宗谷", "上川", "留萌", "石狩", "空知", "後志", "ｵﾎｰﾂｸ", "オホーツク",
  "根室", "釧路", "十勝", "胆振", "日高", "渡島", "檜山"
]);

const PREF_BY_NAME = {
  青森: "aomori", 岩手: "iwate", 宮城: "miyagi", 秋田: "akita", 山形: "yamagata", 福島: "fukushima",
  茨城: "ibaraki", 栃木: "tochigi", 群馬: "gunma", 埼玉: "saitama", 千葉: "chiba", 東京: "tokyo", 神奈川: "kanagawa",
  新潟: "niigata", 富山: "toyama", 石川: "ishikawa", 福井: "fukui", 山梨: "yamanashi", 長野: "nagano",
  岐阜: "gifu", 静岡: "shizuoka", 愛知: "aichi", 三重: "mie",
  滋賀: "shiga", 京都: "kyoto", 大阪: "osaka", 兵庫: "hyogo", 奈良: "nara", 和歌山: "wakayama",
  鳥取: "tottori", 島根: "shimane", 岡山: "okayama", 広島: "hiroshima", 山口: "yamaguchi",
  徳島: "tokushima", 香川: "kagawa", 愛媛: "ehime", 高知: "kochi",
  福岡: "fukuoka", 佐賀: "saga", 長崎: "nagasaki", 熊本: "kumamoto", 大分: "oita", 宮崎: "miyazaki",
  鹿児島: "kagoshima", 沖縄: "okinawa"
};

const TYPE_MEANING = {
  官: "気象官署（気象台・測候所等）",
  四: "アメダス四要素（降水量・風向風速・気温・湿度）",
  三: "アメダス三要素",
  雨: "降水量観測所",
  雪: "積雪観測所"
};

function present(value) {
  const raw = String(value ?? "").trim();
  return raw !== "" && raw !== "－" && raw !== "-" && raw !== "―";
}

function num(value) {
  if (!present(value)) return null;
  const n = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function dms(deg, min) {
  const d = num(deg);
  const m = num(min);
  if (d == null || m == null) return null;
  return Math.round((d + m / 60) * 10000) / 10000;
}

function prefIdFor(bureau) {
  if (HOKKAIDO_BUREAUS.has(bureau)) return "hokkaido";
  return PREF_BY_NAME[bureau] || null;
}

function parseCsv(buf) {
  return new TextDecoder("shift_jis").decode(buf).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function elementsFromOfficial(type, windH, tempH) {
  const rain = type === "雨" || type === "四" || type === "三" || type === "官";
  const wind = type === "四" || type === "三" || type === "官" || present(windH);
  const temp = type === "四" || type === "三" || type === "官" || present(tempH);
  return {
    temperature: temp,
    humidity: type === "四" || type === "官",
    rainfall: rain,
    wind_direction: wind,
    wind_speed: wind,
    snow: type === "雪",
    pressure: type === "官",
    sunshine: type === "官"
  };
}

function stationRecord(pref, bureau, id, name, displayName, type, lat, lon, elev, elems) {
  return {
    station_id: String(id),
    station_name: name,
    jma_name: displayName && displayName !== "－" ? displayName : name,
    pref_id: pref.pref_id,
    region_id: pref.region_id,
    jma_bureau: bureau,
    jma_station_type: type,
    latitude: lat,
    longitude: lon,
    elevation: elev,
    elements: elems,
    temperature_available: elems.temperature,
    humidity_available: elems.humidity,
    rainfall_available: elems.rainfall,
    wind_direction_available: elems.wind_direction,
    wind_speed_available: elems.wind_speed,
    wind_available: elems.wind_speed,
    snow_available: elems.snow,
    pressure_available: elems.pressure,
    sunshine_available: elems.sunshine,
    enabled: true
  };
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

function findCsv(dir) {
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const name of readdirSync(current)) {
      const full = path.join(current, name);
      if (statSync(full).isDirectory()) stack.push(full);
      else if (name.toLowerCase().endsWith(".csv")) return full;
    }
  }
  throw new Error(`CSV がありません: ${dir}`);
}

function unzip(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  if (process.platform === "win32") {
    execFileSync("powershell", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -Force -LiteralPath '${zipPath}' -DestinationPath '${destDir}'`
    ]);
  } else {
    execFileSync("unzip", ["-o", zipPath, "-d", destDir]);
  }
  return findCsv(destDir);
}

const prefs = JSON.parse(readFileSync(path.join(root, "data/prefectures.json"), "utf8")).prefectures;
const prefById = Object.fromEntries(prefs.map((p) => [p.pref_id, p]));

const work = path.join(tmpdir(), "led-jma-amedas");
mkdirSync(work, { recursive: true });
const ameZip = path.join(work, "ame_master.zip");
const snowZip = path.join(work, "snow_master.zip");
await download(AME_ZIP, ameZip);
await download(SNOW_ZIP, snowZip);
const ameCsv = unzip(ameZip, path.join(work, "ame"));
const snowCsv = unzip(snowZip, path.join(work, "snow"));

const cacheDir = path.join(root, "data", "jma");
mkdirSync(cacheDir, { recursive: true });
writeFileSync(path.join(cacheDir, path.basename(ameCsv)), readFileSync(ameCsv));
writeFileSync(path.join(cacheDir, path.basename(snowCsv)), readFileSync(snowCsv));

const ameLines = parseCsv(readFileSync(ameCsv));
const snowLines = parseCsv(readFileSync(snowCsv));

const snowByName = new Set();
const snowIds = new Set();
for (const line of snowLines.slice(1)) {
  const c = line.split(",");
  snowIds.add(c[1]);
  snowByName.add(`${prefIdFor(c[0])}|${c[3]}`);
}

const excluded = [];
const byId = new Map();

for (const line of ameLines.slice(1)) {
  const c = line.split(",");
  const bureau = c[0];
  const prefId = prefIdFor(bureau);
  if (!prefId || !prefById[prefId]) {
    excluded.push({ station_id: c[1], name: c[3], reason: `都府県振興局未対応: ${bureau}` });
    continue;
  }
  const elems = elementsFromOfficial(c[2], c[12], c[13]);
  if (snowByName.has(`${prefId}|${c[3]}`) || snowIds.has(c[15])) elems.snow = true;
  byId.set(String(c[1]), stationRecord(
    prefById[prefId],
    bureau,
    c[1],
    c[3],
    c[5],
    c[2],
    dms(c[7], c[8]),
    dms(c[9], c[10]),
    num(c[11]),
    elems
  ));
}

for (const line of snowLines.slice(1)) {
  const c = line.split(",");
  if (c[2] !== "雪" || byId.has(String(c[1]))) continue;
  const prefId = prefIdFor(c[0]);
  if (!prefId || !prefById[prefId]) {
    excluded.push({ station_id: c[1], name: c[3], reason: `雪観測所の都府県振興局未対応: ${c[0]}` });
    continue;
  }
  byId.set(String(c[1]), stationRecord(
    prefById[prefId],
    c[0],
    c[1],
    c[3],
    c[3],
    "雪",
    dms(c[6], c[7]),
    dms(c[8], c[9]),
    num(c[10]),
    elementsFromOfficial("雪", "", "")
  ));
}

const stations = [...byId.values()].sort((a, b) => (
  a.pref_id.localeCompare(b.pref_id) || a.station_id.localeCompare(b.station_id, undefined, { numeric: true })
));

const byPref = {};
const byType = {};
for (const s of stations) {
  byPref[s.pref_id] = (byPref[s.pref_id] || 0) + 1;
  byType[s.jma_station_type] = (byType[s.jma_station_type] || 0) + 1;
}

const doc = {
  source: "Japan Meteorological Agency",
  source_name: "地域気象観測所一覧 / 地域気象観測所一覧（雪）",
  source_url: AME_ZIP,
  source_page: "https://www.jma.go.jp/jma/kishou/know/amedas/kaisetsu.html",
  source_date: SOURCE_DATE,
  generated_at: new Date().toISOString(),
  station_types: TYPE_MEANING,
  counts: {
    total: stations.length,
    official_ame_rows: ameLines.length - 1,
    official_snow_rows: snowLines.length - 1,
    by_type: byType,
    by_pref: byPref,
    excluded: excluded.length
  },
  excluded,
  stations
};

writeFileSync(path.join(root, "data/stations.json"), `${JSON.stringify(doc, null, 2)}\n`);
console.log(`wrote ${stations.length} stations from JMA master ${SOURCE_DATE}`);
console.log(`types ${JSON.stringify(byType)}`);
console.log(`akita ${byPref.akita} tokyo ${byPref.tokyo} osaka ${byPref.osaka} hokkaido ${byPref.hokkaido}`);
if (excluded.length) console.log(`excluded ${excluded.length}`, excluded.slice(0, 8));
