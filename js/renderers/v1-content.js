/**
 * 新規V1コンテンツ。選択中の1本だけ動的読込される。
 */
import { getPrefecture, getStation } from "../location-masters.js?v=pref434";
import { requiredStationElements, stationMatchesContent, stationRequired } from "../content-registry.js?v=pref434";
import { loadMapSvg, mountMap } from "../map-renderer.js?v=pref422";
import { applyMapTransform, loadMapLayout } from "../studio-layout.js?v=pref428";
import {
  fetchNowcTimes,
  fetchOfficeWarning,
  fetchRiskTimes,
  fetchTyphoonDetail,
  fetchTyphoonList,
  parseEarlyWarning,
  parseWarningItems,
  typhoonCenter
} from "../jma-v1-data.js?v=pref434";
import { renderPending } from "./graph-renderer.js?v=pref434";
import { LEGENDS, markEmptyIfClear, pickSlot, renderWeatherMap } from "./weather-map.js?v=pref434";
import { renderRainForecast } from "./rain-forecast.js?v=pref434";
import { renderHourlyForecast } from "./hourly-forecast.js?v=pref434";
import { renderAmedasObservation } from "./amedas-observation.js?v=pref434";

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
  const wantsStation = stationRequired(content.id) || Boolean(stationId);
  if (wantsStation && requiredStationElements(content.id).length && (!station || !stationMatchesContent(station, content.id))) {
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
    if (content.id === "hourly_forecast") {
      return renderHourlyForecast({ pref, station, setNote });
    }

    if (content.id === "amedas_temperature" || content.id === "amedas_rainfall" || content.id === "amedas_wind") {
      return renderAmedasObservation({ contentId: content.id, station, setNote });
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
      const details = await Promise.all(list.map((t) => fetchTyphoonDetail(t.tropicalCyclone)));
      const centers = details.map(typhoonCenter).filter(Boolean);
      const focus = centers[0] || { lat: 37.5, lon: 137 };
      const japan = { pref_id: "tokyo", pref_name: "全国", region_id: "national", center_lat: focus.lat, center_lon: focus.lon };
      await paintWeatherMap(stage, {
        pref: japan,
        overlay: null,
        legend: [],
        emptyText: list.length ? "" : "現在、表示対象の台風情報はありません",
        regionId: "national",
        tiles: true,
        zoom: centers.length ? 5 : 4
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
