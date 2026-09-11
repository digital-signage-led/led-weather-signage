import { renderFrame } from "../../components/Frame.js";
import { renderMap } from "../../components/Map.js";
import { buildRegionNote } from "../../services/insightService.js";

export async function render(context) {
  const { data, region } = context;
  const points = [...data.points].sort((a, b) => a.priority - b.priority);

  const mapHtml = await renderMap({
    mapFile: region.mapFile,
    points,
    selectedRegionId: region.id
  });

  return renderFrame({
    title: "今日の天気",
    kicker: region.name,
    updatedAt: data.updatedAt,
    extraClass: "tpl-today-region",
    weatherCode: data.today?.weatherCode || "",
    note: buildRegionNote(points, data.today),
    body: `<div class="map-fill">${mapHtml}</div>`
  });
}
