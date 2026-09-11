/**
 * 気象データ取得。
 * サイネージ端末はこのサービスを直接呼ばない。生成パイプライン側が使う。
 * provider を差し替えればモックから実APIへ移行できる。
 */

import { buildMockProviderFeed } from "../data/weather/mockProviderFeed.js";
import { listRegions } from "../data/regions/regions.js";
import { applyStaleState, normalizeWeather } from "../normalizers/weatherNormalizer.js";
import { filterAlertsForSite, normalizeAlerts } from "../normalizers/alertNormalizer.js";
import { loadLastGood, saveLastGood } from "./cacheService.js";

let provider = {
  async fetch({ region, now }) {
    return buildMockProviderFeed(region, now || new Date());
  }
};

export function setWeatherProvider(nextProvider) {
  provider = nextProvider;
}

export async function fetchCanonicalWeather({ region, site, now = new Date(), national = false }) {
  try {
    const canonical = national
      ? await composeNationalWeather({ region, site, now })
      : await composeRegionWeather({ region, site, now });
    saveLastGood(cacheKey(region, site, national), canonical);
    return canonical;
  } catch (error) {
    const fallback = loadLastGood(cacheKey(region, site, national));
    if (!fallback) {
      throw error;
    }
    return applyStaleState({ ...fallback, sourceStatus: "fallback" }, now);
  }
}

async function composeRegionWeather({ region, site, now }) {
  const feed = await provider.fetch({ region, site, now });
  const canonical = normalizeWeather(feed, { region, site, now });
  canonical.alerts = filterAlertsForSite(normalizeAlerts(feed.warnings || []), site);
  return canonical;
}

/**
 * 地方ごとの正規化データを統合し、全国表示用の1オブジェクトにする。
 * 気象庁の全国画像を使うのではなく、システム側で再構成する。
 */
async function composeNationalWeather({ region, site, now }) {
  const allRegions = listRegions();
  const feeds = await Promise.all(
    allRegions.map((item) => provider.fetch({ region: item, site, now }))
  );

  const normalized = feeds.map((feed, index) =>
    normalizeWeather(feed, { region: allRegions[index], site: nationalSiteStub(allRegions[index], site), now })
  );

  const base = await composeRegionWeather({ region, site, now });
  const points = allRegions.map((item, index) => {
    const local = normalized[index];
    const representative =
      local.points.find((point) => point.id === item.nationalPoint.id) ||
      local.points.find((point) => point.name === item.nationalPoint.name) ||
      local.points[0];
    return {
      ...representative,
      id: item.nationalPoint.id,
      name: item.nationalPoint.name,
      regionId: item.id,
      x: item.nationalPoint.x,
      y: item.nationalPoint.y,
      priority: index + 1
    };
  });

  const allAlerts = feeds.flatMap((feed) => normalizeAlerts(feed.warnings || []));

  return {
    ...base,
    points,
    alerts: filterAlertsForSite(allAlerts, site)
  };
}

function nationalSiteStub(region, fallbackSite) {
  const point = region.displayPoints[0];
  return {
    ...fallbackSite,
    region: region.id,
    regionName: region.name,
    prefectureId: point.prefectureId,
    forecastAreaId: point.forecastAreaId,
    pointId: point.id
  };
}

function cacheKey(region, site, national) {
  return national
    ? `weather:JAPAN:${site.forecastAreaId || site.pointId}`
    : `weather:${region.id}:${site.forecastAreaId || site.pointId}`;
}
