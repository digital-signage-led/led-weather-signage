/**
 * 国土地理院 地球地図日本 第2.2版（行政界 polbnda）から LED 用 SVG を生成する。
 * 出典: https://www.gsi.go.jp/kankyochiri/gm_jpn.html
 */
import { open } from "shapefile";
import polygonClipping from "polygon-clipping";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shpDir = path.join(root, "src/maps/source/gm-jpn-all_u_2_2/gm-jpn-all_u_2_2");

const PREF = {
  "Hokkai Do": { id: "01", region: "HOKKAIDO" },
  "Aomori Ken": { id: "02", region: "TOHOKU" },
  "Iwate Ken": { id: "03", region: "TOHOKU" },
  "Miyagi Ken": { id: "04", region: "TOHOKU" },
  "Akita Ken": { id: "05", region: "TOHOKU" },
  "Yamagata Ken": { id: "06", region: "TOHOKU" },
  "Fukushima Ken": { id: "07", region: "TOHOKU" },
  "Ibaraki Ken": { id: "08", region: "KANTO" },
  "Tochigi Ken": { id: "09", region: "KANTO" },
  "Gunma Ken": { id: "10", region: "KANTO" },
  "Saitama Ken": { id: "11", region: "KANTO" },
  "Chiba Ken": { id: "12", region: "KANTO" },
  "Tokyo To": { id: "13", region: "KANTO" },
  "Kanagawa Ken": { id: "14", region: "KANTO" },
  "Niigata Ken": { id: "15", region: "CHUBU" },
  "Toyama Ken": { id: "16", region: "CHUBU" },
  "Ishikawa Ken": { id: "17", region: "CHUBU" },
  "Fukui Ken": { id: "18", region: "CHUBU" },
  "Yamanashi Ken": { id: "19", region: "CHUBU" },
  "Nagano Ken": { id: "20", region: "CHUBU" },
  "Gifu Ken": { id: "21", region: "CHUBU" },
  "Shizuoka Ken": { id: "22", region: "CHUBU" },
  "Aichi Ken": { id: "23", region: "CHUBU" },
  "Mie Ken": { id: "24", region: "KINKI" },
  "Shiga Ken": { id: "25", region: "KINKI" },
  "Kyoto Fu": { id: "26", region: "KINKI" },
  "Osaka Fu": { id: "27", region: "KINKI" },
  "Hyogo Ken": { id: "28", region: "KINKI" },
  "Nara Ken": { id: "29", region: "KINKI" },
  "Wakayama Ken": { id: "30", region: "KINKI" },
  "Tottori Ken": { id: "31", region: "CHUGOKU" },
  "Shimane Ken": { id: "32", region: "CHUGOKU" },
  "Okayama Ken": { id: "33", region: "CHUGOKU" },
  "Hiroshima Ken": { id: "34", region: "CHUGOKU" },
  "Yamaguchi Ken": { id: "35", region: "CHUGOKU" },
  "Tokushima Ken": { id: "36", region: "SHIKOKU" },
  "Kagawa Ken": { id: "37", region: "SHIKOKU" },
  "Ehime Ken": { id: "38", region: "SHIKOKU" },
  "Kochi Ken": { id: "39", region: "SHIKOKU" },
  "Fukuoka Ken": { id: "40", region: "KYUSHU" },
  "Saga Ken": { id: "41", region: "KYUSHU" },
  "Nagasaki Ken": { id: "42", region: "KYUSHU" },
  "Kumamoto Ken": { id: "43", region: "KYUSHU" },
  "Oita Ken": { id: "44", region: "KYUSHU" },
  "Miyazaki Ken": { id: "45", region: "KYUSHU" },
  "Kagoshima Ken": { id: "46", region: "KYUSHU" },
  "Okinawa Ken": { id: "47", region: "OKINAWA" }
};

const REGION_ORDER = ["HOKKAIDO", "TOHOKU", "KANTO", "CHUBU", "KINKI", "CHUGOKU", "SHIKOKU", "KYUSHU", "OKINAWA"];

