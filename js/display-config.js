/**
 * 表示設定の階層解決。本番正本は data/display/*.json。
 * 既存6コンテンツの地図／カードは studio-layout / layout-defaults を正本のまま使う。
 */
export const DISPLAY_STORE = "led-display-draft-v1";
export const DISPLAY_SCOPE = ["content", "prefecture", "station"];

export const SYSTEM_DEFAULTS = {
  title_scale: 1,
  map_scale: 1,
  map_x: 0,
  map_y: 0,
  map_rotation: 0,
  box_scale: 1,
  box_width: null,
  box_x: null,
  box_y: null,
  ticker_enabled: true,
  graph_scale: 1,
  graph_x: 0,
  graph_y: 0
};

const SCALE = { title_scale: [0.6, 2.8], map_scale: [0.4, 6.5], box_scale: [0.28, 3], graph_scale: [0.5, 2.5] };
const SHIFT = { map_x: [-280, 280], map_y: [-280, 280], graph_x: [-280, 280], graph_y: [-280, 280], map_rotation: [-40, 40] };

export function emptyContentDoc(contentId) {
  return {
    content_id: contentId,
    version: 1,
    updated_at: "",
    ...SYSTEM_DEFAULTS,
    prefectures: {},
    stations: {}
  };
}

export function pickLayer(source = {}) {
  const out = {};
  for (const key of Object.keys(SYSTEM_DEFAULTS)) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

export function resolveDisplayConfig({ contentDoc, defaultsDoc, prefId, stationId, draftLayer } = {}) {
  const system = { ...SYSTEM_DEFAULTS, ...pickLayer(defaultsDoc || {}) };
  const content = { ...system, ...pickLayer(contentDoc || {}) };
  const pref = prefId && contentDoc?.prefectures?.[prefId]
    ? { ...content, ...pickLayer(contentDoc.prefectures[prefId]) }
    : content;
  const station = stationId && contentDoc?.stations?.[stationId]
    ? { ...pref, ...pickLayer(contentDoc.stations[stationId]) }
    : pref;
  const resolved = draftLayer ? { ...station, ...pickLayer(draftLayer) } : station;
  return {
    ...resolved,
    content_id: contentDoc?.content_id || "",
    version: Number(contentDoc?.version) || 1,
    updated_at: contentDoc?.updated_at || "",
    source: stationId && contentDoc?.stations?.[stationId]
      ? "station"
      : prefId && contentDoc?.prefectures?.[prefId]
        ? "prefecture"
        : "content"
  };
}

export function applyLayerToDoc(doc, scope, { prefId, stationId, layer }) {
  const next = structuredClone(doc);
  const clean = pickLayer(layer);
  if (scope === "station") {
    if (!stationId) throw new Error("station_id required");
    next.stations = { ...(next.stations || {}), [stationId]: { ...(next.stations?.[stationId] || {}), ...clean } };
  } else if (scope === "prefecture") {
    if (!prefId) throw new Error("pref_id required");
    next.prefectures = { ...(next.prefectures || {}), [prefId]: { ...(next.prefectures?.[prefId] || {}), ...clean } };
  } else {
    Object.assign(next, clean);
  }
  return next;
}

export function validateDisplayDoc(doc, { contentIds, prefIds, stationIds } = {}) {
  const errors = [];
  if (!doc || typeof doc !== "object") return ["設定が空です"];
  if (!doc.content_id) errors.push("content_id がありません");
  if (contentIds && !contentIds.includes(doc.content_id)) errors.push(`不明な content: ${doc.content_id}`);
  if (!Number.isInteger(Number(doc.version)) || Number(doc.version) < 1) errors.push("version が不正です");
  const layers = [pickLayer(doc)];
  for (const [prefId, layer] of Object.entries(doc.prefectures || {})) {
    if (prefIds && !prefIds.includes(prefId)) errors.push(`不明な pref: ${prefId}`);
    layers.push(pickLayer(layer));
  }
  for (const [stationId, layer] of Object.entries(doc.stations || {})) {
    if (stationIds && !stationIds.includes(String(stationId))) errors.push(`不明な station: ${stationId}`);
    layers.push(pickLayer(layer));
  }
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      if (value == null) continue;
      if (key === "ticker_enabled") {
        if (typeof value !== "boolean") errors.push("ticker_enabled は boolean");
        continue;
      }
      if (typeof value !== "number" || !Number.isFinite(value)) {
        errors.push(`${key} が数値ではありません`);
        continue;
      }
      const range = SCALE[key] || SHIFT[key];
      if (range && (value < range[0] || value > range[1])) errors.push(`${key} が範囲外です`);
    }
  }
  return errors;
}

export function countAffectedUrls(rows, { contentId, scope, prefId, stationId }) {
  const list = (rows || []).filter((row) => row.contentId === contentId);
  if (scope === "station") return list.filter((row) => row.url.includes(`station=${stationId}`)).length;
  if (scope === "prefecture") {
    return list.filter((row) => (
      row.url.includes(`pref=${prefId}`)
      || (row.prefId === prefId)
      || (row.target && String(row.target).includes(prefId))
    )).length || list.filter((row) => row.scope === "prefecture" && row.url.includes(`pref=${prefId}`)).length;
  }
  return list.length;
}

export function readDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(DISPLAY_STORE) || localStorage.getItem(DISPLAY_STORE) || "null");
  } catch {
    return null;
  }
}

export function writeDraft(draft) {
  const raw = JSON.stringify(draft);
  sessionStorage.setItem(DISPLAY_STORE, raw);
  localStorage.setItem(DISPLAY_STORE, raw);
}

export function clearDraft() {
  sessionStorage.removeItem(DISPLAY_STORE);
  localStorage.removeItem(DISPLAY_STORE);
}

export async function loadDisplayBundle(contentId) {
  const base = (typeof window !== "undefined" && window.__LED_BASE__) || "";
  const bust = (typeof window !== "undefined" && window.__LED_DISPLAY_V__) || Date.now();
  const [defaultsDoc, manifest, contentDoc] = await Promise.all([
    fetch(`${base}data/display/defaults.json?v=${bust}`).then((r) => r.json()),
    fetch(`${base}data/display/manifest.json?v=${bust}`).then((r) => r.json()),
    fetch(`${base}data/display/contents/${contentId}.json?v=${bust}`).then((r) => r.json())
  ]);
  return { defaultsDoc, manifest, contentDoc };
}
