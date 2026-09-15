/**
 * 雨の予報：ナウキャストと降水短時間予報を共通時間軸へ正規化する。
 * 間隔はハードコードせず、気象庁の validtime をそのまま使う。
 */

export function jmaTimeMs(raw) {
  const s = String(raw || "");
  if (s.length < 12) return NaN;
  return Date.parse(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00+09:00`);
}

export function formatJmaClock(raw) {
  const s = String(raw || "");
  if (s.length < 12) return "";
  return `${s.slice(8, 10)}:${s.slice(10, 12)}`;
}

export function formatJmaStamp(raw) {
  const s = String(raw || "");
  if (s.length >= 12) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00+09:00`;
  }
  return s;
}

function hasElement(slot, element) {
  return !element || (slot.elements || []).includes(element);
}

export function latestByValidTime(slots, element) {
  const map = new Map();
  for (const slot of slots || []) {
    if (!slot?.validtime || !hasElement(slot, element)) continue;
    const prev = map.get(slot.validtime);
    if (!prev || String(slot.basetime) > String(prev.basetime)) map.set(slot.validtime, slot);
  }
  return [...map.values()].sort((a, b) => String(a.validtime).localeCompare(String(b.validtime)));
}

export function latestCurrentNowcast(slots) {
  const hits = (slots || []).filter((t) => hasElement(t, "hrpns") && String(t.validtime) === String(t.basetime));
  hits.sort((a, b) => String(b.validtime).localeCompare(String(a.validtime)));
  return hits[0] || null;
}

function toFrame(slot, sourceType, element) {
  return {
    validTime: String(slot.validtime),
    baseTime: String(slot.basetime),
    sourceType,
    layer: sourceType === "nowcast" ? "nowc" : "rasrf",
    element,
    member: slot.member || "none",
    available: true
  };
}

/**
 * 直近は高解像度ナウキャスト優先。同じ validTime は二重表示しない。
 * 現在（最新実況）より前の解析コマは再生に入れない。
 */
export function buildRainTimeline(nowcastSlots, forecastSlots) {
  const warnings = [];
  const nowcastList = nowcastSlots || [];
  const forecastList = forecastSlots || [];

  const current = latestCurrentNowcast(nowcastList);
  const nowcastFuture = latestByValidTime(
    nowcastList.filter((t) => current && String(t.validtime) > String(current.validtime)),
    "hrpns"
  );
  const nowcastFrames = [];
  if (current) nowcastFrames.push(toFrame(current, "nowcast", "hrpns"));
  for (const slot of nowcastFuture) nowcastFrames.push(toFrame(slot, "nowcast", "hrpns"));

  const rasrfAll = latestByValidTime(forecastList, "rasrf");
  let cutoff = nowcastFrames.at(-1)?.validTime || "";
  if (!cutoff) {
    const analysis = [...rasrfAll].reverse().find((slot) => String(slot.validtime) === String(slot.basetime));
    cutoff = analysis ? String(analysis.validtime) : "";
  }
  const forecastFrames = rasrfAll
    .filter((slot) => (cutoff
      ? (nowcastFrames.length ? String(slot.validtime) > cutoff : String(slot.validtime) >= cutoff)
      : true))
    .map((slot) => toFrame(slot, "forecast", "rasrf"));

  const byValid = new Map();
  for (const frame of nowcastFrames) byValid.set(frame.validTime, frame);
  for (const frame of forecastFrames) {
    if (byValid.has(frame.validTime)) continue;
    byValid.set(frame.validTime, frame);
  }

  const frames = [...byValid.values()].sort((a, b) => a.validTime.localeCompare(b.validTime));
  const nowIndex = frames.findIndex((f) => current && f.validTime === String(current.validtime));

  if (!nowcastFrames.length) warnings.push("直近の雨雲データを取得できません");
  if (!forecastFrames.length && !rasrfAll.length) warnings.push("その先の予測を取得できません");
  else if (!forecastFrames.length && nowcastFrames.length) warnings.push("");

  return {
    frames,
    nowIndex: nowIndex < 0 ? 0 : nowIndex,
    nowcastAvailable: nowcastFrames.length > 0,
    forecastAvailable: forecastFrames.length > 0,
    nowcastBase: current?.basetime || nowcastFrames[0]?.baseTime || "",
    forecastBase: rasrfAll.at(-1)?.basetime || "",
    warnings: warnings.filter(Boolean),
    sources: {
      nowcast: { count: nowcastFrames.length, first: nowcastFrames[0]?.validTime || "", last: nowcastFrames.at(-1)?.validTime || "" },
      forecast: { count: forecastFrames.length, first: forecastFrames[0]?.validTime || "", last: forecastFrames.at(-1)?.validTime || "" }
    }
  };
}

export function overlayForFrame(frame) {
  if (!frame) return null;
  if (frame.sourceType === "forecast") {
    return { kind: "rasrf", basetime: frame.baseTime, validtime: frame.validTime, member: frame.member, element: frame.element };
  }
  return { kind: "nowc", basetime: frame.baseTime, validtime: frame.validTime, element: frame.element };
}

export function segmentLabel(sourceType) {
  return sourceType === "forecast" ? "今後の予測" : "直近予測";
}
