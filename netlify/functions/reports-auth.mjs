import { driveConfiguration } from "./_shared/google-drive.mjs";
import { appsScriptConfigured, appsScriptProblem, callAppsScript } from "./_shared/apps-script.mjs";
import { sheetWriteReady } from "./_shared/google-sheets.mjs";
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

// Só diz o que falta configurar, nunca os valores: o site avisa antes de a pessoa preencher tudo.
function setupStatus() {
  const drive = driveConfiguration();
  return {
    sheet: sheetWriteReady() && !appsScriptProblem(),
    sheetError: appsScriptProblem(),
    drive: drive.ready,
    driveError: drive.ready ? "" : drive.error,
  };
}

export async function handler(event) {
  if (event.httpMethod === "GET") {
    const setup = setupStatus();
    // ?verificar=1 chama o script de verdade (e faz o pareamento na primeira vez).
    if (event.queryStringParameters?.verificar === "1" && appsScriptConfigured()) {
      try {
        await callAppsScript("ping", {}, 20000);
        setup.script = "ok";
      } catch (error) {
        setup.script = error.message;
      }
    }
    return reply(200, { protected: reportsProtectionEnabled(), authenticated: isReportAuthenticated(event), writeEnabled: Boolean(process.env.REPORTS_ACCESS_CODE && process.env.REPORTS_SESSION_SECRET), setup });
  }
  if (event.httpMethod === "DELETE") return reply(200, { authenticated: false }, { "Set-Cookie": clearSessionCookie() });
  if (event.httpMethod !== "POST") return reply(405, { error: "Método não permitido." });
  if (!reportsProtectionEnabled()) return reply(200, { protected: false, authenticated: true, writeEnabled: false });
  if (tooManyAttempts(event)) return reply(429, { error: "Muitas tentativas. Aguarde 15 minutos." });
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return reply(400, { error: "Solicitação inválida." }); }
  if (!verifyAccessCode(String(body.code || "").slice(0, 100))) return reply(401, { error: "Código de acesso incorreto." });
  return reply(200, { protected: true, authenticated: true, writeEnabled: Boolean(process.env.REPORTS_SESSION_SECRET) }, { "Set-Cookie": createSessionCookie() });
}
