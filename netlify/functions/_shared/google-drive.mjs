import crypto from "node:crypto";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const APP_ID = "dashboard-safe";
let tokenCache = { key: "", token: "", expiresAt: 0 };

function base64url(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

function envConfig() {
  return {
    folderId: String(process.env.GOOGLE_DRIVE_FOLDER_ID || "").trim(),
    sharedDriveId: String(process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID || "").trim(),
    email: String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim(),
    privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n") || "",
    subject: String(process.env.GOOGLE_DRIVE_IMPERSONATE_EMAIL || "").trim(),
    clientId: String(process.env.GOOGLE_DRIVE_CLIENT_ID || "").trim(),
    clientSecret: String(process.env.GOOGLE_DRIVE_CLIENT_SECRET || "").trim(),
    refreshToken: String(process.env.GOOGLE_DRIVE_REFRESH_TOKEN || "").trim(),
  };
}

export function driveConfiguration() {
  const config = envConfig();
  const oauth = Boolean(config.clientId && config.clientSecret && config.refreshToken);
  const serviceAccount = Boolean(config.email && config.privateKey);
  const partialOauth = Boolean(config.clientId || config.clientSecret || config.refreshToken) && !oauth;
  const partialService = Boolean(config.email || config.privateKey) && !serviceAccount;
  if (!config.folderId) return { ready: false, error: "Configure GOOGLE_DRIVE_FOLDER_ID no Netlify." };
  if (partialOauth || partialService) return { ready: false, error: "As credenciais do Google Drive estão incompletas." };
  if (!oauth && !serviceAccount) return { ready: false, error: "Configure uma conta de serviço ou OAuth do Google Drive." };
  if (serviceAccount && !config.sharedDriveId && !config.subject) {
    return { ready: false, error: "Conta de serviço precisa de um Drive compartilhado ou de GOOGLE_DRIVE_IMPERSONATE_EMAIL." };
  }
  return { ready: true, mode: oauth ? "oauth" : "service-account", ...config };
}

async function tokenFromServiceAccount(config) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: config.email,
    scope: DRIVE_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  if (config.subject) claims.sub = config.subject;
  const unsigned = `${base64url({ alg: "RS256", typ: "JWT" })}.${base64url(claims)}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), config.privateKey).toString("base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    signal: AbortSignal.timeout(10000),
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  if (!response.ok) throw new Error("A conta de serviço não conseguiu autenticar no Google Drive.");
  return response.json();
}

async function tokenFromRefreshToken(config) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    signal: AbortSignal.timeout(10000),
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
    }),
  });
  if (!response.ok) throw new Error("O Google Drive recusou a renovação do acesso OAuth.");
  return response.json();
}

async function accessToken() {
  const config = driveConfiguration();
  if (!config.ready) throw new Error(config.error);
  const key = config.mode === "oauth" ? `${config.clientId}:${config.refreshToken.slice(-8)}` : `${config.email}:${config.subject}`;
  if (tokenCache.key === key && tokenCache.token && tokenCache.expiresAt > Date.now() + 60_000) return { token: tokenCache.token, config };
  const data = config.mode === "oauth" ? await tokenFromRefreshToken(config) : await tokenFromServiceAccount(config);
  tokenCache = { key, token: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return { token: tokenCache.token, config };
}

function safeProperty(value, max = 120) {
  return String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}

function queryEscape(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function decodeDescription(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function fileToPhoto(file) {
  const details = decodeDescription(file.description);
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: Number(file.size || 0),
    createdAt: file.createdTime,
    front: file.appProperties?.front || "",
    frontLabel: details.frontLabel || "",
    date: file.appProperties?.reportDate || "",
    recordId: file.appProperties?.recordId || "",
    sector: details.sector || "",
    caption: details.caption || "",
    width: Number(details.width || 0),
    height: Number(details.height || 0),
    contentUrl: `/api/fotos?id=${encodeURIComponent(file.id)}&content=1`,
    driveUrl: file.webViewLink || `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`,
  };
}

async function driveFetch(url, options = {}) {
  const { token } = await accessToken();
  const response = await fetch(url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (response.ok) return response;
  const payload = await response.json().catch(() => ({}));
  const message = payload?.error?.message || `Google Drive indisponível (${response.status}).`;
  if (response.status === 403 || response.status === 404) throw new Error("A pasta do Google Drive não foi encontrada ou não está compartilhada com a credencial configurada.");
  throw new Error(message);
}

export async function listDriveFiles({ kind, front, reportKey, start, end, limit = 100 } = {}) {
  const { config } = await accessToken();
  const clauses = [
    `'${queryEscape(config.folderId)}' in parents`,
    "trashed = false",
    `appProperties has { key='safeApp' and value='${APP_ID}' }`,
  ];
  if (kind) clauses.push(`appProperties has { key='safeKind' and value='${queryEscape(kind)}' }`);
  if (front) clauses.push(`appProperties has { key='front' and value='${queryEscape(front)}' }`);
  if (reportKey) clauses.push(`appProperties has { key='reportKey' and value='${queryEscape(reportKey)}' }`);
  const params = new URLSearchParams({
    q: clauses.join(" and "),
    orderBy: "createdTime desc",
    pageSize: String(Math.min(1000, Math.max(1, Number(limit) || 100))),
    fields: "files(id,name,mimeType,size,createdTime,modifiedTime,description,parents,appProperties,webViewLink)",
    spaces: "drive",
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true",
  });
  if (config.sharedDriveId) {
    params.set("corpora", "drive");
    params.set("driveId", config.sharedDriveId);
  }
  const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?${params}`);
  const files = (await response.json()).files || [];
  return files.filter((file) => {
    const date = file.appProperties?.reportDate || "";
    return (!start || date >= start) && (!end || date <= end);
  });
}

