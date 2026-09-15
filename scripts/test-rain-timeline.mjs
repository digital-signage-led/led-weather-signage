import { buildRainTimeline } from "../js/rain-timeline.js";

let failed = 0;
function assert(cond, message) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL ${message}`);
    return;
  }
  console.log(`ok   ${message}`);
}

const nowcast = [
  { basetime: "20260915140000", validtime: "20260915140000", elements: ["hrpns"] },
  { basetime: "20260915140000", validtime: "20260915140500", elements: ["hrpns"] },
  { basetime: "20260915140000", validtime: "20260915141000", elements: ["hrpns"] }
];
const forecast = [
  { basetime: "20260915130000", validtime: "20260915140000", elements: ["rasrf"] },
  { basetime: "20260915133000", validtime: "20260915140000", elements: ["rasrf"] },
  { basetime: "20260915133000", validtime: "20260915150000", elements: ["rasrf"] },
  { basetime: "20260915133000", validtime: "20260915160000", elements: ["rasrf"] }
];

const tl = buildRainTimeline(nowcast, forecast);
assert(tl.frames[0].sourceType === "nowcast", "starts at current nowcast");
assert(tl.frames[0].validTime === "20260915140000", "current valid");
assert(tl.frames.filter((f) => f.validTime === "20260915140000").length === 1, "no duplicate valid");
assert(tl.frames.find((f) => f.validTime === "20260915140000").sourceType === "nowcast", "overlap prefers nowcast");
assert(tl.frames.find((f) => f.validTime === "20260915150000").sourceType === "forecast", "later uses rasrf");
assert(tl.frames.every((f, i, arr) => !i || f.validTime > arr[i - 1].validTime), "sorted unique");
assert(tl.nowcastAvailable && tl.forecastAvailable, "both sources kept");

const onlyNow = buildRainTimeline(nowcast, []);
assert(onlyNow.frames.every((f) => f.sourceType === "nowcast"), "nowcast-only still plays");
assert(onlyNow.warnings.length >= 1, "warns missing forecast");

const onlyFc = buildRainTimeline([], forecast);
assert(onlyFc.frames.length >= 1 && onlyFc.frames.every((f) => f.sourceType === "forecast"), "forecast-only still plays");
assert(onlyFc.warnings.length >= 1, "warns missing nowcast");

const empty = buildRainTimeline([], []);
assert(empty.frames.length === 0, "empty timeline");

const n1 = await (await fetch("https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json")).json();
const n2 = await (await fetch("https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N2.json")).json();
const rasrf = await (await fetch("https://www.jma.go.jp/bosai/jmatile/data/rasrf/targetTimes.json")).json();
const live = buildRainTimeline([...n1, ...n2], rasrf);
assert(live.frames.length > 8, `live frames ${live.frames.length}`);
assert(live.frames.some((f) => f.sourceType === "nowcast"), "live nowcast present");
assert(live.frames.some((f) => f.sourceType === "forecast"), "live forecast present");
const ids = live.frames.map((f) => f.validTime);
assert(new Set(ids).size === ids.length, "live unique valids");
const switchAt = live.frames.findIndex((f, i, arr) => i && f.sourceType !== arr[i - 1].sourceType);
assert(switchAt > 0, `source switch at ${switchAt}`);

if (failed) {
  console.error(`\n${failed} rain timeline checks failed`);
  process.exit(1);
}
console.log("\nrain timeline checks passed");
