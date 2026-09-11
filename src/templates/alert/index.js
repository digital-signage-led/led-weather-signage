import { formatStamp } from "../../components/UpdateTime.js";
import { strongestAlert } from "../../services/alertService.js";

const LEVEL_COPY = {
  advisory: "注意報",
  warning: "警報",
  critical: "重大警報"
};

export async function render(context) {
  const { data } = context;
  const alert = strongestAlert(data.alerts);

  if (!alert) {
    return `
      <article class="led-screen stale-screen">
        <header class="led-header">
          <div class="led-heading">
            <h1 class="led-title">警報・注意報</h1>
          </div>
          <div class="led-stamp">${formatStamp(data.updatedAt)}</div>
        </header>
        <div class="led-body">
          <div class="stale-hero">
            <h2>発表なし</h2>
            <p>${data.site.forecastAreaName || data.site.prefecture}に警報・注意報は発表されていません</p>
          </div>
        </div>
        <footer class="led-footer"><span class="led-note">対象地域のみ判定しています</span></footer>
      </article>
    `;
  }

  return `
    <article class="led-screen alert-screen level-${alert.level}">
      <header class="led-header">
        <div class="led-heading">
          <span class="led-live">${LEVEL_COPY[alert.level]}</span>
          <h1 class="led-title">緊急情報</h1>
        </div>
        <div class="led-stamp">${formatStamp(alert.issuedAt)}</div>
      </header>
      <div class="led-body">
        <div class="alert-hero">
          <p>${alert.areaNames.join("・")}</p>
          <h2>${alert.title}</h2>
          <p>${alert.headline}</p>
        </div>
      </div>
      <footer class="led-footer"><span class="led-note">${alert.areaNames.join("・")}が対象です</span></footer>
    </article>
  `;
}
