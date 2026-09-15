/**
 * 新規V1コンテンツ。選択中の1本だけ動的読込される。
 */
import { getPrefecture, getStation } from "../location-masters.js?v=pref432";
import { stationMatchesContent, requiredStationElements } from "../content-registry.js?v=pref432";
import { fetchAmedasHours, windDirLabel } from "../jma-amedas.js?v=pref426";
import { loadMapSvg, mountMap } from "../map-renderer.js?v=pref422";
import { applyMapTransform, loadMapLayout } from "../studio-layout.js?v=pref428";
import {
  fetchNowcTimes,
  fetchOfficeForecast,
  fetchOfficeOverview,
  fetchOfficeWarning,
  fetchRiskTimes,
  fetchTyphoonList,
  parseEarlyWarning,
  parseHourlyPops,
  parseHourlyWeather,
  parseTodayTomorrowTemps,
  parseWarningItems,
  parseWeeklyTemps
} from "../jma-v1-data.js?v=pref433";
import { renderLedGraph, renderPending, renderStatCards } from "./graph-renderer.js?v=pref431";
import { LEGENDS, markEmptyIfClear, pickSlot, renderWeatherMap } from "./weather-map.js?v=pref433";
import { renderRainForecast } from "./rain-forecast.js?v=pref433";

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

function prefZoom(pref) {
  if (pref?.pref_id === "hokkaido") return 6;
  if (pref?.pref_id === "okinawa") return 8;
  return 7;
}

const PREF_JIS = {
  hokkaido: "01", aomori: "02", iwate: "03", miyagi: "04", akita: "05", yamagata: "06", fukushima: "07",
  ibaraki: "08", tochigi: "09", gunma: "10", saitama: "11", chiba: "12", tokyo: "13", kanagawa: "14",
  niigata: "15", toyama: "16", ishikawa: "17", fukui: "18", yamanashi: "19", nagano: "20", gifu: "21",
  shizuoka: "22", aichi: "23", mie: "24", shiga: "25", kyoto: "26", osaka: "27", hyogo: "28", nara: "29",
  wakayama: "30", tottori: "31", shimane: "32", okayama: "33", hiroshima: "34", yamaguchi: "35",
  tokushima: "36", kagawa: "37", ehime: "38", kochi: "39", fukuoka: "40", saga: "41", nagasaki: "42",
  kumamoto: "43", oita: "44", miyazaki: "45", kagoshima: "46", okinawa: "47"
};

