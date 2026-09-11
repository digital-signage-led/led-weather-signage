/**
 * 最終更新時刻。画面端ではなくセーフエリア内に置く。
 */

export function renderUpdateTime(updatedAt) {
  return `<span class="update-time">${formatStamp(updatedAt)}</span>`;
}

export function formatShortDate(isoOrDate) {
  const date = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  const week = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  return `${date.getMonth() + 1}/${date.getDate()}(${week})`;
}

export function formatStamp(isoOrDate) {
  const date = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  const week = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  return `${date.getMonth() + 1}月${date.getDate()}日（${week}）${pad(date.getHours())}:${pad(date.getMinutes())} 更新`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}