/** 地域図の薄色は隣接する陸地だけ。枠で切れる島（九州図の四国など）は出さない。 */
const REGION_NEIGHBORS = {
  HOKKAIDO: ["TOHOKU"],
  TOHOKU: ["HOKKAIDO", "KANTO"],
  KANTO: ["TOHOKU", "CHUBU"],
  CHUBU: ["KANTO", "TOHOKU", "KINKI"],
  KINKI: ["CHUBU", "CHUGOKU", "SHIKOKU"],
  CHUGOKU: ["KINKI", "SHIKOKU", "KYUSHU"],
  SHIKOKU: ["KINKI", "CHUGOKU"],
  KYUSHU: ["CHUGOKU"],
  OKINAWA: []
};

const CITIES = [
  { id: "wakkanai", name: "稚内", region: "HOKKAIDO", lon: 141.6783, lat: 45.415 },
  { id: "asahikawa", name: "旭川", region: "HOKKAIDO", lon: 142.3717, lat: 43.7567 },
  { id: "abashiri", name: "網走", region: "HOKKAIDO", lon: 144.2783, lat: 44.0167 },
  { id: "kitami", name: "北見", region: "HOKKAIDO", lon: 143.8417, lat: 43.7767 },
  { id: "nemuro", name: "根室", region: "HOKKAIDO", lon: 145.585, lat: 43.33 },
  { id: "sapporo", name: "札幌", region: "HOKKAIDO", lon: 141.3283, lat: 43.06 },
  { id: "otaru", name: "小樽", region: "HOKKAIDO", lon: 141.015, lat: 43.1817 },
  { id: "kushiro", name: "釧路", region: "HOKKAIDO", lon: 144.3767, lat: 42.985 },
  { id: "obihiro", name: "帯広", region: "HOKKAIDO", lon: 143.2117, lat: 42.9217 },
  { id: "muroran", name: "室蘭", region: "HOKKAIDO", lon: 140.975, lat: 42.3117 },
  { id: "hakodate", name: "函館", region: "HOKKAIDO", lon: 140.7533, lat: 41.8167 },
  { id: "aomori", name: "青森", region: "TOHOKU", lon: 140.74, lat: 40.822 },
  { id: "morioka", name: "盛岡", region: "TOHOKU", lon: 141.153, lat: 39.702 },
  { id: "sendai", name: "仙台", region: "TOHOKU", lon: 140.872, lat: 38.269 },
  { id: "akita", name: "秋田", region: "TOHOKU", lon: 140.103, lat: 39.72 },
  { id: "yamagata", name: "山形", region: "TOHOKU", lon: 140.364, lat: 38.241 },
  { id: "fukushima", name: "福島", region: "TOHOKU", lon: 140.468, lat: 37.75 },
  { id: "mito", name: "水戸", region: "KANTO", lon: 140.447, lat: 36.342 },
  { id: "utsunomiya", name: "宇都宮", region: "KANTO", lon: 139.883, lat: 36.566 },
  { id: "maebashi", name: "前橋", region: "KANTO", lon: 139.061, lat: 36.391 },
  { id: "saitama", name: "さいたま", region: "KANTO", lon: 139.649, lat: 35.862 },
  { id: "chiba", name: "千葉", region: "KANTO", lon: 140.123, lat: 35.605 },
  { id: "tokyo", name: "東京", region: "KANTO", lon: 139.767, lat: 35.681 },
  { id: "yokohama", name: "横浜", region: "KANTO", lon: 139.638, lat: 35.444 },
  { id: "kofu", name: "甲府", region: "CHUBU", lon: 138.568, lat: 35.664 },
  { id: "nagano", name: "長野", region: "CHUBU", lon: 138.181, lat: 36.649 },
  { id: "sado", name: "佐渡", region: "CHUBU", lon: 138.368, lat: 38.018 },
  { id: "niigata", name: "新潟", region: "CHUBU", lon: 139.023, lat: 37.902 },
  { id: "toyama", name: "富山", region: "CHUBU", lon: 137.213, lat: 36.696 },
  { id: "kanazawa", name: "金沢", region: "CHUBU", lon: 136.656, lat: 36.561 },
  { id: "fukui", name: "福井", region: "CHUBU", lon: 136.222, lat: 36.065 },
  { id: "takayama", name: "高山", region: "CHUBU", lon: 137.252, lat: 36.146 },
  { id: "gifu", name: "岐阜", region: "CHUBU", lon: 136.723, lat: 35.423 },
  { id: "shizuoka", name: "静岡", region: "CHUBU", lon: 138.383, lat: 34.977 },
  { id: "nagoya", name: "名古屋", region: "CHUBU", lon: 136.906, lat: 35.181 },
  { id: "tsu", name: "津", region: "KINKI", lon: 136.509, lat: 34.73 },
  { id: "otsu", name: "大津", region: "KINKI", lon: 135.868, lat: 35.004 },
  { id: "kyoto", name: "京都", region: "KINKI", lon: 135.768, lat: 35.012 },
  { id: "osaka", name: "大阪", region: "KINKI", lon: 135.496, lat: 34.702 },
  { id: "kobe", name: "神戸", region: "KINKI", lon: 135.195, lat: 34.69 },
  { id: "nara", name: "奈良", region: "KINKI", lon: 135.805, lat: 34.685 },
  { id: "wakayama", name: "和歌山", region: "KINKI", lon: 135.17, lat: 34.226 },
  { id: "tottori", name: "鳥取", region: "CHUGOKU", lon: 134.238, lat: 35.501 },
  { id: "matsue", name: "松江", region: "CHUGOKU", lon: 133.048, lat: 35.472 },
  { id: "okayama", name: "岡山", region: "CHUGOKU", lon: 133.935, lat: 34.655 },
  { id: "hiroshima", name: "広島", region: "CHUGOKU", lon: 132.46, lat: 34.396 },
  { id: "yamaguchi", name: "山口", region: "CHUGOKU", lon: 131.471, lat: 34.186 },
  { id: "tokushima", name: "徳島", region: "SHIKOKU", lon: 134.559, lat: 34.07 },
  { id: "takamatsu", name: "高松", region: "SHIKOKU", lon: 134.047, lat: 34.343 },
  { id: "matsuyama", name: "松山", region: "SHIKOKU", lon: 132.766, lat: 33.839 },
  { id: "kochi", name: "高知", region: "SHIKOKU", lon: 133.531, lat: 33.56 },
  { id: "fukuoka", name: "福岡", region: "KYUSHU", lon: 130.402, lat: 33.59 },
  { id: "saga", name: "佐賀", region: "KYUSHU", lon: 130.299, lat: 33.249 },
  { id: "nagasaki", name: "長崎", region: "KYUSHU", lon: 129.874, lat: 32.75 },
  { id: "kumamoto", name: "熊本", region: "KYUSHU", lon: 130.742, lat: 32.79 },
  { id: "oita", name: "大分", region: "KYUSHU", lon: 131.613, lat: 33.238 },
  { id: "miyazaki", name: "宮崎", region: "KYUSHU", lon: 131.424, lat: 31.911 },
  { id: "kagoshima", name: "鹿児島", region: "KYUSHU", lon: 130.558, lat: 31.597 },
  { id: "nago", name: "名護", region: "OKINAWA", lon: 127.978, lat: 26.592 },
  { id: "naha", name: "那覇", region: "OKINAWA", lon: 127.679, lat: 26.212 },
  { id: "miyako", name: "宮古", region: "OKINAWA", lon: 125.281, lat: 24.805 },
  { id: "ishigaki", name: "石垣", region: "OKINAWA", lon: 124.157, lat: 24.344 }
];

