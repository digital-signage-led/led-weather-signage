/**
 * サンプル現場。V1プレビューと地域判定の動作確認用。
 * 本番では管理画面 / CSV から投入する。
 */

export const sampleSites = [
  {
    id: "OSAKA_001",
    name: "大阪中央現場",
    postalCode: "530-0001",
    address: "大阪府大阪市北区梅田1-1-1",
    lat: 34.7024,
    lng: 135.4959,
    pitch: "P3.47",
    inches: 100,
    templates: ["W01", "W05", "W07", "W09", "W10", "W11"],
    active: true
  },
  {
    id: "TOKYO_001",
    name: "東京駅前現場",
    postalCode: "100-0005",
    address: "東京都千代田区丸の内1-9-1",
    lat: 35.6812,
    lng: 139.7671,
    pitch: "P2.87",
    inches: 125,
    templates: ["W01", "W05", "W10", "W11"],
    active: true
  },
  {
    id: "SAPPORO_001",
    name: "札幌大通現場",
    postalCode: "060-0001",
    address: "北海道札幌市中央区北1条西2丁目",
    lat: 43.0621,
    lng: 141.3544,
    pitch: "P3.47",
    inches: 75,
    templates: ["W05", "W10"],
    active: true
  },
  {
    id: "FUKUOKA_001",
    name: "福岡天神現場",
    postalCode: "810-0001",
    address: "福岡県福岡市中央区天神1-1-1",
    lat: 33.5904,
    lng: 130.4017,
    pitch: "P2.87",
    inches: 100,
    templates: ["W05", "W09", "W10"],
    active: true
  },
  {
    id: "NAHA_001",
    name: "那覇国際通り現場",
    postalCode: "900-0013",
    address: "沖縄県那覇市牧志2-1-1",
    lat: 26.2145,
    lng: 127.6792,
    pitch: "P3.47",
    inches: 100,
    templates: ["W10", "W11"],
    active: false
  }
];

export function getSampleSite(siteId) {
  return sampleSites.find((site) => site.id === siteId) || sampleSites[0];
}
