/**
 * 気象庁取得の短命キャッシュ。無期限表示はしない。
 */
const store = new Map();

export async function cachedFetchJson(key, url, ttlMs) {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires_at > now && hit.status === "ok") {
    return { ...hit, from_cache: true };
  }
  const last_fetch_at = now;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${url} ${response.status}`);
    const data = await response.json();
    const rec = {
      data,
      last_fetch_at,
      last_success_at: Date.now(),
      expires_at: Date.now() + Math.max(30_000, ttlMs),
      status: "ok"
    };
    store.set(key, rec);
    return { ...rec, from_cache: false };
  } catch (error) {
    if (hit?.data) {
      return { ...hit, status: "stale", from_cache: true, error: error.message };
    }
    throw error;
  }
}

export async function cachedFetchText(key, url, ttlMs) {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires_at > now && hit.status === "ok") return { ...hit, from_cache: true };
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${url} ${response.status}`);
    const data = await response.text();
    const rec = {
      data,
      last_fetch_at: now,
      last_success_at: Date.now(),
      expires_at: Date.now() + Math.max(30_000, ttlMs),
      status: "ok"
    };
    store.set(key, rec);
    return { ...rec, from_cache: false };
  } catch (error) {
    if (hit?.data) return { ...hit, status: "stale", from_cache: true, error: error.message };
    throw error;
  }
}