// 全国本図は北海道〜九州。沖縄は実緯度だと本州が潰れるため、日本海側インセットへ移す。
const JAPAN_EXTENT = { lonMin: 128.35, lonMax: 145.9, latMin: 30.2, latMax: 45.55 };
const OKINAWA_EXTENT = { lonMin: 122.9, lonMax: 128.5, latMin: 24.0, latMax: 27.2 };
const OKINAWA_INSET = { x: 88.8, y: 76.2, w: 8.8, h: 9.6 };
const OKINAWA_INSET_TRANSFORM = "translate(16.2 48) scale(1.75) translate(-16.2 -48) translate(-77 -33)";
const COS = Math.cos((36 * Math.PI) / 180);
const NATIONAL_SIMPLIFY = 0.014;
const REGION_SIMPLIFY = 0.009;

const features = [];
const source = await open(path.join(shpDir, "polbnda_jpn.shp"), path.join(shpDir, "polbnda_jpn.dbf"));
while (true) {
  const result = await source.read();
  if (result.done) break;
  const meta = PREF[result.value.properties.nam];
  if (!meta) continue;
  features.push({ ...meta, nam: result.value.properties.nam, geometry: result.value.geometry });
}

const lakes = [];
const lakeSource = await open(path.join(shpDir, "inwatera_jpn.shp"), path.join(shpDir, "inwatera_jpn.dbf"));
while (true) {
  const result = await lakeSource.read();
  if (result.done) break;
  if (result.value.properties.hyt !== 4) continue;
  lakes.push(result.value.geometry);
}

