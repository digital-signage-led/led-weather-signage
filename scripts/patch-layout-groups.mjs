import fs from "node:fs";

const path = "js/studio-layout.js";
let s = fs.readFileSync(path, "utf8");

const oldImport = `import { canonicalContent, canonicalRegion, isNational } from "./catalog.js?v=pref368";
import { isValidMapTransform, MAP_LAYOUT_GEN } from "./map-layout.js?v=pref386";

const STORAGE_KEY = "led-weather-layout-v6";
const STORAGE_KEY_LEGACY = "led-weather-layout-v5";
const CARD_SIZE_KEY = "led-weather-card-size-v4";
const CARD_SIZE_KEY_LEGACY_V3 = "led-weather-card-size-v3";
const CARD_SIZE_KEY_LEGACY_V2 = "led-weather-card-size-v2";`;

const newImport = `import { canonicalContent, canonicalRegion, isNational } from "./catalog.js?v=pref368";
import { isValidMapTransform, MAP_LAYOUT_GEN } from "./map-layout.js?v=pref386";
import {
  aspectTemplateKey,
  describeLayoutShare,
  getLayoutGroup,
  isSharedMapContent,
  layoutSharePeers,
  parseViewportKey
} from "./layout-groups.js?v=pref387";

export { aspectTemplateKey, describeLayoutShare, getLayoutGroup, isSharedMapContent, layoutSharePeers };

const STORAGE_KEY = "led-weather-layout-v7";
const STORAGE_KEY_LEGACY_V6 = "led-weather-layout-v6";
const STORAGE_KEY_LEGACY_V5 = "led-weather-layout-v5";
const CARD_SIZE_KEY = "led-weather-card-size-v5";
const CARD_SIZE_KEY_LEGACY_V4 = "led-weather-card-size-v4";
const CARD_SIZE_KEY_LEGACY_V3 = "led-weather-card-size-v3";
const CARD_SIZE_KEY_LEGACY_V2 = "led-weather-card-size-v2";`;

if (!s.includes(oldImport)) {
  console.error("import block not found");
  process.exit(1);
}
s = s.replace(oldImport, newImport);

const oldShare = `/** 地図4種（今日/明日 × 天気/降水）は配置・倍率を共有する。 */
export const SHARED_MAP_CONTENT_IDS = [
  "today_weather",
  "today_precip",
  "tomorrow_weather",
  "tomorrow_precip"
];

export function isSharedMapContent(contentId = "today_weather") {
  const id = canonicalContent(contentId);
  return SHARED_MAP_CONTENT_IDS.includes(id);
}

function isPopContent(contentId = "today_weather") {
  const id = canonicalContent(contentId);
  return id === "today_precip" || id === "tomorrow_precip";
}`;

const newShare = `function isPopContent(contentId = "today_weather") {
  return getLayoutGroup(contentId) === "daily_precip";
}`;

if (!s.includes(oldShare)) {
  console.error("share block not found");
  process.exit(1);
}
s = s.replace(oldShare, newShare);

const oldRead = `function readLayoutStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) || {};
    const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY_LEGACY) || "{}");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy || {}));
    return legacy || {};
  } catch {
    return {};
  }
}`;

const newRead = `function migrateRegionToGroups(regionDef = {}) {
  const groups = {};
  const ensure = (group, aspect, entry) => {
    if (!groups[group]) groups[group] = { aspects: {} };
    const prev = groups[group].aspects[aspect];
    const nextRev = Number(entry?.rev) || 0;
    const prevRev = Number(prev?.rev) || 0;
    if (!prev || nextRev >= prevRev) {
      groups[group].aspects[aspect] = layoutEntryFrom(entry);
    }
  };
  for (const [group, pack] of Object.entries(regionDef.groups || {})) {
    for (const [aspect, entry] of Object.entries(pack?.aspects || {})) {
      ensure(group, aspect, entry);
    }
  }
  for (const [vpKey, entry] of Object.entries(regionDef.viewports || {})) {
    const { w, h } = parseViewportKey(vpKey);
    if (!(w > 0 && h > 0) || !entry) continue;
    const aspect = aspectTemplateKey(w, h);
    // 旧4コンテンツ共有スロットは「今日」基準で天気・降水の両グループへ複製
    ensure("daily_weather", aspect, entry);
    ensure("daily_precip", aspect, entry);
  }
  if ((regionDef.map || regionDef.cards) && !Object.keys(regionDef.viewports || {}).length) {
    ensure("daily_weather", "16:9", regionDef);
    ensure("daily_precip", "16:9", regionDef);
  }
  return { groups };
}

function readLayoutStore() {
  try {
    const rawV7 = localStorage.getItem(STORAGE_KEY);
    if (rawV7) return JSON.parse(rawV7) || {};
    const legacyRaw = localStorage.getItem(STORAGE_KEY_LEGACY_V6)
      || localStorage.getItem(STORAGE_KEY_LEGACY_V5)
      || "{}";
    const legacy = JSON.parse(legacyRaw) || {};
    const migrated = {};
    for (const [regionId, regionDef] of Object.entries(legacy)) {
      if (!regionDef || typeof regionDef !== "object") continue;
      migrated[canonicalRegion(regionId)] = migrateRegionToGroups(regionDef);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    try {
      localStorage.removeItem(STORAGE_KEY_LEGACY_V6);
      localStorage.removeItem(STORAGE_KEY_LEGACY_V5);
    } catch {
      /* ignore */
    }
    return migrated;
  } catch {
    return {};
  }
}

function pickGroupAspectSlice(regionSaved, group, aspect) {
  return regionSaved?.groups?.[group]?.aspects?.[aspect] || null;
}`;

if (!s.includes(oldRead)) {
  console.error("readLayoutStore not found");
  process.exit(1);
}
s = s.replace(oldRead, newRead);

fs.writeFileSync(path, s);
console.log("ok pass1");
