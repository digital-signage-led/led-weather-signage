/**
 * 地図レイアウト座標系の世代・妥当性（studio-layout と map-renderer で共有）。
 */

import { canonicalRegion, isNational } from "./catalog.js?v=pref386";

/** 全国共通 viewBox + transform 方式の世代。旧・地方 viewBox 切り出しと混在させない。 */
export const MAP_LAYOUT_GEN = "national-vb-1";
export const MAP_SCALE_MAX = 6.5;
export const MAP_SHIFT_MAX = 280;

export function isValidMapTransform(map, regionId = "national") {
  regionId = canonicalRegion(regionId);
  if (!map || typeof map !== "object") return false;
  if (map.gen !== MAP_LAYOUT_GEN) return false;
  const scale = Number(map.scale);
  const x = Number(map.x);
  const y = Number(map.y);
  const rotate = Number(map.rotate) || 0;
  if (![scale, x, y, rotate].every((n) => Number.isFinite(n))) return false;
  if (scale <= 0 || scale < 0.4 || scale > MAP_SCALE_MAX) return false;
  if (Math.abs(x) > MAP_SHIFT_MAX || Math.abs(y) > MAP_SHIFT_MAX) return false;
  if (Math.abs(rotate) > 40) return false;
  if (!isNational(regionId) && regionId !== "okinawa" && scale < 1.05) return false;
  return true;
}
