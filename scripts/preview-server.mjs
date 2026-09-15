import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publishDisplay, waitForPagesVersion } from "./publish-display.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 5173);
const defaultsPath = path.join(root, "data", "layout-defaults.json");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png"
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function mergeDefaults(base, patch) {
  const out = {
    rev: Math.max(Number(base.rev) || 0, Number(patch.rev) || 0, Date.now()),
    layouts: { ...(base.layouts || {}) },
    cardScales: { ...(base.cardScales || {}) },
    titleScales: { ...(base.titleScales || {}) }
  };
  for (const [regionId, regionDef] of Object.entries(patch.layouts || {})) {
    const prev = out.layouts[regionId] || { viewports: {} };
    out.layouts[regionId] = {
      viewports: {
        ...(prev.viewports || {}),
        ...(regionDef.viewports || {})
      }
    };
  }
  Object.assign(out.cardScales, patch.cardScales || {});
  Object.assign(out.titleScales, patch.titleScales || {});
  return out;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);

  if (req.method === "OPTIONS" && urlPath.startsWith("/api/")) {
    res.writeHead(204, {
      "access-control-allow-origin": req.headers.origin || "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "POST, GET, OPTIONS"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && urlPath === "/api/publish-status") {
    const manifest = readJson(path.join(root, "data", "display", "manifest.json"), {});
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify({ ok: true, manifest }));
    return;
  }

  if (req.method === "POST" && urlPath === "/api/publish") {
    try {
      const secret = process.env.LED_PUBLISH_SECRET || "";
      const auth = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      if (!secret || auth !== secret) {
        res.writeHead(401, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "認証が必要です。管理者パスワードを確認してください。" }));
        return;
      }
      const body = JSON.parse((await readBody(req)) || "{}");
      const result = publishDisplay({
        contentId: body.content_id,
        scope: body.scope || "content",
        prefId: body.pref_id,
        stationId: body.station_id,
        layer: body.layer || {},
        baseVersion: body.base_version,
        publisher: body.publisher || "studio"
      });
      const deploy = await waitForPagesVersion(result.pages_wait_version || undefined, 120000).catch(() => ({ ok: false }));
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify({
        ...result,
        deploy_ok: deploy.ok === true,
        pages_checked: true
      }));
    } catch (error) {
      const code = error?.code === "CONFLICT" ? 409 : error?.code === "INVALID" ? 400 : 500;
      res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        ok: false,
        error: String(error?.message || error),
        code: error?.code || "ERROR",
        currentVersion: error?.currentVersion
      }));
    }
    return;
  }

  if (req.method === "POST" && urlPath === "/api/layout-defaults") {
    try {
      const raw = await readBody(req);
      const patch = JSON.parse(raw || "{}");
      const current = readJson(defaultsPath, { layouts: {}, cardScales: {}, titleScales: {} });
      const merged = mergeDefaults(current, patch);
      fs.writeFileSync(defaultsPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: String(error?.message || error) }));
    }
    return;
  }

  const relative = urlPath === "/" || urlPath === "/view" ? "index.html" : urlPath.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(root, relative));
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, {
      "content-type": TYPES[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`LED preview: http://127.0.0.1:${port}/`);
});
