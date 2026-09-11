import { renderFrame } from "../../components/Frame.js";
import { renderWeatherIcon } from "../../components/WeatherIcon.js";
import { renderHeroTemps } from "../../components/Temperature.js";
import { renderAlertChip } from "../../components/AlertBanner.js";
import {
  buildTodayHeadline,
  buildUmbrellaAdvice,
  buildWeatherChangeStory,
  peakRainProbability
} from "../../services/insightService.js";

export async function render(context) {
  const { data } = context;
  const umbrella = buildUmbrellaAdvice(data.today);
  const story = buildWeatherChangeStory(data.hourly, new Date(data.updatedAt));
  const headline = buildTodayHeadline(data.today, story, data.alerts, umbrella);
  const next = story[1];
  const place = data.site.pointName || data.site.city;

  return renderFrame({
    title: "きょうのポイント",
    kicker: place,
    updatedAt: data.updatedAt,
    weatherCode: data.today.weatherCode,
    extraClass: "tpl-today-status",
    note: next ? `このあと ${next.title} ${next.note || next.weather}` : "大きな天気の変化はありません。",
    body: `
      <div class="status-layout">
        <div class="status-main">
          <div class="status-icon-disc">
            ${renderWeatherIcon(data.today.weatherCode, { sizeVar: "--icon-hero", label: data.today.weather })}
          </div>
          <div class="status-copy">
            <p class="status-weather-name">${data.today.weather}</p>
            ${renderHeroTemps(data.today.tempMax, data.today.tempMin)}
          </div>
        </div>
        <p class="status-headline">${headline}</p>
        <div class="life-grid">
          <div class="life-card">
            <span class="stat-label">降水確率</span>
            <span class="stat-value">${peakRainProbability(data.today)}%</span>
          </div>
          <div class="life-card ${umbrella.need ? "is-warn" : ""}">
            <span class="stat-label">傘</span>
            <span class="stat-value">${umbrella.label}</span>
          </div>
          <div class="life-card">
            <span class="stat-label">風</span>
            <span class="stat-value">${data.today.windDir} ${data.today.windSpeed}<small>m/s</small></span>
          </div>
          <div class="life-card">
            <span class="stat-label">警報</span>
            ${renderAlertChip(data.alerts.length > 0)}
          </div>
        </div>
      </div>
    `
  });
}
