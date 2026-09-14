/**
 * 週間天気右上の「今週の気象ポイント」。
 * 通常は週末・週明け・気温の3点。警報・雷・台風があるときだけ差し替える。
 * 気温は気象庁週間予報の平年値（tempAverage）が取れた場合だけ出す。
 */
import { jmaTone, isWetWeather } from "./jma-icons.js?v=pref355";

const WARNING_URL = (office) => `https://www.jma.go.jp/bosai/warning/data/warning/${office}.json`;
const ALERT_MAX_AGE_MS = 36 * 60 * 60 * 1000;

const ALERT_CODES = {
  "02": "暴風雪警報",
  "03": "大雨警報",
  "04": "洪水警報",
  "05": "暴風警報",
  "06": "大雪警報",
  "07": "波浪警報",
  "08": "高潮警報",
  "14": "雷注意報",
  "32": "暴風特別警報",
  "33": "大雨特別警報",
  "35": "暴風雪特別警報",
  "36": "大雪特別警報",
  "37": "波浪特別警報",
  "38": "高潮特別警報"
};

export function buildWeekPoints(cities) {
  return {
    weekend: summarizeDays(cities, (day) => day.weekend, "週末"),
    weekStart: summarizeDays(cities, (day) => day.weekday === "月" || day.weekday === "火", "週明け"),
    temperature: temperatureVsNormal(cities)
  };
}

function summarizeDays(cities, match, label) {
  const days = cities.flatMap((city) => (city.weekly || []).filter(match));
  if (!days.length) return { label, icon: "cloudy", text: "情報なし" };
  const n = days.length;
  const snow = days.filter((day) => jmaTone(day.weather) === "is-snow").length;
  const rain = days.filter((day) => isWetWeather(day.weather) || jmaTone(day.weather) === "is-rain").length;
  const sunny = days.filter((day) => jmaTone(day.weather) === "is-sunny").length;
  if (snow >= n * 0.22) return { label, icon: "rain", text: "雪の地域あり" };
  if (rain >= n * 0.45) return { label, icon: "rain", text: "雨の地域が多い" };
  if (rain >= n * 0.22) return { label, icon: "rain", text: "雨の地域も" };
  if (sunny >= n * 0.5) return { label, icon: "sun", text: "晴れる地域が多い" };
  return { label, icon: "cloudy", text: "曇りの地域が多い" };
}

function temperatureVsNormal(cities) {
  const samples = [];
  for (const city of cities) {
    const normal = Number(city.normalMax);
    if (!Number.isFinite(normal) || normal <= 0) continue;
    const maxes = (city.weekly || [])
      .map((day) => Number(day.tempMax))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (!maxes.length) continue;
    samples.push({
      forecast: maxes.reduce((sum, value) => sum + value, 0) / maxes.length,
      normal
    });
  }
  if (!samples.length) return null;
  const forecast = samples.reduce((sum, item) => sum + item.forecast, 0) / samples.length;
  const normal = samples.reduce((sum, item) => sum + item.normal, 0) / samples.length;
  const diff = forecast - normal;
  if (diff >= 1.5) return { label: "気温", icon: "temp", text: "平年より高め" };
  if (diff <= -1.5) return { label: "気温", icon: "temp", text: "平年より低め" };
  return null;
}

export async function fetchWeekAlert(cities) {
  const offices = [...new Set(cities.map((city) => city.jmaOffice).filter(Boolean))].slice(0, 12);
  const reports = await Promise.all(offices.map(async (office) => {
    try {
      const response = await fetch(WARNING_URL(office), { cache: "no-store" });
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }));
  const hits = [];
  for (const report of reports) {
    if (!report || !isFreshReport(report)) continue;
    const headline = String(report.headlineText || "");
    if (/特別警報/.test(headline)) hits.push({ rank: 10, text: "特別警報発表中" });
    if (/台風/.test(headline)) hits.push({ rank: 9, text: "台風の影響に注意" });
    for (const type of report.areaTypes || []) {
      for (const area of type.areas || []) {
        for (const warning of area.warnings || []) {
          const code = String(warning.code || "");
          const status = String(warning.status || "");
          if (!ALERT_CODES[code]) continue;
          if (status === "解除" || status.includes("なし")) continue;
          if (!shouldCountWarning(code, area.code, cities)) continue;
          hits.push({
            rank: code.startsWith("3") ? 8 : code === "14" ? 5 : 7,
            text: `${ALERT_CODES[code]}発表中`
          });
        }
      }
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => b.rank - a.rank);
  return hits[0];
}

function isFreshReport(report) {
  const at = Date.parse(report.reportDatetime);
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < ALERT_MAX_AGE_MS;
}

function shouldCountWarning(code, areaCode, cities) {
  const hasKeys = cities.some((city) => city.jmaClass10 || city.jmaClass20);
  if (hasKeys) return areaBelongsToCities(areaCode, cities);
  return code !== "14";
}

function areaBelongsToCities(code, cities) {
  const id = String(code || "");
  if (!id) return false;
  return cities.some((city) => city.jmaClass10 === id || city.jmaClass20 === id);
}

export function renderWeekPointsHtml(points, alert) {
  const rows = alert
    ? [{ label: "注意", icon: "alert", text: alert.text }]
    : [points.weekend, points.weekStart, points.temperature].filter(Boolean);
  if (!rows.length) return "";
  return `
    <p class="week-points-badge">今週のポイント</p>
    <ul class="week-points-list">
      ${rows.map((row) => `
        <li class="week-points-item">
          <span class="week-points-icon" aria-hidden="true">${iconHtml(row.icon)}</span>
          <span class="week-points-copy">
            <b>${row.label}</b>
            <span>${row.text}</span>
          </span>
        </li>
      `).join("")}
    </ul>
  `;
}

function iconHtml(kind) {
  if (kind === "sun") return `<img src="icons/jma/100.svg" alt="">`;
  if (kind === "rain") return `<img src="icons/jma/300.svg" alt="">`;
  if (kind === "cloudy") return `<img src="icons/jma/200.svg" alt="">`;
  if (kind === "alert") {
    return `<svg viewBox="0 0 64 64"><path fill="#ffd400" d="M32 8 58 54H6z"/><path fill="#0a2f7a" d="M30 26h4v16h-4zm0 20h4v4h-4z"/></svg>`;
  }
  return `<svg viewBox="0 0 64 64"><rect x="26" y="6" width="10" height="34" rx="5" fill="#fff" stroke="#e62919" stroke-width="4"/><circle cx="31" cy="48" r="13" fill="#e62919"/><path fill="#e62919" d="M26 36h10v10H26z"/><path fill="none" stroke="#e62919" stroke-width="3" stroke-linecap="round" d="M42 14h7M42 22h7M42 30h5"/></svg>`;
}
