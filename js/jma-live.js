/**
 * 気象庁の予報JSONを読み、サイネージ用の地点データにする。
 * CORS は公式 API が * を返す。失敗時は呼び出し側で weather.json に戻す。
 */
import { JMA_WEATHER_CODES } from "./jma-codes.js";

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

const REGION_IDS = ["national", "hokkaido", "tohoku", "kanto", "chubu", "kinki", "chugoku", "shikoku", "kyushu", "okinawa"];

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
  return {
    class10: c10 ? (c15 ? c15.parent : class20Code) : null,
    office: c10?.parent || null
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

function findCityArea(area, city) {
  const class20 = findClass20Code(area, city);
  const walked = class20 ? walkToOffice(area, class20) : { class10: null, office: null };
  const class10 = city.jmaClass10 && area.class10s[city.jmaClass10]
    ? city.jmaClass10
    : walked.class10;
  const officeFromClass10 = class10 ? area.class10s[class10]?.parent : null;
  const raw = (city.jmaOffice && area.offices[city.jmaOffice] ? city.jmaOffice : null)
    || walked.office
    || officeFromClass10;
  return { class10, office: FORECAST_OFFICE[raw] || raw };
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
  const weeklyWxArea = weeklyWx ? pickArea(weeklyWx.areas, [mapping.class10, mapping.office]) : null;
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
    const code = String((i === 1 ? tomorrowCode : null) || weeklyCodes[weeklyIndex] || tomorrowCode);
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
    reportDatetime: shortTerm.reportDatetime || ""
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

export function buildJmaWeather(cities, area, forecastsByOffice) {
  const locationsById = new Map(cities.map((city) => [city.cityId, city]));
  const points = [];
  let updatedAt = "";
  for (const city of cities) {
    const mapping = findCityArea(area, city);
    const forecast = mapping.office ? forecastsByOffice[mapping.office] : null;
    if (!forecast) continue;
    const point = extractPoint(forecast, city, mapping);
    if (point.reportDatetime && point.reportDatetime > updatedAt) updatedAt = point.reportDatetime;
    const { reportDatetime, ...rest } = point;
    points.push(rest);
  }
  const notes = Object.fromEntries(
    REGION_IDS.map((id) => [id, noteForRegion(id, points, locationsById) || "各地の天気です。"])
  );
  return {
    title: "今日の天気",
    updatedAt: updatedAt || new Date().toISOString(),
    notes,
    points
  };
}

export async function fetchJmaWeather(cities) {
  const areaRes = await fetch(AREA_URL, { cache: "no-store" });
  if (!areaRes.ok) throw new Error("area.json");
  const area = await areaRes.json();
  const offices = [...new Set(cities.map((city) => findCityArea(area, city).office).filter(Boolean))];
  const forecastsByOffice = {};
  await Promise.all(offices.map(async (office) => {
    const response = await fetch(FORECAST_URL(office), { cache: "no-store" });
    if (!response.ok) return;
    forecastsByOffice[office] = await response.json();
  }));
  const weather = buildJmaWeather(cities, area, forecastsByOffice);
  if (!weather.points.length) throw new Error("no points");
  return weather;
}
