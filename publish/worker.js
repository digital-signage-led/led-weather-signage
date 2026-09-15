/**
 * 任意の Cloudflare Worker。Secret: ADMIN_PASSWORD, GITHUB_TOKEN
 * クライアントへ Secret は返さない。
 */
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors() });
    }
    if (request.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
    const auth = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!env.ADMIN_PASSWORD || auth !== env.ADMIN_PASSWORD) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    return json({
      ok: false,
      error: "このWorkerは雛形です。本番はローカル preview-server の /api/publish を使用してください。"
    }, 501);
  }
};

function cors() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "POST, OPTIONS"
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors() }
  });
}
