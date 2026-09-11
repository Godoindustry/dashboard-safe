import crypto from "node:crypto";
import { rowsToObjects } from "./data.mjs";

export const SHEETS = {
  inspections: process.env.SHEET_INSPECTIONS_NAME || "Inspeções por Setor",
  dds: process.env.SHEET_DDS_NAME || "DDS",
  absences: process.env.SHEET_ABSENCES_NAME || "Absenteísmo",
  pending: process.env.SHEET_PENDING_NAME || "Pendências",
};

let tokenCache = { token: "", expiresAt: 0 };

function base64url(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

async function serviceAccountToken() {
  if (tokenCache.token && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) throw new Error("Credenciais de leitura do Google Sheets incompletas.");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url({ alg: "RS256", typ: "JWT" })}.${base64url({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), privateKey).toString("base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    signal: AbortSignal.timeout(10000),
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  if (!response.ok) throw new Error("A conta de serviço não conseguiu autenticar no Google.");
  const data = await response.json();
  tokenCache = { token: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

async function fetchPrivateSheets(spreadsheetId) {
  const token = await serviceAccountToken();
  const params = new URLSearchParams({ majorDimension: "ROWS", valueRenderOption: "FORMATTED_VALUE", dateTimeRenderOption: "FORMATTED_STRING" });
  for (const sheet of Object.values(SHEETS)) params.append("ranges", `'${sheet.replaceAll("'", "''")}'!A:Z`);
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params}`, { signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    if (response.status === 403 || response.status === 404) throw new Error("A conta de serviço não tem acesso à planilha. Compartilhe a planilha com o e-mail configurado.");
    throw new Error(`Falha na API Google Sheets (${response.status}).`);
  }
  const body = await response.json();
  const result = {};
  Object.keys(SHEETS).forEach((key, index) => { result[key] = rowsToObjects(body.valueRanges?.[index]?.values || []); });
  return result;
}

function parseGviz(body) {
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("A planilha não está disponível para leitura pública.");
  const json = body.slice(start, end + 1).replace(/("(?:\\.|[^"\\])*")|Date\(\d+,\d+,\d+(?:,\d+,\d+,\d+)?\)/g, (match, quoted) => quoted || JSON.stringify(match));
  const parsed = JSON.parse(json);
  if (parsed.status === "error") throw new Error("O Google recusou a leitura da planilha.");
  const headers = (parsed.table?.cols || []).map((column, index) => column.label || column.id || `Coluna ${index + 1}`);
  return (parsed.table?.rows || []).map((row) => Object.fromEntries(headers.map((header, index) => {
    const cell = row.c?.[index];
    let value = cell?.f ?? cell?.v ?? '';
    if (!cell?.f && typeof value === 'string') {
      const match = value.match(/^Date\((\d+),(\d+),(\d+)/);
      if (match) value = `${match[1]}-${String(+match[2] + 1).padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    }
    return [header, value];
  })));
}

async function fetchPublicSheet(spreadsheetId, sheetName) {
  const params = new URLSearchParams({ tqx: "out:json", headers: "1", sheet: sheetName });
  const response = await fetch(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/gviz/tq?${params}`, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "INTEP-Safety-Dashboard/2.0" } });
  if (!response.ok) throw new Error(`A aba ${sheetName} não pôde ser lida (${response.status}).`);
  return parseGviz(await response.text());
}

async function fetchPublicSheets(spreadsheetId) {
  const entries = await Promise.all(Object.entries(SHEETS).map(async ([key, name]) => [key, await fetchPublicSheet(spreadsheetId, name)]));
  return Object.fromEntries(entries);
}

export async function readWorkbook(spreadsheetId) {
  if (Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) !== Boolean(process.env.GOOGLE_PRIVATE_KEY)) throw new Error('Credenciais Google incompletas. Configure e-mail e chave da conta de serviço.');
  const privateMode = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
  const data = privateMode ? await fetchPrivateSheets(spreadsheetId) : await fetchPublicSheets(spreadsheetId);
  return { data, mode: privateMode ? "service-account" : "public-view" };
}

export { parseGviz };
