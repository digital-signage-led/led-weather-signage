/**
 * 最高・最低気温。視認性を優先し、色と数字サイズを固定ルールで出す。
 */

export function renderTemperature(tempMax, tempMin, { compact = false } = {}) {
  return `
    <div class="temp-pair ${compact ? "is-compact" : ""}">
      <span class="temp temp-max"><b>${formatTemp(tempMax)}</b><small>℃</small></span>
      <span class="temp-slash">/</span>
      <span class="temp temp-min"><b>${formatTemp(tempMin)}</b><small>℃</small></span>
    </div>
  `;
}

/** 今日の見通し用。最高・最低を並べて大きく出す。 */
export function renderHeroTemps(tempMax, tempMin) {
  return `
    <div class="temp-hero">
      <div class="temp-hero-col is-max">
        <span class="temp-hero-label">最高</span>
        <span class="temp-hero-num">${formatTemp(tempMax)}<small>℃</small></span>
      </div>
      <div class="temp-hero-col is-min">
        <span class="temp-hero-label">最低</span>
        <span class="temp-hero-num">${formatTemp(tempMin)}<small>℃</small></span>
      </div>
    </div>
  `;
}

export function renderSingleTemp(value, kind = "max") {
  return `
    <span class="temp temp-${kind}"><b>${formatTemp(value)}</b><small>℃</small></span>
  `;
}

function formatTemp(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return Math.round(Number(value));
}
