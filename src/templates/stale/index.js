import { formatStamp } from "../../components/UpdateTime.js";

export async function render(context) {
  const { data } = context;
  const updated = new Date(data.updatedAt);
  const stamp = `${updated.getMonth() + 1}月${updated.getDate()}日 ${pad(updated.getHours())}時${pad(updated.getMinutes())}分`;

  return `
    <article class="led-screen stale-screen">
      <header class="led-header">
        <div class="led-heading">
          <h1 class="led-title">気象情報</h1>
        </div>
        <div class="led-stamp">${formatStamp(data.updatedAt)}</div>
      </header>
      <div class="led-body">
        <div class="stale-hero">
          <h2>気象情報を更新できません</h2>
          <p>最終更新 ${stamp}</p>
        </div>
      </div>
      <footer class="led-footer"><span class="led-note">古い予報を表示し続けません</span></footer>
    </article>
  `;
}

function pad(value) {
  return String(value).padStart(2, "0");
}
