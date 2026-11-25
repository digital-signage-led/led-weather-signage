/**
 * 週間天気／週間降水の季節背景（JSTの月で切替）。縦・横どちらも使う。
 * 画像パスは CSS（css/weather.css）側で ../img/seasons/ を使う。
 * JS で url("img/...") を変数に入れると、CSS適用時に css/img/... へずれて読めない。
 */

export const SEASON_BACKGROUNDS = {
  spring: { id: "spring", label: "春", bg: "#fff0f4" },
  summer: { id: "summer", label: "夏", bg: "#e8f6ff" },
  autumn: { id: "autumn", label: "秋", bg: "#fff6ea" },
  winter: { id: "winter", label: "冬", bg: "#eef4ff" }
};

export function jstMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    month: "numeric"
  }).formatToParts(date);
  return Number(parts.find((p) => p.type === "month")?.value) || (date.getMonth() + 1);
}

export function seasonForMonth(month) {
  const m = Number(month) || jstMonth();
  if (m >= 3 && m <= 5) return SEASON_BACKGROUNDS.spring;
  if (m >= 6 && m <= 8) return SEASON_BACKGROUNDS.summer;
  if (m >= 9 && m <= 11) return SEASON_BACKGROUNDS.autumn;
  return SEASON_BACKGROUNDS.winter;
}

export function currentSeason(date = new Date()) {
  return seasonForMonth(jstMonth(date));
}

/** 週間コンテンツに季節属性を付与。画像は data-season CSS が担当。 */
export function applyWeeklySeason(element, date = new Date()) {
  if (!element) return null;
  const season = currentSeason(date);
  element.dataset.season = season.id;
  element.style.setProperty("--season-bg", season.bg);
  element.style.setProperty("--bg-sea", season.bg);
  element.style.removeProperty("--season-image");
  return season;
}

/** @deprecated 互換用。applyWeeklySeason と同じ。 */
export function applyPortraitSeason(element, date = new Date()) {
  return applyWeeklySeason(element, date);
}
