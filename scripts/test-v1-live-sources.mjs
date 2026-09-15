/**
 * 気象庁 bosai タイル／時刻JSONが実際に200で返るか確認する。
 */
const urls = {
  n1: "https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json",
  n2: "https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N2.json",
  n3: "https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N3.json",
  risk: "https://www.jma.go.jp/bosai/jmatile/data/risk/targetTimes.json",
  rasrf: "https://www.jma.go.jp/bosai/jmatile/data/rasrf/targetTimes.json",
  typhoon: "https://www.jma.go.jp/bosai/typhoon/data/targetTc.json",
  forecast: "https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json",
  warning: "https://www.jma.go.jp/bosai/warning/data/warning/130000.json",
  base: "https://www.jma.go.jp/bosai/jmatile/data/map/none/none/none/surf/std/6/57/25.png"
};

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`ok   ${message}`);
}

async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const n1 = await json(urls.n1);
const n2 = await json(urls.n2);
const n3 = await json(urls.n3);
const risk = await json(urls.risk);
const rasrf = await json(urls.rasrf);
ok(`N1 ${n1.length}`);
ok(`N2 ${n2.length}`);
ok(`N3 ${n3.length}`);
ok(`risk ${risk.length}`);
ok(`rasrf ${rasrf.length}`);

const rain = n1.find((t) => t.elements?.includes("hrpns"));
const fcst = n2.find((t) => t.elements?.includes("hrpns") && t.validtime !== t.basetime) || n2[0];
const thunder = n3.find((t) => t.elements?.includes("thns"));
const tornado = n3.find((t) => t.elements?.includes("trns"));
const land = risk.find((t) => t.elements?.includes("land"));
const ras = rasrf.find((t) => t.elements?.includes("rasrf"));
if (!rain || !fcst || !thunder || !tornado || !land || !ras) fail("required elements missing");

const tile = (path) => fetch(path).then((r) => {
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  ok(path.split("/data/")[1] || path);
});

await tile(urls.base);
await tile(`https://www.jma.go.jp/bosai/jmatile/data/nowc/${rain.basetime}/none/${rain.validtime}/surf/hrpns/7/113/50.png`);
await tile(`https://www.jma.go.jp/bosai/jmatile/data/nowc/${fcst.basetime}/none/${fcst.validtime}/surf/hrpns/7/113/50.png`);
await tile(`https://www.jma.go.jp/bosai/jmatile/data/nowc/${thunder.basetime}/none/${thunder.validtime}/surf/thns/6/56/25.png`);
await tile(`https://www.jma.go.jp/bosai/jmatile/data/nowc/${tornado.basetime}/none/${tornado.validtime}/surf/trns/6/56/25.png`);
await tile(`https://www.jma.go.jp/bosai/jmatile/data/risk/${land.basetime}/${land.member || "immed0"}/${land.validtime}/surf/land/7/113/50.png`);
await tile(`https://www.jma.go.jp/bosai/jmatile/data/risk/${land.basetime}/${land.member || "immed0"}/${land.validtime}/surf/inund/7/113/50.png`);
await tile(`https://www.jma.go.jp/bosai/jmatile/data/risk/${land.basetime}/${land.member || "immed0"}/${land.validtime}/surf/flood/7/113/50.png`);
await tile(`https://www.jma.go.jp/bosai/jmatile/data/rasrf/${ras.basetime}/${ras.member || "none"}/${ras.validtime}/surf/rasrf/7/113/50.png`);

const fc = await json(urls.forecast);
const warn = await json(urls.warning);
ok(`forecast series ${fc?.[0]?.timeSeries?.length || 0}`);
ok(`warning keys ${Object.keys(warn || {}).length}`);
await json(urls.typhoon).then((d) => ok(`typhoon ${Array.isArray(d) ? d.length : 0}`));

if (!process.exitCode) console.log("\nv1 live source checks passed");
