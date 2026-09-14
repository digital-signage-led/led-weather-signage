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
  tottori: ["鳥取市"],
  matsue: ["松江市"],
  okayama: ["岡山市"],
  yamaguchi: ["山口市"],
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

function formatYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function popAtHour(defines, values, ymd, hour) {
  for (let i = 0; i < defines.length; i += 1) {
    const stamp = new Date(defines[i]);
    if (Number.isNaN(stamp.getTime())) continue;
    if (formatYmd(stamp) === ymd && stamp.getHours() === hour) {
      return values[i] ?? null;
    }
  }
  return null;
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
  return { class10, class20: class20 || null, office: FORECAST_OFFICE[raw] || raw };
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

function shortTempsForYmd(tempSeries, tempArea, ymd) {
  if (!tempSeries || !tempArea?.temps) return { min: null, max: null };
  const defines = tempSeries.timeDefines || [];
  const temps = tempArea.temps;
  const idxs = [];
  for (let i = 0; i < defines.length; i += 1) {
    const stamp = new Date(defines[i]);
    if (!Number.isNaN(stamp.getTime()) && formatYmd(stamp) === ymd) idxs.push(i);
  }
  if (idxs.length >= 2) {
    return { min: num(temps[idxs[0]]), max: num(temps[idxs[1]]) };
  }
  if (idxs.length === 1) {
    const v = num(temps[idxs[0]]);
    return { min: v, max: v };
  }
  // 定義が無い／日付不一致のときは従来どおり [最低, 最高]
  if (defines.length >= 2 && temps.length >= 2) {
    const d0 = formatYmd(new Date(defines[0]));
    const d1 = formatYmd(new Date(defines[1]));
    if (d0 === ymd || d1 === ymd) {
      return { min: num(temps[0]), max: num(temps[1]) };
    }
  }
  return { min: null, max: null };
}

function weeklyTempsForYmd(weeklyTempSeries, weeklyTempArea, ymd) {
  if (!weeklyTempSeries || !weeklyTempArea) return { min: null, max: null };
  const defines = weeklyTempSeries.timeDefines || [];
  const idx = defines.findIndex((stamp) => {
    const d = new Date(stamp);
    return !Number.isNaN(d.getTime()) && formatYmd(d) === ymd;
  });
  if (idx < 0) return { min: null, max: null };
  return {
    min: num(weeklyTempArea.tempsMin?.[idx]),
    max: num(weeklyTempArea.tempsMax?.[idx])
  };
}

function weatherCodeForYmd(weeklyWxSeries, weeklyWxArea, ymd, fallback) {
  if (!weeklyWxSeries || !weeklyWxArea?.weatherCodes) return fallback;
  const defines = weeklyWxSeries.timeDefines || [];
  const idx = defines.findIndex((stamp) => {
    const d = new Date(stamp);
    return !Number.isNaN(d.getTime()) && formatYmd(d) === ymd;
  });
  if (idx < 0) return fallback;
  return String(weeklyWxArea.weatherCodes[idx] || fallback);
}

function popForYmd(weeklyWxSeries, weeklyWxArea, ymd, fallback) {
  if (!weeklyWxSeries || !weeklyWxArea) return fallback;
  const defines = weeklyWxSeries.timeDefines || [];
  const idx = defines.findIndex((stamp) => {
    const d = new Date(stamp);
    return !Number.isNaN(d.getTime()) && formatYmd(d) === ymd;
  });
  if (idx < 0) return fallback;
  const raw = weeklyWxArea.pops?.[idx];
  if (raw === "" || raw == null) return fallback;
  return num(raw) ?? fallback;
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
  const pops = (popArea?.pops || []).map(num);
  const popDefines = popSeries?.timeDefines || [];
  const todayYmd = formatYmd(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowYmd = formatYmd(tomorrowDate);
  const todayAm = popAtHour(popDefines, pops, todayYmd, 6);
  const todayPm = popAtHour(popDefines, pops, todayYmd, 12);
  const tomorrowAm = popAtHour(popDefines, pops, tomorrowYmd, 6);
  const tomorrowPm = popAtHour(popDefines, pops, tomorrowYmd, 12);
  const todayPops = pops.filter((n) => n != null);
  const todayPop = todayAm != null || todayPm != null
    ? Math.max(todayAm ?? 0, todayPm ?? 0)
    : (todayPops.length ? Math.max(...todayPops.slice(0, Math.min(3, todayPops.length))) : 0);
  const tomorrowPop = tomorrowAm != null || tomorrowPm != null
    ? Math.max(tomorrowAm ?? 0, tomorrowPm ?? 0)
    : (todayPops.length ? Math.max(...todayPops.slice(-3)) : todayPop);

  const shortToday = shortTempsForYmd(tempSeries, tempArea, todayYmd);
  const shortTomorrow = shortTempsForYmd(tempSeries, tempArea, tomorrowYmd);
  // 夕方以降は temps が「明日の最低／最高」だけになることが多い
  const fallbackPair = {
    min: num(tempArea?.temps?.[0]),
    max: num(tempArea?.temps?.[1])
  };

  const weeklyWx = seriesBy(weekly, "weatherCodes");
  const weeklyTemp = seriesBy(weekly, "tempsMax") || seriesBy(weekly, "tempsMin");
  const weeklyWxArea = weeklyWx ? pickArea(weeklyWx.areas, [mapping.class10, mapping.office]) : null;
  const weeklyTempArea = weeklyTemp
    ? pickArea(weeklyTemp.areas, [city.cityName, city.cityName.replace(/[市町村]$/, "")])
    : null;

  const weeklyDays = [];
  for (let i = 0; i < 7; i += 1) {
    const dayDate = new Date();
    dayDate.setDate(dayDate.getDate() + i);
    const ymd = formatYmd(dayDate);
    const weeklyT = weeklyTempsForYmd(weeklyTemp, weeklyTempArea, ymd);
    const shortT = i === 0
      ? shortToday
      : i === 1
        ? shortTomorrow
        : { min: null, max: null };
    // 週間の該当日が空（明日の気温など）なら短時間予報で補う。無い日は null
    const tempMax = weeklyT.max ?? shortT.max ?? (i <= 1 ? fallbackPair.max : null);
    const tempMin = weeklyT.min ?? shortT.min ?? (i <= 1 ? fallbackPair.min : null);

    if (i === 0) {
      weeklyDays.push({
        weather: todayCode,
        weatherLabel: labelOf(todayCode),
        tempMax,
        tempMin,
        pop: todayPop,
        popAm: todayAm ?? todayPop,
        popPm: todayPm ?? todayPop,
        humidity: estimateLiveHumidity(todayPop, todayCode)
      });
      continue;
    }

    const code = weatherCodeForYmd(
      weeklyWx,
      weeklyWxArea,
      ymd,
      i === 1 ? tomorrowCode : todayCode
    );
    const dayPop = popForYmd(
      weeklyWx,
      weeklyWxArea,
      ymd,
      i === 1 ? tomorrowPop : todayPop
    );
    weeklyDays.push({
      weather: code,
      weatherLabel: labelOf(code),
      tempMax,
      tempMin,
      pop: dayPop,
      popAm: i === 1 ? (tomorrowAm ?? dayPop) : dayPop,
      popPm: i === 1 ? (tomorrowPm ?? dayPop) : dayPop,
      humidity: estimateLiveHumidity(dayPop, code)
    });
  }

  const climateAreas = weekly?.tempAverage?.areas || [];
  const climate = climateAreas.find((item) => item.area?.name === city.cityName)
    || climateAreas.find((item) => city.cityName && item.area?.name?.includes(city.cityName.replace(/[市町村]$/, "")))
    || null;

  return {
    cityId: city.cityId,
    weather: todayCode,
    weatherLabel: labelOf(todayCode),
    tempMax: weeklyDays[0].tempMax,
    tempMin: weeklyDays[0].tempMin,
    pop: todayPop,
    normalMax: num(climate?.max),
    normalMin: num(climate?.min),
    jmaClass10: mapping.class10 || "",
    jmaClass20: mapping.class20 || "",
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

function estimateLiveHumidity(pop, weatherCode) {
  const code = String(weatherCode || "");
  const wet = /^(3|4)|雨|雪|雷/.test(code) || Number(code) >= 200 && Number(code) < 500 && /[3-9]/.test(code.slice(-1));
  // JMA weather codes: 3xx rain, etc. Simpler: use pop
  const rainy = Number(pop) >= 40 || /^3\d\d$/.test(code) || /^4\d\d$/.test(code);
  const base = rainy || wet ? 72 : 52;
  const n = Math.round(base + (Number(pop) || 0) * 0.18);
  return Math.max(20, Math.min(99, n));
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

let areaCache = { at: 0, doc: null };
const AREA_TTL_MS = 24 * 60 * 60 * 1000;

async function loadArea() {
  const now = Date.now();
  if (areaCache.doc && now - areaCache.at < AREA_TTL_MS) return areaCache.doc;
  const areaRes = await fetch(AREA_URL, { cache: "force-cache" });
  if (!areaRes.ok) throw new Error("area.json");
  const area = await areaRes.json();
  areaCache = { at: now, doc: area };
  return area;
}

export async function fetchJmaWeather(cities) {
  const area = await loadArea();
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
