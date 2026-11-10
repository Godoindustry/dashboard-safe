// Ponte para o Apps Script instalado na própria planilha (apps-script/Codigo.gs).
// Alternativa à conta de serviço: grava na planilha e guarda arquivos no Drive de quem
// instalou o script, sem chave do Google na Vercel e sem precisar de Google Workspace.

import crypto from "node:crypto";

// Sem GOOGLE_APPS_SCRIPT_TOKEN, o token sai do segredo de sessão que já existe na Vercel:
// o script aceita o primeiro token recebido após a instalação (pareamento) e só ele depois.
function config() {
  const secret = String(process.env.REPORTS_SESSION_SECRET || "");
  const derived = secret.length >= 16 ? crypto.createHmac("sha256", secret).update("safe-apps-script").digest("hex") : "";
  return {
    url: String(process.env.GOOGLE_APPS_SCRIPT_URL || "").trim(),
    token: String(process.env.GOOGLE_APPS_SCRIPT_TOKEN || "").trim() || derived,
  };
}

export function appsScriptConfigured() {
  const { url, token } = config();
  return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url) && token.length >= 16;
}

export function appsScriptProblem() {
  const { url, token } = config();
  if (!url) return "";
  if (!token) return "Configure REPORTS_SESSION_SECRET na Vercel para o dashboard se conectar ao script da planilha.";
  if (!appsScriptConfigured()) return "GOOGLE_APPS_SCRIPT_URL precisa ser o link do App da Web, terminado em /exec.";
  return "";
}

export async function callAppsScript(action, payload = {}, timeout = 30000) {
  const { url, token } = config();
  // O Apps Script responde ao POST com um redirecionamento: o fetch segue como GET e lê a resposta.
  const response = await fetch(url, {
    method: "POST",
    redirect: "follow",
    signal: AbortSignal.timeout(timeout),
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: JSON.stringify({ ...payload, action, token }),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("O script da planilha não respondeu. Confira se a implantação é App da Web com acesso de \"Qualquer pessoa\".");
  }
  if (!data.ok) throw new Error(data.error || "O script da planilha recusou o pedido.");
  return data;
}
