/**
 * 複雑な県境パスを三角形に分解して SVG に焼き込む。
 * Chrome が一部の県を塗りつぶせない問題向け。頂点は元の地理院パスのまま。
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mapsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../maps");

function pathRings(d) {
  const rings = [];
  for (const part of d.split(/(?=[MZ])/i)) {
    if (!part || /^[Zz]/.test(part)) continue;
    const nums = part.slice(1).trim().split(/[Ll\s,]+/).filter(Boolean).map(Number);
    const pts = [];
    for (let i = 0; i < nums.length - 1; i += 2) pts.push([nums[i], nums[i + 1]]);
    if (pts.length >= 2) rings.push(pts);
  }
  return rings;
}

function uniqueRing(ring) {
  const closed =
    ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]
      ? ring.slice(0, -1)
      : ring.slice();
  const pts = [];
  for (const p of closed) {
    const prev = pts.at(-1);
    if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) pts.push(p);
  }
  return pts;
}

function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function ringArea(pts) {
  let sum = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

function pointInTriangle(p, a, b, c) {
  const c1 = cross(a, b, p);
  const c2 = cross(b, c, p);
  const c3 = cross(c, a, p);
  return !(c1 < 0 || c2 < 0 || c3 < 0) || !(c1 > 0 || c2 > 0 || c3 > 0);
}

function rdp(pts, eps) {
  if (pts.length <= 3) return pts.slice();
  let maxDist = 0;
  let index = 0;
  const first = pts[0];
  const last = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i += 1) {
    const dx = last[0] - first[0];
    const dy = last[1] - first[1];
    const len = Math.hypot(dx, dy) || 1;
    const dist = Math.abs((pts[i][0] - first[0]) * dy - (pts[i][1] - first[1]) * dx) / len;
    if (dist > maxDist) {
      index = i;
      maxDist = dist;
    }
  }
  if (maxDist <= eps) return [first, last];
  const left = rdp(pts.slice(0, index + 1), eps);
  const right = rdp(pts.slice(index), eps);
  return left.slice(0, -1).concat(right);
}

function earClip(ring) {
  const pts = uniqueRing(ring);
  if (pts.length < 3) return [];
  if (pts.length === 3) return [pts.slice()];
  const poly = pts.slice();
  const sign = ringArea(poly) >= 0 ? 1 : -1;
  const tris = [];
  let guard = poly.length * 4;
  while (poly.length > 3 && guard > 0) {
    guard -= 1;
    let clipped = false;
    for (let i = 0; i < poly.length; i += 1) {
      const prev = poly[(i + poly.length - 1) % poly.length];
      const curr = poly[i];
      const next = poly[(i + 1) % poly.length];
      if (cross(prev, curr, next) * sign <= 0) continue;
      let inside = false;
      for (let j = 0; j < poly.length; j += 1) {
        if (j === i || j === (i + poly.length - 1) % poly.length || j === (i + 1) % poly.length) continue;
        if (pointInTriangle(poly[j], prev, curr, next)) {
          inside = true;
          break;
        }
      }
      if (inside) continue;
      tris.push([prev, curr, next]);
      poly.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (poly.length === 3) tris.push(poly.slice());
  return tris;
}

function convexHull(ring) {
  const pts = uniqueRing(ring);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cr(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cr(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function fillablePolygons(ring) {
  const pts = uniqueRing(ring);
  if (pts.length < 3) return [];
  for (const eps of [0, 0.12, 0.28, 0.55, 1.1]) {
    const simple = eps ? rdp(pts, eps) : pts;
    const tris = earClip(simple);
    if (tris.length >= Math.max(1, simple.length - 2)) return tris;
  }
  const hull = convexHull(pts);
  return hull.length >= 3 ? [hull] : [];
}

function polygonMarkup(pref, region, pts) {
  const points = pts.map((pt) => `${Number(pt[0]).toFixed(2)},${Number(pt[1]).toFixed(2)}`).join(" ");
  const prefAttr = pref ? ` data-pref="${pref}"` : "";
  const regionAttr = region ? ` data-region="${region}"` : "";
  return `      <polygon${prefAttr}${regionAttr} fill-rule="nonzero" points="${points}"/>`;
}

function bakeSvg(svg) {
  const stripped = svg.replace(/\s*<g class="map-land-tris[\s\S]*?<\/g>/g, "");
  const pathRe = /<path\b([^>]*)\bd="([^"]+)"([^>]*)\/?>/g;
  const focus = [];
  const dim = [];
  let focusChunk = "";
  let dimChunk = "";
  const parts = stripped.split(/(<g\b[^>]*class="[^"]*"[^>]*>)/);
  let kind = null;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    const cls = /class="([^"]*)"/.exec(part)?.[1] || "";
    if (part.startsWith("<g") && cls.includes("map-fills")) {
      if (cls.includes("map-fills-cover")) kind = "skip";
      else if (cls.includes("map-dim")) kind = "dim";
      else if (cls.includes("map-focus") || cls.includes("map-fills")) kind = "focus";
      else kind = "skip";
    }
    if (!part.startsWith("<g") && (kind === "focus" || kind === "dim")) {
      const bucket = kind === "dim" ? dim : focus;
      let match;
      pathRe.lastIndex = 0;
      while ((match = pathRe.exec(part))) {
        const attrs = `${match[1]} ${match[3]}`;
        if (/\bfill="none"/.test(attrs)) continue;
        const pref = /data-pref="([^"]*)"/.exec(attrs)?.[1] || "";
        const region = /data-region="([^"]*)"/.exec(attrs)?.[1] || "";
        for (const ring of pathRings(match[2])) {
          for (const pts of fillablePolygons(ring)) {
            if (pts.length >= 3) bucket.push(polygonMarkup(pref, region, pts));
          }
        }
      }
    }
    if (part.startsWith("<g") && cls.includes("map-lakes")) kind = "skip";
    if (part.startsWith("<g") && cls.includes("map-borders")) kind = "skip";
  }
  const groups = [];
  if (dim.length) {
    groups.push(`  <g class="map-land-tris map-dim" fill="#d0d5db" fill-rule="nonzero" stroke="none">\n${dim.join("\n")}\n  </g>`);
  }
  if (focus.length) {
    groups.push(`  <g class="map-land-tris map-focus" fill="#76c85a" fill-rule="nonzero" stroke="none">\n${focus.join("\n")}\n  </g>`);
  }
  if (!groups.length) return stripped;
  const block = `${groups.join("\n")}\n`;
  if (stripped.includes('class="map-lakes"')) {
    return stripped.replace(/<g class="map-lakes"/, `${block}  <g class="map-lakes"`);
  }
  return stripped.replace(/<\/svg>\s*$/, `${block}</svg>`);
}

export { bakeSvg };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const requested = process.argv.slice(2);
  const files = requested.length ? requested : ["japan.svg"];
  for (const file of files) {
    const full = path.join(mapsDir, file);
    const next = bakeSvg(readFileSync(full, "utf8"));
    writeFileSync(full, next);
    console.log("baked", file);
  }
}
