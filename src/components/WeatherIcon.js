/**
 * LED向け天気アイコン。細い線を避け、塗り中心の単純形状にする。
 */

const TONE_CLASS = {
  sunny: "is-sunny",
  sunny_cloudy: "is-sunny",
  cloudy: "is-cloudy",
  cloudy_sunny: "is-cloudy",
  cloudy_rain: "is-rain",
  rain: "is-rain",
  heavy_rain: "is-rain",
  snow: "is-snow",
  thunder: "is-thunder"
};

export function renderWeatherIcon(weatherCode, { sizeVar = "--icon-md", label = "" } = {}) {
  const code = TONE_CLASS[weatherCode] ? weatherCode : "cloudy";
  return `
    <span class="wx-icon ${TONE_CLASS[code]}" style="width:var(${sizeVar});height:var(${sizeVar})" aria-label="${label || code}">
      ${iconSvg(code)}
    </span>
  `;
}

function iconSvg(code) {
  switch (code) {
    case "sunny":
      return `
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="12"/>
          <g stroke="currentColor" stroke-width="5" stroke-linecap="round">
            <path d="M32 6v8M32 50v8M6 32h8M50 32h8M12 12l6 6M46 46l6 6M12 52l6-6M46 18l6-6"/>
          </g>
        </svg>`;
    case "sunny_cloudy":
    case "cloudy_sunny":
      return `
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="24" cy="24" r="10"/>
          <path d="M18 42h28a10 10 0 0 0 0-20 14 14 0 0 0-26 6 9 9 0 0 0-2 14z"/>
        </svg>`;
    case "cloudy":
      return `
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M16 42h32a12 12 0 0 0 0-24 16 16 0 0 0-30 8 10 10 0 0 0-2 16z"/>
        </svg>`;
    case "rain":
    case "heavy_rain":
    case "cloudy_rain":
      return `
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M16 34h32a12 12 0 0 0 0-22 16 16 0 0 0-30 7 10 10 0 0 0-2 15z"/>
          <g>
            <rect x="20" y="42" width="5" height="12" rx="2"/>
            <rect x="30" y="46" width="5" height="12" rx="2"/>
            <rect x="40" y="42" width="5" height="12" rx="2"/>
          </g>
        </svg>`;
    case "snow":
      return `
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M16 32h32a12 12 0 0 0 0-22 16 16 0 0 0-30 7 10 10 0 0 0-2 15z"/>
          <circle cx="22" cy="46" r="3"/>
          <circle cx="32" cy="52" r="3"/>
          <circle cx="42" cy="46" r="3"/>
        </svg>`;
    case "thunder":
      return `
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M16 30h32a12 12 0 0 0 0-22 16 16 0 0 0-30 7 10 10 0 0 0-2 15z"/>
          <path d="M34 32 L24 46 H32 L28 58 L44 40 H34 Z"/>
        </svg>`;
    default:
      return iconSvg("cloudy");
  }
}
