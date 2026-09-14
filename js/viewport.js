/**
 * サイネージは固定デザインキャンバスで描き、実画面へは均一スケールで合わせる。
 * 機種ごとの流体トークン差や、部品単位の vw/vh 拡大は使わない。
 */

/** 本番の固定設計解像度（レイアウト・週間フレーム基準） */
export const FIXED_DESIGN = { width: 1920, height: 1080 };

export const VIEWPORT_PRESETS = [
  { width: 1920, height: 1080, label: "1920×1080（固定）" },
  { width: 720, height: 576, label: "720×576" },
  { width: 576, height: 432, label: "576×432" },
  { width: 432, height: 288, label: "432×288" },
  { width: 880, height: 704, label: "880×704" },
  { width: 704, height: 528, label: "704×528" },
  { width: 528, height: 352, label: "528×352" },
  { width: 1024, height: 600, label: "1024×600" },
  { width: 1376, height: 448, label: "1376×448" }
];

/** スタジオ初期プレビュー用（設計解像度） */
export const DEFAULT_STUDIO_VIEWPORT = { ...FIXED_DESIGN };

const MIN_W = 160;
const MIN_H = 120;
const MAX_W = 7680;
const MAX_H = 4320;

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function readViewport(width, height) {
  const w = clamp(Math.round(Number(width) || 0), MIN_W, MAX_W);
  const h = clamp(Math.round(Number(height) || 0), MIN_H, MAX_H);
  const aspect = w / h;
  const minSide = Math.min(w, h);
  const maxSide = Math.max(w, h);
  const area = w * h;
  const basis = minSide;
  const shape = aspect < 0.82
    ? "portrait"
    : aspect < 1.12
      ? "square"
      : aspect < 1.55
        ? "standard"
        : aspect < 2.15
          ? "wide"
          : "ultrawide";
  const size = minSide < 260
    ? "tiny"
    : minSide < 360
      ? "small"
      : minSide < 560
        ? "medium"
        : minSide < 900
          ? "large"
          : "huge";
  const density = minSide < 280 ? "minimal" : minSide < 360 ? "compact" : "full";
  return { width: w, height: h, aspect, minSide, maxSide, area, basis, shape, size, density };
}

/** 基準長に比例し、下限・上限で saturate */
export function fluidPx(basis, ratio, minPx, maxPx) {
  return Math.round(clamp(basis * ratio, minPx, maxPx));
}

/** 窓サイズ（スケール計算用）。design サイズとは分けて扱う */
export function readWindowSize() {
  const w = window.innerWidth || document.documentElement.clientWidth || FIXED_DESIGN.width;
  const h = window.innerHeight || document.documentElement.clientHeight || FIXED_DESIGN.height;
  return {
    width: Math.max(1, Math.round(w)),
    height: Math.max(1, Math.round(h))
  };
}

/** 天気／降水ボックスの実ピクセル（デザイン座標） */
export function cardBoxPx(vp, variant = "weather") {
  const s = vp.basis || vp.minSide;
  const pop = variant === "pop";
  if (pop) {
    const rawW = fluidPx(s, 0.22, 80, 220);
    const rawH = fluidPx(s, 0.24, 72, 240);
    return {
      w: Math.min(rawW, Math.round(vp.width * 0.2)),
      h: Math.min(rawH, Math.round(vp.height * 0.28))
    };
  }
  const rawW = fluidPx(s, 0.18, 64, 200);
  const rawH = fluidPx(s, 0.26, 88, 260);
  return {
    w: Math.min(rawW, Math.round(vp.width * 0.18)),
    h: Math.min(rawH, Math.round(vp.height * 0.32))
  };
}

