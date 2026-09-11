/**
 * 気象庁予報JSONから data/weather.json を更新する。
 * 表示HTMLは API を呼ばず、このスナップショットを読む。
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JMA_WEATHER_CODES } from "../js/jma-codes.js";
import locations from "../data/locations.json" with { type: "json" };

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const AREA_URL = "https://www.jma.go.jp/bosai/common/const/area.json";
const FORECAST_URL = (office) => `https://www.jma.go.jp/bosai/forecast/data/forecast/${office}.json`;

const FORECAST_OFFICE = {
  "014030": "014100",
  "460040": "460100"
};

const CLASS20_ALIASES = {
  naze: ["奄美市"],
  nago: ["名護市"],
  miyako: ["宮古島市"],
  miyakoIwate: ["宮古市"],
  tsu: ["津市東部", "津市中西部"],
  tokyo: ["千代田区"],
  naha: ["那覇市"],
  kitami: ["北見市北見", "北見市"],
  otaru: ["小樽市"],
  nemuro: ["根室市"],
  nagano: ["長野市長野"],
  takayama: ["高山市"],
  sado: ["佐渡市"],
  aizuwakamatsu: ["会津若松市"],
  iwaki: ["いわき市"],
  saitama: ["さいたま市"],
  yokohama: ["横浜市"],
  nagoya: ["名古屋市"],
  osaka: ["大阪市"],
  kyoto: ["京都市"],
  kobe: ["神戸市"],
  fukuoka: ["福岡市"],
  sendai: ["仙台市"],
  hiroshima: ["広島市"],
  kagoshima: ["鹿児島市"],
  wakkanai: ["稚内市"],
  asahikawa: ["旭川市"],
  abashiri: ["網走市"],
  kushiro: ["釧路市"],
  obihiro: ["帯広市"],
  sapporo: ["札幌市"],
  muroran: ["室蘭市"],
  hakodate: ["函館市"]
};

function num(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function labelOf(code) {
  return JMA_WEATHER_CODES[String(code)]?.labelJa || "";
}

function walkToOffice(area, class20Code) {
  const c20 = area.class20s[class20Code];
  const c15 = c20 ? area.class15s[c20.parent] : null;
  const c10 = c15 ? area.class10s[c15.parent] : area.class10s[class20Code];
  const officeCode = c10?.parent;
  return {
    class20: c20 ? class20Code : null,
    class15: c15 ? c20.parent : null,
    class10: c10 ? (c15 ? c15.parent : class20Code) : null,
    office: officeCode || null
  };
}

function findClass20Code(area, city) {
  const aliases = CLASS20_ALIASES[city.cityId] || [];
  for (const name of aliases) {
    const hit = Object.entries(area.class20s).find(([, value]) => value.name === name);
    if (hit) return hit[0];
  }
  const exactCity = Object.entries(area.class20s).find(([, value]) => value.name === `${city.cityName}市`);
  if (exactCity) return exactCity[0];
  const startsCity = Object.entries(area.class20s).find(([, value]) => value.name.startsWith(`${city.cityName}市`));
  return startsCity?.[0] || null;
}

function forecastOffice(office) {
  return FORECAST_OFFICE[office] || office;
}

function findCityArea(area, city) {
  const class20 = findClass20Code(area, city);
  const walked = class20 ? walkToOffice(area, class20) : { class10: null, office: null };
  const class10 = city.jmaClass10 && area.class10s[city.jmaClass10]
    ? city.jmaClass10
    : walked.class10;
  const officeFromClass10 = class10 ? area.class10s[class10]?.parent : null;
  const office = forecastOffice(
    (city.jmaOffice && area.offices[city.jmaOffice] ? city.jmaOffice : null)
    || walked.office
    || officeFromClass10
  );
  return { class10, office };
}

function pickArea(areas, codesOrNames) {
  const names = codesOrNames.filter(Boolean);
  return areas.find((item) => names.includes(item.area.code))
    || areas.find((item) => names.some((name) => item.area.name === name))
    || areas.find((item) => names.some((name) => item.area.name.includes(name)))
    || areas[0];
}

function seriesBy(forecastBlock, key) {
  return forecastBlock?.timeSeries?.find((series) => series.areas?.some((item) => key in item));
}

function extractPoint(forecast, city, mapping) {
  const shortTerm = forecast[0];
  const weekly = forecast[1];
  const wxSeries = seriesBy(shortTerm, "weatherCodes");
  const popSeries = seriesBy(shortTerm, "pops");
  const tempSeries = seriesBy(shortTerm, "temps");
  const wxArea = pickArea(wxSeries.areas, [mapping.class10, mapping.office, city.cityName]);
  const popArea = popSeries ? pickArea(popSeries.areas, [mapping.class10, mapping.office, city.cityName]) : null;
  const tempArea = tempSeries
    ? pickArea(tempSeries.areas, [city.cityName, city.cityName.replace(/[市町村]$/, "")])
    : null;

  const todayCode = String(wxArea.weatherCodes[0] || "200");
  const tomorrowCode = String(wxArea.weatherCodes[1] || todayCode);
  const pops = (popArea?.pops || []).map(num).filter((n) => n != null);
  const todayPop = pops.length ? Math.max(...pops.slice(0, Math.min(3, pops.length))) : 0;
  const tomorrowPop = pops.length ? Math.max(...pops.slice(-3)) : todayPop;
  const tempMin = num(tempArea?.temps?.[0]);
  const tempMax = num(tempArea?.temps?.[1]);

  const weeklyWx = seriesBy(weekly, "weatherCodes");
  const weeklyTemp = seriesBy(weekly, "tempsMax") || seriesBy(weekly, "tempsMin");
  const weeklyWxArea = weeklyWx ? pickArea(weeklyWx.areas, [mapping.class10, mapping.office, weeklyWx.areas[0]?.area?.code]) : null;
  const weeklyTempArea = weeklyTemp
    ? pickArea(weeklyTemp.areas, [city.cityName, city.cityName.replace(/[市町村]$/, "")])
    : null;
  const weeklyCodes = weeklyWxArea?.weatherCodes || [];
  const weeklyPops = (weeklyWxArea?.pops || []).map((value) => (value === "" ? null : num(value)));

  const weeklyDays = [];
  for (let i = 0; i < 7; i += 1) {
    if (i === 0) {
      weeklyDays.push({
        weather: todayCode,
        weatherLabel: labelOf(todayCode),
        tempMax: tempMax ?? num(weeklyTempArea?.tempsMax?.[0]) ?? 0,
        tempMin: tempMin ?? num(weeklyTempArea?.tempsMin?.[0]) ?? 0,
        pop: todayPop
      });
      continue;
    }
    const weeklyIndex = i - 1;
    const code = String(
      (i === 1 ? tomorrowCode : null)
      || weeklyCodes[weeklyIndex]
      || tomorrowCode
    );
    weeklyDays.push({
      weather: code,
      weatherLabel: labelOf(code),
      tempMax: num(weeklyTempArea?.tempsMax?.[weeklyIndex]) ?? tempMax ?? 0,
      tempMin: num(weeklyTempArea?.tempsMin?.[weeklyIndex]) ?? tempMin ?? 0,
      pop: weeklyPops[weeklyIndex] ?? (i === 1 ? tomorrowPop : todayPop)
    });
  }

  return {
    cityId: city.cityId,
    weather: todayCode,
    weatherLabel: labelOf(todayCode),
    tempMax: weeklyDays[0].tempMax,
    tempMin: weeklyDays[0].tempMin,
    pop: todayPop,
    tomorrow: {
      weather: weeklyDays[1].weather,
      weatherLabel: weeklyDays[1].weatherLabel,
      tempMax: weeklyDays[1].tempMax,
      tempMin: weeklyDays[1].tempMin,
      pop: weeklyDays[1].pop
    },
    weekly: weeklyDays,
    _debug: {
      office: mapping.office,
      class10: mapping.class10,
      wxArea: wxArea.area.name,
      tempArea: tempArea?.area?.name || null,
      report: shortTerm.reportDatetime
    }
  };
}

function noteForRegion(regionId, points, locationsById) {
  const regionPoints = regionId === "national"
    ? points.filter((point) => locationsById.get(point.cityId)?.showOnNational)
    : points.filter((point) => locationsById.get(point.cityId)?.regionId === regionId);
  if (!regionPoints.length) return "";
  const labels = regionPoints.map((point) => point.weatherLabel);
  const snow = labels.filter((label) => /雪/.test(label) && !/雨/.test(label)).length;
  const rain = labels.filter((label) => /雨/.test(label)).length;
  const cloudy = labels.filter((label) => /曇/.test(label)).length;
  const sunny = labels.filter((label) => /^晴/.test(label)).length;
  if (snow) return "雪の所があります。路面の凍結に注意してください。";
  if (rain >= Math.ceil(regionPoints.length / 2)) return "雨の所が多くなります。傘をご用意ください。";
  if (rain) return "雨の所があります。折りたたみ傘があると安心です。";
  if (cloudy >= sunny) return "曇りの所が多くなります。";
  return "おおむね晴れです。";
}

const forecastCache = new Map();
async function getForecast(office) {
  if (forecastCache.has(office)) return forecastCache.get(office);
  const response = await fetch(FORECAST_URL(office));
  if (!response.ok) throw new Error(`${office} ${response.status}`);
  const json = await response.json();
  forecastCache.set(office, json);
  await new Promise((resolve) => setTimeout(resolve, 80));
  return json;
}

const area = await (await fetch(AREA_URL)).json();
const locationsById = new Map(locations.cities.map((city) => [city.cityId, city]));
const points = [];
const failures = [];

for (const city of locations.cities) {
  const mapping = findCityArea(area, city);
  if (!mapping.office) {
    failures.push(`${city.cityId} ${city.cityName}: office not found`);
    continue;
  }
  try {
    const forecast = await getForecast(mapping.office);
    const point = extractPoint(forecast, city, mapping);
    points.push(point);
    const snow = /雪/.test(point.weatherLabel);
    console.log(
      `${city.cityName.padEnd(6)} ${point.weather} ${point.weatherLabel.padEnd(12)} ${point.tempMax}/${point.tempMin} ${point.pop}%  ${point._debug.wxArea} / ${point._debug.tempArea || "-"}`
      + (snow ? "  << SNOW" : "")
    );
  } catch (error) {
    failures.push(`${city.cityId}: ${error.message}`);
  }
}

if (failures.length) {
  console.error("FAILURES", failures);
  process.exitCode = 1;
}

const regionIds = ["national", "hokkaido", "tohoku", "kanto", "chubu", "kinki", "chugoku", "shikoku", "kyushu", "okinawa"];
const notes = Object.fromEntries(regionIds.map((id) => [id, noteForRegion(id, points, locationsById) || "各地の天気です。"]));

const updatedAt = points[0]
  ? (forecastCache.values().next().value?.[0]?.reportDatetime || new Date().toISOString())
  : new Date().toISOString();

const out = {
  title: "今日の天気",
  updatedAt,
  notes,
  points: points.map(({ _debug, ...point }) => point)
};

writeFileSync(path.join(root, "data/weather.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${out.points.length} points  updatedAt=${out.updatedAt}  offices=${forecastCache.size}`);
if (failures.length) console.log(failures.join("\n"));
