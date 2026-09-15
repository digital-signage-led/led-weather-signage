/**
 * 本番表示設定を検証してリポジトリへ commit / push する。
 * GitHub token はここでは使わない。既存 git remote 認証を使う。
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyLayerToDoc, emptyContentDoc, pickLayer, validateDisplayDoc } from "../js/display-config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = "https://digital-signage-led.github.io/led-weather-signage/data/display/manifest.json";

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

export function loadMasters() {
  const contents = readJson(path.join(root, "data/contents.json"), { contents: [] }).contents.map((c) => c.id);
  const prefs = readJson(path.join(root, "data/prefectures.json"), { prefectures: [] }).prefectures.map((p) => p.pref_id);
  const stations = readJson(path.join(root, "data/stations.json"), { stations: [] }).stations.map((s) => String(s.station_id));
  return { contents, prefs, stations };
}

export function publishDisplay({ contentId, scope, prefId, stationId, layer, baseVersion, publisher = "studio" }) {
  const masters = loadMasters();
  const file = path.join(root, "data/display/contents", `${contentId}.json`);
  const current = readJson(file, emptyContentDoc(contentId));
  const currentVersion = Number(current.version) || 1;
  if (Number(baseVersion) !== currentVersion) {
    const err = new Error("conflict");
    err.code = "CONFLICT";
    err.currentVersion = currentVersion;
    throw err;
  }
  const next = applyLayerToDoc(current, scope, { prefId, stationId, layer });
  next.version = currentVersion + 1;
  next.updated_at = new Date().toISOString();
  next.content_id = contentId;
  const errors = validateDisplayDoc(next, {
    contentIds: masters.contents,
    prefIds: masters.prefs,
    stationIds: masters.stations
  });
  if (errors.length) {
    const err = new Error(errors.join("; "));
    err.code = "INVALID";
    throw err;
  }

  mkdirSync(path.join(root, "data/display/history", contentId), { recursive: true });
  writeFileSync(path.join(root, "data/display/history", contentId, `v${currentVersion}.json`), `${JSON.stringify(current, null, 2)}\n`);
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);

  const manifestPath = path.join(root, "data/display/manifest.json");
  const manifest = readJson(manifestPath, { version: 1, contents: {}, history: [] });
  manifest.version = (Number(manifest.version) || 1) + 1;
  manifest.updated_at = next.updated_at;
  manifest.published_at = next.updated_at;
  manifest.publisher = publisher;
  manifest.contents = manifest.contents || {};
  manifest.contents[contentId] = { version: next.version, updated_at: next.updated_at, status: "published" };
  manifest.history = [
    {
      version: next.version,
      published_at: next.updated_at,
      content_id: contentId,
      scope,
      pref_id: prefId || "",
      station_id: stationId || "",
      publisher,
      commit: "",
      status: "published"
    },
    ...(manifest.history || [])
  ].slice(0, 20);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  git(["add", "data/display"]);
  git(["commit", "-m", `Publish ${contentId} display v${next.version} (${scope}).`]);
  const commit = git(["rev-parse", "--short", "HEAD"]);
  manifest.commit = commit;
  if (manifest.history[0]) manifest.history[0].commit = commit;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  git(["add", "data/display/manifest.json"]);
  try {
    git(["commit", "-m", `Record publish commit ${commit} for ${contentId} v${next.version}.`]);
  } catch {
    /* nothing extra */
  }
  git(["push", "origin", "HEAD"]);

  return {
    ok: true,
    contentId,
    scope,
    version: next.version,
    commit: git(["rev-parse", "--short", "HEAD"]),
    published_at: next.updated_at,
    pages_wait_version: manifest.version,
    pages_origin: "https://digital-signage-led.github.io/led-weather-signage/"
  };
}

export function rollbackDisplay({ contentId, toVersion, publisher = "studio" }) {
  const snapshot = readJson(path.join(root, "data/display/history", contentId, `v${toVersion}.json`), null);
  if (!snapshot) throw new Error(`履歴 v${toVersion} がありません`);
  const current = readJson(path.join(root, "data/display/contents", `${contentId}.json`), emptyContentDoc(contentId));
  const restored = applyLayerToDoc(current, "content", { layer: snapshot });
  Object.assign(restored, snapshot);
  restored.version = Number(current.version) || 1;
  writeFileSync(path.join(root, "data/display/contents", `${contentId}.json`), `${JSON.stringify({
    ...snapshot,
    version: Number(current.version) || 1,
    updated_at: current.updated_at
  }, null, 2)}\n`);
  return publishDisplay({
    contentId,
    scope: "content",
    layer: pickLayer(snapshot),
    baseVersion: Number(current.version) || 1,
    publisher: `${publisher}:rollback-v${toVersion}`
  });
}


export async function waitForPagesVersion(minManifestVersion, timeoutMs = 180000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const rec = await fetch(`${PAGES}?t=${Date.now()}`, { cache: "no-store" });
      if (rec.ok) {
        last = await rec.json();
        if (Number(last.version) >= Number(minManifestVersion)) return { ok: true, manifest: last };
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 8000));
  }
  return { ok: false, manifest: last };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const payload = JSON.parse(readFileSync(0, "utf8") || "{}");
  const result = publishDisplay(payload);
  console.log(JSON.stringify(result, null, 2));
}
