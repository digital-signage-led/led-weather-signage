/**
 * 配置グループと縦横比テンプレート。
 * 地図: 地方 × 縦横比。ボックス/凡例: 地方 × グループ × 縦横比。
 */

import { canonicalContent, canonicalRegion } from "./catalog.js?v=pref386";

export const SHARED_DAILY_MAP_CONTENTS = [
  "today_weather",
  "today_precip",
  "tomorrow_weather",
  "tomorrow_precip"
];

export const MAP_LAYOUT_DOC_VERSION = 3;

const CONTENT_LABELS = {
  today_weather: "今日の天気",
  tomorrow_weather: "明日の天気",
  today_precip: "今日の降水確率",
  tomorrow_precip: "明日の降水確率",
  weekly_weather: "週間天気",
  weekly_precip: "週間降水確率"
};

const REGION_LABELS = {
  national: "全国",
  hokkaido: "北海道",
  tohoku: "東北",
  kanto: "関東",
  chubu: "中部",
  kinki: "近畿",
  chugoku: "中国",
  shikoku: "四国",
  kyushu: "九州",
  okinawa: "沖縄"
};

/** コンテンツ → 配置グループ（今日/明日は同一）。 */
export function getLayoutGroup(contentType = "today_weather") {
  switch (canonicalContent(contentType)) {
    case "today_weather":
    case "tomorrow_weather":
      return "daily_weather";
    case "today_precip":
    case "tomorrow_precip":
      return "daily_precip";
    case "weekly_weather":
      return "weekly_weather";
    case "weekly_precip":
      return "weekly_precip";
    default:
      return canonicalContent(contentType);
  }
}

export function isDailyMapLayoutGroup(group) {
  return group === "daily_weather" || group === "daily_precip";
}

export function isSharedMapContent(contentId = "today_weather") {
  return SHARED_DAILY_MAP_CONTENTS.includes(canonicalContent(contentId));
}

export function layoutSharePeers(contentId = "today_weather") {
  const id = canonicalContent(contentId);
  if (SHARED_DAILY_MAP_CONTENTS.includes(id)) return [...SHARED_DAILY_MAP_CONTENTS];
  return [id];
}

export function aspectSlug(aspect = "16:9") {
  return String(aspect || "16:9").replace(/:/g, "-");
}

export function mapLayoutStorageKey(regionId, aspect = "16:9") {
  return `mapLayout:${canonicalRegion(regionId)}:${aspectSlug(aspect)}`;
}

export function describeMapShare(regionId, width = 0, height = 0) {
  const region = canonicalRegion(regionId);
  const aspect = aspectTemplateKey(width, height);
  const storageKey = mapLayoutStorageKey(region, aspect);
  const peerLabel = SHARED_DAILY_MAP_CONTENTS.map((id) => CONTENT_LABELS[id] || id).join("・");
  return {
    aspect,
    regionId: region,
    regionLabel: REGION_LABELS[region] || region,
    storageKey,
    peerLabel,
    saveMessage: "4コンテンツ共通の地図設定を保存しました",
    summary: `地図設定の共有対象：${peerLabel}\n地方：${REGION_LABELS[region] || region}\n縦横比：${aspect}\n保存キー：${storageKey}`
  };
}

/**
 * 縦横比テンプレート。同じ比なら解像度が違っても配置を共有。
 * 16:9 / 4:3 / 3:2 / 5:4 / ultrawide / special
 */
export function aspectTemplateKey(width, height) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const ratio = w / h;
  if (ratio >= 2.1) return "ultrawide";
  const candidates = [
    { id: "16:9", ratio: 16 / 9 },
    { id: "4:3", ratio: 4 / 3 },
    { id: "3:2", ratio: 3 / 2 },
    { id: "5:4", ratio: 5 / 4 }
  ];
  let best = "special";
  let bestDiff = Infinity;
  for (const item of candidates) {
    const diff = Math.abs(Math.log(ratio / item.ratio));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = item.id;
    }
  }
  if (bestDiff > 0.06) return "special";
  return best;
}

export function describeLayoutShare(contentId, regionId, width = 0, height = 0) {
  const group = getLayoutGroup(contentId);
  const aspect = aspectTemplateKey(width, height);
  const mapInfo = describeMapShare(regionId, width, height);
  const boxPeers = group === "daily_weather"
    ? ["today_weather", "tomorrow_weather"]
    : group === "daily_precip"
      ? ["today_precip", "tomorrow_precip"]
      : [canonicalContent(contentId)];
  const boxLabel = boxPeers.map((id) => CONTENT_LABELS[id] || id).join(" ⇔ ");
  let saveMessage = mapInfo.saveMessage;
  if (group === "daily_weather") saveMessage = "今日・明日の天気ボックス配置を保存しました";
  if (group === "daily_precip") saveMessage = "今日・明日の降水ボックス配置を保存しました";
  const region = canonicalRegion(regionId);
  return {
    group,
    aspect,
    regionId: region,
    regionLabel: REGION_LABELS[region] || region,
    peerLabel: mapInfo.peerLabel,
    storageKey: mapInfo.storageKey,
    saveMessage,
    mapSaveMessage: mapInfo.saveMessage,
    mapSummary: mapInfo.summary,
    summary: `${mapInfo.summary.replace(/\n/g, "　")}　ボックス共有：${boxLabel}`
  };
}

export function parseViewportKey(vpKey) {
  const parts = String(vpKey || "").split("x");
  return { w: Number(parts[0]) || 0, h: Number(parts[1]) || 0 };
}
