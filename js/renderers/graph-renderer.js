/**
 * 1920×1080 LED向け太線グラフ。値は呼び出し側の実測／予報のみ。
 */
export function renderLedGraph({
  title,
  unit,
  points,
  valueKey,
  color = "#e62919",
  currentLabel = "現在"
}) {
  const usable = (points || []).filter((p) => Number.isFinite(Number(p[valueKey])));
  if (!usable.length) {
    return `<section class="v1-panel"><p class="v1-empty">この地点の${title}は現在取得できません。</p></section>`;
  }
  const values = usable.map((p) => Number(p[valueKey]));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(1, (max - min) * 0.15);
  const lo = min - pad;
  const hi = max + pad;
  const w = 1680;
  const h = 620;
  const left = 90;
  const right = 40;
  const top = 40;
  const bottom = 90;
  const innerW = w - left - right;
  const innerH = h - top - bottom;
  const last = usable[usable.length - 1];
  const coords = usable.map((p, i) => {
    const x = left + (usable.length === 1 ? innerW / 2 : (i / (usable.length - 1)) * innerW);
    const y = top + (1 - (Number(p[valueKey]) - lo) / (hi - lo)) * innerH;
    return { x, y, p };
  });
  const path = coords.map((c, i) => `${i ? "L" : "M"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const ticks = usable.filter((_, i) => i === 0 || i === usable.length - 1 || i % Math.ceil(usable.length / 8) === 0);
  return `
    <section class="v1-graph">
      <div class="v1-current">
        <span class="v1-current-label">${currentLabel}</span>
        <strong>${Number(last[valueKey]).toFixed(1)}</strong>
        <span class="v1-unit">${unit}</span>
        <span class="v1-minmax">最高 ${max.toFixed(1)}${unit}　最低 ${min.toFixed(1)}${unit}</span>
      </div>
      <svg class="v1-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}">
        <rect x="0" y="0" width="${w}" height="${h}" fill="rgba(255,255,255,0.55)"/>
        <text x="16" y="36" class="v1-axis">${unit}</text>
        <text x="16" y="${top + 12}" class="v1-axis">${hi.toFixed(0)}</text>
        <text x="16" y="${top + innerH}" class="v1-axis">${lo.toFixed(0)}</text>
        <path d="${path}" fill="none" stroke="${color}" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/>
        ${coords.map((c) => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="7" fill="${color}"/>`).join("")}
        ${ticks.map((p) => {
          const c = coords[usable.indexOf(p)];
          return `<text x="${c.x.toFixed(1)}" y="${h - 28}" text-anchor="middle" class="v1-tick">${p.label || ""}</text>`;
        }).join("")}
      </svg>
    </section>`;
}

export function renderStatCards(cards) {
  return `<div class="v1-stats">${cards.map((c) => `
    <article class="v1-stat">
      <h3>${c.label}</h3>
      <p><strong>${c.value}</strong><span>${c.unit || ""}</span></p>
      ${c.sub ? `<small>${c.sub}</small>` : ""}
    </article>`).join("")}</div>`;
}

export function renderPending(name) {
  return `<section class="v1-panel v1-pending">
    <p class="v1-pending-flag">DATA_SOURCE_PENDING</p>
    <p>「${name}」は気象庁の配信形式を確認できるまで本番数値を出していません。</p>
  </section>`;
}

export function renderTileLayer({ lat, lon, zoom, basetime, validtime, element, caption }) {
  const { x, y } = lonLatToTile(lon, lat, zoom);
  const tiles = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const tx = x + dx;
      const ty = y + dy;
      const src = `https://www.jma.go.jp/bosai/jmatile/data/nowc/${basetime}/none/${validtime}/surf/${element}/${zoom}/${tx}/${ty}.png`;
      tiles.push(`<img class="v1-tile" data-dx="${dx}" data-dy="${dy}" src="${src}" alt="">`);
    }
  }
  return `<section class="v1-tiles">
    <p class="v1-tile-caption">${caption}</p>
    <div class="v1-tile-grid">${tiles.join("")}</div>
  </section>`;
}

function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}
