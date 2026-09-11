/**
 * 気象データ正規化。
 * プロバイダ固有のコード・構造を canonical モデルへ変換する。
 * テンプレートは必ずこの出力だけを参照する。
 */

import { getWeatherMeta } from "../config/weatherCodes.js";

const JMA_TO_CANONICAL = {
  "100": "sunny",
  "101": "sunny_cloudy",
  "110": "sunny_cloudy",
  "200": "cloudy",
  "201": "cloudy_sunny",
  "202": "cloudy_rain",
  "218": "cloudy_rain",
  "300": "rain",
  "302": "heavy_rain",
  "303": "rain",
  "350": "thunder",
  "400": "snow",
  "500": "snow"
};

const DATA_TTL_MS = 3 * 60 * 60 * 1000;

export function normalizeWeather(providerFeed, context) {
  const { region, site, now = new Date() } = context;
  const siteSeries = pickSiteSeries(providerFeed.timeseries, site);
  const points = providerFeed.timeseries.map((series) => {
    const pointMeta = region.displayPoints.find((item) => item.id === series.stationId);
    return {
      id: series.stationId,
      name: series.stationName,
      prefectureId: series.prefectureId,
      forecastAreaId: series.areaCode,
      x: pointMeta?.x ?? 50,
      y: pointMeta?.y ?? 50,
      priority: pointMeta?.priority ?? 9,
      today: normalizeToday(series.today),
      weekly: series.weekly.map(normalizeWeeklyDay)
    };
  });

  const updatedAt = providerFeed.fetchedAt;
  const expiresAt = new Date(new Date(updatedAt).getTime() + DATA_TTL_MS).toISOString();
  const dataVersion = toDataVersion(updatedAt);

  return {
    site: {
      id: site.id,
      name: site.name,
      prefecture: site.prefecture,
      prefectureId: site.prefectureId,
      city: site.city,
      region: region.id,
      regionName: region.name,
      forecastAreaId: site.forecastAreaId,
      forecastAreaName: site.forecastAreaName,
      pointId: site.pointId || siteSeries.stationId,
      pointName: site.pointName || siteSeries.stationName
    },
    updatedAt,
    expiresAt,
    dataVersion,
    isStale: false,
    sourceStatus: "ok",
    today: normalizeToday(siteSeries.today),
    hourly: siteSeries.hourly.map(normalizeHourly),
    weekly: siteSeries.weekly.map(normalizeWeeklyDay),
    points: sortPoints(points),
    alerts: []
  };
}

export function applyStaleState(canonical, now = new Date()) {
  const expired = new Date(canonical.expiresAt).getTime() < now.getTime();
  if (!expired) {
    return { ...canonical, isStale: false };
  }
  return {
    ...canonical,
    isStale: true,
    sourceStatus: "stale"
  };
}

function pickSiteSeries(timeseries, site) {
  return (
    timeseries.find((item) => item.stationId === site.pointId) ||
    timeseries.find((item) => item.areaCode === site.forecastAreaId) ||
    timeseries[0]
  );
}

function normalizeToday(today) {
  const weatherCode = canonicalWeatherCode(today.weatherCode, today.weatherText);
  const meta = getWeatherMeta(weatherCode);
  return {
    weather: meta.label,
    weatherCode,
    tempMax: today.tempMax,
    tempMin: today.tempMin,
    rainProbability: { ...today.pops },
    windDir: today.wind?.dir || "",
    windSpeed: today.wind?.speed ?? 0
  };
}

function normalizeHourly(item) {
  const weatherCode = canonicalWeatherCode(item.weatherCode, item.weatherText);
  const at = new Date(item.time);
  return {
    at: item.time,
    label: `${at.getHours()}時`,
    weather: getWeatherMeta(weatherCode).label,
    weatherCode,
    temp: item.temp,
    rainProbability: item.pop,
    windDir: item.wind?.dir || "",
    windSpeed: item.wind?.speed ?? 0
  };
}

function normalizeWeeklyDay(item) {
  const weatherCode = canonicalWeatherCode(item.weatherCode, item.weatherText);
  return {
    date: item.date,
    weekday: item.weekday,
    weather: getWeatherMeta(weatherCode).label,
    weatherCode,
    tempMax: item.tempMax,
    tempMin: item.tempMin,
    rainProbability: item.pop
  };
}

export function canonicalWeatherCode(providerCode, fallbackText) {
  if (JMA_TO_CANONICAL[String(providerCode)]) {
    return JMA_TO_CANONICAL[String(providerCode)];
  }
  if (fallbackText && getWeatherMeta(fallbackText).icon) {
    return fallbackText;
  }
  return "cloudy";
}

function sortPoints(points) {
  return [...points].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, "ja"));
}

function toDataVersion(iso) {
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}${m}${d}T${hh}${mm}`;
}