function inMainJapan(lon, lat) {
  if (lat < 23.9 || lat > 45.8) return false;
  if (lon < 122.8 || lon > 146.2) return false;
  if (lat < 29.5 && lon > 131.2) return false;
  if (lat < 32.2 && lon > 138.2) return false;
  return true;
}

function inMainland(lon, lat) {
  if (lat < 30.2 || lat > 45.8) return false;
  if (lon < 128.2 || lon > 146.2) return false;
  if (lat < 32.2 && lon > 138.2) return false;
  return true;
}

function ringBbox(ring) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY, area: (maxX - minX) * (maxY - minY) };
}

function simplify(ring, tol) {
  if (ring.length <= 8) return ring;
  const sq = tol * tol;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;

  function rec(a, b) {
    let maxD = 0;
    let idx = 0;
    const ax = ring[a][0], ay = ring[a][1], bx = ring[b][0], by = ring[b][1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    for (let i = a + 1; i < b; i += 1) {
      const t = ((ring[i][0] - ax) * dx + (ring[i][1] - ay) * dy) / len2;
      const px = ax + t * dx;
      const py = ay + t * dy;
      const d = (ring[i][0] - px) ** 2 + (ring[i][1] - py) ** 2;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > sq) {
      keep[idx] = 1;
      rec(a, idx);
      rec(idx, b);
    }
  }
  rec(0, ring.length - 1);
  return ring.filter((_, i) => keep[i]);
}

function extractPolygons(geometry, minArea, keepPoint = inMainJapan, minHoleArea = 0.008) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const out = [];
  for (const polygon of polygons) {
    const outer = polygon[0];
    if (!outer || outer.length < 4) continue;
    if (!outer.some(([lon, lat]) => keepPoint(lon, lat))) continue;
    const bbox = ringBbox(outer);
    if (bbox.area < minArea) continue;
    const holes = polygon.slice(1).filter((ring) => ring && ring.length >= 4 && ringBbox(ring).area >= minHoleArea);
    out.push([outer, ...holes]);
  }
  return out;
}

function extractOuterRings(geometry, minArea, keepPoint = inMainJapan) {
  return extractPolygons(geometry, minArea, keepPoint, Infinity).map((polygon) => polygon[0]);
}

function closeRing(ring) {
  if (ring.length < 4) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, [first[0], first[1]]];
}

function unionPrefecturePolygons(polygons) {
  const polys = polygons
    .map((polygon) => polygon.map(closeRing).filter((ring) => ring.length >= 4))
    .filter((polygon) => polygon.length);
  if (!polys.length) return [];
  try {
    let merged = [polys[0]];
    for (let i = 1; i < polys.length; i += 1) {
      merged = polygonClipping.union(merged, [polys[i]]);
    }
    return merged.filter((polygon) => polygon?.[0]?.length >= 4);
  } catch {
    return polygons;
  }
}

