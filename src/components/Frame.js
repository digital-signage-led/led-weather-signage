/**
 * LED画面の共通フレーム。
 * 気象番組型：紺ヘッダー / 水色本文 / 紺フッター。
 */

import { formatStamp } from "./UpdateTime.js";

export function renderFrame({
  title,
  kicker = "",
  showName = "",
  updatedAt,
  body,
  extraClass = "",
  weatherCode = "",
  note = ""
}) {
  return `
    <article class="led-screen ${extraClass}" data-weather="${weatherCode}">
      <header class="led-header">
        <div class="led-heading">
          ${kicker ? `<span class="led-kicker">${kicker}</span>` : ""}
          ${showName ? `<span class="led-show">${showName}</span>` : ""}
          <h1 class="led-title">${title}</h1>
        </div>
        <div class="led-stamp">${formatStamp(updatedAt)}</div>
      </header>
      <div class="led-body">${body}</div>
      <footer class="led-footer">
        <span class="led-note">${note}</span>
      </footer>
    </article>
  `;
}
