import { renderFrame } from "../../components/Frame.js";
import { renderWeatherIcon } from "../../components/WeatherIcon.js";

export async function render(context) {
  const { data } = context;
  const take = 6;
  const todaySlots = data.hourly.slice(0, take);
  const tomorrowSlots = data.hourly.slice(8, 8 + take);

  return renderFrame({
    title: "時間帯別予報",
    kicker: data.site.pointName || data.site.city || data.site.name,
    updatedAt: data.updatedAt,
    extraClass: "tpl-hourly",
    note: `${data.site.pointName || data.site.city}の時間帯別です。`,
    weatherCode: data.today?.weatherCode || "",
    body: `
      <div class="two-row">
        ${renderBand("今日", todaySlots)}
        ${renderBand("明日", tomorrowSlots)}
      </div>
    `
  });
}

function renderBand(title, slots) {
  return `
    <section class="stack-col" style="flex:1">
      <div class="band-title">${title}</div>
      <div class="hourly-grid" style="grid-template-columns:repeat(${slots.length},1fr)">
        ${slots.map((slot) => `
          <div class="hourly-card">
            <span class="label">${slot.label}</span>
            ${renderWeatherIcon(slot.weatherCode, { sizeVar: "--icon-md", label: slot.weather })}
            <span class="stat-value">${slot.temp}<small>℃</small></span>
            <span class="pop-badge">${slot.rainProbability}%</span>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}
