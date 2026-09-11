/**
 * 警報・注意報の正規化。
 * 地方全体へブロードキャストせず、予報区域コードで現場と突合できる形にする。
 */

const LEVEL_MAP = {
  advisory: "advisory",
  warning: "warning",
  emergency: "critical",
  critical: "critical"
};

export function normalizeAlerts(providerWarnings = []) {
  return providerWarnings.map((item) => ({
    id: item.id,
    level: LEVEL_MAP[item.severity] || "advisory",
    type: item.code,
    title: item.event,
    headline: item.headline,
    issuedAt: item.issued,
    areaCodes: (item.areas || []).map((area) => area.code),
    areaNames: (item.areas || []).map((area) => area.name),
    officeCode: item.office
  }));
}

/**
 * 現場の予報区域・都道府県に該当する警報だけを残す。
 * 「近畿で警報がある」だけでは近畿全現場に出さない。
 */
export function filterAlertsForSite(alerts, site) {
  return alerts.filter((alert) =>
    alert.areaCodes.some((code) =>
      code === site.forecastAreaId ||
      code === site.prefectureId ||
      code === `${site.prefectureId}0000` ||
      (site.prefecture && alert.areaNames.includes(site.prefecture))
    )
  );
}
