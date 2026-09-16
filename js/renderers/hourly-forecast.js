/**
 * 時間別予報：天気・降水確率・気温を1画面。予報時刻は気象庁の配信どおり。
 */
import { JMA_WEATHER_CODES } from "../jma-codes.js?v=pref434";
import { fetchAmedasHours } from "../jma-amedas.js?v=pref434";
import { fetchOfficeForecast, parseForecastTemps, parseHourlyPops, parseHourlyWeather } from "../jma-v1-data.js?v=pref434";
import { renderLedGraph } from "./graph-renderer.js?v=pref434";

function hourKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso || "");
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}`;
}

function clockLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getHours()}時`;
}

function nearest(items, time, key) {
  if (!items?.length) return null;
  const t = Date.parse(time);
  let best = null;
  let bestDist = Infinity;
  for (const item of items) {
    const at = Date.parse(item.time || item.stamp);
    if (!Number.isFinite(at)) continue;
    const dist = Math.abs(at - t);
    if (dist < bestDist && (key ? item[key] != null : true)) {
      best = item;
      bestDist = dist;
    }
  }
  return bestDist <= 6 * 3600_000 ? best : null;
}

function weatherIcon(code) {
  const meta = JMA_WEATHER_CODES[String(code)] || {};
  const src = meta.officialDayUrl || (code ? `https://www.jma.go.jp/bosai/forecast/img/${code}.svg` : "");
  const label = meta.labelJa || "";
  if (!src) return `<span class="v1-wx-text">${label || "—"}</span>`;
  return `<img class="v1-wx-icon" src="${src}" alt="${label}"><span class="v1-wx-text">${label || "—"}</span>`;
}

function amedasHourly(points, key) {
  const byHour = new Map();
  for (const p of points || []) {
    const hour = `${String(p.stamp).slice(0, 10)}00`;
    const prev = byHour.get(hour);
    if (!prev || p.stamp > prev.stamp) byHour.set(hour, p);
  }
  return [...byHour.values()].map((p) => ({
    time: `${p.stamp.slice(0, 4)}-${p.stamp.slice(4, 6)}-${p.stamp.slice(6, 8)}T${p.stamp.slice(8, 10)}:00:00+09:00`,
    label: `${Number(p.stamp.slice(8, 10))}時`,
    temp: p[key]
  })).filter((p) => Number.isFinite(Number(p.temp)));
}

export async function renderHourlyForecast({ pref, station, setNote }) {
  const stage = document.getElementById("map-stage");
  const office = pref?.jma_office || "130000";
  const fc = await fetchOfficeForecast(office);
  const weather = parseHourlyWeather(fc);
  const pops = parseHourlyPops(fc);
  const forecastTemps = parseForecastTemps(fc);
  let observed = [];
  if (station?.station_id) {
    try {
      const rec = await fetchAmedasHours(station.station_id, 24);
      observed = amedasHourly(rec.points, "temp");
    } catch (error) {
      console.error(error);
    }
  }

  const axis = (pops.length ? pops : weather).map((item) => item.time);
  const times = [...new Set(axis)].sort();
  if (!times.length && !forecastTemps.length && !observed.length) {
    stage.innerHTML = `<section class="v1-panel" data-state="empty"><p class="v1-empty">${pref.pref_name}の時間別予報は、この配信に含まれていません。</p></section>`;
    setNote(`${pref.pref_name}の時間別予報です。`);
    return { stamp: fc?.[0]?.reportDatetime || "", state: "empty" };
  }

  const columns = times.map((time) => {
    const wx = nearest(weather, time);
    const pop = pops.find((p) => hourKey(p.time) === hourKey(time)) || nearest(pops, time, "pop");
    const obs = nearest(observed, time, "temp");
    const fcTemp = nearest(forecastTemps, time, "temp");
    const temp = obs?.temp ?? fcTemp?.temp ?? null;
    return {
      time,
      label: clockLabel(time),
      code: wx?.code || "",
      weather: wx?.weather || "",
      pop: pop?.pop ?? null,
      temp
    };
  });

  const tempPoints = (observed.length ? observed : forecastTemps).map((p) => ({
    ...p,
    label: p.label || clockLabel(p.time)
  }));
  const popPoints = pops.map((p) => ({ ...p, label: p.label || clockLabel(p.time) }));

  stage.innerHTML = `<section class="v1-hourly" data-state="ready">
    <div class="v1-hourly-strip">${columns.map((col) => `
      <article class="v1-hourly-col">
        <time>${col.label}</time>
        <div class="v1-hourly-wx">${weatherIcon(col.code)}</div>
        <p class="v1-hourly-pop">${col.pop != null ? `${col.pop}<small>%</small>` : "—"}</p>
        <p class="v1-hourly-temp">${col.temp != null ? `${Number(col.temp).toFixed(0)}<small>℃</small>` : "—"}</p>
      </article>`).join("")}</div>
    <div class="v1-hourly-graphs">
      ${renderLedGraph({ title: "気温推移", unit: "℃", points: tempPoints, valueKey: "temp", color: "#e62919", currentLabel: station ? `${station.station_name} 気温` : `${pref.pref_name} 気温`, compact: true })}
      ${renderLedGraph({ title: "降水確率推移", unit: "%", points: popPoints, valueKey: "pop", color: "#086dcc", currentLabel: `${pref.pref_name} 降水確率`, compact: true })}
    </div>
  </section>`;
  setNote(station
    ? `${pref.pref_name}の時間別予報（気温はアメダス ${station.station_name}）です。`
    : `${pref.pref_name}の時間別予報です。`);
  return { stamp: fc?.[0]?.reportDatetime || "", state: "ready" };
}
