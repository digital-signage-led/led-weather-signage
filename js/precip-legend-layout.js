/**
 * 降水確率凡例（朝・昼・夜）の配置。
 * 保存単位: daily_precip × 縦横比（今日⇔明日で共有）。
 * 基準アンカー + オフセット。公開画面ではドラッグ不可。
 */

import { aspectTemplateKey } from "./layout-groups.js?v=pref388";

export const PRECIP_LEGEND_VERSION = 2;
export const PRECIP_LEGEND_CONTENT = "precipitation";

/** 基準アンカー（led-body 上の left%/top% 目安） */
export const PRECIP_LEGEND_ANCHORS = {
  "bottom-right": { x: 86, y: 68, label: "右下" },
  "middle-right": { x: 86, y: 42, label: "右中央" },
  "top-right": { x: 86, y: 10, label: "右上" },
  "bottom-left": { x: 3, y: 68, label: "左下" },
  "middle-left": { x: 3, y: 42, label: "左中央" },
  "top-left": { x: 3, y: 10, label: "左上" },
  "below-map": { x: 42, y: 76, label: "地図下" },
  "above-map": { x: 42, y: 8, label: "地図上" }
};

export const PRECIP_LEGEND_DEFAULT = createLegendLayout({
  anchor: "bottom-right",
  offsetX: 0,
  offsetY: 0,
  manuallyFixed: false
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createLegendLayout(partial = {}, width = 1920, height = 1080) {
  const w = Math.max(1, Number(width) || 1920);
  const h = Math.max(1, Number(height) || 1080);
  const anchor = PRECIP_LEGEND_ANCHORS[partial.anchor] ? partial.anchor : "bottom-right";
  const base = PRECIP_LEGEND_ANCHORS[anchor];
  const offsetX = Number(partial.offsetX) || 0;
  const offsetY = Number(partial.offsetY) || 0;
  // offset はデザイン座標の px。％指定の x/y がある場合はそれを優先。
  const offsetXPct = (offsetX / w) * 100;
  const offsetYPct = (offsetY / h) * 100;
  let x = Number.isFinite(Number(partial.x))
    ? Number(partial.x)
    : base.x + offsetXPct;
  let y = Number.isFinite(Number(partial.y))
    ? Number(partial.y)
    : base.y + offsetYPct;
  x = clamp(x, 0, 92);
  y = clamp(y, 0, 90);
  return {
    layoutType: partial.layoutType || aspectTemplateKey(w, h),
    contentType: PRECIP_LEGEND_CONTENT,
    anchor: partial.anchor === "custom" ? "custom" : anchor,
    offsetX,
    offsetY,
    manuallyFixed: Boolean(partial.manuallyFixed),
    version: PRECIP_LEGEND_VERSION,
    x,
    y
  };
}

/** 旧 {x,y} 形式も受け入れる */
export function normalizePrecipLegend(pos = {}, width = 0, height = 0) {
  if (!pos || typeof pos !== "object") {
    return createLegendLayout({}, width || 1920, height || 1080);
  }
  // 旧デフォルト（左上 3,22）は右下へ
  const x = Number(pos.x);
  const y = Number(pos.y);
  if (Number.isFinite(x) && Number.isFinite(y)
    && Math.abs(x - 3) < 0.51 && Math.abs(y - 22) < 0.51) {
    return createLegendLayout({ anchor: "bottom-right" }, width || 1920, height || 1080);
  }
  if (pos.version >= 2 || pos.anchor || pos.contentType === PRECIP_LEGEND_CONTENT) {
    return createLegendLayout(pos, width || 1920, height || 1080);
  }
  // 旧絶対%のみ → 自動配置へ（解像度固定座標は捨てる）
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return createLegendLayout({
      anchor: "bottom-right",
      offsetX: 0,
      offsetY: 0,
      manuallyFixed: false
    }, width || 1920, height || 1080);
  }
  return createLegendLayout({}, width || 1920, height || 1080);
}

export function legendStatusLabel(legend, warnings = []) {
  const warn = warnings.length ? warnings : (legend?._warnings || []);
  if (legend?._outOfBounds || warn.includes("画面外エラー")) return "画面外エラー";
  if (warn.includes("他要素との重なり警告")) return "他要素との重なり警告";
  if (!legend) return "自動配置中";
  if (legend.manuallyFixed) return "位置固定中";
  if (legend.anchor === "custom") return "手動調整済み";
  return "自動配置中";
}

/** 自動配置で動かしてよいか（固定・手動調整済みは維持） */
export function shouldAutoPlaceLegend(legend, { force = false } = {}) {
  if (force) return true;
  if (!legend) return true;
  if (legend.manuallyFixed) return false;
  if (legend.anchor === "custom") return false;
  return true;
}

function rectsOverlap(a, b, pad = 4) {
  if (!a || !b) return false;
  return !(
    a.right + pad < b.left
    || a.left - pad > b.right
    || a.bottom + pad < b.top
    || a.top - pad > b.bottom
  );
}

function collectObstacles(screen) {
  const nodes = [];
  const push = (sel) => {
    screen.querySelectorAll(sel).forEach((el) => {
      if (el.classList?.contains("precip-tod-legend")) return;
      const box = el.getBoundingClientRect();
      if (box.width > 2 && box.height > 2) nodes.push(box);
    });
  };
  push(".led-header");
  push(".led-footer");
  push(".map-attribution");
  push(".city-card");
  push(".map-pin");
  push("#week-points");
  // 地図本体は弱めの障害物（完全回避ではなくスコア減）
  const mapFit = screen.querySelector(".map-fit, .map-stage, #map-stage");
  if (mapFit) {
    const box = mapFit.getBoundingClientRect();
    if (box.width > 2 && box.height > 2) {
      nodes.push(Object.assign(box, { soft: true }));
    }
  }
  return nodes;
}

/**
 * 候補アンカーを評価して最良位置へ。手動固定中は動かさない。
 * @returns {{ legend, score, warnings }}
 */
export function autoPlacePrecipLegend(screen, layout, {
  force = false,
  width = 0,
  height = 0
} = {}) {
  const body = screen?.querySelector(".led-body") || screen;
  const el = body?.querySelector(".precip-tod-legend");
  if (!body || !el) {
    return { legend: normalizePrecipLegend(layout?.precipLegend, width, height), score: 0, warnings: [] };
  }
  const current = normalizePrecipLegend(layout?.precipLegend, width, height);
  if (!shouldAutoPlaceLegend(current, { force })) {
    const clamped = clampLegendInSafeArea(screen, current);
    const warnings = [];
    if (clamped._outOfBounds) warnings.push("画面外エラー");
    clamped._warnings = warnings;
    return { legend: clamped, score: 0, warnings };
  }

  const bodyBox = body.getBoundingClientRect();
  if (bodyBox.width < 8 || bodyBox.height < 8) {
    return { legend: current, score: 0, warnings: [] };
  }

  const obstacles = collectObstacles(screen);
  const footer = screen.querySelector(".led-footer");
  const footerTop = footer?.getBoundingClientRect()?.top ?? (bodyBox.bottom);
  const safe = Math.max(8, bodyBox.width * 0.012);

  let best = null;
  let bestScore = -Infinity;
  const warnings = [];

  for (const [anchorId, anchor] of Object.entries(PRECIP_LEGEND_ANCHORS)) {
    const candidate = createLegendLayout({
      anchor: anchorId,
      offsetX: 0,
      offsetY: 0,
      manuallyFixed: false,
      x: anchor.x,
      y: anchor.y
    }, width, height);

    // 仮配置して矩形取得
    el.style.left = `${candidate.x}%`;
    el.style.top = `${candidate.y}%`;
    void el.offsetWidth;
    let box = el.getBoundingClientRect();

    // はみ出し補正（%）
    let dx = 0;
    let dy = 0;
    if (box.left < bodyBox.left + safe) dx = bodyBox.left + safe - box.left;
    if (box.right > bodyBox.right - safe) dx = bodyBox.right - safe - box.right;
    if (box.top < bodyBox.top + safe) dy = bodyBox.top + safe - box.top;
    if (box.bottom > footerTop - safe) dy = footerTop - safe - box.bottom;
    if (dx || dy) {
      candidate.x = clamp(candidate.x + (dx / bodyBox.width) * 100, 0, 92);
      candidate.y = clamp(candidate.y + (dy / bodyBox.height) * 100, 0, 90);
      el.style.left = `${candidate.x}%`;
      el.style.top = `${candidate.y}%`;
      void el.offsetWidth;
      box = el.getBoundingClientRect();
    }

    let score = 100;
    let hits = 0;
    for (const obs of obstacles) {
      if (rectsOverlap(box, obs, 6)) {
        hits += 1;
        score -= obs.soft ? 10 : 28;
      }
    }
    // 右下がやや優先（視認性）
    if (anchorId === "bottom-right") score += 8;
    if (anchorId === "middle-right") score += 4;
    if (anchorId.startsWith("top")) score -= 2;
    // 画面端余白
    const edgePad = Math.min(
      box.left - bodyBox.left,
      bodyBox.right - box.right,
      box.top - bodyBox.top,
      footerTop - box.bottom
    );
    score += Math.min(12, edgePad / 4);
    if (hits === 0) score += 20;

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  const legend = best || current;
  if (bestScore < 40) warnings.push("他要素との重なり警告");
  legend._warnings = warnings;
  if (layout) layout.precipLegend = legend;
  el.style.left = `${legend.x}%`;
  el.style.top = `${legend.y}%`;
  return { legend, score: bestScore, warnings };
}

export function clampLegendInSafeArea(screen, legend) {
  const body = screen?.querySelector(".led-body") || screen;
  const el = body?.querySelector(".precip-tod-legend");
  if (!body || !el) return legend;
  const bodyBox = body.getBoundingClientRect();
  const footer = screen.querySelector(".led-footer");
  const footerTop = footer?.getBoundingClientRect()?.top ?? bodyBox.bottom;
  const safe = Math.max(8, bodyBox.width * 0.012);
  el.style.left = `${legend.x}%`;
  el.style.top = `${legend.y}%`;
  void el.offsetWidth;
  const box = el.getBoundingClientRect();
  let dx = 0;
  let dy = 0;
  if (box.left < bodyBox.left + safe) dx = bodyBox.left + safe - box.left;
  if (box.right > bodyBox.right - safe) dx = bodyBox.right - safe - box.right;
  if (box.top < bodyBox.top + safe) dy = bodyBox.top + safe - box.top;
  if (box.bottom > footerTop - safe) dy = footerTop - safe - box.bottom;
  const next = { ...legend };
  if (dx || dy) {
    next.x = clamp(legend.x + (dx / bodyBox.width) * 100, 0, 92);
    next.y = clamp(legend.y + (dy / bodyBox.height) * 100, 0, 90);
    next.anchor = "custom";
    next._outOfBounds = true;
  }
  return next;
}

/** 凡例の画面上矩形（天気ボックス自動配置の障害物用） */
export function precipLegendObstacleRect(screen) {
  const el = screen?.querySelector(".precip-tod-legend");
  if (!el || el.hidden) return null;
  const box = el.getBoundingClientRect();
  if (box.width < 2 || box.height < 2) return null;
  return box;
}