/** 画面chrome（ヘッダー／フッター／地図カード）用トークン */
export function tokensFor(vp, content = { id: "today_weather", name: "今日の天気", card: "weather" }) {
  const s = vp.basis || vp.minSide;
  const longTitle = `${content.name || ""}`.length >= 6;
  const titleRatio = longTitle ? 0.046 : 0.06;
  const popTight = content.card === "pop";
  const box = cardBoxPx(vp, content.kind === "map" ? "weather" : (popTight ? "pop" : "weather"));
  // 1920×1080 固定キャンバス向け：メイン／サブ／ニュースティッカーを 1.5 倍
  const chrome = 1.5;
  return {
    "--viewport-width": `${vp.width}px`,
    "--viewport-height": `${vp.height}px`,
    "--led-width": `${vp.width}px`,
    "--led-height": `${vp.height}px`,
    "--font-title": `${fluidPx(s, 0.039 * chrome, 10, Math.round(34 * chrome))}px`,
    "--font-main-title": `${fluidPx(s, titleRatio * chrome, 12, Math.round(48 * chrome))}px`,
    "--font-stamp": `${fluidPx(s, 0.025 * chrome, 9, Math.round(22 * chrome))}px`,
    "--font-note": `${fluidPx(s, 0.049 * chrome, 11, Math.round(40 * chrome))}px`,
    "--font-city": `${fluidPx(s, popTight ? 0.056 : 0.062, 12, 52)}px`,
    "--font-temp": `${fluidPx(s, popTight ? 0.056 : 0.074, 14, 64)}px`,
    "--font-pop": `${fluidPx(s, 0.04, 11, 32)}px`,
    "--font-pop-lg": `${fluidPx(s, popTight ? 0.068 : 0.058, 14, 56)}px`,
    "--font-week": `${fluidPx(s, 0.028, 10, 24)}px`,
    "--font-attr": `${fluidPx(s, 0.023, 8, 16)}px`,
    "--header-height": `${fluidPx(s, 0.062 * chrome, 16, Math.round(40 * chrome))}px`,
    "--header-title-height": `${fluidPx(s, 0.092 * chrome, 24, Math.round(58 * chrome))}px`,
    "--footer-height": `${fluidPx(s, 0.146 * chrome, 32, Math.round(100 * chrome))}px`,
    "--footer-gap": `${fluidPx(s, 0.035 * chrome, 6, Math.round(28 * chrome))}px`,
    "--safe-inset": `${fluidPx(s, 0.056, 8, 36)}px`,
    "--icon-card": `${fluidPx(s, popTight ? 0.05 : 0.1, 16, 88)}px`,
    "--icon-note": `${fluidPx(s, 0.076 * chrome, 14, Math.round(56 * chrome))}px`,
    "--card-pad-y": `${fluidPx(s, 0.014, 3, 12)}px`,
    "--card-pad-x": `${fluidPx(s, 0.016, 3, 14)}px`,
    "--card-gap": `${fluidPx(s, 0.01, 2, 8)}px`,
    "--card-meta-gap": `${fluidPx(s, 0.006, 2, 6)}px`,
    "--box-radius": `${fluidPx(s, 0.01, 2, 8)}px`,
    "--card-box-w": `${box.w}px`,
    "--card-box-h": `${box.h}px`,
    "--card-min-width": "0px",
    "--pin-size": `${fluidPx(s, 0.028, 8, 22)}px`,
    "--map-stroke": `${clamp(s * 0.0028, 0.8, 2.4).toFixed(2)}px`,
    "--precip-legend-title": `${fluidPx(s, 0.036, 12, 28)}px`,
    "--precip-legend-label": `${fluidPx(s, 0.034, 11, 26)}px`,
    "--precip-legend-pad-y": `${fluidPx(s, 0.014, 3, 12)}px`,
    "--precip-legend-pad-x": `${fluidPx(s, 0.022, 6, 16)}px`,
    "--precip-legend-min-w": `${fluidPx(s, 0.12, 40, 88)}px`,
    "--precip-legend-radius": `${fluidPx(s, 0.012, 3, 10)}px`,
    "--precip-legend-gap": `${fluidPx(s, 0.012, 3, 10)}px`
  };
}

/**
 * 週間表：デザインキャンバス内の使用可能領域 ÷ 行・列 からセル基準トークンを算出。
 */
