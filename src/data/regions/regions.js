/**
 * 地方マスター。
 * 地方ごとに HTML を複製せず、この定義と地図SVGから画面を組む。
 *
 * 座標 x, y は各地図 SVG の viewBox に対する 0–100 の相対位置。
 * 表示時に自動配置するため、テンプレート側で位置を計算しない。
 */

export const REGION_IDS = {
  HOKKAIDO: "HOKKAIDO",
  TOHOKU: "TOHOKU",
  KANTO: "KANTO",
  HOKURIKU: "HOKURIKU",
  TOKAI: "TOKAI",
  KINKI: "KINKI",
  CHUGOKU: "CHUGOKU",
  SHIKOKU: "SHIKOKU",
  KYUSHU: "KYUSHU",
  OKINAWA: "OKINAWA"
};

export const regions = [
  {
    id: "HOKKAIDO",
    name: "北海道",
    nameEn: "Hokkaido",
    mapFile: "japan.svg",
    nationalPoint: { id: "sapporo", name: "札幌", x: 73.14, y: 17.56 },
    prefectures: [
      { id: "01", name: "北海道", jmaOffice: "016000" }
    ],
    forecastAreas: [
      { id: "016000", name: "石狩・空知・後志", prefectureId: "01" }
    ],
    displayPoints: [
      { id: "sapporo", name: "札幌", prefectureId: "01", forecastAreaId: "016000", x: 32.64, y: 57.86, priority: 1 },
      { id: "asahikawa", name: "旭川", prefectureId: "01", forecastAreaId: "016000", x: 46.72, y: 42.52, priority: 2 },
      { id: "kushiro", name: "釧路", prefectureId: "01", forecastAreaId: "016000", x: 74.83, y: 59.53, priority: 3 },
      { id: "hakodate", name: "函館", prefectureId: "01", forecastAreaId: "016000", x: 23.92, y: 85.86, priority: 2 }
    ]
  },
  {
    id: "TOHOKU",
    name: "東北",
    nameEn: "Tohoku",
    mapFile: "japan.svg",
    nationalPoint: { id: "sendai", name: "仙台", x: 70.5, y: 47.54 },
    prefectures: [
      { id: "02", name: "青森県", jmaOffice: "020000" },
      { id: "03", name: "岩手県", jmaOffice: "030000" },
      { id: "04", name: "宮城県", jmaOffice: "040000" },
      { id: "05", name: "秋田県", jmaOffice: "050000" },
      { id: "06", name: "山形県", jmaOffice: "060000" },
      { id: "07", name: "福島県", jmaOffice: "070000" }
    ],
    forecastAreas: [
      { id: "020000", name: "青森県", prefectureId: "02" },
      { id: "030000", name: "岩手県", prefectureId: "03" },
      { id: "040000", name: "宮城県", prefectureId: "04" },
      { id: "050000", name: "秋田県", prefectureId: "05" },
      { id: "060000", name: "山形県", prefectureId: "06" },
      { id: "070000", name: "福島県", prefectureId: "07" }
    ],
    displayPoints: [
      { id: "aomori", name: "青森", prefectureId: "02", forecastAreaId: "020000", x: 49.66, y: 18.61, priority: 2 },
      { id: "morioka", name: "盛岡", prefectureId: "03", forecastAreaId: "030000", x: 63.73, y: 39.64, priority: 2 },
      { id: "sendai", name: "仙台", prefectureId: "04", forecastAreaId: "040000", x: 54.16, y: 66.54, priority: 1 },
      { id: "akita", name: "秋田", prefectureId: "05", forecastAreaId: "050000", x: 27.95, y: 39.3, priority: 2 },
      { id: "yamagata", name: "山形", prefectureId: "06", forecastAreaId: "060000", x: 36.85, y: 67.07, priority: 3 },
      { id: "fukushima", name: "福島", prefectureId: "07", forecastAreaId: "070000", x: 40.39, y: 76.29, priority: 2 }
    ]
  },
  {
    id: "KANTO",
    name: "関東甲信",
    nameEn: "Kanto",
    mapFile: "japan.svg",
    nationalPoint: { id: "tokyo", name: "東京", x: 64.45, y: 63.72 },
    prefectures: [
      { id: "08", name: "茨城県", jmaOffice: "080000" },
      { id: "09", name: "栃木県", jmaOffice: "090000" },
      { id: "10", name: "群馬県", jmaOffice: "100000" },
      { id: "11", name: "埼玉県", jmaOffice: "110000" },
      { id: "12", name: "千葉県", jmaOffice: "120000" },
      { id: "13", name: "東京都", jmaOffice: "130000" },
      { id: "14", name: "神奈川県", jmaOffice: "140000" },
      { id: "19", name: "山梨県", jmaOffice: "190000" },
      { id: "20", name: "長野県", jmaOffice: "200000" }
    ],
    forecastAreas: [
      { id: "080000", name: "茨城県", prefectureId: "08" },
      { id: "090000", name: "栃木県", prefectureId: "09" },
      { id: "100000", name: "群馬県", prefectureId: "10" },
      { id: "110000", name: "埼玉県", prefectureId: "11" },
      { id: "120000", name: "千葉県", prefectureId: "12" },
      { id: "130000", name: "東京都", prefectureId: "13" },
      { id: "140000", name: "神奈川県", prefectureId: "14" },
      { id: "190000", name: "山梨県", prefectureId: "19" },
      { id: "200000", name: "長野県", prefectureId: "20" }
    ],
    displayPoints: [
      { id: "mito", name: "水戸", prefectureId: "08", forecastAreaId: "080000", x: 83.32, y: 36.32, priority: 3 },
      { id: "utsunomiya", name: "宇都宮", prefectureId: "09", forecastAreaId: "090000", x: 69.11, y: 27.36, priority: 3 },
      { id: "maebashi", name: "前橋", prefectureId: "10", forecastAreaId: "100000", x: 48.39, y: 34.36, priority: 3 },
      { id: "saitama", name: "さいたま", prefectureId: "11", forecastAreaId: "110000", x: 63.21, y: 55.52, priority: 2 },
      { id: "chiba", name: "千葉", prefectureId: "12", forecastAreaId: "120000", x: 75.16, y: 65.8, priority: 2 },
      { id: "tokyo", name: "東京", prefectureId: "13", forecastAreaId: "130000", x: 66.18, y: 62.76, priority: 1 },
      { id: "yokohama", name: "横浜", prefectureId: "14", forecastAreaId: "140000", x: 62.93, y: 72.24, priority: 1 },
      { id: "kofu", name: "甲府", prefectureId: "19", forecastAreaId: "190000", x: 35.96, y: 63.44, priority: 3 },
      { id: "nagano", name: "長野", prefectureId: "20", forecastAreaId: "200000", x: 26.21, y: 24.04, priority: 2 }
    ]
  },
  {
    id: "HOKURIKU",
    name: "北陸",
    nameEn: "Hokuriku",
    mapFile: "japan.svg",
    nationalPoint: { id: "kanazawa", name: "金沢", x: 47.43, y: 58.22 },
    prefectures: [
      { id: "15", name: "新潟県", jmaOffice: "150000" },
      { id: "16", name: "富山県", jmaOffice: "160000" },
      { id: "17", name: "石川県", jmaOffice: "170000" },
      { id: "18", name: "福井県", jmaOffice: "180000" }
    ],
    forecastAreas: [
      { id: "150000", name: "新潟県", prefectureId: "15" },
      { id: "160000", name: "富山県", prefectureId: "16" },
      { id: "170000", name: "石川県", prefectureId: "17" },
      { id: "180000", name: "福井県", prefectureId: "18" }
    ],
    displayPoints: [
      { id: "niigata", name: "新潟", prefectureId: "15", forecastAreaId: "150000", x: 77.26, y: 23.46, priority: 1 },
      { id: "toyama", name: "富山", prefectureId: "16", forecastAreaId: "160000", x: 40.66, y: 57.08, priority: 2 },
      { id: "kanazawa", name: "金沢", prefectureId: "17", forecastAreaId: "170000", x: 29.4, y: 60.84, priority: 1 },
      { id: "fukui", name: "福井", prefectureId: "18", forecastAreaId: "180000", x: 20.62, y: 74.67, priority: 2 }
    ]
  },
  {
    id: "TOKAI",
    name: "東海",
    nameEn: "Tokai",
    mapFile: "japan.svg",
    nationalPoint: { id: "nagoya", name: "名古屋", x: 48.8, y: 66.85 },
    prefectures: [
      { id: "21", name: "岐阜県", jmaOffice: "210000" },
      { id: "22", name: "静岡県", jmaOffice: "220000" },
      { id: "23", name: "愛知県", jmaOffice: "230000" },
      { id: "24", name: "三重県", jmaOffice: "240000" }
    ],
    forecastAreas: [
      { id: "210000", name: "岐阜県", prefectureId: "21" },
      { id: "220000", name: "静岡県", prefectureId: "22" },
      { id: "230000", name: "愛知県", prefectureId: "23" },
      { id: "240000", name: "三重県", prefectureId: "24" }
    ],
    displayPoints: [
      { id: "gifu", name: "岐阜", prefectureId: "21", forecastAreaId: "210000", x: 28.98, y: 39.39, priority: 2 },
      { id: "shizuoka", name: "静岡", prefectureId: "22", forecastAreaId: "220000", x: 73.89, y: 54.04, priority: 2 },
      { id: "nagoya", name: "名古屋", prefectureId: "23", forecastAreaId: "230000", x: 33.93, y: 47.34, priority: 1 },
      { id: "tsu", name: "津", prefectureId: "24", forecastAreaId: "240000", x: 23.18, y: 62.16, priority: 2 }
    ]
  },
  {
    id: "KINKI",
    name: "近畿",
    nameEn: "Kinki",
    mapFile: "japan.svg",
    nationalPoint: { id: "osaka", name: "大阪", x: 41.09, y: 69.84 },
    prefectures: [
      { id: "25", name: "滋賀県", jmaOffice: "250000" },
      { id: "26", name: "京都府", jmaOffice: "260000" },
      { id: "27", name: "大阪府", jmaOffice: "270000" },
      { id: "28", name: "兵庫県", jmaOffice: "280000" },
      { id: "29", name: "奈良県", jmaOffice: "290000" },
      { id: "30", name: "和歌山県", jmaOffice: "300000" }
    ],
    forecastAreas: [
      { id: "250010", name: "滋賀県南部", prefectureId: "25" },
      { id: "250020", name: "滋賀県北部", prefectureId: "25" },
      { id: "260010", name: "京都府南部", prefectureId: "26" },
      { id: "260020", name: "京都府北部", prefectureId: "26" },
      { id: "270000", name: "大阪府", prefectureId: "27" },
      { id: "280010", name: "兵庫県南部", prefectureId: "28" },
      { id: "280020", name: "兵庫県北部", prefectureId: "28" },
      { id: "290000", name: "奈良県", prefectureId: "29" },
      { id: "300000", name: "和歌山県", prefectureId: "30" }
    ],
    displayPoints: [
      { id: "otsu", name: "大津", prefectureId: "25", forecastAreaId: "250010", x: 69.3, y: 34.51, priority: 2 },
      { id: "kyoto", name: "京都", prefectureId: "26", forecastAreaId: "260010", x: 65.39, y: 34.21, priority: 1 },
      { id: "osaka", name: "大阪", prefectureId: "27", forecastAreaId: "270000", x: 54.74, y: 46.09, priority: 1 },
      { id: "kobe", name: "神戸", prefectureId: "28", forecastAreaId: "280010", x: 42.95, y: 46.55, priority: 1 },
      { id: "nara", name: "奈良", prefectureId: "29", forecastAreaId: "290000", x: 66.83, y: 46.74, priority: 2 },
      { id: "wakayama", name: "和歌山", prefectureId: "30", forecastAreaId: "300000", x: 41.97, y: 64.34, priority: 2 }
    ]
  },
  {
    id: "CHUGOKU",
    name: "中国",
    nameEn: "Chugoku",
    mapFile: "japan.svg",
    nationalPoint: { id: "hiroshima", name: "広島", x: 24.48, y: 71.76 },
    prefectures: [
      { id: "31", name: "鳥取県", jmaOffice: "310000" },
      { id: "32", name: "島根県", jmaOffice: "320000" },
      { id: "33", name: "岡山県", jmaOffice: "330000" },
      { id: "34", name: "広島県", jmaOffice: "340000" },
      { id: "35", name: "山口県", jmaOffice: "350000" }
    ],
    forecastAreas: [
      { id: "310000", name: "鳥取県", prefectureId: "31" },
      { id: "320000", name: "島根県", prefectureId: "32" },
      { id: "330000", name: "岡山県", prefectureId: "33" },
      { id: "340000", name: "広島県", prefectureId: "34" },
      { id: "350000", name: "山口県", prefectureId: "35" }
    ],
    displayPoints: [
      { id: "tottori", name: "鳥取", prefectureId: "31", forecastAreaId: "310000", x: 80.59, y: 34.63, priority: 3 },
      { id: "matsue", name: "松江", prefectureId: "32", forecastAreaId: "320000", x: 54.83, y: 35.62, priority: 2 },
      { id: "okayama", name: "岡山", prefectureId: "33", forecastAreaId: "330000", x: 74.03, y: 63.46, priority: 2 },
      { id: "hiroshima", name: "広島", prefectureId: "34", forecastAreaId: "340000", x: 42.1, y: 72.28, priority: 1 },
      { id: "yamaguchi", name: "山口", prefectureId: "35", forecastAreaId: "350000", x: 20.69, y: 79.44, priority: 2 }
    ]
  },
  {
    id: "SHIKOKU",
    name: "四国",
    nameEn: "Shikoku",
    mapFile: "japan.svg",
    nationalPoint: { id: "takamatsu", name: "高松", x: 33.16, y: 72.09 },
    prefectures: [
      { id: "36", name: "徳島県", jmaOffice: "360000" },
      { id: "37", name: "香川県", jmaOffice: "370000" },
      { id: "38", name: "愛媛県", jmaOffice: "380000" },
      { id: "39", name: "高知県", jmaOffice: "390000" }
    ],
    forecastAreas: [
      { id: "360000", name: "徳島県", prefectureId: "36" },
      { id: "370000", name: "香川県", prefectureId: "37" },
      { id: "380000", name: "愛媛県", prefectureId: "38" },
      { id: "390000", name: "高知県", prefectureId: "39" }
    ],
    displayPoints: [
      { id: "tokushima", name: "徳島", prefectureId: "36", forecastAreaId: "360000", x: 85.18, y: 29.01, priority: 2 },
      { id: "takamatsu", name: "高松", prefectureId: "37", forecastAreaId: "370000", x: 68.94, y: 16.13, priority: 1 },
      { id: "matsuyama", name: "松山", prefectureId: "38", forecastAreaId: "380000", x: 28.3, y: 39.9, priority: 1 },
      { id: "kochi", name: "高知", prefectureId: "39", forecastAreaId: "390000", x: 52.57, y: 53.07, priority: 2 }
    ]
  },
  {
    id: "KYUSHU",
    name: "九州",
    nameEn: "Kyushu",
    mapFile: "japan.svg",
    nationalPoint: { id: "fukuoka", name: "福岡", x: 13.22, y: 76.8 },
    prefectures: [
      { id: "40", name: "福岡県", jmaOffice: "400000" },
      { id: "41", name: "佐賀県", jmaOffice: "410000" },
      { id: "42", name: "長崎県", jmaOffice: "420000" },
      { id: "43", name: "熊本県", jmaOffice: "430000" },
      { id: "44", name: "大分県", jmaOffice: "440000" },
      { id: "45", name: "宮崎県", jmaOffice: "450000" },
      { id: "46", name: "鹿児島県", jmaOffice: "460000" }
    ],
    forecastAreas: [
      { id: "400000", name: "福岡県", prefectureId: "40" },
      { id: "410000", name: "佐賀県", prefectureId: "41" },
      { id: "420000", name: "長崎県", prefectureId: "42" },
      { id: "430000", name: "熊本県", prefectureId: "43" },
      { id: "440000", name: "大分県", prefectureId: "44" },
      { id: "450000", name: "宮崎県", prefectureId: "45" },
      { id: "460000", name: "鹿児島県", prefectureId: "46" }
    ],
    displayPoints: [
      { id: "fukuoka", name: "福岡", prefectureId: "40", forecastAreaId: "400000", x: 54.89, y: 16.17, priority: 1 },
      { id: "saga", name: "佐賀", prefectureId: "41", forecastAreaId: "410000", x: 52.4, y: 26.29, priority: 3 },
      { id: "nagasaki", name: "長崎", prefectureId: "42", forecastAreaId: "420000", x: 42.11, y: 41.1, priority: 2 },
      { id: "kumamoto", name: "熊本", prefectureId: "43", forecastAreaId: "430000", x: 63.12, y: 39.91, priority: 2 },
      { id: "oita", name: "大分", prefectureId: "44", forecastAreaId: "440000", x: 84.21, y: 26.61, priority: 2 },
      { id: "miyazaki", name: "宮崎", prefectureId: "45", forecastAreaId: "450000", x: 79.63, y: 66, priority: 2 },
      { id: "kagoshima", name: "鹿児島", prefectureId: "46", forecastAreaId: "460000", x: 58.67, y: 75.31, priority: 1 }
    ]
  },
  {
    id: "OKINAWA",
    name: "沖縄",
    nameEn: "Okinawa",
    mapFile: "japan.svg",
    nationalPoint: { id: "naha", name: "那覇", x: 92.95, y: 82.79 },
    prefectures: [
      { id: "47", name: "沖縄県", jmaOffice: "471000" }
    ],
    forecastAreas: [
      { id: "471010", name: "本島中南部", prefectureId: "47" },
      { id: "471020", name: "本島北部", prefectureId: "47" },
      { id: "473000", name: "宮古島地方", prefectureId: "47" },
      { id: "474000", name: "八重山地方", prefectureId: "47" }
    ],
    displayPoints: [
      { id: "nago", name: "名護", prefectureId: "47", forecastAreaId: "471020", x: 87.42, y: 21.48, priority: 2 },
      { id: "naha", name: "那覇", prefectureId: "47", forecastAreaId: "471010", x: 82.51, y: 32.4, priority: 1 },
      { id: "miyako", name: "宮古", prefectureId: "47", forecastAreaId: "473000", x: 43.12, y: 72.86, priority: 2 },
      { id: "ishigaki", name: "石垣", prefectureId: "47", forecastAreaId: "474000", x: 24.65, y: 86.11, priority: 2 }
    ]
  }
];

export const NATIONAL_MAP = {
  id: "JAPAN",
  name: "全国",
  mapFile: "japan.svg",
  viewBox: "0 0 100 100"
};

export function getRegion(regionId) {
  const region = regions.find((item) => item.id === regionId);
  if (!region) {
    throw new Error(`未知のregionId: ${regionId}`);
  }
  return region;
}

export function listRegions() {
  return regions;
}

export function getNationalDisplayPoints() {
  return regions.map((region) => ({
    ...region.nationalPoint,
    regionId: region.id,
    regionName: region.name
  }));
}

export function findForecastArea(forecastAreaId) {
  for (const region of regions) {
    const area = region.forecastAreas.find((item) => item.id === forecastAreaId);
    if (area) {
      return { region, area };
    }
  }
  return null;
}

export function findPrefectureRegion(prefectureNameOrId) {
  return regions.find((region) =>
    region.prefectures.some(
      (pref) => pref.name === prefectureNameOrId || pref.id === prefectureNameOrId
    )
  );
}
