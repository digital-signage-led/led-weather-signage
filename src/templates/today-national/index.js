import { renderFrame } from "../../components/Frame.js";
import { renderMap } from "../../components/Map.js";
import { renderWeatherIcon } from "../../components/WeatherIcon.js";
import { renderTemperature } from "../../components/Temperature.js";
import { buildRegionNote } from "../../services/insightService.js";

export async function render(context) {
  const { data, region } = context;
  const points = pickNationalPoints(data.points, region, context.profile);
  const mapHtml = await renderMap({
    mapFile: "japan.svg",
    points,
    selectedRegionId: region.id
  });

  const list = points.map((point) => `
    <div class="point-row">
      <span class="point-name">${point.name}</span>
      ${renderWeatherIcon(point.today.weatherCode, { sizeVar: "--icon-sm", label: point.today.weather })}
      ${renderTemperature(point.today.tempMax, point.today.tempMin, { compact: true })}
    </div>
  `).join("");

  return renderFrame({
    title: "今日の天気",
    kicker: "全国",
    updatedAt: data.updatedAt,
    extraClass: "tpl-today-national",
    weatherCode: data.today?.weatherCode || "",
    note: buildRegionNote(points, data.today),
    body: `
      <div class="split-map">
        <div class="map-fill">${mapHtml}</div>
        <div class="point-list panel">${list}</div>
      </div>
    `
  });
}

function pickNationalPoints(points, region, profile) {
  const limit = profile.height <= 352 ? 6 : 8;
  const preferred = ["札幌", "仙台", "東京", "名古屋", "大阪", "広島", "福岡", "那覇", "金沢", "高松"];
  const byName = new Map(points.map((point) => [point.name, point]));
  const selected = preferred.map((name) => byName.get(name)).filter(Boolean);
  if (selected.length >= 6) return selected.slice(0, limit);

  const fallback = [...points].sort((a, b) => a.priority - b.priority);
  const regionFirst = fallback.filter((p) => p.name === region.nationalPoint.name);
  return uniqueByName([...regionFirst, ...fallback]).slice(0, limit);
}

function uniqueByName(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}