async function paintWeatherMap(stage, {
  pref,
  overlay,
  legend,
  emptyText,
  zoom,
  regionId,
  tiles = true
}) {
  const svgText = await loadMapSvg();
  const focusRegion = regionId || pref.region_id || "kanto";
  const mounted = mountMap(stage, svgText, focusRegion);
  const screen = document.getElementById("led-screen");
  applyMapTransform(screen, loadMapLayout(focusRegion, 1920, 1080));
  const jis = PREF_JIS[pref.pref_id];
  if (jis) {
    mounted.fit.querySelectorAll(`[data-pref="${jis}"]`).forEach((el) => el.classList.add("is-v1-pref"));
  }
  const chrome = document.createElement("div");
  chrome.className = "v1-map-chrome";
  if (tiles) {
    chrome.innerHTML = renderWeatherMap({
      lat: pref.center_lat,
      lon: pref.center_lon,
      zoom: zoom || prefZoom(pref),
      overlay,
      legend,
      emptyText
    });
  } else {
    chrome.innerHTML = `<section class="v1-map" data-state="ready"><p class="v1-map-status">${emptyText || ""}</p></section>`;
    const status = chrome.querySelector(".v1-map-status");
    if (status && !emptyText) status.hidden = true;
  }
  mounted.fit.appendChild(chrome);
  return tiles ? markEmptyIfClear(chrome, emptyText) : (emptyText ? "empty" : "ready");
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

export async function renderV1Content({ content, prefId, stationId, setNote, setStamp }) {
  const stage = document.getElementById("map-stage");
  const pref = getPrefecture(prefId);
  const station = getStation(stationId);
  const office = pref?.jma_office || "130000";
  const stationNeeded = requiredStationElements(content.id).length > 0;
  if (stationNeeded && (!station || !stationMatchesContent(station, content.id))) {
    const need = requiredStationElements(content.id).join("・");
    stage.innerHTML = `<section class="v1-panel" data-state="error"><p class="v1-empty">${station ? `この観測地点では${need}を観測していません。` : "指定の観測地点は利用できません。"}</p></section>`;
    setNote(station ? `${station.station_name}では${need}を観測していません。` : "観測地点を確認してください。");
    return { stamp: "", state: "error" };
  }

  if (content.status === "DATA_SOURCE_PENDING") {
    stage.innerHTML = renderPending(content.name);
    setNote(`${content.name}はデータソース未確定です。公開済みではありません。`);
    return { stamp: "", state: "pending" };
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
      if (!rows.length) {
        stage.innerHTML = `<section class="v1-panel"><p class="v1-empty">${pref.pref_name}の時間別天気は、この配信に含まれていません。</p></section>`;
        setNote(`${pref.pref_name}の時間別天気です。`);
        return { stamp: fc?.[0]?.reportDatetime || "", state: "empty" };
      }
      stage.innerHTML = `<section class="v1-list">${rows.map((r) => `
        <article class="v1-row"><time>${r.label}</time><p>${r.weather || r.code}</p><small>${r.wind || ""}</small></article>
      `).join("")}</section>`;
      setNote(ov?.headlineText || ov?.text || `${pref.pref_name}の時間別天気です。`);
      return { stamp: fc?.[0]?.reportDatetime || "", state: "ready" };
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
      const empty = !items.length;
      stage.innerHTML = `<section class="v1-list" data-state="${empty ? "empty" : "ready"}">
        ${headline ? `<article class="v1-row"><p>${headline}</p></article>` : ""}
        ${items.length ? items.map((i) => `<article class="v1-row"><time>${i.area}</time><p>${i.name}</p><small>${i.status}</small></article>`).join("") : `<p class="v1-empty">現在、${pref.pref_name}に発表中の気象警報・注意報はありません。</p>`}
      </section>`;
      setNote(headline || `${pref.pref_name}の気象警報・注意報です。`);
      return { stamp: doc.reportDatetime || "", state: empty ? "empty" : "ready" };
    }

    if (content.id === "early_warning") {
      const doc = await fetchOfficeWarning(office);
      const items = parseEarlyWarning(doc);
      const headline = doc.headlineText || "";
      if (!items.length && !headline) {
        stage.innerHTML = `<section class="v1-panel" data-state="empty"><p class="v1-empty">現在、${pref.pref_name}に発表中の早期注意情報はありません。</p></section>`;
      } else {
        stage.innerHTML = `<section class="v1-list" data-state="ready">
          ${headline ? `<article class="v1-row"><p>${headline}</p></article>` : ""}
          ${items.map((i) => `<article class="v1-row"><time>${i.area || ""}</time><p>${i.text}</p></article>`).join("")}
        </section>`;
      }
      setNote(headline || `${pref.pref_name}の早期注意情報です。`);
      return { stamp: doc.reportDatetime || "", state: (!items.length && !headline) ? "empty" : "ready" };
    }

    if (content.id === "typhoon") {
      const list = await fetchTyphoonList();
      const japan = { pref_id: "tokyo", pref_name: "全国", region_id: "national", center_lat: 37.5, center_lon: 137 };
      await paintWeatherMap(stage, {
        pref: japan,
        overlay: null,
        legend: [],
        emptyText: list.length ? "" : "現在、表示対象の台風情報はありません",
        regionId: "national",
        tiles: false
      });
      if (list.length) {
        stage.insertAdjacentHTML("beforeend", `<section class="v1-typhoon-list">${list.map((t) => `
          <article class="v1-row"><time>${t.tropicalCyclone || ""}</time><p>${t.category || ""} ${t.typhoonNumber || ""}</p><small>${t.issue || ""}</small></article>
        `).join("")}</section>`);
      }
      setNote("気象庁の台風情報です。");
      return { stamp: list[0]?.issue || "", state: list.length ? "ready" : "empty" };
    }

    if (content.id === "rain_forecast" || content.id === "rain_nowcast") {
      return renderRainForecast({ prefId: pref.pref_id, setNote, setStamp });
    }

    if (content.id === "kikikuru_landslide" || content.id === "kikikuru_inundation" || content.id === "kikikuru_flood") {
      const element = content.id === "kikikuru_landslide" ? "land" : content.id === "kikikuru_inundation" ? "inund" : "flood";
      const times = await fetchRiskTimes();
      const slot = pickSlot(times, element);
      if (!slot) throw new Error("no risk times");
      const emptyText = `現在、${pref.pref_name}に表示対象の危険度はありません`;
      const state = await paintWeatherMap(stage, {
        pref,
        overlay: {
          kind: "risk",
          basetime: slot.basetime,
          validtime: slot.validtime,
          member: slot.member || "immed0",
          element
        },
        legend: LEGENDS.kikikuru,
        emptyText
      });
      setNote("気象庁のキキクル（危険度分布）です。");
      return { stamp: stampFromJma(slot.validtime), state };
    }

    if (content.id === "lightning_nowcast") {
      const times = await fetchNowcTimes("n3");
      const slot = pickSlot(times, "thns") || pickSlot(times, "liden");
      if (!slot) throw new Error("no lightning times");
      const element = (slot.elements || []).includes("thns") ? "thns" : "liden";
      const emptyText = `現在、${pref.pref_name}に表示対象の雷活動はありません`;
      const state = await paintWeatherMap(stage, {
        pref,
        overlay: { kind: "nowc", basetime: slot.basetime, validtime: slot.validtime, element },
        legend: LEGENDS.thns,
        emptyText
      });
      setNote("気象庁の雷ナウキャストです。");
      return { stamp: stampFromJma(slot.validtime), state };
    }

    if (content.id === "tornado_nowcast") {
      const times = await fetchNowcTimes("n3");
      const slot = pickSlot(times, "trns");
      if (!slot) throw new Error("no tornado times");
      const emptyText = `現在、${pref.pref_name}に表示対象の竜巻発生確度はありません`;
      const state = await paintWeatherMap(stage, {
        pref,
        overlay: { kind: "nowc", basetime: slot.basetime, validtime: slot.validtime, element: "trns" },
        legend: LEGENDS.trns,
        emptyText
      });
      setNote("気象庁の竜巻発生確度ナウキャストです。");
      return { stamp: stampFromJma(slot.validtime), state };
    }

    stage.innerHTML = `<section class="v1-panel" data-state="error"><p class="v1-empty">${content.name}の描画処理が未接続です。</p></section>`;
    setNote(`${content.name}の描画処理が未接続です。`);
    return { stamp: "", state: "error" };
  } catch (error) {
    console.error(error);
    stage.innerHTML = `<section class="v1-panel" data-state="error"><p class="v1-empty">情報を取得できませんでした。次回更新をお待ちください。</p><p class="v1-error-detail">${content.name} / ${error.message || "error"}</p></section>`;
    setNote(`${content.name}のデータを取得できませんでした。`);
    return { stamp: "", state: "error" };
  }
}