function makeProjector(extent, vbW, vbH, pad = 2) {
  return makeBoxProjector(extent, { x: pad, y: pad, w: vbW - pad * 2, h: vbH - pad * 2 });
}

/** 緯度経度を同じ縮尺で収め、縦長の地方が横に潰れないようにする。 */
function makeContainProjector(extent, vbW, vbH, pad = 4) {
  const geoW = (extent.lonMax - extent.lonMin) * COS;
  const geoH = extent.latMax - extent.latMin;
  const innerW = vbW - pad * 2;
  const innerH = vbH - pad * 2;
  const scale = Math.min(innerW / geoW, innerH / geoH);
  return makeBoxProjector(extent, {
    x: pad + (innerW - geoW * scale) / 2,
    y: pad + (innerH - geoH * scale) / 2,
    w: geoW * scale,
    h: geoH * scale
  });
}

function makeBoxProjector(extent, box) {
  const x0 = extent.lonMin * COS;
  const x1 = extent.lonMax * COS;
  const y0 = extent.latMin;
  const y1 = extent.latMax;
  return {
    point(lon, lat) {
      const x = box.x + ((lon * COS - x0) / (x1 - x0)) * box.w;
      const y = box.y + ((y1 - lat) / (y1 - y0)) * box.h;
      return [x, y];
    }
  };
}

/** 東を +x、北を +y として反時計回り。沖縄列島を横並び・本島を縦にする。 */
function makeRotatedProjector(extent, vbW, vbH, pad, rotateDeg) {
  const box = { x: pad, y: pad, w: vbW - pad * 2, h: vbH - pad * 2 };
  const bounds = rotatedLocalBounds(extent, rotateDeg);
  return {
    point(lon, lat) {
      const [x, y] = toRotatedLocal(lon, lat, extent, rotateDeg);
      return [
        box.x + ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * box.w,
        box.y + ((bounds.maxY - y) / (bounds.maxY - bounds.minY)) * box.h
      ];
    }
  };
}

function toRotatedLocal(lon, lat, extent, rotateDeg) {
  const lon0 = (extent.lonMin + extent.lonMax) / 2;
  const lat0 = (extent.latMin + extent.latMax) / 2;
  const cosLat = Math.cos((lat0 * Math.PI) / 180);
  const rad = (rotateDeg * Math.PI) / 180;
  const x = (lon - lon0) * cosLat;
  const y = lat - lat0;
  return [x * Math.cos(rad) - y * Math.sin(rad), x * Math.sin(rad) + y * Math.cos(rad)];
}

function rotatedLocalBounds(extent, rotateDeg) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i <= 8; i += 1) {
    const lon = extent.lonMin + (extent.lonMax - extent.lonMin) * (i / 8);
    for (let j = 0; j <= 8; j += 1) {
      const lat = extent.latMin + (extent.latMax - extent.latMin) * (j / 8);
      const [x, y] = toRotatedLocal(lon, lat, extent, rotateDeg);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, maxX, minY, maxY };
}

function ringToPath(ring, project) {
  const pts = ring.map(([lon, lat]) => project.point(lon, lat));
  return `M${pts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join("L")}Z`;
}

function polygonsToPath(polygons, project) {
  return polygons.map((polygon) => polygon.map((ring) => ringToPath(ring, project)).join("")).join("");
}

function prefPaths(proj, keepIds, minArea, simplifyTol, extent = null, minVisible = 0) {
  return Object.entries(PREF)
    .filter(([, v]) => keepIds.has(v.region))
    .flatMap(([, v]) => {
      let polygons = polygonsForPref(v.id, minArea, inMainJapan, simplifyTol, MULTI_PART[v.id] || 1);
      if (extent && minVisible > 0) {
        polygons = polygons.filter((polygon) => ringVisibleFrac(polygon[0], extent) >= minVisible);
      }
      return polygons.map((polygon) => {
        const d = polygonsToPath([polygon], proj);
        return d ? `<path data-pref="${v.id}" d="${d}"/>` : "";
      });
    })
    .filter(Boolean)
    .join("\n      ");
}

