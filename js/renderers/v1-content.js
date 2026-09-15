/**
 * 新規V1コンテンツ。選択中の1本だけ動的読込される。
 */
import { getPrefecture, getStation } from "../location-masters.js?v=pref426";
import { fetchAmedasHours, windDirLabel } from "../jma-amedas.js?v=pref426";
import {
  fetchNowcTimes,
  fetchOfficeForecast,
  fetchOfficeOverview,
  fetchOfficeWarning,
  fetchTyphoonList,
  parseEarlyWarning,
  parseHourlyPops,
  parseHourlyWeather,
  parseTodayTomorrowTemps,
  parseWarningItems,
  parseWeeklyTemps
} from "../jma-v1-data.js?v=pref426";
import { renderLedGraph, renderPending, renderStatCards, renderTileLayer } from "./graph-renderer.js?v=pref426";

function hourlyPoints(points, key) {
  const byHour = new Map();
  for (const p of points) {
    const hour = `${p.stamp.slice(0, 10)}00`;
    const prev = byHour.get(hour);
    if (!prev || p.stamp > prev.stamp) byHour.set(hour, p);
  }
  return [...byHour.values()].map((p) => ({
    ...p,
    label: `${Number(p.stamp.slice(8, 10))}時`
  })).filter((p) => Number.isFinite(Number(p[key])));
}

async function amedasSeries(station, hours = 24) {
  return fetchAmedasHours(station.station_id, hours);
}

function pickNowc(times, element) {
  const hit = (times || []).find((t) => (t.elements || []).includes(element)) || times?.[0];
  return hit || null;
}

