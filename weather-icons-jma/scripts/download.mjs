/**
 * 気象庁公式SVGをコードごとに取得する。
 * 取れないコードは別アイコンで埋めない。
 *
 *   node scripts/download.mjs
 *   node scripts/download.mjs --csv-only
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WEATHER_LABELS, AVAILABLE_CODES } from "../weather-codes.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = path.join(root, "icons");
const csvOnly = process.argv.includes("--csv-only");

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(name, header, rows) {
  const body = [
    header.join(","),
    ...rows.map((row) => row.map(csvEscape).join(","))
  ].join("\n") + "\n";
  fs.writeFileSync(path.join(root, name), body, "utf8");
}

function writeCodeTables(rows) {
  writeCsv(
    "weather-codes.csv",
    ["天気コード", "天気名称", "SVGパス", "取得結果"],
    rows.map((row) => [row.code, row.label, row.icon || "", row.result])
  );
  writeCsv(
    "download-report.csv",
    ["天気コード", "天気名称", "取得URL", "HTTPステータス", "SVG判定", "ファイルサイズ", "取得日時", "結果", "備考"],
    rows.map((row) => [
      row.code,
      row.label,
      row.url,
      row.status,
      row.svgOk ? "OK" : "NG",
      row.size,
      row.fetchedAt,
      row.result,
      row.note
    ])
  );
}

function looksLikeSvg(text) {
  const trimmed = text.replace(/^\uFEFF/, "").trimStart();
  if (!trimmed.toLowerCase().startsWith("<svg") && !trimmed.toLowerCase().startsWith("<?xml")) return false;
  if (!/<svg[\s>]/i.test(trimmed)) return false;
  if (/<!doctype html|<html[\s>]/i.test(trimmed)) return false;
  return /<\/svg>/i.test(trimmed);
}

async function fetchOne(code, label, fetchedAt) {
  const url = `https://www.jma.go.jp/bosai/forecast/img/${code}.svg`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "weather-icons-jma-local-archive/1.0" }
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const text = buf.toString("utf8");
    const svgOk = res.status === 200 && buf.length > 0 && looksLikeSvg(text);
    const note = [];
    if (res.status !== 200) note.push("HTTPが200ではない");
    if (buf.length === 0) note.push("空ファイル");
    if (res.status === 200 && !looksLikeSvg(text)) note.push("SVGではない、またはHTMLエラーページ");

    const dest = path.join(iconsDir, `${code}.svg`);
    if (svgOk) fs.writeFileSync(dest, buf);
    else if (fs.existsSync(dest)) fs.unlinkSync(dest);

    return {
      code,
      label,
      url,
      status: res.status,
      svgOk,
      size: buf.length,
      fetchedAt,
      result: svgOk ? "成功" : "失敗",
      icon: svgOk ? `./icons/${code}.svg` : "",
      note: note.join(" / ")
    };
  } catch (error) {
    return {
      code,
      label,
      url,
      status: "",
      svgOk: false,
      size: 0,
      fetchedAt,
      result: "失敗",
      icon: "",
      note: `通信エラー: ${error.message}`
    };
  }
}

function updateAvailableCodes(codes) {
  const file = path.join(root, "weather-codes.js");
  const source = fs.readFileSync(file, "utf8");
  const next = `export const AVAILABLE_CODES = new Set([\n  ${codes.map((code) => `"${code}"`).join(", ")}\n]);`;
  const updated = source.replace(/export const AVAILABLE_CODES = new Set\(\[[\s\S]*?\]\);/, next);
  if (updated === source) throw new Error("AVAILABLE_CODES を更新できませんでした");
  fs.writeFileSync(file, updated, "utf8");
}

if (csvOnly) {
  writeCsv(
    "weather-codes.csv",
    ["天気コード", "天気名称", "SVGパス", "取得結果"],
    Object.entries(WEATHER_LABELS).map(([code, label]) => {
      const ok = AVAILABLE_CODES.has(code);
      return [code, label, ok ? `./icons/${code}.svg` : "", ok ? "成功" : "失敗"];
    })
  );
  console.log(`csv-only total=${Object.keys(WEATHER_LABELS).length} ok=${AVAILABLE_CODES.size}`);
  process.exit(0);
}

fs.mkdirSync(iconsDir, { recursive: true });
const fetchedAt = new Date().toISOString().replace("T", " ").slice(0, 19);
const rows = [];

for (const [code, label] of Object.entries(WEATHER_LABELS)) {
  const row = await fetchOne(code, label, fetchedAt);
  rows.push(row);
  console.log(`${row.code} ${row.result} ${row.status} ${row.size} ${row.note}`);
  await new Promise((resolve) => setTimeout(resolve, 80));
}

writeCodeTables(rows);
updateAvailableCodes(rows.filter((row) => row.svgOk).map((row) => row.code));

const ok = rows.filter((row) => row.svgOk).length;
console.log(`DONE total=${rows.length} ok=${ok} ng=${rows.length - ok}`);