function ringVisibleFrac(ring, extent) {
  if (!extent || !ring.length) return 1;
  let inside = 0;
  for (const [lon, lat] of ring) {
    if (lon >= extent.lonMin && lon <= extent.lonMax && lat >= extent.latMin && lat <= extent.latMax) inside += 1;
  }
  return inside / ring.length;
}

function keepLargestPolygons(polygons, maxParts) {
  return [...polygons]
    .sort((a, b) => ringBbox(b[0]).area - ringBbox(a[0]).area)
    .slice(0, maxParts);
}

function signedArea(ring) {
  let area = 0;
  const pts = closeRing(ring);
  for (let i = 0; i < pts.length - 1; i += 1) {
    area += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  }
  return area / 2;
}

function ringArea(ring) {
  return Math.abs(signedArea(ring));
}

function orientForSvg(polygon) {
  return polygon.map((ring, idx) => {
    const closed = closeRing(ring);
    const a = signedArea(closed);
    if ((idx === 0 && a < 0) || (idx > 0 && a > 0)) {
      const core = closed.slice(0, -1).reverse();
      return [...core, core[0]];
    }
    return closed;
  });
}

/** 簡略化で自己交差した輪郭を直す。交差したままだと LED 縮小表示で塗りが消える。 */
function cleanSimplifiedPolygon(polygon) {
  try {
    const rings = polygon.map(closeRing).filter((ring) => ring.length >= 4);
    if (!rings.length) return [];
    return polygonClipping.union([rings])
      .map((poly) => poly.filter((ring, idx) => idx === 0 || ringArea(ring) >= 0.0004))
      .filter((poly) => poly[0]?.length >= 4);
  } catch {
    return [polygon];
  }
}

function polygonsForPref(prefId, minArea, keepPoint = inMainJapan, simplifyTol = NATIONAL_SIMPLIFY, maxParts = 1) {
  const minHoleArea = Math.max(0.03, minArea * 2);
  const polygons = [];
  for (const feature of features) {
    if (feature.id !== prefId) continue;
    polygons.push(...extractPolygons(feature.geometry, minArea, keepPoint, minHoleArea));
  }
  return keepLargestPolygons(
    unionPrefecturePolygons(polygons)
      .filter((polygon) => ringBbox(polygon[0]).area >= minArea * 0.25)
      .map((polygon) => polygon
        .map((ring) => simplify(ring, prefId === "28" ? Math.max(simplifyTol, 0.016) : simplifyTol))
        .filter((ring) => ring.length >= 4))
      .filter((polygon) => polygon.length)
      .flatMap(cleanSimplifiedPolygon)
      .map(orientForSvg),
    maxParts
  );
}

function ringHitsExtent(ring, extent) {
  if (!extent) return true;
  const bbox = ringBbox(ring);
  return bbox.maxX >= extent.lonMin && bbox.minX <= extent.lonMax
    && bbox.maxY >= extent.latMin && bbox.minY <= extent.latMax;
}

function lakesToPath(project, minArea, keepPoint = inMainland, simplifyTol = NATIONAL_SIMPLIFY, extent = null) {
  const rings = [];
  for (const geometry of lakes) {
    rings.push(...extractOuterRings(geometry, minArea, keepPoint));
  }
  return rings
    .filter((ring) => ringBbox(ring).area >= minArea && ringHitsExtent(ring, extent))
    .map((ring) => simplify(ring, simplifyTol))
    .filter((ring) => ring.length >= 4)
    .map((ring) => ringToPath(ring, project))
    .join("");
}

function svgWrap(viewBox, body) {
  return `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" aria-label="地図">
  <!-- 出典: 国土地理院 地球地図日本 第2.2版 https://www.gsi.go.jp/kankyochiri/gm_jpn.html -->
  ${body}
</svg>
`;
}

const japanVb = { w: 100, h: 100 };
const japanProj = makeProjector(JAPAN_EXTENT, japanVb.w, japanVb.h, 2);
const okinawaProj = makeBoxProjector(OKINAWA_EXTENT, {
  x: OKINAWA_INSET.x + 1.1,
  y: OKINAWA_INSET.y + 2.4,
  w: OKINAWA_INSET.w - 2.2,
  h: OKINAWA_INSET.h - 3.4
});

