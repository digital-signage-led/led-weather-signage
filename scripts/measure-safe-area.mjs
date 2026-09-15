/**
 * 通常公開URLを 1920×1080 設計座標で安全領域検査する。
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chrome = process.env.CHROME_PATH
  || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9333;
const sizes = [
  [1920, 1080],
  [1440, 1080],
  [1600, 1200],
  [1280, 1024],
  [2560, 720]
];
const urls = [
  ["weekly_precip", "national"],
  ["weekly_weather", "national"]
];

const EXPR = `(() => {
  const screen = document.querySelector(".led-screen");
  if (!screen) return { error: "no screen" };
  const sr = screen.getBoundingClientRect();
  const W = Number.parseFloat(screen.style.getPropertyValue("--led-width")) || 1920;
  const H = Number.parseFloat(screen.style.getPropertyValue("--led-height")) || 1080;
  const sx = sr.width / W;
  const sy = sr.height / H;
  const mx = 40 * (W / 1920);
  const myTop = 32 * (H / 1080);
  const myBot = 24 * (H / 1080);
  const logical = (el, name) => {
    if (!el) return { name, missing: true };
    const r = el.getBoundingClientRect();
    const left = (r.left - sr.left) / sx;
    const right = (r.right - sr.left) / sx;
    const top = (r.top - sr.top) / sy;
    const bottom = (r.bottom - sr.top) / sy;
    return {
      name,
      left: +left.toFixed(1),
      right: +right.toFixed(1),
      top: +top.toFixed(1),
      bottom: +bottom.toFixed(1),
      width: +(right - left).toFixed(1),
      stageWidth: W,
      overflowLeft: +Math.max(0, -left).toFixed(1),
      overflowRight: +Math.max(0, right - W).toFixed(1),
      safe: left >= mx - 0.5 && top >= myTop - 0.5 && right <= W - mx + 0.5 && bottom <= H - myBot + 0.5,
      scrollOk: name.includes("news") || name.includes("track")
        ? true
        : el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1
    };
  };
  return {
    boot: document.documentElement.className,
    canvas: { W, H, scaleX: +sx.toFixed(3) },
    items: [
      logical(screen, "canvas"),
      logical(document.querySelector(".led-title"), "title"),
      logical(document.querySelector(".led-stamp"), "stamp"),
      logical(document.querySelector(".forecast-table"), "weekly-table"),
      logical(document.querySelector(".background-decoration"), "bg-deco"),
      logical(document.querySelector(".led-footer"), "footer"),
      logical(document.querySelector(".ticker-icon, .led-note-mark"), "yellow-icon"),
      logical(document.querySelector(".ticker-message, #led-note"), "news"),
      logical(document.querySelector(".ticker-current"), "current"),
      logical(document.querySelector(".ticker-temp"), "temp"),
      logical(document.querySelector(".ticker-wind"), "wind"),
      logical(document.querySelector(".ticker-source, .jma-credit"), "source")
    ]
  };
})()`;

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitPort() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      if (tabs) return;
    } catch {
      await wait(250);
    }
  }
  throw new Error("cdp not ready");
}

async function cdpEval(wsUrl, expression) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id != null && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  const send = (method, params = {}) => new Promise((resolve) => {
    const i = ++id;
    pending.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send("Runtime.enable");
  const result = await send("Runtime.evaluate", { expression, returnByValue: true });
  ws.close();
  return result.result?.result?.value;
}

const userData = path.join(root, "tests", ".chrome-safe");
mkdirSync(userData, { recursive: true });
mkdirSync(path.join(root, "tests", "safe-area"), { recursive: true });

const child = spawn(chrome, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userData}`,
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "about:blank"
], { stdio: "ignore" });

const report = [];
try {
  await waitPort();
  for (const [w, h] of sizes) {
    for (const [content, region] of urls) {
      const url = `http://127.0.0.1:5173/?region=${region}&content=${content}`;
      const shot = path.join(root, "tests", "safe-area", `${content}-${w}x${h}.png`);
      const created = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
      const tabs = await created.json();
      await wait(3500);
      const data = await cdpEval(tabs.webSocketDebuggerUrl, EXPR);
      const fail = (data.items || []).filter((i) => i.missing || (i.name !== "bg-deco" && i.name !== "canvas" && (i.overflowLeft > 0.5 || i.overflowRight > 0.5)));
      report.push({ w, h, content, fail: fail.map((f) => f.name), items: data.items });
      console.log(JSON.stringify({ w, h, content, fail: fail.map((f) => `${f.name} L${f.overflowLeft}/R${f.overflowRight}`) }, null, 0));
      const shotProc = spawn(chrome, [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        `--window-size=${w},${h}`,
        "--virtual-time-budget=12000",
        `--screenshot=${shot}`,
        url
      ], { stdio: "ignore" });
      await new Promise((resolve) => shotProc.on("exit", resolve));
    }
  }
} finally {
  child.kill();
}
writeFileSync(path.join(root, "tests", "safe-area", "report.json"), JSON.stringify(report, null, 2));
console.log("wrote tests/safe-area/report.json");