export async function getDriveFile(id) {
  const safeId = String(id || "").trim();
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(safeId)) throw new Error("Arquivo inválido.");
  const metadataResponse = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(safeId)}?supportsAllDrives=true&fields=id,name,mimeType,size,description,parents,appProperties,webViewLink`);
  const metadata = await metadataResponse.json();
  const config = driveConfiguration();
  if (!metadata.parents?.includes(config.folderId) || metadata.appProperties?.safeApp !== APP_ID) throw new Error("Arquivo fora da pasta protegida.");
  const content = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(safeId)}?alt=media&supportsAllDrives=true`);
  return { metadata, bytes: Buffer.from(await content.arrayBuffer()) };
}

export async function uploadDriveFile({ name, mimeType, bytes, kind, front = "", reportDate = "", reportKey = "", recordId = "", details = {} }) {
  const { token, config } = await accessToken();
  const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const metadata = {
    name: safeProperty(name, 180),
    parents: [config.folderId],
    mimeType,
    appProperties: {
      safeApp: APP_ID,
      safeKind: safeProperty(kind, 30),
      front: safeProperty(front, 60),
      reportDate: safeProperty(reportDate, 20),
      reportKey: safeProperty(reportKey, 100),
      recordId: safeProperty(recordId, 100),
    },
    description: JSON.stringify(details).slice(0, 12000),
  };
  const start = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,size,createdTime,description,parents,appProperties,webViewLink", {
    signal: AbortSignal.timeout(20000),
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
      "X-Upload-Content-Type": mimeType,
      "X-Upload-Content-Length": String(payload.length),
    },
    body: JSON.stringify(metadata),
  });
  if (!start.ok) {
    const error = await start.json().catch(() => ({}));
    throw new Error(error?.error?.message || `Não foi possível iniciar o envio ao Google Drive (${start.status}).`);
  }
  const location = start.headers.get("location");
  if (!location) throw new Error("O Google Drive não devolveu o endereço de envio.");
  const uploaded = await fetch(location, {
    signal: AbortSignal.timeout(30000),
    method: "PUT",
    headers: { "Content-Type": mimeType, "Content-Length": String(payload.length) },
    body: payload,
  });
  if (!uploaded.ok) throw new Error(`O envio ao Google Drive falhou (${uploaded.status}).`);
  return uploaded.json();
}
