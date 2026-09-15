/**
 * 気象庁アメダス（bosai）。観測値のみ。数値は捏造しない。
 */
import { cachedFetchJson, cachedFetchText } from "./data-cache.js?v=pref426";

const LATEST = "https://www.jma.go.jp/bosai/amedas/data/latest_time.txt";
const POINT = (id, ymd, hh) => `https://www.jma.go.jp/bosai/amedas/data/point/${id}/${ymd}_${hh}.json`;

function pad(n) {
  return String(n).padStart(2, "0");
}

function jstDate(d) {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000);
}

function ymdFromJst(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function parseLatest(text) {
  const t = Date.parse(String(text || "").trim());
  return Number.isFinite(t) ? new Date(t) : new Date();
}

function hourKeys(latest, hours) {
  const keys = [];
  const jst = jstDate(latest);
  for (let i = hours - 1; i >= 0; i -= 1) {
    const d = new Date(jst.getTime() - i * 3600_000);
    keys.push({ ymd: ymdFromJst(d), hh: pad(d.getUTCHours()) });
  }
  return keys;
}

function val(tuple) {
  if (!Array.isArray(tuple) || tuple[0] == null || tuple[0] === "") return null;
  const n = Number(tuple[0]);
  return Number.isFinite(n) ? n : null;
}

function stampLabel(raw) {
  const y = raw.slice(0, 4);
  const m = raw.slice(4, 6);
  const d = raw.slice(6, 8);
  const h = raw.slice(8, 10);
  const mi = raw.slice(10, 12);
  return `${Number(m)}/${Number(d)} ${h}:${mi}`;
}

export async function fetchAmedasLatestTime() {
  const rec = await cachedFetchText("amedas-latest", LATEST, 60_000);
  return parseLatest(rec.data);
}

export async function fetchAmedasHours(stationId, hours = 24) {
  const latest = await fetchAmedasLatestTime();
  const keys = hourKeys(latest, hours + 1);
  const series = [];
  await Promise.all(keys.map(async (key) => {
    try {
      const rec = await cachedFetchJson(
        `amedas:${stationId}:${key.ymd}:${key.hh}`,
        POINT(stationId, key.ymd, key.hh),
        5 * 60_000
      );
      for (const [stamp, row] of Object.entries(rec.data || {})) {
        series.push({
          stamp,
          label: stampLabel(stamp),
          temp: val(row.temp),
          precipitation1h: val(row.precipitation1h),
          precipitation10m: val(row.precipitation10m),
          wind: val(row.wind),
          windDirection: val(row.windDirection),
          humidity: val(row.humidity),
          maxTemp: val(row.maxTemp),
          minTemp: val(row.minTemp)
        });
      }
    } catch {
      /* 欠測時間は飛ばす */
    }
  }));
  series.sort((a, b) => a.stamp.localeCompare(b.stamp));
  const cutoff = new Date(latest.getTime() - hours * 3600_000);
  const cutoffKey = `${cutoff.getFullYear()}${pad(cutoff.getMonth() + 1)}${pad(cutoff.getDate())}${pad(cutoff.getHours())}${pad(cutoff.getMinutes())}00`;
  return {
    latest,
    points: series.filter((item) => item.stamp >= cutoffKey)
  };
}

export const WIND_DIRS = ["静穏", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西", "北"];

export function windDirLabel(code) {
  const n = Number(code);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return WIND_DIRS[n] || "—";
}
