/**
 * LED実解像度プロファイル。
 * 現場設定の「ピッチ × インチ」から自動決定する。
 * 1920×1080は管理プレビュー用であり、ここには含めない。
 */

export const PITCH_MM = {
  P3_47: 3.47,
  P2_87: 2.87
};

export const displayProfiles = {
  p347_75: {
    id: "p347_75",
    pitch: "P3.47",
    pitchMm: 3.47,
    inches: 75,
    width: 432,
    height: 288
  },
  p347_100: {
    id: "p347_100",
    pitch: "P3.47",
    pitchMm: 3.47,
    inches: 100,
    width: 576,
    height: 432
  },
  p347_125: {
    id: "p347_125",
    pitch: "P3.47",
    pitchMm: 3.47,
    inches: 125,
    width: 720,
    height: 576
  },
  p287_75: {
    id: "p287_75",
    pitch: "P2.87",
    pitchMm: 2.87,
    inches: 75,
    width: 528,
    height: 352
  },
  p287_100: {
    id: "p287_100",
    pitch: "P2.87",
    pitchMm: 2.87,
    inches: 100,
    width: 704,
    height: 528
  },
  p287_125: {
    id: "p287_125",
    pitch: "P2.87",
    pitchMm: 2.87,
    inches: 125,
    width: 880,
    height: 704
  }
};

export const PITCH_OPTIONS = ["P3.47", "P2.87"];
export const INCH_OPTIONS = [75, 100, 125];

/**
 * 現場のピッチ・インチからプロファイルを解決する。
 */
export function resolveDisplayProfile(pitch, inches) {
  const normalizedPitch = String(pitch).replace(".", "").replace("P", "p").toLowerCase();
  const key = `${normalizedPitch}_${inches}`;
  const profile = displayProfiles[key];
  if (!profile) {
    throw new Error(`未対応のLEDプロファイルです: pitch=${pitch}, inches=${inches}`);
  }
  return profile;
}

export function getDisplayProfile(profileId) {
  const profile = displayProfiles[profileId];
  if (!profile) {
    throw new Error(`未知のdisplayProfileId: ${profileId}`);
  }
  return profile;
}

export function listDisplayProfiles() {
  return Object.values(displayProfiles);
}
