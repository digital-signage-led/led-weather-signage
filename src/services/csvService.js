/**
 * CSV一括登録の受け皿。
 * Phase 5 の管理画面から呼ぶ。ここではパースと地域判定までを担当する。
 */

import { resolveSiteLocation } from "./regionResolver.js";

const REQUIRED_COLUMNS = ["siteId", "siteName", "postalCode", "address", "pitch", "screenSize", "templates"];

export function parseSiteCsv(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter((line) => line.trim());
  if (!lines.length) {
    return { ok: [], errors: [{ row: 0, message: "CSVが空です" }] };
  }

  const header = splitCsvLine(lines[0]);
  const missing = REQUIRED_COLUMNS.filter((name) => !header.includes(name));
  if (missing.length) {
    return { ok: [], errors: [{ row: 1, message: `列が不足しています: ${missing.join(", ")}` }] };
  }

  const ok = [];
  const errors = [];

  lines.slice(1).forEach((line, index) => {
    const rowNumber = index + 2;
    const cells = splitCsvLine(line);
    const row = Object.fromEntries(header.map((key, i) => [key, cells[i] || ""]));
    const input = {
      id: row.siteId,
      name: row.siteName,
      postalCode: row.postalCode,
      address: row.address,
      pitch: row.pitch,
      inches: Number(row.screenSize),
      templates: row.templates.split(/[|,]/).map((item) => item.trim()).filter(Boolean),
      active: true
    };
    const resolved = resolveSiteLocation(input);
    if (!resolved.ok) {
      errors.push({ row: rowNumber, siteId: input.id, message: resolved.error });
      return;
    }
    ok.push(resolved.site);
  });

  return { ok, errors, summary: `${ok.length}件 正常 / ${errors.length}件 住所判定エラー` };
}

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  result.push(current.trim());
  return result;
}
