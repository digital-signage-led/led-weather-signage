/**
 * Studio の下書き／本番公開 UI。秘密情報は入力欄のみ。リポジトリへは書かない。
 */
import { generatePublicUrls } from "./public-urls.js?v=pref427";
import { getContent } from "./catalog.js?v=pref427";
import { getPrefecture, getStation, listStations } from "./location-masters.js?v=pref434";
import { capabilityForContent } from "./content-registry.js?v=pref434";
import {
  clearDraft,
  loadDisplayBundle,
  pickLayer,
  readDraft,
  resolveDisplayConfig,
  writeDraft
} from "./display-config.js?v=pref427";

function scopeLabel(scope, prefId, stationId) {
  if (scope === "station") return `${getStation(stationId)?.station_name || stationId}観測地点のみ`;
  if (scope === "prefecture") return `${getPrefecture(prefId).pref_name}のみ`;
  return "コンテンツ全体";
}

function impactCount(state, scope) {
  const rows = generatePublicUrls().filter((row) => row.contentId === state.contentId);
  if (scope === "station") return rows.filter((row) => row.url.includes(`station=${state.stationId}`)).length || 1;
  if (scope === "prefecture") {
    const prefRows = rows.filter((row) => row.url.includes(`pref=${state.prefId}`));
    if (prefRows.length) return prefRows.length;
    const cap = capabilityForContent(state.contentId);
    return listStations().filter((st) => st.pref_id === state.prefId && (!cap || st[cap])).length || 1;
  }
  return rows.length;
}

function currentLayer(root) {
  return {
    title_scale: Number(root.querySelector("#v1-title-scale")?.value || 1),
    stamp_scale: Number(root.querySelector("#v1-stamp-scale")?.value || root.querySelector("#v1-title-scale")?.value || 1),
    graph_scale: Number(root.querySelector("#v1-graph-scale")?.value || 1),
    graph_x: Number(root.querySelector("#v1-graph-x")?.value || 0),
    graph_y: Number(root.querySelector("#v1-graph-y")?.value || 0),
    ticker_enabled: root.querySelector("#v1-ticker-enabled")?.checked !== false
  };
}

function fillLayer(root, layer) {
  const set = (id, value) => {
    const el = root.querySelector(id);
    if (el && value != null) el.value = String(value);
  };
  set("#v1-title-scale", layer.title_scale);
  set("#v1-stamp-scale", layer.stamp_scale ?? layer.title_scale);
  set("#v1-graph-scale", layer.graph_scale);
  set("#v1-graph-x", layer.graph_x);
  set("#v1-graph-y", layer.graph_y);
  const tick = root.querySelector("#v1-ticker-enabled");
  if (tick) tick.checked = layer.ticker_enabled !== false;
  const t = root.querySelector("#v1-title-value");
  const g = root.querySelector("#v1-graph-scale-value");
  if (t) t.textContent = Number(layer.title_scale || 1).toFixed(2);
  const s = root.querySelector("#v1-stamp-value");
  if (s) s.textContent = Number(layer.stamp_scale ?? layer.title_scale ?? 1).toFixed(2);
  if (g) g.textContent = Number(layer.graph_scale || 1).toFixed(2);
}

