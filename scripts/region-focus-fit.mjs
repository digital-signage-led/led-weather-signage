import fs from "fs";

const svg = fs.readFileSync(new URL("../maps/japan.svg", import.meta.url), "utf8");
const SCREEN = {
  hokkaido: ["01"],
  tohoku: ["02", "03", "04", "05", "06", "07"],
  kanto: ["08", "09", "10", "11", "12", "13", "14"],
  chubu: ["15", "16", "17", "18", "19", "20", "21", "22", "23", "24"],
  kinki: ["24", "25", "26", "27", "28", "29", "30"],
  chugoku: ["31", "32", "33", "34", "35"],
  shikoku: ["36", "37", "38", "39"],
  kyushu: ["40", "41", "42", "43", "44", "45", "46"]
};

function pathBBox(d) {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  let i = 0;
  let cmd = "M";
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (px, py) => {
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  };
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[MmLlHhVvCcSsQqTtAaZz]$/.test(t)) {
      cmd = t;
      i += 1;
    }
    const rel = cmd === cmd.toLowerCase();
    const c = cmd.toUpperCase();
    if (c === "Z") {
      x = sx;
      y = sy;
      continue;
    }
    if (c === "H") {
      x = rel ? x + num() : num();
      add(x, y);
      continue;
    }
    if (c === "V") {
      y = rel ? y + num() : num();
      add(x, y);
      continue;
    }
    if (c === "M" || c === "L" || c === "T") {
      const nx = rel ? x + num() : num();
      const ny = rel ? y + num() : num();
      x = nx;
      y = ny;
      if (c === "M") {
        sx = x;
        sy = y;
      }
      add(x, y);
      cmd = c === "M" ? (rel ? "l" : "L") : cmd;
      continue;
    }
    if (c === "C") {
      num();
      num();
      num();
      num();
      const nx = rel ? x + num() : num();
      const ny = rel ? y + num() : num();
      x = nx;
      y = ny;
      add(x, y);
      continue;
    }
    if (c === "S" || c === "Q") {
      num();
      num();
      const nx = rel ? x + num() : num();
      const ny = rel ? y + num() : num();
      x = nx;
      y = ny;
      add(x, y);
      continue;
    }
    if (c === "A") {
      num();
      num();
      num();
      num();
      num();
      const nx = rel ? x + num() : num();
      const ny = rel ? y + num() : num();
      x = nx;
      y = ny;
      add(x, y);
      continue;
    }
    i += 1;
  }
  return { minX, minY, maxX, maxY };
}

function bboxFor(prefs) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const re = /data-pref="(\d+)"[^>]*\sd="([^"]+)"/g;
  let m;
  while ((m = re.exec(svg))) {
    if (!prefs.includes(m[1])) continue;
    const b = pathBBox(m[2]);
    if (!Number.isFinite(b.minX)) continue;
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  return { minX, minY, maxX, maxY };
}

function fit(b, margin = 0.18) {
  const w = Math.max(1, (b.maxX - b.minX) * (1 + margin * 2));
  const h = Math.max(1, (b.maxY - b.minY) * (1 + margin * 2));
  let scale = Math.min(100 / w, 100 / h);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const xTerm = 100 * (0.5 - cx / 100);
  const yTerm = 100 * (0.47 - cy / 100);
  while (scale > 1.15 && (Math.abs(scale * xTerm) > 46 || Math.abs(scale * yTerm) > 40)) {
    scale -= 0.02;
  }
  return {
    scale: Number(scale.toFixed(3)),
    x: Number((scale * xTerm).toFixed(2)),
    y: Number((scale * yTerm).toFixed(2))
  };
}

for (const [name, prefs] of Object.entries(SCREEN)) {
  const b = bboxFor(prefs);
  console.log(name, JSON.stringify(fit(b)), JSON.stringify(b));
}
