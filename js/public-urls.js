/**
 * 有効な公開URLだけを生成する。
 */
import { listRegions, listContents } from "./catalog.js?v=pref426";
import { capabilityForContent, isExistingContent } from "./content-registry.js?v=pref426";
import { listPrefectures, listStations } from "./location-masters.js?v=pref426";

export function publicBasePath() {
  const path = location.pathname;
  if (path === "/view") return "/view";
  if (path.endsWith("/") || /\.html$/i.test(path)) return path.replace(/[^/]+$/, (m) => (/\.html$/i.test(m) ? "" : m));
  return path.endsWith("/") ? path : `${path}/`;
}

export function buildPublicUrl({ contentId, regionId, prefId, stationId }) {
  const next = new URL(location.origin + (publicBasePath() || "/"));
  next.searchParams.set("content", contentId);
  if (regionId) next.searchParams.set("region", regionId);
  if (prefId) next.searchParams.set("pref", prefId);
  if (stationId) next.searchParams.set("station", stationId);
  return next.pathname + next.search;
}

export function generatePublicUrls() {
  const rows = [];
  for (const content of listContents()) {
    if (!content.enabled) continue;
    const scope = content.location_scope || "region";
    const status = content.status === "DATA_SOURCE_PENDING" ? "DATA_SOURCE_PENDING" : "公開";
    if (scope === "region") {
      for (const region of listRegions()) {
        rows.push({
          group: "既存 地方・全国",
          name: content.name,
          contentId: content.id,
          scope,
          target: region.name,
          url: buildPublicUrl({ contentId: content.id, regionId: region.id }),
          status: isExistingContent(content.id) ? "公開" : status
        });
      }
    } else if (scope === "national") {
      rows.push({
        group: "全国防災",
        name: content.name,
        contentId: content.id,
        scope,
        target: "全国",
        url: buildPublicUrl({ contentId: content.id, regionId: "national" }),
        status
      });
    } else if (scope === "prefecture") {
      for (const pref of listPrefectures()) {
        rows.push({
          group: "都道府県",
          name: content.name,
          contentId: content.id,
          scope,
          target: pref.pref_name,
          url: buildPublicUrl({ contentId: content.id, prefId: pref.pref_id, regionId: pref.region_id }),
          status
        });
      }
    } else if (scope === "station") {
      const cap = capabilityForContent(content.id);
      for (const st of listStations()) {
        if (cap && st[cap] !== true) continue;
        rows.push({
          group: "観測地点",
          name: content.name,
          contentId: content.id,
          scope,
          target: `${st.station_name}（${st.station_id}）`,
          url: buildPublicUrl({ contentId: content.id, stationId: st.station_id, regionId: st.region_id }),
          status
        });
      }
    }
  }
  return rows;
}