function stampFromJma(raw) {
  if (!raw) return "";
  const s = String(raw);
  if (s.includes("T")) return s;
  if (s.length >= 12) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00+09:00`;
  }
  return s;
}

export async function renderV1Content({ content, prefId, stationId, setNote }) {
  const stage = document.getElementById("map-stage");
  const pref = getPrefecture(prefId);
  const station = getStation(stationId);
  const office = pref?.jma_office || "130000";

  if (content.status === "DATA_SOURCE_PENDING") {
    stage.innerHTML = renderPending(content.name);
    setNote(`${content.name}は配信確認待ちです。`);
    return { stamp: "" };
  }

  try {
    if (content.id === "temperature_24h" || content.id === "hourly_temperature") {
      const { latest, points } = await amedasSeries(station, 24);
      const series = hourlyPoints(points, "temp");
      stage.innerHTML = renderLedGraph({
        title: "気温",
        unit: "℃",
        points: series,
        valueKey: "temp",
        color: "#e62919",
        currentLabel: `${station.station_name} 気温`
      });
      setNote(`アメダス ${station.station_name}（${station.jma_name}）の気温です。`);
      return { stamp: latest.toISOString() };
    }

    if (content.id === "rainfall_trend") {
      const { latest, points } = await amedasSeries(station, 24);
      const series = hourlyPoints(points, "precipitation1h");
      stage.innerHTML = renderLedGraph({
        title: "降水量",
        unit: "mm",
        points: series,
        valueKey: "precipitation1h",
        color: "#086dcc",
        currentLabel: `${station.station_name} 1時間降水量`
      });
      setNote(`アメダス ${station.station_name} の1時間降水量です。`);
      return { stamp: latest.toISOString() };
    }

    if (content.id === "wind_speed_trend") {
      const { latest, points } = await amedasSeries(station, 24);
      const series = hourlyPoints(points, "wind");
      stage.innerHTML = renderLedGraph({
        title: "風速",
        unit: "m/s",
        points: series,
        valueKey: "wind",
        color: "#0a2f7a",
        currentLabel: `${station.station_name} 風速`
      });
      setNote(`アメダス ${station.station_name} の風速です。`);
      return { stamp: latest.toISOString() };
    }

    if (content.id === "amedas_temperature") {
      const { latest, points } = await amedasSeries(station, 24);
      const last = [...points].reverse().find((p) => p.temp != null);
      if (!last) throw new Error("no temp");
      stage.innerHTML = renderStatCards([
        { label: "現在気温", value: last.temp.toFixed(1), unit: "℃", sub: station.station_name },
        { label: "日最高", value: last.maxTemp != null ? last.maxTemp.toFixed(1) : "—", unit: "℃" },
        { label: "日最低", value: last.minTemp != null ? last.minTemp.toFixed(1) : "—", unit: "℃" }
      ]);
      setNote(`アメダス ${station.station_name} の気温です。`);
      return { stamp: latest.toISOString() };
    }

    if (content.id === "amedas_rainfall") {
      const { latest, points } = await amedasSeries(station, 6);
      const last = [...points].reverse().find((p) => p.precipitation1h != null || p.precipitation10m != null);
      if (!last) throw new Error("no rain");
      stage.innerHTML = renderStatCards([
        { label: "1時間降水量", value: last.precipitation1h != null ? last.precipitation1h.toFixed(1) : "—", unit: "mm", sub: station.station_name },
        { label: "10分降水量", value: last.precipitation10m != null ? last.precipitation10m.toFixed(1) : "—", unit: "mm" }
      ]);
      setNote(`アメダス ${station.station_name} の降水量です。`);
      return { stamp: latest.toISOString() };
    }

    if (content.id === "amedas_wind") {
      const { latest, points } = await amedasSeries(station, 6);
      const last = [...points].reverse().find((p) => p.wind != null);
      if (!last) throw new Error("no wind");
      stage.innerHTML = renderStatCards([
        { label: "風速", value: last.wind.toFixed(1), unit: "m/s", sub: station.station_name },
        { label: "風向", value: windDirLabel(last.windDirection), unit: "" }
      ]);
      setNote(`アメダス ${station.station_name} の風向・風速です。`);
      return { stamp: latest.toISOString() };
    }

    if (content.id === "hourly_weather") {
      const fc = await fetchOfficeForecast(office);
      const rows = parseHourlyWeather(fc);
      const ov = await fetchOfficeOverview(office);
      stage.innerHTML = `<section class="v1-list">${rows.map((r) => `
        <article class="v1-row"><time>${r.label}</time><p>${r.weather || r.code}</p><small>${r.wind || ""}</small></article>
      `).join("")}</section>`;
      setNote(ov?.headlineText || ov?.text || `${pref.pref_name}の時間別天気です。`);
      return { stamp: fc?.[0]?.reportDatetime || "" };
    }

    if (content.id === "hourly_precip" || content.id === "precip_probability_trend") {
      const fc = await fetchOfficeForecast(office);
      const rows = parseHourlyPops(fc);
      if (content.id === "precip_probability_trend") {
        stage.innerHTML = renderLedGraph({
          title: "降水確率",
          unit: "%",
          points: rows,
          valueKey: "pop",
          color: "#086dcc",
          currentLabel: `${pref.pref_name} 降水確率`
        });
      } else {
        stage.innerHTML = `<section class="v1-list">${rows.map((r) => `
          <article class="v1-row"><time>${r.label}</time><p>${r.pop}%</p></article>
        `).join("")}</section>`;
      }
      setNote(`${pref.pref_name}の降水確率です。`);
      return { stamp: fc?.[0]?.reportDatetime || "" };
    }

    if (content.id === "today_tomorrow_temperature") {
      const fc = await fetchOfficeForecast(office);
      const parsed = parseTodayTomorrowTemps(fc);
      stage.innerHTML = renderStatCards(parsed.temps.map((t) => ({
        label: t.label,
        value: t.temp.toFixed(0),
        unit: "℃",
        sub: parsed.areaName
      })));
      setNote(`${pref.pref_name}の今日・明日の気温です。`);
      return { stamp: fc?.[0]?.reportDatetime || "" };
    }

    if (content.id === "weekly_temperature") {
      const fc = await fetchOfficeForecast(office);
      const rows = parseWeeklyTemps(fc);
      const cards = rows.flatMap((r) => ([
        { label: `${r.label} 最高`, value: r.max != null ? String(r.max) : "—", unit: "℃" },
        { label: `${r.label} 最低`, value: r.min != null ? String(r.min) : "—", unit: "℃" }
      ]));
      stage.innerHTML = `<section class="v1-week">${cards.map((c) => `
        <article class="v1-stat"><h3>${c.label}</h3><p><strong>${c.value}</strong><span>${c.unit}</span></p></article>
      `).join("")}</section>`;
      setNote(`${pref.pref_name}の週間最高・最低気温です。`);
      return { stamp: fc?.[1]?.reportDatetime || fc?.[0]?.reportDatetime || "" };
    }

    if (content.id === "weather_warning") {
      const doc = await fetchOfficeWarning(office);
      const items = parseWarningItems(doc).filter((i) => i.status && i.status !== "発表警報・注意報はなし");
      const headline = doc.headlineText || "";
      stage.innerHTML = `<section class="v1-list">
        ${headline ? `<article class="v1-row"><p>${headline}</p></article>` : ""}
        ${items.length ? items.map((i) => `<article class="v1-row"><time>${i.area}</time><p>${i.name}</p><small>${i.status}</small></article>`).join("") : "<p class=\"v1-empty\">発表中の警報・注意報はありません。</p>"}
      </section>`;
      setNote(headline || `${pref.pref_name}の気象警報・注意報です。`);
      return { stamp: doc.reportDatetime || "" };
    }

    if (content.id === "early_warning") {
      const doc = await fetchOfficeWarning(office);
      const items = parseEarlyWarning(doc);
      const headline = doc.headlineText || "";
      if (!items.length && !headline) {
        stage.innerHTML = `<section class="v1-panel"><p class="v1-empty">${pref.pref_name}の早期注意情報は、この配信に含まれていません。</p></section>`;
      } else {
        stage.innerHTML = `<section class="v1-list">
          ${headline ? `<article class="v1-row"><p>${headline}</p></article>` : ""}
          ${items.map((i) => `<article class="v1-row"><time>${i.area || ""}</time><p>${i.text}</p></article>`).join("")}
        </section>`;
      }
      setNote(headline || `${pref.pref_name}の早期注意情報です。`);
      return { stamp: doc.reportDatetime || "" };
    }

    if (content.id === "typhoon") {
      const list = await fetchTyphoonList();
      if (!list.length) {
        stage.innerHTML = `<section class="v1-panel"><p class="v1-empty">発表中の台風情報はありません。</p></section>`;
        setNote("台風情報です。");
        return { stamp: "" };
      }
      stage.innerHTML = `<section class="v1-list">${list.map((t) => `
        <article class="v1-row"><time>${t.tropicalCyclone || ""}</time><p>${t.category || ""} ${t.typhoonNumber || ""}</p><small>${t.issue || ""}</small></article>
      `).join("")}</section>`;
      setNote("気象庁の台風情報です。");
      return { stamp: list[0]?.issue || "" };
    }

    if (content.id === "rain_nowcast" || content.id === "rain_forecast") {
      const times = await fetchNowcTimes(content.id === "rain_forecast" ? "n2" : "n1");
      const slot = pickNowc(times, "hrpns");
      if (!slot) throw new Error("no nowcast");
      stage.innerHTML = renderTileLayer({
        lat: pref.center_lat,
        lon: pref.center_lon,
        zoom: 7,
        basetime: slot.basetime,
        validtime: slot.validtime,
        element: "hrpns",
        caption: `${pref.pref_name}　${content.name}`
      });
      setNote(`${content.name}（気象庁降水ナウキャスト）です。`);
      return { stamp: stampFromJma(slot.validtime) };
    }

    if (content.id === "lightning_nowcast") {
      const times = await fetchNowcTimes("n3");
      const slot = pickNowc(times, "liden") || pickNowc(times, "thns");
      if (!slot) throw new Error("no lightning");
      const element = (slot.elements || []).includes("liden") ? "liden" : "thns";
      stage.innerHTML = renderTileLayer({
        lat: pref.center_lat,
        lon: pref.center_lon,
        zoom: 6,
        basetime: slot.basetime,
        validtime: slot.validtime,
        element,
        caption: `${pref.pref_name}　雷ナウキャスト`
      });
      setNote("気象庁の雷ナウキャストです。");
      return { stamp: stampFromJma(slot.validtime) };
    }

    if (content.id === "tornado_nowcast") {
      const times = await fetchNowcTimes("n3");
      const slot = pickNowc(times, "trns");
      if (!slot) throw new Error("no tornado");
      stage.innerHTML = renderTileLayer({
        lat: pref.center_lat,
        lon: pref.center_lon,
        zoom: 6,
        basetime: slot.basetime,
        validtime: slot.validtime,
        element: "trns",
        caption: `${pref.pref_name}　竜巻発生確度ナウキャスト`
      });
      setNote("気象庁の竜巻発生確度ナウキャストです。");
      return { stamp: stampFromJma(slot.validtime) };
    }

    stage.innerHTML = renderPending(content.name);
    setNote(`${content.name}は準備中です。`);
    return { stamp: "" };
  } catch (error) {
    console.error(error);
    stage.innerHTML = `<section class="v1-panel"><p class="v1-empty">${content.name}のデータを取得できませんでした。</p></section>`;
    setNote(`${content.name}のデータを取得できませんでした。`);
    return { stamp: "" };
  }
}
