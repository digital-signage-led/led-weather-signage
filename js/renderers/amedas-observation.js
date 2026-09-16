/**
 * アメダス：現在値 + 24時間推移を1画面。
 */
import { fetchAmedasHours, windDirLabel } from "../jma-amedas.js?v=pref434";
import { renderLedGraph } from "./graph-renderer.js?v=pref434";

function hourlyPoints(points, key) {
  const byHour = new Map();
  for (const p of points || []) {
    const hour = `${p.stamp.slice(0, 10)}00`;
    const prev = byHour.get(hour);
    if (!prev || p.stamp > prev.stamp) byHour.set(hour, p);
  }
  return [...byHour.values()].map((p) => ({
    ...p,
    label: `${Number(p.stamp.slice(8, 10))}時`
  })).filter((p) => Number.isFinite(Number(p[key])));
}

function lastWith(points, keys) {
  return [...(points || [])].reverse().find((p) => keys.some((key) => p[key] != null)) || null;
}

export async function renderAmedasObservation({ contentId, station, setNote }) {
  const stage = document.getElementById("map-stage");
  const { latest, points } = await fetchAmedasHours(station.station_id, 24);

  if (contentId === "amedas_temperature") {
    const series = hourlyPoints(points, "temp");
    const last = lastWith(points, ["temp"]);
    if (!last) throw new Error("no temp");
    const temps = series.map((p) => p.temp);
    const max = last.maxTemp ?? (temps.length ? Math.max(...temps) : null);
    const min = last.minTemp ?? (temps.length ? Math.min(...temps) : null);
    stage.innerHTML = `<section class="v1-obs">
      <div class="v1-stats">
        <article class="v1-stat"><h3>現在気温</h3><p><strong>${last.temp.toFixed(1)}</strong><span>℃</span></p><small>${station.station_name}</small></article>
        <article class="v1-stat"><h3>最高</h3><p><strong>${max != null ? Number(max).toFixed(1) : "—"}</strong><span>℃</span></p></article>
        <article class="v1-stat"><h3>最低</h3><p><strong>${min != null ? Number(min).toFixed(1) : "—"}</strong><span>℃</span></p></article>
      </div>
      ${renderLedGraph({ title: "気温", unit: "℃", points: series, valueKey: "temp", color: "#e62919", currentLabel: `${station.station_name} 24時間`, compact: true })}
    </section>`;
    setNote(`アメダス ${station.station_name} の気温です。`);
    return { stamp: latest.toISOString(), state: "ready" };
  }

  if (contentId === "amedas_rainfall") {
    const series = hourlyPoints(points, "precipitation1h");
    const last = lastWith(points, ["precipitation1h", "precipitation10m"]);
    if (!last) throw new Error("no rain");
    const sum = series.reduce((n, p) => n + (Number(p.precipitation1h) || 0), 0);
    stage.innerHTML = `<section class="v1-obs">
      <div class="v1-stats">
        <article class="v1-stat"><h3>1時間降水量</h3><p><strong>${last.precipitation1h != null ? last.precipitation1h.toFixed(1) : "—"}</strong><span>mm</span></p><small>${station.station_name}</small></article>
        <article class="v1-stat"><h3>10分降水量</h3><p><strong>${last.precipitation10m != null ? last.precipitation10m.toFixed(1) : "—"}</strong><span>mm</span></p></article>
        <article class="v1-stat"><h3>24時間積算</h3><p><strong>${sum.toFixed(1)}</strong><span>mm</span></p></article>
      </div>
      ${renderLedGraph({ title: "降水量", unit: "mm", points: series, valueKey: "precipitation1h", color: "#086dcc", currentLabel: `${station.station_name} 1時間降水量`, compact: true })}
    </section>`;
    setNote(`アメダス ${station.station_name} の降水量です。`);
    return { stamp: latest.toISOString(), state: "ready" };
  }

  const series = hourlyPoints(points, "wind");
  const last = lastWith(points, ["wind"]);
  if (!last) throw new Error("no wind");
  const maxWind = series.length ? Math.max(...series.map((p) => Number(p.wind))) : last.wind;
  stage.innerHTML = `<section class="v1-obs">
    <div class="v1-stats">
      <article class="v1-stat"><h3>風速</h3><p><strong>${last.wind.toFixed(1)}</strong><span>m/s</span></p><small>${station.station_name}</small></article>
      <article class="v1-stat"><h3>風向</h3><p><strong>${windDirLabel(last.windDirection)}</strong></p></article>
      <article class="v1-stat"><h3>最大風速</h3><p><strong>${Number(maxWind).toFixed(1)}</strong><span>m/s</span></p></article>
    </div>
    ${renderLedGraph({ title: "風速", unit: "m/s", points: series, valueKey: "wind", color: "#0a2f7a", currentLabel: `${station.station_name} 風速`, compact: true })}
  </section>`;
  setNote(`アメダス ${station.station_name} の風向・風速です。`);
  return { stamp: latest.toISOString(), state: "ready" };
}