export function tableLayoutTokens(vp, rows = 5) {
  const rowCount = Math.max(1, Number(rows) || 5);
  const s = vp.basis || vp.minSide;
  const chrome = 1.5;
  const gap = Math.max(1, fluidPx(s, 0.005, 1, 4));
  const pad = fluidPx(s, 0.035, 6, 28);
  const headerTitle = fluidPx(s, 0.092 * chrome, 24, Math.round(58 * chrome));
  const headerSub = fluidPx(s, 0.062 * chrome, 16, Math.round(40 * chrome));
  const footer = fluidPx(s, 0.146 * chrome, 32, Math.round(100 * chrome));
  const topChrome = headerTitle + headerSub + pad + 22;
  const bottomChrome = footer + 14;
  const availW = Math.max(80, vp.width - pad * 2);
  const availH = Math.max(80, vp.height - topChrome - bottomChrome);
  const dayHeadH = clamp(Math.round(availH * 0.09), 16, Math.round(s * 0.08));
  const cityCol = clamp(Math.round(availW * 0.14), Math.round(s * 0.12), Math.round(availW * 0.2));
  const gridPad = gap;
  const innerW = availW - gridPad * 2;
  const innerH = availH - gridPad * 2;
  const cellW = (innerW - cityCol - gap * 7) / 7;
  const cellH = (innerH - dayHeadH - gap * rowCount) / rowCount;
  const cellMin = Math.max(8, Math.min(cellW, cellH));
  const radius = clamp(Math.round(cellMin * 0.12), 4, 14);

  return {
    "--forecast-rows": String(rowCount),
    "--forecast-gap": `${gap}px`,
    "--forecast-radius": `${radius}px`,
    "--city-col-width": `${Math.round(cityCol)}px`,
    "--day-head-height": `${Math.round(dayHeadH)}px`,
    "--cell-width": `${Math.round(cellW)}px`,
    "--cell-height": `${Math.round(cellH)}px`,
    "--cell-min": `${Math.round(cellMin)}px`,
    "--font-week-day": `${Math.round(clamp(dayHeadH * 0.52, 9, 26))}px`,
    "--font-week-city": `${Math.round(clamp(cellMin * 0.42, 12, 40))}px`,
    "--font-week-label": `${Math.round(clamp(cellMin * 0.26, 11, 24))}px`,
    "--font-week-value": `${Math.round(clamp(cellMin * 0.55, 14, 52))}px`,
    "--font-week-unit": `${Math.round(clamp(cellMin * 0.22, 10, 18))}px`,
    "--font-week-temp": `${Math.round(clamp(cellH * 0.3 * 0.58, 10, 34))}px`,
    "--icon-week": `${Math.round(clamp(cellH * 0.82 * 0.95, 14, 96))}px`,
    "--week-pad-y": `${Math.round(clamp(cellH * 0.05, 1, 8))}px`,
    "--week-pad-x": `${Math.round(clamp(cellW * 0.05, 1, 10))}px`
  };
}

/**
 * 固定設計解像度の画面を、ウインドウに収まるよう中央配置でスケールする。
 * transform は毎回置き換え（累積しない）。
 */
export function fitFixedScreen(element, designW = FIXED_DESIGN.width, designH = FIXED_DESIGN.height) {
  if (!element) return 1;
  const win = readWindowSize();
  const scale = Math.min(win.width / designW, win.height / designH);
  const ox = (win.width - designW * scale) / 2;
  const oy = (win.height - designH * scale) / 2;
  element.style.position = "absolute";
  element.style.left = "0";
  element.style.top = "0";
  element.style.right = "auto";
  element.style.bottom = "auto";
  element.style.width = `${designW}px`;
  element.style.height = `${designH}px`;
  element.style.transformOrigin = "0 0";
  element.style.transform = `translate(${ox}px, ${oy}px) scale(${scale})`;
  element.style.setProperty("--fit-scale", String(scale));
  return scale;
}

export function applyViewport(element, vp, regionId, content, options = {}) {
  if (!element) return;
  const tokens = tokensFor(vp, content);
  for (const [key, value] of Object.entries(tokens)) {
    element.style.setProperty(key, value);
  }
  element.dataset.region = regionId;
  element.dataset.content = content.id;
  element.dataset.shape = vp.shape;
  element.dataset.size = vp.size;
  element.dataset.density = vp.density;
  element.style.setProperty("--screen-width", `${vp.width}px`);
  element.style.setProperty("--screen-height", `${vp.height}px`);
  element.style.setProperty("--safe-area", tokens["--safe-inset"]);
  element.style.setProperty("--title-size", tokens["--font-title"]);
  element.style.setProperty("--city-name-size", tokens["--font-city"]);
  element.style.setProperty("--temperature-size", tokens["--font-temp"]);
  element.style.setProperty("--precip-size", tokens["--font-pop"]);
  element.style.setProperty("--weather-icon-size", tokens["--icon-card"]);
  element.style.setProperty("--map-land", "#76c85a");
  element.style.setProperty("--map-neighbor", "#d0d5db");
  element.style.setProperty("--bg-sea", "#c8ebff");

  if (options.fixedScale) {
    fitFixedScreen(element, vp.width, vp.height);
  } else {
    element.style.width = "100%";
    element.style.height = "100%";
    element.style.position = "absolute";
    element.style.inset = "0";
    element.style.removeProperty("transform");
    element.style.removeProperty("left");
    element.style.removeProperty("top");
    element.style.removeProperty("right");
    element.style.removeProperty("bottom");
  }
}

