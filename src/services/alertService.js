/**
 * 警報の対象現場判定と割込み判定。
 * 地方単位ではなく、現場の予報区域と突合する。
 */

import { filterAlertsForSite } from "../normalizers/alertNormalizer.js";

const LEVEL_RANK = {
  advisory: 1,
  warning: 2,
  critical: 3
};

export function resolveSiteAlerts(canonical, site) {
  return filterAlertsForSite(canonical.alerts || [], site);
}

export function shouldInterrupt(alerts, { includeAdvisory = true } = {}) {
  if (!alerts.length) return false;
  const strongest = alerts.reduce((max, alert) =>
    LEVEL_RANK[alert.level] > LEVEL_RANK[max] ? alert.level : max
  , "advisory");
  if (strongest === "warning" || strongest === "critical") return true;
  return includeAdvisory;
}

export function strongestAlert(alerts) {
  return [...alerts].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])[0] || null;
}
