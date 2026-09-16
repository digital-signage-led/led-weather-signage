/**
 * 正式19コンテンツの公開URLだけを生成する。legacy は一覧に出さない。
 */
import { listRegions, listContents } from "./catalog.js?v=pref434";
import { isExistingContent } from "./content-registry.js?v=pref434";
import { getAvailableStations, listPrefectures } from "./location-masters.js?v=pref434";

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

function pushPref(rows, content, status) {
  for (const pref of listPrefectures()) {
    rows.push({
      group: "都道府県",
      name: content.name,
      contentId: content.id,
      scope: "prefecture",
      target: pref.pref_name,
      url: buildPublicUrl({ contentId: content.id, prefId: pref.pref_id, regionId: pref.region_id }),
      status
    });
  }
}

function pushStation(rows, content, status) {
  for (const st of getAvailableStations({ contentId: content.id })) {
    rows.push({
      group: "観測地点",
      name: content.name,
      contentId: content.id,
      scope: "station",
      target: `${st.station_name}（${st.station_id}）`,
      url: buildPublicUrl({ contentId: content.id, stationId: st.station_id, prefId: st.pref_id, regionId: st.region_id }),
      status
    });
  }
}

export function generatePublicUrls() {
  const rows = [];
  for (const content of listContents()) {
    if (!content.enabled || content.hidden_from_studio || content.legacy || content.alias_of) continue;
    const scopes = content.location_scopes?.length
      ? content.location_scopes
      : [content.location_scope || "region"];
    const status = content.status === "DATA_SOURCE_PENDING" ? "PENDING" : "LIVE";
    for (const scope of scopes) {
      if (scope === "region") {
        for (const region of listRegions()) {
          rows.push({
            group: "既存 地方・全国",
            name: content.name,
            contentId: content.id,
            scope,
            target: region.name,
            url: buildPublicUrl({ contentId: content.id, regionId: region.id }),
            status: isExistingContent(content.id) ? "LIVE" : status
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
        pushPref(rows, content, status);
      } else if (scope === "station") {
        pushStation(rows, content, status);
      }
    }
  }
  return rows;
}
