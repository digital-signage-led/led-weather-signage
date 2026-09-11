import { renderFrame } from "../../components/Frame.js";
import { renderWeatherIcon } from "../../components/WeatherIcon.js";

export async function render(context) {
  const { data } = context;
  const cities = pickCities(data.points, context.profile.height <= 352 ? 4 : 5);
  const days = cities[0]?.weekly || data.weekly;

  const head = `
    <div class="weekly-head">
      <span></span>
      ${days.map((day) => `<span>${day.weekday}</span>`).join("")}
    </div>
  `;

  const rows = cities.map((city) => `
    <div class="weekly-row">
      <span class="weekly-city">${city.name}</span>
      ${(city.weekly || []).map((day) => `
        <div class="weekly-day">
          ${renderWeatherIcon(day.weatherCode, { sizeVar: "--icon-sm", label: day.weather })}
        </div>
      `).join("")}
    </div>
  `).join("");

  return renderFrame({
    title: "週間天気",
    kicker: "全国",
    updatedAt: data.updatedAt,
        extraClass: "tpl-weekly-national",
    weatherCode: data.today?.weatherCode || "",
    note: "全国主要都市の今後7日間です。",
    body: `<div class="weekly-table">${head}<div class="stack-col" style="gap:var(--spacing-xs)">${rows}</div></div>`
  });
}

function pickCities(points, count) {
  const names = ["札幌", "東京", "大阪", "福岡", "那覇", "名古屋", "仙台"];
  const byName = new Map(points.map((point) => [point.name, point]));
  const selected = names.map((name) => byName.get(name)).filter(Boolean);
  if (selected.length >= count) return selected.slice(0, count);
  return [...points].sort((a, b) => a.priority - b.priority).slice(0, count);
}
