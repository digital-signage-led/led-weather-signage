/**
 * 住所・郵便番号・緯度経度から都道府県を推定する。
 * Phase 3 で地図APIや住所正規化サービスへ差し替え可能。
 */

import {
  findPrefectureByLatLng,
  findPrefectureByName,
  findPrefectureByPostalCode
} from "../data/regions/prefectures.js";

export function resolvePrefecture(input) {
  const { postalCode, address, lat, lng } = input;

  if (address) {
    const fromAddress = findPrefectureByName(address);
    if (fromAddress) {
      return { prefecture: fromAddress, method: "address" };
    }
  }

  if (postalCode) {
    const fromPostal = findPrefectureByPostalCode(postalCode);
    if (fromPostal) {
      return { prefecture: fromPostal, method: "postalCode" };
    }
  }

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const fromGeo = findPrefectureByLatLng(lat, lng);
    if (fromGeo) {
      return { prefecture: fromGeo, method: "latlng" };
    }
  }

  return { prefecture: null, method: "unresolved", error: "住所を判定できませんでした" };
}
