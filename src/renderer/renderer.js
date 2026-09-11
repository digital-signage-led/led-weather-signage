/**
 * 画面生成の中核。
 * 気象データ → 正規化済みモデル → テンプレート → LEDプロファイル適用。
 * テンプレートHTMLは現場数だけ作らない。
 */

import { applyTokens } from "../config/designTokens.js";
import { getDisplayProfile } from "../config/displayProfiles.js";
import { getTemplate } from "../config/templates.js";
import { fetchCanonicalWeather } from "../services/weatherService.js";
import { buildCacheKey, getCachedFrame, setCachedFrame, shouldRegenerate } from "../services/cacheService.js";
import { applyStaleState } from "../normalizers/weatherNormalizer.js";

const templateLoaders = {
  W01: () => import("../templates/today-national/index.js"),
  W05: () => import("../templates/today-region/index.js"),
  W03: () => import("../templates/weekly-national/index.js"),
  W07: () => import("../templates/weekly-region/index.js"),
  W09: () => import("../templates/hourly/index.js"),
  W10: () => import("../templates/today-status/index.js"),
  W11: () => import("../templates/weather-change/index.js"),
  ALERT: () => import("../templates/alert/index.js"),
  STALE: () => import("../templates/stale/index.js")
};

export async function renderLedFrame(container, options) {
  const {
    templateId,
    region,
    site,
    displayProfileId,
    forceStale = false,
    now = new Date()
  } = options;

  const profile = getDisplayProfile(displayProfileId);
  const template = getTemplate(templateId);
  const national = template.scope === "national";

  let data = await fetchCanonicalWeather({ region, site, now, national });
  if (forceStale || templateId === "STALE") {
    data = applyStaleState({
      ...data,
      expiresAt: new Date(now.getTime() - 1000).toISOString()
    }, now);
  }

  const cacheKey = buildCacheKey({
    regionId: national ? "JAPAN" : region.id,
    templateId,
    displayProfileId,
    weatherDataVersion: data.dataVersion,
    siteSpecific: template.scope === "site" || template.scope === "system",
    siteId: site.id
  });

  applyTokens(container, profile);
  container.innerHTML = "";

  const useStaleTemplate = data.isStale && templateId !== "ALERT";
  const loader = templateLoaders[useStaleTemplate ? "STALE" : templateId];
  if (!loader) {
    throw new Error(`テンプレート実装がありません: ${templateId}`);
  }

  const previous = getCachedFrame(cacheKey);
  const module = await loader();
  const html = await module.render({ data, region, profile, site, template });
  container.innerHTML = html;

  if (!previous || shouldRegenerate(previous.dataVersion, data.dataVersion)) {
    setCachedFrame(cacheKey, {
      dataVersion: data.dataVersion,
      templateId,
      displayProfileId
    });
  }

  return {
    cacheKey,
    data,
    profile,
    template,
    regenerated: !previous || previous.dataVersion !== data.dataVersion
  };
}
