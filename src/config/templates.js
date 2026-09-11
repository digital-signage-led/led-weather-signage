/**
 * コンテンツテンプレート登録。
 * 現場ごと・地方ごとに HTML を複製しない。ここへ追加するだけでプレビューと配信に載る。
 */

export const TEMPLATE_SCOPE = {
  NATIONAL: "national",
  REGION: "region",
  SITE: "site",
  SYSTEM: "system"
};

export const templates = [
  {
    id: "W01",
    name: "今日の天気（全国）",
    scope: TEMPLATE_SCOPE.NATIONAL,
    folder: "today-national"
  },
  {
    id: "W05",
    name: "今日の天気（地方）",
    scope: TEMPLATE_SCOPE.REGION,
    folder: "today-region"
  },
  {
    id: "W03",
    name: "週間天気（全国）",
    scope: TEMPLATE_SCOPE.NATIONAL,
    folder: "weekly-national"
  },
  {
    id: "W07",
    name: "週間天気（地方）",
    scope: TEMPLATE_SCOPE.REGION,
    folder: "weekly-region"
  },
  {
    id: "W09",
    name: "時間帯別予報",
    scope: TEMPLATE_SCOPE.SITE,
    folder: "hourly"
  },
  {
    id: "W10",
    name: "TODAY STATUS",
    scope: TEMPLATE_SCOPE.SITE,
    folder: "today-status"
  },
  {
    id: "W11",
    name: "このあとの天気",
    scope: TEMPLATE_SCOPE.SITE,
    folder: "weather-change"
  },
  {
    id: "ALERT",
    name: "警報 / 注意報",
    scope: TEMPLATE_SCOPE.SYSTEM,
    folder: "alert"
  },
  {
    id: "STALE",
    name: "更新停止（代替表示）",
    scope: TEMPLATE_SCOPE.SYSTEM,
    folder: "stale"
  }
];

/** Phase 2 以降で本実装する枠。フォルダは先行確保する。 */
export const FUTURE_TEMPLATES = [
  { id: "W02", name: "今日の降水確率（全国）", folder: "rain-national" },
  { id: "W04", name: "週間降水確率（全国）", folder: "weekly-rain-national" },
  { id: "W06", name: "今日の降水確率（地方）", folder: "rain-region" },
  { id: "W08", name: "週間降水確率（地方）", folder: "weekly-rain-region" }
];

export function getTemplate(templateId) {
  const template = templates.find((item) => item.id === templateId);
  if (!template) {
    throw new Error(`未知のtemplateId: ${templateId}`);
  }
  return template;
}

export function listPreviewTemplates() {
  return templates;
}
