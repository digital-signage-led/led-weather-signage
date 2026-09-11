/**
 * 降水確率。時間帯ラベルと数値をセットで出す。
 */

export function renderRainProbability(rainProbability, { compact = false } = {}) {
  const entries = normalizeEntries(rainProbability);
  return `
    <div class="pop-row ${compact ? "is-compact" : ""}">
      ${entries.map(([label, value]) => `
        <div class="pop-cell">
          <span class="pop-label">${label}</span>
          <span class="pop-value">${value}<small>%</small></span>
        </div>
      `).join("")}
    </div>
  `;
}

export function renderPopBadge(value) {
  return `<span class="pop-badge">${value}<small>%</small></span>`;
}

function normalizeEntries(rainProbability) {
  if (typeof rainProbability === "number") {
    return [["降水", rainProbability]];
  }
  const order = ["06-12", "12-18", "18-24", "00-06"];
  return order
    .filter((key) => rainProbability && rainProbability[key] !== undefined)
    .map((key) => [labelOf(key), rainProbability[key]]);
}

function labelOf(key) {
  const map = {
    "00-06": "未明",
    "06-12": "朝",
    "12-18": "昼",
    "18-24": "夜"
  };
  return map[key] || key;
}
