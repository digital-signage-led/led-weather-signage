/**
 * Chrome CDP で各地方の地図メトリクスを収集する（Windows PowerShell 向け補助）。
 * 使い方: node scripts/cdp-region-map-check.mjs
 */
import fs from "node:fs";

const PORT = 9222;
const regions = [
  "national", "hokkaido", "tohoku", "kanto", "chubu",
  "kinki", "chugoku", "shikoku", "kyushu", "okinawa"
];

async function getTab() {
  const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  return tabs.find((t) => t.type === "page" && String(t.url).includes("127.0.0.1:5173"));
}

function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener("open", () => resolve(ws));
    ws.addEventListener("error", reject);
  });
}

function cdp(ws) {
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id != null && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  return (method, params = {}) => {
    const id = nextId++;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  };
}

const EXPR = `(() => {
  const s = document.querySelector(".map-svg svg");
  const vb = s && s.getAttribute("viewBox");
  const uniq = (a) => [...new Set(a)];
  const focus = uniq([...document.querySelectorAll(".map-as-focus")]
    .map((e) => e.getAttribute("data-pref")).filter(Boolean));
  const dim = uniq([...document.querySelectorAll(".map-as-dim")]
    .filter((e) => e.getAttribute("display") !== "none")
    .map((e) => e.getAttribute("data-pref")).filter(Boolean));
  let inView = [];
  if (vb) {
    const [x, y, w, h] = vb.split(/\\s+/).map(Number);
    const box = { x, y, maxX: x + w, maxY: y + h };
    const seen = new Set();
    for (const p of document.querySelectorAll(".map-fills path[data-pref], .map-okinawa-inset path[data-pref]")) {
      if (p.getAttribute("display") === "none") continue;
      let b;
      try { b = p.getBBox(); } catch { continue; }
      const overlaps = !(b.x + b.width < box.x || b.x > box.maxX || b.y + b.height < box.y || b.y > box.maxY);
      if (overlaps) seen.add(p.getAttribute("data-pref"));
    }
    inView = [...seen].sort();
  }
  const focusEl = document.querySelector(".map-as-focus");
  const fill = focusEl ? getComputedStyle(focusEl).fill : "";
  const scale = document.querySelector(".led-screen")?.style.getPropertyValue("--map-scale") || "";
  const hidden = [...document.querySelectorAll(".map-fills path[data-pref]")]
    .filter((p) => p.getAttribute("display") === "none").length;
  return JSON.stringify({
    title: document.title,
    boot: document.documentElement.className,
    vb,
    scale: scale.trim(),
    focusN: focus.length,
    dimN: dim.length,
    hiddenPrefs: hidden,
    inViewN: inView.length,
    inView: inView.join(","),
    focusFill: fill
  });
})()`;

const out = [];
for (const region of regions) {
  const tab = await getTab();
  if (!tab) throw new Error("no tab");
  const ws = await wsConnect(tab.webSocketDebuggerUrl);
  const call = cdp(ws);
  const url = `http://127.0.0.1:5173/view?region=${region}&content=today_precip`;
  await call("Page.enable");
  await call("Page.navigate", { url });
  await new Promise((r) => setTimeout(r, 3500));
  const res = await call("Runtime.evaluate", { expression: EXPR, returnByValue: true });
  ws.close();
  const value = res?.result?.result?.value;
  let parsed = {};
  try { parsed = JSON.parse(value); } catch { parsed = { raw: value, err: res }; }
  out.push({ region, ...parsed });
  console.log(region, JSON.stringify(parsed));
}

fs.writeFileSync("tests/region-map-check.json", JSON.stringify(out, null, 2));
console.log("wrote tests/region-map-check.json");
