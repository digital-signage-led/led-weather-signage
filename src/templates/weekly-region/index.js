import { renderFrame } from "../../components/Frame.js";
import { renderWeatherIcon } from "../../components/WeatherIcon.js";
import { renderTemperature } from "../../components/Temperature.js";

export async function render(context) {
  const { data, region } = context;
  const maxRows = context.profile.height <= 352 ? 3 : context.profile.height <= 528 ? 4 : 5;
  const showTemps = context.profile.width >= 704;
  const points = [...data.points].sort((a, b) => a.priority - b.priority).slice(0, maxRows);
  const days = points[0]?.weekly || data.weekly;

  const head = `
    <div class="weekly-head">
      <span></span>
      ${days.map((day) => `<span>${day.weekday}</span>`).join("")}
    </div>
  `;

  const rows = points.map((point) => `
    <div class="weekly-row">
      <span class="weekly-city">${point.name}</span>
      ${(point.weekly || []).map((day) => `
        <div class="weekly-day">
          ${renderWeatherIcon(day.weatherCode, { sizeVar: "--icon-sm", label: day.weather })}
          ${showTemps ? renderTemperature(day.tempMax, day.tempMin, { compact: true }) : ""}
        </div>
      `).join("")}
    </div>
  `).join("");

  return renderFrame({
    title: "週間天気",
    kicker: region.name,
    updatedAt: data.updatedAt,
        extraClass: "tpl-weekly-region",
    weatherCode: data.today?.weatherCode || "",
    note: `${region.name}の今後7日間です。`,
    body: `<div class="weekly-table">${head}<div class="stack-col" style="gap:var(--spacing-xs)">${rows}</div></div>`
  });
}
