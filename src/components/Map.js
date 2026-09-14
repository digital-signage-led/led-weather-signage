/**
 * 地図コンポーネント。
 * 国土地理院の地球地図日本から生成した SVG を、画像ではなくインライン SVG として載せる。
 * 地点座標はマスターの x/y（viewBox 比の 0–100%）を、同じ枠の上に重ねる。
 */

import { renderWeatherIcon } from "./WeatherIcon.js";

const svgCache = new Map();

export async function loadMapSvg(mapFile) {
  const file = "japan.svg";
  if (svgCache.has(file)) return svgCache.get(file);
  const response = await fetch(`maps/${file}`);
  if (!response.ok) {
    throw new Error(`地図を読み込めません: ${file}`);
  }
  const text = await response.text();
  svgCache.set(file, text);
  return text;
}

function viewBoxSize(svgText) {
  const match = svgText.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  return {
    width: match ? Number(match[1]) : 100,
    height: match ? Number(match[2]) : 100
  };
}

function dodgeChips(points) {
  const placed = points.map((point) => ({ ...point, x: Number(point.x), y: Number(point.y) }));
  const minDx = 10;
  const minDy = 13;
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      const dx = placed[i].x - placed[j].x;
      const dy = placed[i].y - placed[j].y;
      if (Math.abs(dx) >= minDx || Math.abs(dy) >= minDy) continue;
      const push = minDy - Math.abs(dy) + 1;
      placed[i].y += placed[i].y >= placed[j].y ? push : -push;
      placed[i].y = Math.min(96, Math.max(4, placed[i].y));
      if (Math.abs(placed[i].x - placed[j].x) < minDx && Math.abs(placed[i].y - placed[j].y) < minDy) {
        placed[i].x += placed[i].x >= placed[j].x ? minDx : -minDx;
        placed[i].x = Math.min(96, Math.max(4, placed[i].x));
      }
    }
  }
  return placed;
}

export async function renderMap({ mapFile, points, selectedRegionId = "", showTemps = true }) {
  const raw = await loadMapSvg(mapFile);
  const { width, height } = viewBoxSize(raw);
  const withFit = raw.replace("<svg ", '<svg preserveAspectRatio="none" ');
  const tinted = selectedRegionId
    ? withFit.replace(`data-region="${selectedRegionId}"`, `data-region="${selectedRegionId}" class="is-selected"`)
    : withFit;

  const chips = dodgeChips(points).map((point) => `
    <div class="wx-chip" style="left:${point.x}%;top:${point.y}%;">
      ${renderWeatherIcon(point.today.weatherCode, { sizeVar: "--icon-sm", label: point.today.weather })}
      <span class="wx-chip-name">${point.name}</span>
      ${showTemps ? `<b>${Math.round(point.today.tempMax)}℃</b>` : ""}
    </div>
  `).join("");

  return `
    <div class="map-stage" data-region="${selectedRegionId}">
      <div class="map-fit" style="--map-aspect:${width} / ${height}">
        <div class="map-svg">${tinted}</div>
        <div class="map-chips">${chips}</div>
        <div class="map-credit">地図：国土地理院</div>
      </div>
    </div>
  `;
}
