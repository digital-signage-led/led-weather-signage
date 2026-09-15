import fs from "node:fs";

const path = "js/studio-layout.js";
let s = fs.readFileSync(path, "utf8");

// resetLayout
const oldReset = `export function resetLayout(regionId, contentId = "today_weather", width = 0, height = 0) {
  regionId = canonicalRegion(regionId);
  const layout = emptyLayout(regionId);
  const all = readLayoutStore();
  const prev = all[regionId] || {};
  const entry = {
    map: layout.map,
    okinawa: layout.okinawa,
    precipLegend: layout.precipLegend,
    cards: {},
    cardsPop: {}
  };
  const viewports = { ...(prev.viewports || {}) };
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  if (w > 0 && h > 0) {
    viewports[viewportSizeKey(w, h)] = entry;
    all[regionId] = { ...prev, ...entry, viewports };
  } else {
    all[regionId] = { ...entry, viewports: {} };
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return layout;
}`;

const newReset = `export function resetLayout(regionId, contentId = "today_weather", width = 0, height = 0) {
  regionId = canonicalRegion(regionId);
  const layout = emptyLayout(regionId);
  const group = getLayoutGroup(contentId);
  if (!isSharedMapContent(contentId)) return layout;
  const all = readLayoutStore();
  const prev = all[regionId] || { groups: {} };
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  const aspect = w > 0 && h > 0 ? aspectTemplateKey(w, h) : "16:9";
  const entry = {
    map: layout.map,
    okinawa: layout.okinawa,
    precipLegend: layout.precipLegend,
    cards: {},
    cardsPop: {},
    rev: Date.now()
  };
  const groups = { ...(prev.groups || {}) };
  const pack = { aspects: { ...(groups[group]?.aspects || {}) } };
  pack.aspects[aspect] = entry;
  groups[group] = pack;
  all[regionId] = { groups };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return layout;
}`;

if (!s.includes(oldReset)) {
  console.error("resetLayout not found");
  process.exit(1);
}
s = s.replace(oldReset, newReset);

// card scale variant / key
s = s.replace(
  `/** 地図4種は map。それ以外は weather / pop。 */
function cardScaleVariant(contentId = "today_weather") {
  if (isSharedMapContent(contentId)) return "map";
  return isPopContent(contentId) ? "pop" : "weather";
}`,
  `/** 配置グループ名をカード倍率キーに使う。 */
function cardScaleVariant(contentId = "today_weather") {
  const group = getLayoutGroup(contentId);
  if (group === "daily_weather") return "daily_weather";
  if (group === "daily_precip") return "daily_precip";
  return isPopContent(contentId) ? "pop" : "weather";
}`
);

s = s.replace(
  `/** 例: regional:map:1920x1080 */
function cardScaleKey(contentId = "today_weather", regionId = "national", width = 0, height = 0) {
  const base = \`\${cardScaleScope(regionId)}:\${cardScaleVariant(contentId)}\`;
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  if (w > 0 && h > 0) return \`\${base}:\${viewportSizeKey(w, h)}\`;
  return base;
}`,
  `/** 例: regional:daily_precip:16:9 */
function cardScaleKey(contentId = "today_weather", regionId = "national", width = 0, height = 0) {
  const base = \`\${cardScaleScope(regionId)}:\${cardScaleVariant(contentId)}\`;
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  if (w > 0 && h > 0) return \`\${base}:\${aspectTemplateKey(w, h)}\`;
  return base;
}`
);

s = s.replace(
  `  const variants = isSharedMapContent(contentId)
    ? ["map", "weather", "pop"]
    : [cardScaleVariant(contentId), "weather", "pop"];
  const keys = [];
  for (const variant of variants) {
    keys.push(\`\${scope}:\${variant}\${vp}\`);
    if (sized) keys.push(\`\${scope}:\${variant}\`);
    keys.push(variant);
  }
  return [...new Set(keys)];
}`,
  `  const group = getLayoutGroup(contentId);
  const aspect = sized ? aspectTemplateKey(w, h) : "";
  const variants = isSharedMapContent(contentId)
    ? [group, "map", "weather", "pop"]
    : [cardScaleVariant(contentId), "weather", "pop"];
  const keys = [];
  for (const variant of variants) {
    if (aspect) keys.push(\`\${scope}:\${variant}:\${aspect}\`);
    if (sized) keys.push(\`\${scope}:\${variant}:\${viewportSizeKey(w, h)}\`);
    keys.push(\`\${scope}:\${variant}\`);
    keys.push(variant);
  }
  return [...new Set(keys)];
}`
);

// Fix cardScaleLookupKeys vp variable - the old code had `const vp = sized ? ...` which we may have left dangling. Check.
if (s.includes("const vp = sized ? `:${viewportSizeKey(w, h)}` : \"\";")
  && s.includes("const aspect = sized ? aspectTemplateKey(w, h) : \"\";")) {
  s = s.replace(
    `  const sized = w > 0 && h > 0;
  const vp = sized ? \`:\${viewportSizeKey(w, h)}\` : "";
  const group = getLayoutGroup(contentId);`,
    `  const sized = w > 0 && h > 0;
  const group = getLayoutGroup(contentId);`
  );
}

// saveCardScale variants
s = s.replace(
  `  const variants = isSharedMapContent(contentId) ? ["map", "weather", "pop"] : [cardScaleVariant(contentId)];`,
  `  const variants = isSharedMapContent(contentId)
    ? [getLayoutGroup(contentId), "map", "weather", "pop"]
    : [cardScaleVariant(contentId)];`
);

// readCardScaleStore: also migrate from v4
s = s.replace(
  `function readCardScaleStore() {
  try {
    const raw = localStorage.getItem(CARD_SIZE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
    const legacy =
      JSON.parse(localStorage.getItem(CARD_SIZE_KEY_LEGACY_V3) || "null")
      || JSON.parse(localStorage.getItem(CARD_SIZE_KEY_LEGACY_V2) || "{}");`,
  `function readCardScaleStore() {
  try {
    const raw = localStorage.getItem(CARD_SIZE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
    const legacy =
      JSON.parse(localStorage.getItem(CARD_SIZE_KEY_LEGACY_V4) || "null")
      || JSON.parse(localStorage.getItem(CARD_SIZE_KEY_LEGACY_V3) || "null")
      || JSON.parse(localStorage.getItem(CARD_SIZE_KEY_LEGACY_V2) || "{}");`
);

fs.writeFileSync(path, s);
console.log("ok pass3");
