/**
 * fitRegionalView 相当の枠計算を Node で再現し、
 * 各地方で隣接県が viewBox に食い込むか検証する。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svg = fs.readFileSync(path.join(root, "maps", "japan.svg"), "utf8");

const SCREEN_FOCUS_PREFS = {
  hokkaido: ["01"],
  tohoku: ["02", "03", "04", "05", "06", "07"],
  kanto: ["08", "09", "10", "11", "12", "13", "14"],
  chubu: ["15", "16", "17", "18", "19", "20", "21", "22", "23", "24"],
  kinki: ["24", "25", "26", "27", "28", "29", "30"],
  chugoku: ["31", "32", "33", "34", "35"],
  shikoku: ["36", "37", "38", "39"],
  kyushu: ["40", "41", "42", "43", "44", "45", "46"],
  okinawa: ["47"]
};

const REGION_FRAME_NEIGHBORS = {
  hokkaido: ["tohoku"],
  tohoku: ["hokkaido", "kanto"],
  kanto: ["tohoku", "chubu"],
  chubu: ["tohoku", "kanto", "kinki"],
  kinki: ["chubu", "chugoku", "shikoku"],
  chugoku: ["kinki", "shikoku", "kyushu"],
  shikoku: ["kinki", "chugoku", "kyushu"],
  kyushu: ["chugoku", "shikoku"],
  okinawa: []
};

const REGION_FIT_CORE = {
  kyushu: { minX: 7.2, maxX: 23.2, minY: 73.8, maxY: 93.3 }
};

const EXPECT_NEIGHBOR_HINTS = {
  hokkaido: ["02"],
  tohoku: ["01", "08"],
  kanto: ["07", "15", "19", "22"],
  chubu: ["14", "25", "26"],
  kinki: ["18", "21", "23", "33", "31", "36"],
  chugoku: ["28", "30", "36", "40"],
  shikoku: ["30", "33", "40"],
  kyushu: ["35", "38"]
};

function focusPrefsFor(regionId) {
  return SCREEN_FOCUS_PREFS[regionId] || [];
}

function framePrefsFor(regionId) {
  const prefs = new Set(focusPrefsFor(regionId));
  for (const neighbor of REGION_FRAME_NEIGHBORS[regionId] || []) {
    for (const pref of focusPrefsFor(neighbor)) prefs.add(pref);
  }
  return prefs;
}

/** path d からおおよその bbox（絶対座標化）。 */
function pathBBox(d) {
  if (!d) return null;
  let x = 0;
  let y = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const touch = (px, py) => {
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  };
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/g;
  let cmd = "M";
  let nums = [];
  const flush = () => {
    if (!nums.length) return;
    const abs = cmd === cmd.toUpperCase();
    const c = cmd.toUpperCase();
    const take = (n) => {
      const out = nums.splice(0, n);
      return out.map(Number);
    };
    if (c === "Z") {
      nums = [];
      return;
    }
    if (c === "H") {
      while (nums.length) {
        const [v] = take(1);
        x = abs ? v : x + v;
        touch(x, y);
      }
      return;
    }
    if (c === "V") {
      while (nums.length) {
        const [v] = take(1);
        y = abs ? v : y + v;
        touch(x, y);
      }
      return;
    }
    const pairCount = c === "C" ? 6 : c === "S" || c === "Q" ? 4 : c === "A" ? 7 : 2;
    while (nums.length >= (c === "A" ? 7 : c === "C" ? 6 : c === "S" || c === "Q" ? 4 : 2)) {
      if (c === "A") {
        const p = take(7);
        const nx = abs ? p[5] : x + p[5];
        const ny = abs ? p[6] : y + p[6];
        x = nx;
        y = ny;
        touch(x, y);
      } else if (c === "C") {
        const p = take(6);
        for (let i = 0; i < 6; i += 2) {
          const px = abs ? p[i] : x + p[i];
          const py = abs ? p[i + 1] : y + p[i + 1];
          touch(px, py);
          if (i === 4) {
            x = px;
            y = py;
          }
        }
        if (!abs) {
          // relative cubics already applied via running x,y update above incorrectly for mid points
        }
      } else if (c === "S" || c === "Q") {
        const p = take(4);
        for (let i = 0; i < 4; i += 2) {
          const px = abs ? p[i] : x + p[i];
          const py = abs ? p[i + 1] : y + p[i + 1];
          touch(px, py);
          if (i === 2) {
            x = px;
            y = py;
          }
        }
      } else {
        // M L T
        const p = take(2);
        const px = abs ? p[0] : x + p[0];
        const py = abs ? p[1] : y + p[1];
        x = px;
        y = py;
        touch(x, y);
        if (c === "M") cmd = abs ? "L" : "l";
      }
    }
  };
  let m;
  while ((m = re.exec(d))) {
    if (m[1]) {
      flush();
      cmd = m[1];
      nums = [];
      if (cmd.toUpperCase() === "Z") flush();
    } else {
      nums.push(m[2]);
    }
  }
  flush();
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function unionBoxes(boxes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    if (!b) continue;
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function overlaps(a, b) {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

function pathInFitCore(regionId, bounds) {
  const core = REGION_FIT_CORE[regionId];
  if (!core || !bounds) return true;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return cx >= core.minX && cx <= core.maxX && cy >= core.minY && cy <= core.maxY;
}

const prefBoxes = new Map();
const pathRe = /<path\b[^>]*\bdata-pref="(\d+)"[^>]*\bd="([^"]+)"/g;
let pm;
while ((pm = pathRe.exec(svg))) {
  const pref = pm[1];
  const box = pathBBox(pm[2]);
  if (!box) continue;
  const prev = prefBoxes.get(pref);
  prefBoxes.set(pref, prev ? unionBoxes([prev, box]) : box);
}
// also d before data-pref order
const pathRe2 = /<path\b[^>]*\bd="([^"]+)"[^>]*\bdata-pref="(\d+)"/g;
while ((pm = pathRe2.exec(svg))) {
  const pref = pm[2];
  const box = pathBBox(pm[1]);
  if (!box) continue;
  const prev = prefBoxes.get(pref);
  prefBoxes.set(pref, prev ? unionBoxes([prev, box]) : box);
}

