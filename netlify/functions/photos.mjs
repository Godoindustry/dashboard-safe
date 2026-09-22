import { isReportAuthenticated } from "./_shared/auth.mjs";
import { driveConfiguration, fileToPhoto, getDriveFile, listDriveFiles, uploadDriveFile } from "./_shared/google-drive.mjs";
import { FRONT_LABELS, validFront } from "./_shared/fronts.mjs";

const MAX_PHOTO_BYTES = 3_000_000;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function reply(statusCode, body, extraHeaders = {}) {
  return { statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...extraHeaders }, body: JSON.stringify(body) };
}

function protectedReady() {
  return Boolean(process.env.REPORTS_ACCESS_CODE && process.env.REPORTS_SESSION_SECRET);
}

function safeText(value, max) {
  return String(value || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}

function validDate(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T12:00:00Z`)) ? text : "";
}

function decodePhoto(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !ALLOWED_TYPES.has(match[1])) throw new Error("Formato de foto inválido. Use JPEG, PNG ou WebP.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) throw new Error("A foto deve ter no máximo 3 MB após a redução automática.");
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  if (!(jpeg || png || webp)) throw new Error("O conteúdo recebido não é uma imagem válida.");
  return { mimeType: match[1], bytes };
}

export async function handler(event) {
  if (!protectedReady()) return reply(503, { error: "Para proteger as fotos, configure REPORTS_ACCESS_CODE e REPORTS_SESSION_SECRET no Netlify." });
  if (!isReportAuthenticated(event)) return reply(401, { error: "Entre na área de Relatórios para anexar ou visualizar fotos." });
  const drive = driveConfiguration();
  if (!drive.ready) return reply(503, { error: drive.error });
  try {
    if (event.httpMethod === "GET") {
      const query = event.queryStringParameters || {};
      if (query.content === "1") {
        const { metadata, bytes } = await getDriveFile(query.id);
        if (!ALLOWED_TYPES.has(metadata.mimeType)) return reply(415, { error: "Este arquivo não é uma foto aceita." });
        return { statusCode: 200, isBase64Encoded: true, headers: { "Content-Type": metadata.mimeType, "Content-Length": String(bytes.length), "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" }, body: bytes.toString("base64") };
      }
      const front = query.front ? validFront(query.front) : "";
      if (query.front && !front) return reply(400, { error: "Frente de atuação inválida." });
      const start = query.start ? validDate(query.start) : "";
      const end = query.end ? validDate(query.end) : "";
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 24));
      const files = await listDriveFiles({ kind: "photo", front, start, end, limit: Math.max(limit, 100) });
      return reply(200, { photos: files.slice(0, limit).map(fileToPhoto) });
    }
    if (event.httpMethod !== "POST") return reply(405, { error: "Método não permitido." });
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return reply(400, { error: "Solicitação inválida." }); }
    const front = validFront(body.front);
    const date = validDate(body.date);
    if (!front || !date) return reply(400, { error: "Informe a frente e uma data válida para a foto." });
    const { mimeType, bytes } = decodePhoto(body.dataUrl);
    const recordId = safeText(body.recordId, 100);
    if (!/^SAFE-[A-Za-z0-9-]{10,90}$/.test(recordId)) return reply(400, { error: "Identificador do lançamento inválido." });
    const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const uploaded = await uploadDriveFile({
      name: `SAFE_${front}_${date}_${stamp}.${extension}`,
      mimeType,
      bytes,
      kind: "photo",
      front,
      reportDate: date,
      recordId,
      details: {
        frontLabel: FRONT_LABELS[front],
        sector: safeText(body.sector, 120),
        caption: safeText(body.caption, 300),
        originalName: safeText(body.originalName, 160),
        width: Math.max(0, Math.min(10000, Number(body.width) || 0)),
        height: Math.max(0, Math.min(10000, Number(body.height) || 0)),
        uploadedAt: new Date().toISOString(),
        recordId,
      },
    });
    return reply(201, { photo: fileToPhoto(uploaded) });
  } catch (error) {
    return reply(502, { error: error.message || "Não foi possível acessar o Google Drive." });
  }
}

export { decodePhoto, validDate };
