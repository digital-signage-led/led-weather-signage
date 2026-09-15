/**
 * CDP で週間画面の主要要素サイズを測る
 */
const PORT = 9222;
const URL = process.argv[2] || "http://127.0.0.1:5173/?region=national&content=weekly_precip&vw=1920&vh=1080";

const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
let tab = tabs.find((t) => t.type === "page" && /5173/.test(t.url));
if (!tab) tab = tabs.find((t) => t.type === "page");
if (!tab) throw new Error("no page tab");

const ws = new WebSocket(tab.webSocketDebuggerUrl);
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

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: URL });
await new Promise((r) => setTimeout(r, 4500));

const expr = `(() => {
  const q = (s) => document.querySelector(s);
  const m = (el, name) => {
    if (!el) return { name, missing: true };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      name,
      left: +r.left.toFixed(1),
      top: +r.top.toFixed(1),
      right: +r.right.toFixed(1),
      bottom: +r.bottom.toFixed(1),
      w: +r.width.toFixed(1),
      h: +r.height.toFixed(1),
      fontSize: cs.fontSize,
      color: cs.color,
      overflowLeft: Math.max(0, -r.left),
      overflowRight: Math.max(0, r.right - 1920)
    };
  };
  const title = q(".led-title");
  const bar = q(".led-title-bar:not(.led-sub-bar)");
  const screen = q(".led-screen");
  return {
    boot: document.documentElement.className,
    titleScale: screen?.style.getPropertyValue("--title-scale"),
    headerTitleH: screen?.style.getPropertyValue("--header-title-height"),
    titleText: title?.textContent,
    titleAttrStyle: title?.getAttribute("style"),
    barClient: bar && { w: bar.clientWidth, h: bar.clientHeight, sw: bar.scrollWidth },
    screen: m(screen, "screen"),
    title: m(title, "title"),
    mark: m(q(".led-title-mark"), "mark"),
    arrow: m(q(".led-note-arrow"), "arrow"),
    noteMark: m(q(".led-note-mark"), "noteMark"),
    noteIcon: m(q("#led-note-icon"), "noteIcon"),
    footer: m(q(".led-footer"), "footer"),
    table: m(q(".forecast-table"), "table"),
    stack: m(q(".led-title-stack"), "stack"),
    errors: window.__lastError || null
  };
})()`;

const result = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
console.log(JSON.stringify(result.result?.result?.value ?? result, null, 2));
ws.close();
