/**
 * データ層のスモークテスト。ブラウザを使わず正規化パイプラインを確認する。
 */
import { getRegion } from "../src/data/regions/regions.js";
import { resolveSiteLocation } from "../src/services/regionResolver.js";
import { fetchCanonicalWeather } from "../src/services/weatherService.js";
import { parseSiteCsv } from "../src/services/csvService.js";
import { resolveDisplayProfile } from "../src/config/displayProfiles.js";
import { filterAlertsForSite } from "../src/normalizers/alertNormalizer.js";

const osaka = resolveSiteLocation({
  id: "OSAKA_001",
  name: "大阪中央現場",
  postalCode: "530-0001",
  address: "大阪府大阪市北区梅田1-1-1",
  lat: 34.7024,
  lng: 135.4959,
  pitch: "P3.47",
  inches: 100
});

if (!osaka.ok || osaka.site.region !== "KINKI" || osaka.site.forecastAreaId !== "270000") {
  throw new Error(`大阪の地域判定に失敗: ${JSON.stringify(osaka)}`);
}

const kobe = resolveSiteLocation({
  id: "KOBE_001",
  name: "神戸現場",
  address: "兵庫県神戸市中央区",
  postalCode: "650-0001",
  pitch: "P3.47",
  inches: 75
});

const region = getRegion("KINKI");
const osakaData = await fetchCanonicalWeather({ region, site: osaka.site, now: new Date("2026-09-09T11:00:00+09:00") });
const kobeData = await fetchCanonicalWeather({ region, site: kobe.site, now: new Date("2026-09-09T11:00:00+09:00") });

if (!osakaData.today.weatherCode || !osakaData.weekly.length || !osakaData.hourly.length) {
  throw new Error("正規化データが不足しています");
}

const osakaAlerts = filterAlertsForSite(osakaData.alerts, osaka.site);
const kobeAlerts = filterAlertsForSite(kobeData.alerts, kobe.site);
if (!osakaAlerts.length) {
  throw new Error("大阪の警報が対象現場に届いていません");
}
if (kobeAlerts.length) {
  throw new Error("神戸へ大阪府警報が誤配信されています");
}

const profile = resolveDisplayProfile("P3.47", 100);
if (profile.width !== 576 || profile.height !== 432) {
  throw new Error("displayProfile が不正です");
}

const csv = parseSiteCsv(`siteId,siteName,postalCode,address,pitch,screenSize,templates
OK1,大阪,530-0001,大阪府大阪市,P3.47,100,W10
NG1,判定不能,,どこかの島,P3.47,100,W10`);
if (csv.ok.length !== 1 || csv.errors.length !== 1) {
  throw new Error(`CSV結果が想定外: ${csv.summary}`);
}

console.log("SMOKE_OK", {
  site: osaka.site.id,
  region: osaka.site.region,
  weather: osakaData.today.weather,
  alerts: osakaAlerts.map((item) => item.title),
  profile: profile.id,
  csv: csv.summary
});
