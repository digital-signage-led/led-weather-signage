/**
 * 警報バナー。色だけでなく種別ラベルを必ず併記する。
 */

const LEVEL_LABEL = {
  advisory: "注意報",
  warning: "警報",
  critical: "重大警報"
};

export function renderAlertBanner(alert) {
  if (!alert) return "";
  return `
    <div class="alert-banner alert-${alert.level}">
      <span class="alert-kicker">${LEVEL_LABEL[alert.level] || "気象情報"}</span>
      <span class="alert-title">${alert.title}</span>
    </div>
  `;
}

export function renderAlertChip(hasAlert) {
  if (!hasAlert) {
    return `<span class="alert-chip is-clear">警報なし</span>`;
  }
  return `<span class="alert-chip is-on">警報あり</span>`;
}
