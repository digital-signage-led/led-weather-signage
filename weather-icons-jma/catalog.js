/**
 * 一覧画面。カードHTMLはここにだけ書く。
 * データは weather-codes.js を見る。
 */

import { listWeatherCodes } from "./weather-codes.js";

const listEl = document.getElementById("list");
const searchEl = document.getElementById("q");
const summaryEl = document.getElementById("summary");
const filterEl = document.getElementById("filter");

const items = listWeatherCodes();

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderCard(item) {
  const ok = Boolean(item.icon);
  const fileName = `${item.code}.svg`;
  const native = ok
    ? `<img src="${item.icon}" alt="" class="native-icon">`
    : `<span class="missing">—</span>`;
  const framed = ok
    ? `<img src="${item.icon}" alt="${escapeHtml(item.label)}" class="weather-icon">`
    : `<span class="missing">取得失敗</span>`;

  return `
    <article class="card" data-code="${item.code}" data-label="${escapeHtml(item.label)}" data-ok="${ok}">
      <div class="meta">
        <strong>${item.code}</strong>
        <span>${escapeHtml(item.label)}</span>
        <span>${fileName}</span>
        <span class="status ${ok ? "ok" : "ng"}">${ok ? "成功" : "失敗"}</span>
      </div>
      <div class="views">
        <figure>
          <figcaption>原寸</figcaption>
          ${native}
        </figure>
        <figure>
          <figcaption>128×128</figcaption>
          <div class="weather-icon-frame">${framed}</div>
        </figure>
      </div>
    </article>
  `;
}

function applyFilter() {
  const word = searchEl.value.trim();
  const mode = filterEl.value;
  let shown = 0;

  for (const card of listEl.querySelectorAll(".card")) {
    const hay = card.dataset.code + card.dataset.label;
    const matchWord = word === "" || hay.includes(word);
    const matchMode =
      mode === "all" ||
      (mode === "ok" && card.dataset.ok === "true") ||
      (mode === "ng" && card.dataset.ok === "false");
    const visible = matchWord && matchMode;
    card.hidden = !visible;
    if (visible) shown += 1;
  }

  const ok = items.filter((item) => item.icon).length;
  summaryEl.textContent = `表示 ${shown} / 全${items.length}　取得成功 ${ok}　取得失敗 ${items.length - ok}`;
}

listEl.innerHTML = items.map(renderCard).join("");
searchEl.addEventListener("input", applyFilter);
filterEl.addEventListener("change", applyFilter);
applyFilter();