export function bindDisplayStudio({ root, state, reloadPreview, applyLive }) {
  const tools = root.querySelector("#v1-display-tools");
  const confirmEl = root.querySelector("#publish-confirm");
  const resultEl = root.querySelector("#publish-result");
  let liveDoc = null;
  let liveDefaults = null;
  let liveManifest = null;

  const editScope = () => root.querySelector("input[name=edit-scope]:checked")?.value || "content";

  const refreshMeta = async () => {
    const content = getContent(state.contentId);
    root.querySelector("#edit-target-name").textContent = content.name;
    root.querySelector("#edit-scope-label").textContent = scopeLabel(editScope(), state.prefId, state.stationId);
    root.querySelector("#publish-impact").textContent = `${impactCount(state, editScope())}件`;
    if (tools) tools.hidden = content.kind !== "v1";
    try {
      const bundle = await loadDisplayBundle(state.contentId);
      liveDoc = bundle.contentDoc;
      liveDefaults = bundle.defaultsDoc;
      liveManifest = bundle.manifest;
    } catch {
      liveDoc = null;
    }
    const resolved = resolveDisplayConfig({
      contentDoc: liveDoc,
      defaultsDoc: liveDefaults,
      prefId: state.prefId,
      stationId: state.stationId,
      draftLayer: matchingDraft()?.layer
    });
    fillLayer(root, resolved);
    const draft = matchingDraft();
    root.querySelector("#publish-live-ver").textContent = liveDoc ? `v${liveDoc.version}` : "—";
    root.querySelector("#publish-draft-ver").textContent = draft ? "あり" : "なし";
    root.querySelector("#publish-state").textContent = draft ? "下書きあり" : (liveDoc ? "公開済み" : "未変更");
    const hist = (liveManifest?.history || []).filter((h) => h.content_id === state.contentId || h.content_id === "*").slice(0, 6);
    root.querySelector("#publish-history").innerHTML = hist.length
      ? `<ol>${hist.map((h) => `<li>v${h.version} ${h.published_at || ""} ${h.scope || ""} ${h.commit || ""} ${h.status || ""}</li>`).join("")}</ol>`
      : "";
  };

  const matchingDraft = () => {
    const draft = readDraft();
    if (!draft || draft.content_id !== state.contentId) return null;
    return draft;
  };

  const saveDraft = () => {
    const draft = {
      content_id: state.contentId,
      scope: editScope(),
      pref_id: state.prefId,
      station_id: state.stationId,
      layer: currentLayer(root),
      base_version: Number(liveDoc?.version) || 1,
      saved_at: new Date().toISOString()
    };
    writeDraft(draft);
    root.querySelector("#publish-state").textContent = "下書きあり";
    root.querySelector("#publish-draft-ver").textContent = "あり";
    reloadPreview?.(true);
  };

  root.querySelectorAll("input[name=edit-scope]").forEach((el) => el.addEventListener("change", () => {
    refreshMeta();
    reloadPreview?.(false);
  }));
  ["#v1-title-scale", "#v1-stamp-scale", "#v1-graph-scale", "#v1-graph-x", "#v1-graph-y", "#v1-ticker-enabled"].forEach((sel) => {
    root.querySelector(sel)?.addEventListener("input", () => {
      root.querySelector("#publish-state").textContent = "未保存の変更";
      if (sel === "#v1-title-scale") root.querySelector("#v1-title-value").textContent = Number(root.querySelector(sel).value).toFixed(2);
      if (sel === "#v1-stamp-scale") root.querySelector("#v1-stamp-value").textContent = Number(root.querySelector(sel).value).toFixed(2);
      if (sel === "#v1-graph-scale") root.querySelector("#v1-graph-scale-value").textContent = Number(root.querySelector(sel).value).toFixed(2);
      applyLive?.(currentLayer(root));
    });
  });
  root.querySelector("#display-draft")?.addEventListener("click", saveDraft);
  root.querySelector("#display-discard")?.addEventListener("click", () => {
    clearDraft();
    refreshMeta();
    reloadPreview?.(false);
  });
  root.querySelector("#display-revert")?.addEventListener("click", () => {
    clearDraft();
    if (liveDoc) fillLayer(root, resolveDisplayConfig({ contentDoc: liveDoc, defaultsDoc: liveDefaults, prefId: state.prefId, stationId: state.stationId }));
    root.querySelector("#publish-state").textContent = "公開済みに戻した（未保存）";
    reloadPreview?.(false);
  });
  root.querySelector("#display-publish")?.addEventListener("click", () => {
    const content = getContent(state.contentId);
    const scope = editScope();
    const impact = impactCount(state, scope);
    confirmEl.hidden = false;
    confirmEl.innerHTML = `
      <p>本番公開しますか？</p>
      <p>コンテンツ：${content.name}</p>
      <p>適用範囲：${scopeLabel(scope, state.prefId, state.stationId)}</p>
      <p>変更内容：タイトル／グラフ／Ticker</p>
      <p>影響する公開URL：${impact} URL</p>
      <button type="button" id="publish-cancel">キャンセル</button>
      <button type="button" id="publish-go">本番公開</button>`;
    confirmEl.querySelector("#publish-cancel").onclick = () => {
      confirmEl.hidden = true;
    };
    confirmEl.querySelector("#publish-go").onclick = () => runPublish();
  });

  async function runPublish() {
    confirmEl.hidden = true;
    resultEl.hidden = false;
    resultEl.textContent = "公開中…";
    root.querySelector("#publish-state").textContent = "公開中";
    const payload = {
      content_id: state.contentId,
      scope: editScope(),
      pref_id: state.prefId,
      station_id: state.stationId,
      layer: currentLayer(root),
      base_version: Number(liveDoc?.version) || 1,
      publisher: "studio"
    };
    const secret = root.querySelector("#publish-secret")?.value || "";
    try {
      const response = await fetch("/api/publish", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${secret}`
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (response.status === 409 || data.code === "CONFLICT") {
        root.querySelector("#publish-state").textContent = "競合あり";
        resultEl.textContent = `別の変更が公開されています。\n現在の本番Version：v${data.currentVersion || "?"}\n下書き：保持中`;
        return;
      }
      if (!response.ok || !data.ok) {
        root.querySelector("#publish-state").textContent = "公開失敗";
        resultEl.textContent = `公開失敗\n原因：${data.error || response.status}\n現在の本番Version：v${liveDoc?.version || "?"}\n下書き：保持中`;
        return;
      }
      if (!data.deploy_ok) {
        root.querySelector("#publish-state").textContent = "公開失敗";
        resultEl.textContent = `GitHub commit は成功しましたが、Pages 反映を確認できませんでした。\ncommit：${data.commit}\nVersion：v${data.version}\n下書き：保持中`;
        return;
      }
      clearDraft();
      root.querySelector("#publish-state").textContent = "公開済み";
      resultEl.textContent = [
        "公開完了",
        `コンテンツ：${getContent(state.contentId).name}`,
        `適用範囲：${scopeLabel(payload.scope, payload.pref_id, payload.station_id)}`,
        `設定Version：v${data.version}`,
        `対象URL：${impactCount(state, payload.scope)}件`,
        `Git commit：${data.commit}`,
        `公開日時：${data.published_at}`,
        "GitHub Pages：反映確認済み"
      ].join("\n");
      await refreshMeta();
      reloadPreview?.(false);
    } catch (error) {
      root.querySelector("#publish-state").textContent = "公開失敗";
      resultEl.textContent = `公開失敗\n原因：${error.message}\nGitHub Pages 上の Studio から公開するには、ローカル npm start の管理APIが必要です。`;
    }
  }

  refreshMeta();
  return { refreshMeta, currentLayer, editScope };
}

export function applyResolvedDisplay(screen, resolved) {
  if (!screen || !resolved) return;
  screen.style.setProperty("--title-scale", String(resolved.title_scale || 1));
  screen.style.setProperty("--stamp-scale", String(resolved.stamp_scale || resolved.title_scale || 1));
  screen.style.setProperty("--v1-graph-scale", String(resolved.graph_scale || 1));
  screen.style.setProperty("--v1-graph-x", `${Number(resolved.graph_x) || 0}px`);
  screen.style.setProperty("--v1-graph-y", `${Number(resolved.graph_y) || 0}px`);
  const footer = screen.querySelector(".led-footer");
  if (footer) footer.hidden = resolved.ticker_enabled === false;
}

export { pickLayer, resolveDisplayConfig, readDraft };
