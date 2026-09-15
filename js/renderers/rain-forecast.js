/**
 * 雨の予報：同じ地図上で nowcast / rasrf レイヤーだけを時間切替する。
 */
import { getPrefecture } from "../location-masters.js?v=pref433";
import { fetchNowcTimes, fetchRasrfTimes } from "../jma-v1-data.js?v=pref433";
import { loadMapSvg, mountMap } from "../map-renderer.js?v=pref422";
import { applyMapTransform, loadMapLayout } from "../studio-layout.js?v=pref428";
import {
  buildRainTimeline,
  formatJmaClock,
  formatJmaStamp,
  overlayForFrame,
  segmentLabel
} from "../rain-timeline.js?v=pref433";
import { LEGENDS, markEmptyIfClear, renderWeatherMap, updateWeatherOverlay } from "./weather-map.js?v=pref433";

const PREF_JIS = {
  hokkaido: "01", aomori: "02", iwate: "03", miyagi: "04", akita: "05", yamagata: "06", fukushima: "07",
  ibaraki: "08", tochigi: "09", gunma: "10", saitama: "11", chiba: "12", tokyo: "13", kanagawa: "14",
  niigata: "15", toyama: "16", ishikawa: "17", fukui: "18", yamanashi: "19", nagano: "20", gifu: "21",
  shizuoka: "22", aichi: "23", mie: "24", shiga: "25", kyoto: "26", osaka: "27", hyogo: "28", nara: "29",
  wakayama: "30", tottori: "31", shimane: "32", okayama: "33", hiroshima: "34", yamaguchi: "35",
  tokushima: "36", kagawa: "37", ehime: "38", kochi: "39", fukuoka: "40", saga: "41", nagasaki: "42",
  kumamoto: "43", oita: "44", miyazaki: "45", kagoshima: "46", okinawa: "47"
};

const PLAY_MS = 1400;

function prefZoom(pref) {
  if (pref?.pref_id === "hokkaido") return 6;
  if (pref?.pref_id === "okinawa") return 8;
  return 7;
}

function stopRainPlayback(stage) {
  if (stage?._rainTimer) {
    clearInterval(stage._rainTimer);
    stage._rainTimer = 0;
  }
}

async function loadSources() {
  const result = { nowcast: [], forecast: [], nowcastError: "", forecastError: "" };
  try {
    const [n1, n2] = await Promise.all([fetchNowcTimes("n1"), fetchNowcTimes("n2")]);
    result.nowcast = [...(n1 || []), ...(n2 || [])];
    if (!result.nowcast.length) result.nowcastError = "直近の雨雲データを取得できません";
  } catch (error) {
    result.nowcastError = `直近の雨雲データを取得できません（${error.message || "error"}）`;
    console.error(error);
  }
  try {
    result.forecast = await fetchRasrfTimes();
    if (!result.forecast.length) result.forecastError = "その先の予測を取得できません";
  } catch (error) {
    result.forecastError = `その先の予測を取得できません（${error.message || "error"}）`;
    console.error(error);
  }
  return result;
}

function renderDock(timeline, studio) {
  const frames = timeline.frames;
  const marks = frames.map((frame, i) => {
    const prev = frames[i - 1];
    const boundary = !prev || prev.sourceType !== frame.sourceType;
    return `<i class="v1-rain-mark ${frame.sourceType}${boundary ? " is-boundary" : ""}" data-i="${i}" title="${formatJmaClock(frame.validTime)}"></i>`;
  }).join("");
  return `
    <div class="v1-rain-dock">
      <div class="v1-rain-meta">
        <span class="v1-rain-valid"></span>
        <span class="v1-rain-seg"></span>
        <span class="v1-rain-now">現在</span>
      </div>
      <div class="v1-rain-track" role="img" aria-label="雨の予報タイムライン">${marks}</div>
      ${studio ? `<div class="v1-rain-studio">
        <button type="button" data-rain="prev" aria-label="前へ">◀</button>
        <button type="button" data-rain="play" aria-label="再生">停止</button>
        <button type="button" data-rain="next" aria-label="次へ">▶</button>
      </div>` : ""}
      <p class="v1-rain-warn" hidden></p>
    </div>`;
}

