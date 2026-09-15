/**
 * 新規コンテンツ用の気象庁JSON（予報・警報・台風・タイル時刻）。
 */
import { cachedFetchJson } from "./data-cache.js?v=pref426";

const FORECAST = (office) => `https://www.jma.go.jp/bosai/forecast/data/forecast/${office}.json`;
const OVERVIEW = (office) => `https://www.jma.go.jp/bosai/forecast/data/overview_forecast/${office}.json`;
const WARNING = (office) => `https://www.jma.go.jp/bosai/warning/data/warning/${office}.json`;
const TYPHOON = "https://www.jma.go.jp/bosai/typhoon/data/targetTc.json";
const NOWC_N1 = "https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json";
const NOWC_N2 = "https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N2.json";
const NOWC_N3 = "https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N3.json";

function num(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}時`;
}

export async function fetchOfficeForecast(office) {
  const rec = await cachedFetchJson(`forecast:${office}`, FORECAST(office), 10 * 60_000);
  return rec.data;
}

export async function fetchOfficeOverview(office) {
  try {
    const rec = await cachedFetchJson(`overview:${office}`, OVERVIEW(office), 10 * 60_000);
    return rec.data;
  } catch {
    return null;
  }
}

export async function fetchOfficeWarning(office) {
  const rec = await cachedFetchJson(`warning:${office}`, WARNING(office), 3 * 60_000);
  return rec.data;
}

export async function fetchTyphoonList() {
  const rec = await cachedFetchJson("typhoon", TYPHOON, 5 * 60_000);
  return Array.isArray(rec.data) ? rec.data : [];
}

export async function fetchNowcTimes(kind) {
  const url = kind === "n2" ? NOWC_N2 : kind === "n3" ? NOWC_N3 : NOWC_N1;
  const rec = await cachedFetchJson(`nowc:${kind}`, url, 60_000);
  return Array.isArray(rec.data) ? rec.data : [];
}

export function pickForecastArea(series, office) {
  const areas = series?.areas || [];
  return areas.find((a) => a.area?.code === office) || areas[0] || null;
}

export function parseHourlyWeather(forecast) {
  const ts = forecast?.[0]?.timeSeries?.[0];
  const area = ts?.areas?.[0];
  if (!area) return [];
  return (ts.timeDefines || []).map((time, i) => ({
    time,
    label: fmtWhen(time),
    weather: area.weathers?.[i] || "",
    code: area.weatherCodes?.[i] || "",
    wind: area.winds?.[i] || ""
  })).filter((item) => item.weather || item.code);
}

export function parseHourlyPops(forecast) {
  const ts = forecast?.[0]?.timeSeries?.find((s) => s.areas?.[0]?.pops);
  const area = ts?.areas?.[0];
  if (!area) return [];
  return (ts.timeDefines || []).map((time, i) => ({
    time,
    label: fmtWhen(time),
    pop: num(area.pops?.[i])
  })).filter((item) => item.pop != null);
}

export function parseTodayTomorrowTemps(forecast) {
  const ts = forecast?.[0]?.timeSeries?.find((s) => s.areas?.[0]?.temps);
  const area = ts?.areas?.[0];
  const times = ts?.timeDefines || [];
  const temps = (area?.temps || []).map((v, i) => ({
    time: times[i],
    label: fmtWhen(times[i]),
    temp: num(v)
  })).filter((item) => item.temp != null);
  return { areaName: area?.area?.name || "", temps };
}

export function parseWeeklyTemps(forecast) {
  const weekly = forecast?.[1];
  const wx = weekly?.timeSeries?.find((s) => s.areas?.[0]?.weatherCodes);
  const tm = weekly?.timeSeries?.find((s) => s.areas?.[0]?.tempsMax);
  const areaWx = wx?.areas?.[0];
  const areaTm = tm?.areas?.[0];
  const times = tm?.timeDefines || wx?.timeDefines || [];
  return times.map((time, i) => ({
    time,
    label: fmtWhen(time).replace(/ \d+時$/, ""),
    weatherCode: areaWx?.weatherCodes?.[i] || "",
    pop: num(areaWx?.pops?.[i]),
    max: num(areaTm?.tempsMax?.[i]),
    min: num(areaTm?.tempsMin?.[i])
  }));
}

export function parseWarningItems(doc) {
  const items = [];
  for (const areaType of doc?.areaTypes || []) {
    for (const area of areaType.areas || []) {
      for (const w of area.warnings || []) {
        items.push({
          area: area.name || area.code,
          name: w.name || w.code,
          status: w.status || "",
          kind: w.code || ""
        });
      }
    }
  }
  for (const ts of doc?.timeSeries || []) {
    for (const area of ts.areas || []) {
      const kinds = area.warnings || area.warningCodes || [];
      if (Array.isArray(kinds)) {
        for (const w of kinds) {
          if (typeof w === "string") items.push({ area: area.name, name: w, status: "", kind: w });
          else if (w?.name) items.push({ area: area.name, name: w.name, status: w.status || "", kind: w.code || "" });
        }
      }
    }
  }
  return items;
}

export function parseEarlyWarning(doc) {
  const items = [];
  for (const ts of doc?.timeSeries || []) {
    for (const area of ts.areas || []) {
      const poss = area.warningPossibility || area.possibilities || area.attentions;
      if (!poss) continue;
      if (Array.isArray(poss)) {
        poss.forEach((p, i) => {
          if (p) items.push({ area: area.name, text: typeof p === "string" ? p : (p.name || JSON.stringify(p)), when: ts.timeDefines?.[i] });
        });
      } else if (typeof poss === "object") {
        for (const [k, v] of Object.entries(poss)) {
          if (v) items.push({ area: area.name, text: `${k}: ${v}` });
        }
      }
    }
  }
  return items;
}

export function nowcastTileUrl(basetime, validtime, element, z, x, y) {
  return `https://www.jma.go.jp/bosai/jmatile/data/nowc/${basetime}/none/${validtime}/surf/${element}/${z}/${x}/${y}.png`;
}

export function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}
