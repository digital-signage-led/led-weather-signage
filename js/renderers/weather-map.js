/**
 * 気象庁 jmatile のベース地図＋天気レイヤー。タイルは透明なので下地必須。
 * 取得URLは bosai の targetTimes / 実タイル HEAD で確認済み。
 */

export const LEGENDS = {
  hrpns: [
    { color: "#adffff", label: "1mm" },
    { color: "#4d7cff", label: "5" },
    { color: "#0021ff", label: "10" },
    { color: "#fff000", label: "20" },
    { color: "#ff2800", label: "30" },
    { color: "#aa00aa", label: "50+" }
  ],
  rasrf: [
    { color: "#adffff", label: "1mm" },
    { color: "#4d7cff", label: "5" },
    { color: "#0021ff", label: "10" },
    { color: "#fff000", label: "20" },
    { color: "#ff2800", label: "30" },
    { color: "#aa00aa", label: "50+" }
  ],
  kikikuru: [
    { color: "#cbf2cb", label: "今後の情報等に留意" },
    { color: "#f2e700", label: "注意" },
    { color: "#ff2800", label: "警戒" },
    { color: "#a50082", label: "危険" },
    { color: "#0c000c", label: "災害切迫" }
  ],
  thns: [
    { color: "#7dff7d", label: "活動度1" },
    { color: "#f2e700", label: "活動度2" },
    { color: "#ff2800", label: "活動度3" },
    { color: "#a50082", label: "活動度4" }
  ],
  trns: [
    { color: "#f2e700", label: "発生確度1" },
    { color: "#ff2800", label: "発生確度2" }
  ]
};

export function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}

export function baseTileUrl(z, x, y) {
  return `https://www.jma.go.jp/bosai/jmatile/data/map/none/none/none/surf/std/${z}/${x}/${y}.png`;
}

export function nowcTileUrl(basetime, validtime, element, z, x, y) {
  return `https://www.jma.go.jp/bosai/jmatile/data/nowc/${basetime}/none/${validtime}/surf/${element}/${z}/${x}/${y}.png`;
}

export function rasrfTileUrl(basetime, validtime, element, z, x, y, member = "none") {
  return `https://www.jma.go.jp/bosai/jmatile/data/rasrf/${basetime}/${member || "none"}/${validtime}/surf/${element || "rasrf"}/${z}/${x}/${y}.png`;
}

export function riskTileUrl(basetime, member, validtime, element, z, x, y) {
  return `https://www.jma.go.jp/bosai/jmatile/data/risk/${basetime}/${member}/${validtime}/surf/${element}/${z}/${x}/${y}.png`;
}

export function overlayTileUrl({ kind, basetime, validtime, member, element, z, x, y }) {
  if (kind === "risk") return riskTileUrl(basetime, member || "immed0", validtime, element, z, x, y);
  if (kind === "rasrf") return rasrfTileUrl(basetime, validtime, element, z, x, y, member);
  return nowcTileUrl(basetime, validtime, element, z, x, y);
}

function cells(lon, lat, z, radius) {
  const c = lonLatToTile(lon, lat, z);
  const out = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      out.push({ x: c.x + dx, y: c.y + dy, dx, dy });
    }
  }
  return { center: c, tiles: out, cols: radius * 2 + 1 };
}

export function pickSlot(times, element, { forecast = false } = {}) {
  const hits = (times || []).filter((t) => !element || (t.elements || []).includes(element));
  if (!hits.length) return null;
  if (forecast) return hits.find((t) => String(t.validtime) > String(t.basetime)) || hits[0];
  return hits.find((t) => t.validtime === t.basetime) || hits[0];
}

export function renderWeatherMap({
  lat,
  lon,
  zoom = 7,
  radius = 2,
  overlay,
  legend = [],
  emptyText = "現在、対象地域に表示対象はありません",
  credit = "地図・気象データ：気象庁"
}) {
  const grid = cells(lon, lat, zoom, radius);
  const base = grid.tiles.map((t) => (
    `<img class="v1-tile" alt="" decoding="async" data-z="${zoom}" data-x="${t.x}" data-y="${t.y}" src="${baseTileUrl(zoom, t.x, t.y)}">`
  )).join("");
  const weather = overlay
    ? grid.tiles.map((t) => (
      `<img class="v1-tile v1-overlay-tile" alt="" decoding="async" data-z="${zoom}" data-x="${t.x}" data-y="${t.y}" src="${overlayTileUrl({
        ...overlay,
        z: zoom,
        x: t.x,
        y: t.y
      })}">`
    )).join("")
    : "";
  const probe = overlay
    ? overlayTileUrl({ ...overlay, z: zoom, x: grid.center.x, y: grid.center.y })
    : "";
  return `
    <section class="v1-map" data-state="ready" data-probe="${probe}">
      <div class="v1-map-stack" style="--v1-tile-cols:${grid.cols}">
        <div class="v1-tile-grid v1-base-grid">${base}</div>
        ${weather ? `<div class="v1-tile-grid v1-overlay-grid">${weather}</div>` : ""}
      </div>
      ${legend.length ? `<ul class="v1-legend">${legend.map((item) => (
        `<li><span style="background:${item.color}"></span>${item.label}</li>`
      )).join("")}</ul>` : ""}
      <p class="v1-map-status" hidden>${emptyText}</p>
      <p class="v1-map-credit">${credit}</p>
    </section>`;
}

export function updateWeatherOverlay(host, overlay) {
  const root = host?.querySelector?.(".v1-map") || host;
  const grid = root?.querySelector?.(".v1-overlay-grid");
  if (!root || !overlay) return;
  const tiles = [...(grid?.querySelectorAll?.("img") || [])];
  tiles.forEach((img) => {
    const z = img.dataset.z;
    const x = img.dataset.x;
    const y = img.dataset.y;
    if (!x || !y || !z) return;
    img.src = overlayTileUrl({ ...overlay, z, x, y });
  });
  const probe = tiles[0];
  if (probe) root.dataset.probe = overlayTileUrl({ ...overlay, z: probe.dataset.z, x: probe.dataset.x, y: probe.dataset.y });
}

export async function markEmptyIfClear(host, emptyText) {
  const root = host?.querySelector?.(".v1-map") || host;
  const probe = root?.dataset?.probe;
  const status = root?.querySelector?.(".v1-map-status");
  if (!probe || !status) return "ready";
  try {
    const res = await fetch(probe, { cache: "no-store" });
    if (!res.ok) return "ready";
    const bmp = await createImageBitmap(await res.blob());
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = 0;
    for (let i = 3; i < data.length; i += 32) {
      if (data[i] > 16) painted += 1;
    }
    if (painted < 8) {
      status.hidden = false;
      status.textContent = emptyText;
      root.dataset.state = "empty";
      return "empty";
    }
    return "ready";
  } catch {
    return "ready";
  }
}
