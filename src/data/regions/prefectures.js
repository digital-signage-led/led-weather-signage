/**
 * 都道府県マスター。
 * 住所・郵便番号・緯度経度から地方と予報区域を自動判定するための基礎データ。
 * 管理者に気象庁コードを入力させない。
 */

export const prefectures = [
  { id: "01", name: "北海道", regionId: "HOKKAIDO", postalStart: 1, postalEnd: 99, lat: 43.06, lng: 141.35, bounds: { north: 45.55, south: 41.35, east: 145.82, west: 139.40 } },
  { id: "02", name: "青森県", regionId: "TOHOKU", postalStart: 30, postalEnd: 39, lat: 40.82, lng: 140.74, bounds: { north: 41.56, south: 40.22, east: 141.68, west: 139.50 } },
  { id: "03", name: "岩手県", regionId: "TOHOKU", postalStart: 20, postalEnd: 29, lat: 39.70, lng: 141.15, bounds: { north: 40.45, south: 38.75, east: 142.07, west: 140.65 } },
  { id: "04", name: "宮城県", regionId: "TOHOKU", postalStart: 980, postalEnd: 989, lat: 38.27, lng: 140.87, bounds: { north: 39.00, south: 37.77, east: 141.68, west: 140.27 } },
  { id: "05", name: "秋田県", regionId: "TOHOKU", postalStart: 10, postalEnd: 19, lat: 39.72, lng: 140.10, bounds: { north: 40.51, south: 38.87, east: 140.98, west: 139.68 } },
  { id: "06", name: "山形県", regionId: "TOHOKU", postalStart: 990, postalEnd: 999, lat: 38.24, lng: 140.36, bounds: { north: 39.21, south: 37.73, east: 140.65, west: 139.54 } },
  { id: "07", name: "福島県", regionId: "TOHOKU", postalStart: 960, postalEnd: 979, lat: 37.75, lng: 140.47, bounds: { north: 37.98, south: 36.79, east: 141.05, west: 139.16 } },
  { id: "08", name: "茨城県", regionId: "KANTO", postalStart: 300, postalEnd: 319, lat: 36.34, lng: 140.45, bounds: { north: 36.95, south: 35.73, east: 140.85, west: 139.69 } },
  { id: "09", name: "栃木県", regionId: "KANTO", postalStart: 320, postalEnd: 329, lat: 36.57, lng: 139.88, bounds: { north: 37.15, south: 36.20, east: 140.29, west: 139.33 } },
  { id: "10", name: "群馬県", regionId: "KANTO", postalStart: 370, postalEnd: 379, lat: 36.39, lng: 139.06, bounds: { north: 37.05, south: 36.04, east: 139.62, west: 138.40 } },
  { id: "11", name: "埼玉県", regionId: "KANTO", postalStart: 330, postalEnd: 369, lat: 35.86, lng: 139.65, bounds: { north: 36.28, south: 35.75, east: 139.90, west: 138.71 } },
  { id: "12", name: "千葉県", regionId: "KANTO", postalStart: 260, postalEnd: 299, lat: 35.60, lng: 140.12, bounds: { north: 36.10, south: 34.90, east: 140.88, west: 139.74 } },
  { id: "13", name: "東京都", regionId: "KANTO", postalStart: 100, postalEnd: 209, lat: 35.69, lng: 139.69, bounds: { north: 35.90, south: 35.50, east: 139.92, west: 139.00 } },
  { id: "14", name: "神奈川県", regionId: "KANTO", postalStart: 210, postalEnd: 259, lat: 35.45, lng: 139.64, bounds: { north: 35.67, south: 35.13, east: 139.84, west: 138.92 } },
  { id: "15", name: "新潟県", regionId: "HOKURIKU", postalStart: 940, postalEnd: 959, lat: 37.90, lng: 139.02, bounds: { north: 38.55, south: 36.74, east: 139.89, west: 137.64 } },
  { id: "16", name: "富山県", regionId: "HOKURIKU", postalStart: 930, postalEnd: 939, lat: 36.70, lng: 137.21, bounds: { north: 36.98, south: 36.27, east: 137.76, west: 136.77 } },
  { id: "17", name: "石川県", regionId: "HOKURIKU", postalStart: 920, postalEnd: 929, lat: 36.59, lng: 136.63, bounds: { north: 37.85, south: 36.07, east: 137.36, west: 136.24 } },
  { id: "18", name: "福井県", regionId: "HOKURIKU", postalStart: 910, postalEnd: 919, lat: 36.07, lng: 136.22, bounds: { north: 36.30, south: 35.35, east: 136.83, west: 135.45 } },
  { id: "19", name: "山梨県", regionId: "KANTO", postalStart: 400, postalEnd: 409, lat: 35.66, lng: 138.57, bounds: { north: 35.97, south: 35.17, east: 139.14, west: 138.18 } },
  { id: "20", name: "長野県", regionId: "KANTO", postalStart: 380, postalEnd: 399, lat: 36.65, lng: 138.18, bounds: { north: 37.02, south: 35.20, east: 138.73, west: 137.32 } },
  { id: "21", name: "岐阜県", regionId: "TOKAI", postalStart: 500, postalEnd: 509, lat: 35.39, lng: 136.72, bounds: { north: 36.46, south: 35.13, east: 137.66, west: 136.28 } },
  { id: "22", name: "静岡県", regionId: "TOKAI", postalStart: 410, postalEnd: 439, lat: 34.98, lng: 138.38, bounds: { north: 35.64, south: 34.57, east: 139.18, west: 137.47 } },
  { id: "23", name: "愛知県", regionId: "TOKAI", postalStart: 440, postalEnd: 499, lat: 35.18, lng: 136.91, bounds: { north: 35.42, south: 34.57, east: 137.83, west: 136.67 } },
  { id: "24", name: "三重県", regionId: "TOKAI", postalStart: 510, postalEnd: 519, lat: 34.73, lng: 136.51, bounds: { north: 35.26, south: 33.72, east: 136.98, west: 135.85 } },
  { id: "25", name: "滋賀県", regionId: "KINKI", postalStart: 520, postalEnd: 529, lat: 35.00, lng: 135.87, bounds: { north: 35.70, south: 34.79, east: 136.46, west: 135.77 } },
  { id: "26", name: "京都府", regionId: "KINKI", postalStart: 600, postalEnd: 629, lat: 35.02, lng: 135.76, bounds: { north: 35.78, south: 34.71, east: 135.87, west: 134.85 } },
  { id: "27", name: "大阪府", regionId: "KINKI", postalStart: 530, postalEnd: 599, lat: 34.69, lng: 135.50, bounds: { north: 35.05, south: 34.27, east: 135.75, west: 135.09 } },
  { id: "28", name: "兵庫県", regionId: "KINKI", postalStart: 650, postalEnd: 679, lat: 34.69, lng: 135.18, bounds: { north: 35.67, south: 34.16, east: 135.47, west: 134.25 } },
  { id: "29", name: "奈良県", regionId: "KINKI", postalStart: 630, postalEnd: 639, lat: 34.69, lng: 135.83, bounds: { north: 34.78, south: 33.86, east: 136.12, west: 135.54 } },
  { id: "30", name: "和歌山県", regionId: "KINKI", postalStart: 640, postalEnd: 649, lat: 34.23, lng: 135.17, bounds: { north: 34.38, south: 33.45, east: 136.00, west: 135.01 } },
  { id: "31", name: "鳥取県", regionId: "CHUGOKU", postalStart: 680, postalEnd: 689, lat: 35.50, lng: 134.24, bounds: { north: 35.62, south: 35.05, east: 134.90, west: 133.14 } },
  { id: "32", name: "島根県", regionId: "CHUGOKU", postalStart: 690, postalEnd: 699, lat: 35.47, lng: 133.05, bounds: { north: 36.37, south: 34.31, east: 133.43, west: 131.67 } },
  { id: "33", name: "岡山県", regionId: "CHUGOKU", postalStart: 700, postalEnd: 719, lat: 34.66, lng: 133.93, bounds: { north: 35.35, south: 34.29, east: 134.42, west: 133.27 } },
  { id: "34", name: "広島県", regionId: "CHUGOKU", postalStart: 720, postalEnd: 739, lat: 34.40, lng: 132.46, bounds: { north: 35.10, south: 34.08, east: 133.28, west: 132.03 } },
  { id: "35", name: "山口県", regionId: "CHUGOKU", postalStart: 740, postalEnd: 759, lat: 34.19, lng: 131.47, bounds: { north: 34.80, south: 33.72, east: 132.24, west: 130.77 } },
  { id: "36", name: "徳島県", regionId: "SHIKOKU", postalStart: 770, postalEnd: 779, lat: 34.07, lng: 134.56, bounds: { north: 34.25, south: 33.54, east: 134.82, west: 133.66 } },
  { id: "37", name: "香川県", regionId: "SHIKOKU", postalStart: 760, postalEnd: 769, lat: 34.34, lng: 134.04, bounds: { north: 34.56, south: 34.04, east: 134.45, west: 133.45 } },
  { id: "38", name: "愛媛県", regionId: "SHIKOKU", postalStart: 790, postalEnd: 799, lat: 33.84, lng: 132.77, bounds: { north: 34.30, south: 32.91, east: 133.69, west: 132.04 } },
  { id: "39", name: "高知県", regionId: "SHIKOKU", postalStart: 780, postalEnd: 789, lat: 33.56, lng: 133.53, bounds: { north: 33.88, south: 32.70, east: 134.32, west: 132.48 } },
  { id: "40", name: "福岡県", regionId: "KYUSHU", postalStart: 800, postalEnd: 839, lat: 33.61, lng: 130.42, bounds: { north: 33.88, south: 33.06, east: 131.19, west: 130.03 } },
  { id: "41", name: "佐賀県", regionId: "KYUSHU", postalStart: 840, postalEnd: 849, lat: 33.25, lng: 130.30, bounds: { north: 33.62, south: 32.95, east: 130.54, west: 129.86 } },
  { id: "42", name: "長崎県", regionId: "KYUSHU", postalStart: 850, postalEnd: 859, lat: 32.75, lng: 129.87, bounds: { north: 34.70, south: 32.00, east: 130.40, west: 128.10 } },
  { id: "43", name: "熊本県", regionId: "KYUSHU", postalStart: 860, postalEnd: 869, lat: 32.79, lng: 130.74, bounds: { north: 33.20, south: 32.09, east: 131.13, west: 130.14 } },
  { id: "44", name: "大分県", regionId: "KYUSHU", postalStart: 870, postalEnd: 879, lat: 33.24, lng: 131.61, bounds: { north: 33.74, south: 32.72, east: 132.00, west: 130.83 } },
  { id: "45", name: "宮崎県", regionId: "KYUSHU", postalStart: 880, postalEnd: 889, lat: 31.91, lng: 131.42, bounds: { north: 32.83, south: 31.36, east: 131.88, west: 130.70 } },
  { id: "46", name: "鹿児島県", regionId: "KYUSHU", postalStart: 890, postalEnd: 899, lat: 31.56, lng: 130.56, bounds: { north: 32.30, south: 27.02, east: 131.08, west: 128.40 } },
  { id: "47", name: "沖縄県", regionId: "OKINAWA", postalStart: 900, postalEnd: 907, lat: 26.21, lng: 127.68, bounds: { north: 27.90, south: 24.04, east: 131.33, west: 122.93 } }
];

