import { renderFrame } from "../../components/Frame.js";
import { renderWeatherIcon } from "../../components/WeatherIcon.js";
import { buildWeatherChangeStory } from "../../services/insightService.js";

export async function render(context) {
  const { data } = context;
  const story = buildWeatherChangeStory(data.hourly, new Date(data.updatedAt))
    .slice(0, context.profile.width <= 528 ? 3 : 4);

  const steps = story.map((step, index) => {
    const arrow = index < story.length - 1 ? `<div class="timeline-arrow">→</div>` : "";
    return `
      ${index > 0 ? arrow : ""}
      <div class="timeline-step">
        <span class="band-title">${step.title}</span>
        ${renderWeatherIcon(step.weatherCode, { sizeVar: "--icon-lg", label: step.weather })}
        <strong style="font-size:var(--font-medium)">${step.note || step.weather}</strong>
      </div>
    `;
  }).join("");

  return renderFrame({
    title: "このあとの天気",
    kicker: data.site.pointName || data.site.city,
    updatedAt: data.updatedAt,
    extraClass: "tpl-weather-change",
    weatherCode: data.today?.weatherCode || "",
    note: `${data.site.pointName || data.site.city}のこれからの天気です。`,
    body: `<div class="timeline">${steps}</div>`
  });
}