export async function renderRainForecast({ prefId, setNote, setStamp }) {
  const stage = document.getElementById("map-stage");
  const pref = getPrefecture(prefId);
  stopRainPlayback(stage);

  const sources = await loadSources();
  const timeline = buildRainTimeline(sources.nowcast, sources.forecast);
  const warnings = [...timeline.warnings];
  if (sources.nowcastError) warnings.push(sources.nowcastError);
  if (sources.forecastError) warnings.push(sources.forecastError);

  if (!timeline.frames.length) {
    stage.innerHTML = `<section class="v1-panel" data-state="error"><p class="v1-empty">雨の予報を取得できませんでした。次回更新をお待ちください。</p><p class="v1-error-detail">${warnings.join(" / ")}</p></section>`;
    setNote("雨の予報のデータを取得できませんでした。");
    return { stamp: "", state: "error" };
  }

  const svgText = await loadMapSvg();
  const focusRegion = pref.region_id || "kanto";
  const mounted = mountMap(stage, svgText, focusRegion);
  const screen = document.getElementById("led-screen");
  applyMapTransform(screen, loadMapLayout(focusRegion, 1920, 1080));
  const jis = PREF_JIS[pref.pref_id];
  if (jis) mounted.fit.querySelectorAll(`[data-pref="${jis}"]`).forEach((el) => el.classList.add("is-v1-pref"));

  const studio = document.documentElement.classList.contains("is-studio");
  const first = timeline.frames[timeline.nowIndex] || timeline.frames[0];
  const chrome = document.createElement("div");
  chrome.className = "v1-map-chrome is-rain-forecast";
  chrome.innerHTML = renderWeatherMap({
    lat: pref.center_lat,
    lon: pref.center_lon,
    zoom: prefZoom(pref),
    overlay: overlayForFrame(first),
    legend: first.sourceType === "forecast" ? LEGENDS.rasrf : LEGENDS.hrpns,
    emptyText: `現在、${pref.pref_name}に目立った雨域はありません`
  }) + renderDock(timeline, studio);
  mounted.fit.appendChild(chrome);

  const legend = chrome.querySelector(".v1-legend");
  const validEl = chrome.querySelector(".v1-rain-valid");
  const segEl = chrome.querySelector(".v1-rain-seg");
  const nowEl = chrome.querySelector(".v1-rain-now");
  const warnEl = chrome.querySelector(".v1-rain-warn");
  const playBtn = chrome.querySelector("[data-rain=play]");
  const marks = [...chrome.querySelectorAll(".v1-rain-mark")];
  const uniqueWarnings = [...new Set(warnings)].filter(Boolean);
  if (uniqueWarnings.length && warnEl) {
    warnEl.hidden = false;
    warnEl.textContent = uniqueWarnings.join(" / ");
  }

  let index = timeline.nowIndex;
  let playing = true;

  const applyFrame = async (nextIndex) => {
    index = (nextIndex + timeline.frames.length) % timeline.frames.length;
    const frame = timeline.frames[index];
    updateWeatherOverlay(chrome, overlayForFrame(frame));
    if (legend) {
      const items = frame.sourceType === "forecast" ? LEGENDS.rasrf : LEGENDS.hrpns;
      legend.innerHTML = items.map((item) => `<li><span style="background:${item.color}"></span>${item.label}</li>`).join("");
    }
    if (validEl) validEl.textContent = formatJmaClock(frame.validTime);
    if (segEl) segEl.textContent = segmentLabel(frame.sourceType);
    if (nowEl) nowEl.hidden = index !== timeline.nowIndex;
    marks.forEach((el, i) => el.classList.toggle("is-active", i === index));
    const stamp = formatJmaStamp(frame.validTime);
    setStamp?.(stamp);
    const state = await markEmptyIfClear(chrome, `現在、${pref.pref_name}に目立った雨域はありません`);
    return { stamp, state, frame };
  };

  const tick = async () => {
    await applyFrame(index + 1);
  };

  const start = () => {
    stopRainPlayback(stage);
    playing = true;
    if (playBtn) playBtn.textContent = "停止";
    stage._rainTimer = setInterval(() => { tick(); }, PLAY_MS);
  };
  const pause = () => {
    stopRainPlayback(stage);
    playing = false;
    if (playBtn) playBtn.textContent = "再生";
  };

  chrome.querySelector("[data-rain=prev]")?.addEventListener("click", () => { pause(); applyFrame(index - 1); });
  chrome.querySelector("[data-rain=next]")?.addEventListener("click", () => { pause(); applyFrame(index + 1); });
  playBtn?.addEventListener("click", () => (playing ? pause() : start()));
  marks.forEach((el) => {
    el.addEventListener("click", () => {
      if (!studio) return;
      pause();
      applyFrame(Number(el.dataset.i));
    });
  });

  const firstResult = await applyFrame(index);
  start();
  setNote(`${pref.pref_name}の雨の予報です。`);
  return { stamp: firstResult.stamp, state: firstResult.state };
}