export function findPrefectureByName(name) {
  return prefectures.find((item) => name.includes(item.name) || item.name.includes(name));
}

export function findPrefectureByPostalCode(postalCode) {
  const digits = String(postalCode).replace(/\D/g, "");
  if (digits.length < 3) return null;
  const prefix3 = Number(digits.slice(0, 3));
  const prefix2 = Number(digits.slice(0, 2));

  const by3 = prefectures.find((item) => prefix3 >= item.postalStart && prefix3 <= item.postalEnd);
  if (by3) return by3;
  return prefectures.find((item) => prefix2 >= item.postalStart && prefix2 <= item.postalEnd) || null;
}

export function findPrefectureByLatLng(lat, lng) {
  const hits = prefectures.filter((item) =>
    lat <= item.bounds.north &&
    lat >= item.bounds.south &&
    lng <= item.bounds.east &&
    lng >= item.bounds.west
  );
  if (hits.length === 1) return hits[0];
  if (!hits.length) return nearestPrefecture(lat, lng);
  return hits.reduce((best, item) => {
    const bestDist = distance(lat, lng, best.lat, best.lng);
    const dist = distance(lat, lng, item.lat, item.lng);
    return dist < bestDist ? item : best;
  });
}

function nearestPrefecture(lat, lng) {
  return prefectures.reduce((best, item) => {
    const bestDist = distance(lat, lng, best.lat, best.lng);
    const dist = distance(lat, lng, item.lat, item.lng);
    return dist < bestDist ? item : best;
  });
}

function distance(lat1, lng1, lat2, lng2) {
  const dLat = lat1 - lat2;
  const dLng = lng1 - lng2;
  return dLat * dLat + dLng * dLng;
}
