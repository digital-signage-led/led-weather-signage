/**
 * 解像度に依存しないサイネージ計測。
 * 特定の Width×Height 分岐はせず、幅・高さ・比率・面積から連続的に決める。
 */

export const VIEWPORT_PRESETS = [
  { width: 432, height: 288, label: "432×288" },
  { width: 528, height: 352, label: "528×352" },
  { width: 576, height: 432, label: "576×432" },
  { width: 704, height: 528, label: "704×528" },
  { width: 720, height: 576, label: "720×576" },
  { width: 880, height: 704, label: "880×704" },
  { width: 1024, height: 600, label: "1024×600" },
  { width: 1376, height: 448, label: "1376×448" },
  { width: 1920, height: 1080, label: "1920×1080" }
];

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
  return { width: w, height: h, aspect, minSide, maxSide, area, shape, size, density };
}

/** minSide に比例し、下限・推奨付近・上限で saturate する。 */
export function fluidPx(minSide, ratio, minPx, maxPx) {
  return Math.round(clamp(minSide * ratio, minPx, maxPx));
}

/** 天気／降水ボックスの実ピクセル。縦型（立て）を基本にし、画面を食い過ぎないよう抑える。 */
export function cardBoxPx(vp, variant = "weather") {
  const s = vp.minSide;
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

export function tokensFor(vp, content = { id: "today_weather", name: "今日の天気", card: "weather" }) {
  const s = vp.minSide;
  const longTitle = `${content.name || ""}`.length >= 6;
  const titleRatio = longTitle ? 0.046 : 0.06;
  const popTight = content.card === "pop";
  // 地図4種（今日/明日×天気/降水）は外枠サイズを揃えて配置を共有する
  const box = cardBoxPx(vp, content.kind === "map" ? "weather" : (popTight ? "pop" : "weather"));
  return {
    "--led-width": `${vp.width}px`,
    "--led-height": `${vp.height}px`,
    "--font-title": `${fluidPx(s, 0.039, 11, 34)}px`,
    "--font-main-title": `${fluidPx(s, titleRatio, 15, 52)}px`,
    "--font-stamp": `${fluidPx(s, 0.025, 10, 24)}px`,
    "--font-note": `${fluidPx(s, 0.049, 13, 44)}px`,
    "--font-city": `${fluidPx(s, popTight ? 0.056 : 0.062, 16, 58)}px`,
    "--font-temp": `${fluidPx(s, popTight ? 0.056 : 0.074, 18, 70)}px`,
    "--font-pop": `${fluidPx(s, 0.04, 13, 34)}px`,
    "--font-pop-lg": `${fluidPx(s, popTight ? 0.068 : 0.058, 18, 64)}px`,
    "--font-week": `${fluidPx(s, 0.028, 16, 26)}px`,
    "--font-attr": `${fluidPx(s, 0.023, 8, 18)}px`,
    "--header-height": `${fluidPx(s, 0.062, 18, 44)}px`,
    "--header-title-height": `${fluidPx(s, 0.092, 28, 64)}px`,
    "--footer-height": `${fluidPx(s, 0.146, 36, 112)}px`,
    "--footer-gap": `${fluidPx(s, 0.035, 8, 32)}px`,
    "--safe-inset": `${fluidPx(s, 0.056, 10, 42)}px`,
    "--icon-card": `${fluidPx(s, popTight ? 0.05 : 0.1, 20, 96)}px`,
    "--icon-note": `${fluidPx(s, 0.076, 18, 64)}px`,
    "--card-pad-y": `${fluidPx(s, 0.014, 4, 14)}px`,
    "--card-pad-x": `${fluidPx(s, 0.016, 4, 16)}px`,
    "--card-gap": `${fluidPx(s, 0.01, 2, 10)}px`,
    "--card-meta-gap": `${fluidPx(s, 0.006, 2, 8)}px`,
    "--box-radius": `${fluidPx(s, 0.01, 3, 8)}px`,
    "--card-box-w": `${box.w}px`,
    "--card-box-h": `${box.h}px`,
    "--card-min-width": "0px",
    "--pin-size": `${fluidPx(s, 0.028, 8, 22)}px`,
    "--map-stroke": `${clamp(s * 0.0028, 0.8, 2.4).toFixed(2)}px`,
    "--precip-legend-title": `${fluidPx(s, 0.024, 9, 18)}px`,
    "--precip-legend-label": `${fluidPx(s, 0.022, 8, 16)}px`,
    "--precip-legend-pad-y": `${fluidPx(s, 0.009, 2, 7)}px`,
    "--precip-legend-pad-x": `${fluidPx(s, 0.014, 4, 10)}px`,
    "--precip-legend-min-w": `${fluidPx(s, 0.08, 28, 56)}px`,
    "--precip-legend-radius": `${fluidPx(s, 0.008, 2, 6)}px`,
    "--precip-legend-gap": `${fluidPx(s, 0.008, 2, 6)}px`
  };
}

export function applyViewport(element, vp, regionId, content) {
  const tokens = tokensFor(vp, content);
  for (const [key, value] of Object.entries(tokens)) {
    element.style.setProperty(key, value);
  }
  element.style.width = "100%";
  element.style.height = "100%";
  element.style.removeProperty("transform");
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
}

export function cityLimit(vp, regionId, content, available = 12) {
  const wanted = Math.max(1, available);
  if (content.kind === "table") {
    // 全国・地方の週間表は4都市ずつページ切替（余りは最終ページ）
    return Math.min(4, wanted);
  }
  // 北海道・東北・中部は地点をできるだけすべて出す
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

export function cardSizePct(vp, regionId, variant = "weather") {
  const box = cardBoxPx(vp, variant);
  return {
    w: (box.w / vp.width) * 100,
    h: (box.h / vp.height) * 100
  };
}

/** タイトルと更新日時をバーの高さに合わせ、画面幅に収まるまで小さくする。 */
export function fitTitleBars(screen) {
  if (!screen) return;
  const gap = parseFloat(getComputedStyle(screen).getPropertyValue("--footer-gap")) || 8;
  const points = screen.querySelector(".week-points:not([hidden])");
  const reserve = points ? points.getBoundingClientRect().width + gap : 0;
  const titleScale = Math.max(0.6, Number.parseFloat(getComputedStyle(screen).getPropertyValue("--title-scale")) || 1);
  // transform scale 後も収まるよう、計測幅をスケールで割る
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

/** 地点名（会津若松など）を「…」にせず、カード幅に収まるまで小さくする。 */
export function fitCityCardNames(root) {
  const names = root?.querySelectorAll?.(".city-card-name");
  if (!names?.length) return;
  for (const el of names) {
    el.style.fontSize = "";
    let size = parseFloat(getComputedStyle(el).fontSize) || 12;
    let steps = 0;
    while (steps < 48 && size > 8 && el.scrollWidth > el.clientWidth + 0.5) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
      steps += 1;
    }
  }
}

export function showAuxiliary(vp, key) {
  if (key === "pop") return vp.density === "full";
  if (key === "attribution") return vp.size !== "tiny";
  if (key === "stampWeek") return vp.density !== "minimal";
  if (key === "temps") return vp.density !== "minimal" || vp.minSide >= 240;
  return true;
}

export function parseViewportInput(width, height) {
  return readViewport(width, height);
}
