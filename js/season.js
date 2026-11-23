/**
 * 縦サイネージ用の季節背景（JSTの月で切替）。横には使わない。
 */

export const SEASON_BACKGROUNDS = {
  spring: {
    id: "spring",
    label: "春",
    months: [3, 4, 5],
    image: "img/seasons/spring-1080x1920.jpg",
    bg: "#fff0f4"
  },
  summer: {
    id: "summer",
    label: "夏",
    months: [6, 7, 8],
    image: "img/seasons/summer-1080x1920.png",
    bg: "#e8f6ff"
  },
  autumn: {
    id: "autumn",
    label: "秋",
    months: [9, 10, 11],
    image: "img/seasons/autumn-1080x1920.jpg",
    bg: "#fff6ea"
  },
  winter: {
    id: "winter",
    label: "冬",
    months: [12, 1, 2],
    image: "img/seasons/winter-1080x1920.jpg",
    bg: "#eef4ff"
  }
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

/** 縦画面に季節属性と CSS 変数を付与。横では何もしない。 */
export function applyPortraitSeason(element, date = new Date()) {
  if (!element) return null;
  const season = currentSeason(date);
  element.dataset.season = season.id;
  element.style.setProperty("--season-bg", season.bg);
  element.style.setProperty("--season-image", `url("${season.image}?v=pref547")`);
  element.style.setProperty("--bg-sea", season.bg);
  return season;
}
