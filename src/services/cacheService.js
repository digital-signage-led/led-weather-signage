/**
 * 画像キャッシュ。
 * 同一 地域 + テンプレート + 解像度 + データ版 は1回だけ生成し、複数現場で共有する。
 * 現場固有ロゴがある場合のみ siteId をキーに含める。
 */

const lastGoodWeather = new Map();
const renderedFrameCache = new Map();

export function buildCacheKey({ regionId, templateId, displayProfileId, weatherDataVersion, siteSpecific = false, siteId = "" }) {
  const base = [regionId, templateId, displayProfileId, weatherDataVersion].join("|");
  return siteSpecific ? `${base}|site:${siteId}` : base;
}

export function getCachedFrame(key) {
  return renderedFrameCache.get(key) || null;
}

export function setCachedFrame(key, payload) {
  renderedFrameCache.set(key, {
    ...payload,
    cachedAt: new Date().toISOString()
  });
}

export function saveLastGood(key, canonical) {
  lastGoodWeather.set(key, canonical);
}

export function loadLastGood(key) {
  return lastGoodWeather.get(key) || null;
}

export function shouldRegenerate(previousVersion, nextVersion) {
  return previousVersion !== nextVersion;
}
