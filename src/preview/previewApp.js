/**
 * 開発用プレビュー。
 * テンプレート / 地域 / ピッチ / インチ を切り替えると、実LED解像度で再描画する。
 * プレビューの拡大縮小は確認用であり、レイアウト計算には使わない。
 */

import { INCH_OPTIONS, PITCH_OPTIONS, resolveDisplayProfile } from "../config/displayProfiles.js";
import { listPreviewTemplates } from "../config/templates.js";
import { listRegions } from "../data/regions/regions.js";
import { sampleSites } from "../data/sites/sampleSites.js";
import { resolveSiteLocation } from "../services/regionResolver.js";
import { renderLedFrame } from "../renderer/renderer.js";

const params = new URLSearchParams(window.location.search);

const state = {
  templateId: params.get("t") || "W10",
  regionId: params.get("region") || "KINKI",
  pitch: params.get("pitch") || "P3.47",
  inches: Number(params.get("inches") || 100),
  scaleMode: params.get("scale") || "fit"
};

export function mountPreview(root) {
  root.innerHTML = `
    <div class="preview-shell">
      <form class="preview-panel" id="preview-form">
        ${select("templateId", "テンプレート", listPreviewTemplates().map((item) => ({ value: item.id, label: `${item.id} ${item.name}` })))}
        ${select("regionId", "地域", listRegions().map((item) => ({ value: item.id, label: item.name })))}
        ${select("pitch", "LEDピッチ", PITCH_OPTIONS.map((item) => ({ value: item, label: item })))}
        ${select("inches", "インチ", INCH_OPTIONS.map((item) => ({ value: String(item), label: `${item}インチ` })))}
        ${select("scaleMode", "表示", [
          { value: "fit", label: "フィット（確認用拡大）" },
          { value: "1", label: "実寸 1x" }
        ])}
        <div class="preview-metrics" id="preview-metrics"></div>
      </form>
      <div class="preview-stage-wrap">
        <div>
          <div class="preview-stage" id="preview-stage">
            <div id="led-root"></div>
          </div>
          <div class="preview-caption" id="preview-caption"></div>
        </div>
      </div>
    </div>
  `;

  const form = root.querySelector("#preview-form");
  for (const [key, value] of Object.entries(state)) {
    const field = form.elements[key];
    if (field) field.value = String(value);
  }

  form.addEventListener("change", () => {
    state.templateId = form.elements.templateId.value;
    state.regionId = form.elements.regionId.value;
    state.pitch = form.elements.pitch.value;
    state.inches = Number(form.elements.inches.value);
    state.scaleMode = form.elements.scaleMode.value;
    const next = new URL(window.location.href);
    next.searchParams.set("t", state.templateId);
    next.searchParams.set("region", state.regionId);
    next.searchParams.set("pitch", state.pitch);
    next.searchParams.set("inches", String(state.inches));
    next.searchParams.set("scale", state.scaleMode);
    window.history.replaceState({}, "", next);
    refresh();
  });

  window.addEventListener("resize", () => applyScale());
  refresh();
}

async function refresh() {
  const region = listRegions().find((item) => item.id === state.regionId);
  const resolved = resolvePreviewSite(state.regionId);
  if (!resolved.ok) {
    throw new Error(resolved.error);
  }

  const profile = resolveDisplayProfile(state.pitch, state.inches);
  const ledRoot = document.getElementById("led-root");
  const result = await renderLedFrame(ledRoot, {
    templateId: state.templateId,
    region,
    site: resolved.site,
    displayProfileId: profile.id,
    forceStale: state.templateId === "STALE"
  });

  document.getElementById("preview-metrics").innerHTML = `
    <strong>${profile.width} × ${profile.height}</strong>
    <span>cache: ${result.cacheKey}</span>
  `;
  document.getElementById("preview-caption").textContent =
    `${resolved.site.name} / ${resolved.site.prefecture}${resolved.site.city} / ${resolved.method}`;

  applyScale();
}

function resolvePreviewSite(regionId) {
  const sample = sampleSites.find((site) => {
    const resolved = resolveSiteLocation(site);
    return resolved.ok && resolved.site.region === regionId;
  });
  if (sample) return resolveSiteLocation(sample);

  const region = listRegions().find((item) => item.id === regionId);
  const point = region.displayPoints[0];
  return resolveSiteLocation({
    id: `${regionId}_PREVIEW`,
    name: `${region.name}プレビュー現場`,
    address: region.prefectures[0].name,
    postalCode: "",
    lat: 0,
    lng: 0,
    pitch: state.pitch,
    inches: state.inches,
    templates: [state.templateId],
    pointHint: point.id
  });
}

function applyScale() {
  const stage = document.getElementById("preview-stage");
  const led = document.getElementById("led-root");
  if (!stage || !led) return;
  const width = Number.parseInt(led.style.width, 10) || led.offsetWidth || 1;
  const height = Number.parseInt(led.style.height, 10) || led.offsetHeight || 1;
  const wrap = document.querySelector(".preview-stage-wrap");
  let scale = 1;
  if (state.scaleMode === "fit") {
    const availW = Math.max(240, wrap.clientWidth - 64);
    const availH = Math.max(180, wrap.clientHeight - 80);
    scale = Math.min(availW / width, availH / height);
  }
  led.style.transformOrigin = "top left";
  led.style.transform = `scale(${scale})`;
  stage.style.width = `${Math.round(width * scale)}px`;
  stage.style.height = `${Math.round(height * scale)}px`;
  stage.style.overflow = "hidden";
}

function select(name, label, options) {
  return `
    <label>
      ${label}
      <select name="${name}">
        ${options.map((option) => `<option value="${option.value}">${option.label}</option>`).join("")}
      </select>
    </label>
  `;
}