/** 週間表描画後に、行数に応じたセル基準トークンを適用 */
export function applyTableLayout(element, vp, rows) {
  if (!element) return;
  const tokens = tableLayoutTokens(vp, rows);
  for (const [key, value] of Object.entries(tokens)) {
    element.style.setProperty(key, value);
  }
}

export function cityLimit(vp, regionId, content, available = 12) {
  const wanted = Math.max(1, available);
  if (content.kind === "table") {
    return Math.min(5, wanted);
  }
  const region = String(regionId || "").toLowerCase();
  if (region === "hokkaido" || region === "tohoku" || region === "chubu") {
    return wanted;
  }
  const cardW = vp.width * (content.card === "pop" ? 0.22 : 0.2);
  const cardH = vp.height * (content.card === "pop" ? 0.12 : 0.11);
  const budget = Math.round((vp.area * 0.4) / Math.max(1, cardW * cardH));
  let max = clamp(budget, 4, wanted);
  if (vp.shape === "portrait" || vp.size === "tiny") max = Math.min(max, Math.max(4, wanted - 2));
  if (vp.shape === "ultrawide") max = Math.min(wanted, max + 1);
  return Math.min(wanted, max);
}

/** 週間表ページ分割。余り1件だけになる分割を避ける */
export function partitionTablePages(items, maxPerPage = 5) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const n = list.length;
  if (n === 0) return [[]];
  if (n <= maxPerPage) return [list];

  const sizes = [];
  let left = n;
  while (left > 0) {
    if (left <= maxPerPage) {
      sizes.push(left);
      break;
    }
    if (left - maxPerPage === 1) {
      const first = Math.ceil(left / 2);
      sizes.push(first, left - first);
      break;
    }
    sizes.push(maxPerPage);
    left -= maxPerPage;
  }

  const pages = [];
  let offset = 0;
  for (const size of sizes) {
    pages.push(list.slice(offset, offset + size));
    offset += size;
  }
  return pages;
}

export function cardSizePct(vp, regionId, variant = "weather") {
  const box = cardBoxPx(vp, variant);
  return {
    w: (box.w / vp.width) * 100,
    h: (box.h / vp.height) * 100
  };
}

/** タイトルと更新日時をバーの高さに合わせ、画面幅に収まるまで小さくする */
export function fitTitleBars(screen) {
  if (!screen) return;
  const gap = parseFloat(getComputedStyle(screen).getPropertyValue("--footer-gap")) || 8;
  const points = screen.querySelector(".week-points:not([hidden])");
  const reserve = points ? points.getBoundingClientRect().width + gap : 0;
  const titleScale = Math.max(0.6, Number.parseFloat(getComputedStyle(screen).getPropertyValue("--title-scale")) || 1);
  const maxW = Math.max(72, (screen.clientWidth - gap - reserve) / titleScale);

  const shrinkToFit = (el, bar, ratio) => {
    if (!el || !bar) return;
    el.style.fontSize = "";
    const height = bar.clientHeight || 32;
    let size = Math.max(10, height * ratio);
    el.style.fontSize = `${size}px`;
    let steps = 0;
    while (
      steps < 48
      && size > 10
      && (bar.scrollWidth > maxW + 0.5 || bar.scrollWidth > bar.clientWidth + 0.5 || el.scrollWidth > el.clientWidth + 0.5)
    ) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
      steps += 1;
    }
  };

  shrinkToFit(
    screen.querySelector(".led-title"),
    screen.querySelector(".led-title-bar:not(.led-sub-bar)"),
    0.62
  );
  shrinkToFit(
    screen.querySelector(".led-stamp"),
    screen.querySelector(".led-sub-bar"),
    0.5
  );
}

export function fitCityCardNames(root = document) {
  const cards = root.querySelectorAll?.(".city-card-name") || [];
  cards.forEach((el) => {
    const card = el.closest(".city-card");
    if (!card) return;
    el.style.fontSize = "";
    const maxW = Math.max(24, card.clientWidth - 8);
    let size = parseFloat(getComputedStyle(el).fontSize) || 16;
    let steps = 0;
    while (steps < 32 && size > 9 && el.scrollWidth > maxW + 0.5) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
      steps += 1;
    }
  });
}

export function showAuxiliary(vp, key) {
  if (vp.density === "minimal") {
    return key === "stampWeek" || key === "note";
  }
  return true;
}

export function resolveViewport(width, height) {
  return readViewport(width, height);
}
