import { clearSessionCookie, createSessionCookie, isReportAuthenticated, reportsProtectionEnabled, verifyAccessCode } from "./_shared/auth.mjs";

const attempts = new Map();

function reply(statusCode, body, extraHeaders = {}) {
  return { statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders }, body: JSON.stringify(body) };
}

function clientIp(event) {
  return String(event.headers?.["x-nf-client-connection-ip"] || event.headers?.["x-forwarded-for"] || "unknown").split(",")[0].trim();
}

function tooManyAttempts(event) {
  const key = clientIp(event);
  const now = Date.now();
  const current = attempts.get(key) || { start: now, count: 0 };
  if (now - current.start > 15 * 60 * 1000) { current.start = now; current.count = 0; }
  current.count += 1;
  attempts.set(key, current);
  return current.count > 8;
}

export async function handler(event) {
  if (event.httpMethod === "GET") return reply(200, { protected: reportsProtectionEnabled(), authenticated: isReportAuthenticated(event) });
  if (event.httpMethod === "DELETE") return reply(200, { authenticated: false }, { "Set-Cookie": clearSessionCookie() });
  if (event.httpMethod !== "POST") return reply(405, { error: "Método não permitido." });
  if (!reportsProtectionEnabled()) return reply(200, { protected: false, authenticated: true });
  if (tooManyAttempts(event)) return reply(429, { error: "Muitas tentativas. Aguarde 15 minutos." });
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return reply(400, { error: "Solicitação inválida." }); }
  if (!verifyAccessCode(String(body.code || "").slice(0, 100))) return reply(401, { error: "Código de acesso incorreto." });
  return reply(200, { protected: true, authenticated: true }, { "Set-Cookie": createSessionCookie() });
}