function fitView(regionId) {
  const focus = new Set(focusPrefsFor(regionId));
  const frame = framePrefsFor(regionId);
  const focusBoxes = [];
  for (const pref of focus) {
    const b = prefBoxes.get(pref);
    if (!b) continue;
    if (!pathInFitCore(regionId, b)) continue;
    focusBoxes.push(b);
  }
  let box = unionBoxes(focusBoxes);
  if (!box) return null;
  const expand = Math.max(2.4, (box.maxX - box.minX) * 0.12, (box.maxY - box.minY) * 0.12);
  const gate = {
    minX: box.minX - expand,
    minY: box.minY - expand,
    maxX: box.maxX + expand,
    maxY: box.maxY + expand
  };
  const includedNeighbors = [];
  for (const pref of frame) {
    if (focus.has(pref)) continue;
    const b = prefBoxes.get(pref);
    if (!b || !overlaps(b, gate)) continue;
    includedNeighbors.push(pref);
    box = unionBoxes([box, b]);
  }
  const pad = 1.8;
  const view = {
    minX: box.minX - pad,
    minY: box.minY - pad,
    maxX: box.maxX + pad,
    maxY: box.maxY + pad,
    w: box.maxX - box.minX + pad * 2,
    h: box.maxY - box.minY + pad * 2
  };
  return { view, includedNeighbors, gate };
}

function visibleInView(view, pref) {
  const b = prefBoxes.get(pref);
  if (!b) return false;
  return overlaps(b, view);
}

let failed = 0;
console.log(`prefs parsed: ${prefBoxes.size}`);
for (const regionId of Object.keys(SCREEN_FOCUS_PREFS)) {
  if (regionId === "okinawa") {
    console.log("okinawa: skip (inset)");
    continue;
  }
  const result = fitView(regionId);
  if (!result) {
    console.log(`${regionId}: FAIL no view`);
    failed += 1;
    continue;
  }
  const hints = EXPECT_NEIGHBOR_HINTS[regionId] || [];
  const hit = hints.filter((p) => visibleInView(result.view, p));
  const miss = hints.filter((p) => !visibleInView(result.view, p));
  const ok = hit.length >= Math.min(2, hints.length);
  console.log(
    `${regionId}: view=${result.view.w.toFixed(1)}x${result.view.h.toFixed(1)} neighbors+=${result.includedNeighbors.join(",") || "-"} hit=${hit.join(",") || "-"} miss=${miss.join(",") || "-"} ${ok ? "OK" : "WEAK"}`
  );
  if (!ok) failed += 1;
}

// OLD behavior: focus-only + pad 1.5 vs NEW
function oldFit(regionId) {
  const focus = focusPrefsFor(regionId);
  const boxes = focus.map((p) => prefBoxes.get(p)).filter(Boolean);
  const box = unionBoxes(boxes);
  if (!box) return null;
  const pad = regionId === "chubu" || regionId === "tohoku" ? 3.2 : 1.5;
  return {
    minX: box.minX - pad,
    minY: box.minY - pad,
    maxX: box.maxX + pad,
    maxY: box.maxY + pad
  };
}

console.log("\n--- old vs new neighbor visibility (kinki) ---");
const old = oldFit("kinki");
const neu = fitView("kinki");
for (const pref of ["18", "21", "23", "31", "33", "36"]) {
  console.log(
    `pref ${pref}: old=${visibleInView(old, pref)} new=${visibleInView(neu.view, pref)}`
  );
}

process.exit(failed ? 1 : 0);
