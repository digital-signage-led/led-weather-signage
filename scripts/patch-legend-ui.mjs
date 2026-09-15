import fs from "node:fs";

// index.html: insert legend tools before layout-commit
let html = fs.readFileSync("index.html", "utf8");
if (!html.includes("id=\"legend-tools\"")) {
  const needle = `<button type="button" id="layout-commit">`;
  const insert = `<div id="legend-tools" class="studio-legend-tools" hidden>
        <span class="studio-legend-heading">降水凡例 <span id="legend-status">自動配置中</span></span>
        <button type="button" id="legend-auto">凡例を自動配置</button>
        <button type="button" id="legend-fix">凡例位置を固定</button>
        <button type="button" id="legend-unfix">凡例の固定を解除</button>
        <button type="button" id="legend-reset">凡例位置をリセット</button>
        <button type="button" id="layout-auto-all">全要素を自動配置</button>
      </div>
      `;
  // Find layout-commit - may be mojibake encoded. Try both.
  if (html.includes(needle)) {
    html = html.replace(needle, insert + needle);
  } else {
    const idx = html.indexOf("id=\"layout-commit\"");
    if (idx < 0) {
      console.error("layout-commit not found");
      process.exit(1);
    }
    const btnStart = html.lastIndexOf("<button", idx);
    html = html.slice(0, btnStart) + insert + html.slice(btnStart);
  }
  fs.writeFileSync("index.html", html);
  console.log("index legend tools inserted");
} else {
  console.log("index already has legend tools");
}

// bump pref388
for (const p of ["js/version.js", "js/catalog.js", "index.html", "css/weather.css", "css/base.css", "js/app.js"]) {
  if (!fs.existsSync(p)) continue;
  let s = fs.readFileSync(p, "utf8");
  const n = s.replace(/pref387/g, "pref388");
  if (n !== s) {
    fs.writeFileSync(p, n);
    console.log("bumped", p);
  }
}
