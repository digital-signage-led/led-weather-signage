/**
 * Last Known Good 気象データ。表示は待たず、成功したときだけ差し替える。
 */
const LKG_KEY = "led-weather-lkg-v1";

export function readWeatherLkg() {
  try {
    const raw = localStorage.getItem(LKG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isWeatherDoc(parsed?.doc)) return null;
    const at = Number(parsed.at) || 0;
    return { at, doc: parsed.doc };
  } catch {
    return null;
  }
}

export function writeWeatherLkg(doc, at = Date.now()) {
  if (!isWeatherDoc(doc)) return false;
  try {
    localStorage.setItem(LKG_KEY, JSON.stringify({ at, doc }));
    return true;
  } catch {
    return false;
  }
}

export function isWeatherDoc(doc) {
  return Boolean(doc && Array.isArray(doc.points) && doc.points.length > 0);
}