const ISLAND_PREFS = new Set(["15", "42", "46", "38", "34", "28", "01", "47"]);

const MULTI_PART = { "01": 2, "15": 3, "28": 2, "34": 3, "38": 2, "42": 4, "46": 3, "47": 4 };

const regionGroups = REGION_ORDER.filter((id) => id !== "OKINAWA").map((regionId) => {
  const prefs = Object.entries(PREF).filter(([, v]) => v.region === regionId);
  const paths = prefs.flatMap(([, v]) => {
    const minArea = ISLAND_PREFS.has(v.id) ? 0.0012 : 0.0025;
    return polygonsForPref(v.id, minArea, inMainland, NATIONAL_SIMPLIFY, MULTI_PART[v.id] || 1).map((polygon) => {
      const d = polygonsToPath([polygon], japanProj);
      return d ? `<path data-pref="${v.id}" d="${d}"/>` : "";
    });
  }).join("\n      ");
  return `    <g data-region="${regionId}">\n      ${paths}\n    </g>`;
}).join("\n");

const okinawaPaths = polygonsToPath(polygonsForPref("47", 0.0004, inMainJapan, 0.012, 4), okinawaProj);
const nationalLakes = lakesToPath(japanProj, 0.018, inMainland, NATIONAL_SIMPLIFY, JAPAN_EXTENT);

const japanSvg = svgWrap(`0 0 ${japanVb.w} ${japanVb.h}`, `<g class="map-fills" fill="#76c85a" fill-rule="nonzero" stroke="none">
${regionGroups}
  </g>
  <g class="map-borders" fill="none" stroke="#ffffff" stroke-width="0.75" stroke-linejoin="round" stroke-linecap="round">
${regionGroups}
  </g>
  <g class="map-fills map-fills-cover" fill="#76c85a" fill-rule="nonzero" stroke="none">
${regionGroups}
  </g>
  <g class="map-lakes" fill="#c8ebff" fill-rule="evenodd" stroke="none">
    <path d="${nationalLakes}"/>
  </g>
  <g class="map-okinawa-inset" transform="${OKINAWA_INSET_TRANSFORM}">
    <rect x="${OKINAWA_INSET.x}" y="${OKINAWA_INSET.y}" width="${OKINAWA_INSET.w}" height="${OKINAWA_INSET.h}" rx="0.25" fill="#dff4ff" stroke="#ffffff" stroke-width="0.45"/>
    <g data-region="OKINAWA" fill="#76c85a" stroke="#ffffff" stroke-width="0.55" stroke-linejoin="round">
      <path data-pref="47" d="${okinawaPaths}"/>
    </g>
  </g>`);

fs.mkdirSync(path.join(root, "maps"), { recursive: true });
fs.writeFileSync(path.join(root, "src/maps/japan.svg"), japanSvg);
fs.writeFileSync(path.join(root, "maps/japan.svg"), japanSvg);

const regionExtents = {
  HOKKAIDO: { lonMin: 138.9, lonMax: 146.2, latMin: 40.7, latMax: 45.7 },
  TOHOKU: { lonMin: 138.9, lonMax: 142.5, latMin: 36.35, latMax: 41.75 },
  KANTO: { lonMin: 138.15, lonMax: 141.15, latMin: 34.55, latMax: 37.25 },
  CHUBU: { lonMin: 134.85, lonMax: 140.45, latMin: 34.15, latMax: 38.75 },
  KINKI: { lonMin: 133.65, lonMax: 137.05, latMin: 33.05, latMax: 36.2 },
  CHUGOKU: { lonMin: 130.3, lonMax: 135.35, latMin: 33.35, latMax: 36.55 },
  SHIKOKU: { lonMin: 131.5, lonMax: 135.25, latMin: 32.35, latMax: 34.85 },
  KYUSHU: { lonMin: 127.8, lonMax: 132.55, latMin: 30.55, latMax: 34.35 },
  OKINAWA: { lonMin: 122.6, lonMax: 129.0, latMin: 23.7, latMax: 27.55, rotateDeg: 34 }
};

const files = {
  HOKKAIDO: "hokkaido.svg",
  TOHOKU: "tohoku.svg",
  KANTO: "kanto.svg",
  CHUBU: "chubu.svg",
  KINKI: "kinki.svg",
  CHUGOKU: "chugoku.svg",
  SHIKOKU: "shikoku.svg",
  KYUSHU: "kyushu.svg",
  OKINAWA: "okinawa.svg"
};

const positions = { national: {}, regions: {} };

for (const city of CITIES) {
  const project = city.region === "OKINAWA" ? okinawaProj : japanProj;
  const [x, y] = project.point(city.lon, city.lat);
  positions.national[city.id] = { x: +(x / japanVb.w * 100).toFixed(2), y: +(y / japanVb.h * 100).toFixed(2) };
}

for (const regionId of REGION_ORDER) {
  const extent = regionExtents[regionId];
  const proj = extent.rotateDeg
    ? makeRotatedProjector(extent, 100, 100, 4, extent.rotateDeg)
    : regionId === "TOHOKU"
      ? makeContainProjector(extent, 100, 100, 4)
      : makeProjector(extent, 100, 100, 4);
  const minArea = regionId === "OKINAWA" ? 0.0004 : 0.0012;
  const simplifyTol = regionId === "OKINAWA" ? 0.008 : REGION_SIMPLIFY;
  const focusIds = new Set([regionId]);
  const dimIds = new Set(REGION_NEIGHBORS[regionId] || []);
  const dimPaths = prefPaths(proj, dimIds, minArea, simplifyTol, extent, 0.4);
  const focusPaths = prefPaths(proj, focusIds, minArea, simplifyTol);
  const lakeKeep = regionId === "OKINAWA" ? inMainJapan : inMainland;
  const lakePaths = lakesToPath(proj, regionId === "OKINAWA" ? 0.004 : 0.01, lakeKeep, simplifyTol, extent);
  const svg = svgWrap("0 0 100 100", `<g class="map-fills map-dim" fill="#d0d5db" fill-rule="nonzero" stroke="none">
      ${dimPaths}
  </g>
  <g class="map-borders map-dim" fill="none" stroke="#ffffff" stroke-width="0.45" stroke-linejoin="round" stroke-linecap="round">
      ${dimPaths}
  </g>
  <g class="map-fills map-dim map-fills-cover" fill="#d0d5db" fill-rule="nonzero" stroke="none">
      ${dimPaths}
  </g>
  <g class="map-fills map-focus" data-region="${regionId}" fill="#76c85a" fill-rule="nonzero" stroke="none">
      ${focusPaths}
  </g>
  <g class="map-borders map-focus" fill="none" stroke="#ffffff" stroke-width="0.75" stroke-linejoin="round" stroke-linecap="round">
      ${focusPaths}
  </g>
  <g class="map-fills map-focus map-fills-cover" data-region="${regionId}" fill="#76c85a" fill-rule="nonzero" stroke="none">
      ${focusPaths}
  </g>
  <g class="map-lakes" fill="#c8ebff" fill-rule="evenodd" stroke="none">
      <path d="${lakePaths}"/>
  </g>`);
  fs.writeFileSync(path.join(root, "src/maps", files[regionId]), svg);
  fs.writeFileSync(path.join(root, "maps", files[regionId]), svg);

  positions.regions[regionId] = {};
  for (const city of CITIES.filter((item) => item.region === regionId)) {
    const [x, y] = proj.point(city.lon, city.lat);
    positions.regions[regionId][city.id] = { x: +x.toFixed(2), y: +y.toFixed(2) };
  }
}

fs.writeFileSync(path.join(root, "src/maps/marker-positions.json"), JSON.stringify(positions, null, 2));
console.log("MAPS_OK", Object.keys(files).length + 1, "svg files");
console.log(JSON.stringify(positions.national, null, 2));
