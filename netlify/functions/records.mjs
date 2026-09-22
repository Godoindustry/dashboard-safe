import { isReportAuthenticated } from "./_shared/auth.mjs";
import { FRONT_LABELS, validFront } from "./_shared/fronts.mjs";
import { appendSiteRecord } from "./_shared/google-sheets.mjs";
import { invalidateSnapshot } from "./_shared/snapshot.mjs";

const STATUS = new Set(["Em aberto", "Em andamento", "Resolvida", "Cancelada"]);
const PRIORITY = new Set(["Crítica", "Alta", "Média", "Baixa", "Não informada"]);

function reply(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }, body: JSON.stringify(body) };
}

function safe(value, max = 500) {
  return String(value || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}

function date(value) {
  const text = safe(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T12:00:00Z`)) ? text : "";
}

function protectedReady() {
  return Boolean(process.env.REPORTS_ACCESS_CODE && process.env.REPORTS_SESSION_SECRET);
}

export function recordDestination(front) {
  if (front === "actions") return "pending";
  if (front === "training") return "dds";
  return "inspections";
}

export function normalizeRecord(body) {
  const front = validFront(body.front);
  const recordDate = date(body.date);
  const sector = safe(body.sector, 120);
  const description = safe(body.description, 1000);
  if (!front || !recordDate || !sector || !description) throw new Error("Preencha frente, data, setor e descrição do registro.");
  const photoUrls = Array.isArray(body.photoUrls) ? body.photoUrls.map((url) => safe(url, 500)).filter((url) => /^https:\/\/drive\.google\.com\//.test(url)).slice(0, 8) : [];
  const status = STATUS.has(body.status) ? body.status : "Em aberto";
  const priority = PRIORITY.has(body.priority) ? body.priority : "Não informada";
  const registered = body.registered === true ? "Sim" : "Não";
  const recordId = safe(body.recordId, 100);
  if (!/^SAFE-[A-Za-z0-9-]{10,90}$/.test(recordId)) throw new Error("Identificador do lançamento inválido.");
  return {
    front,
    sheetKey: recordDestination(front),
    values: {
      date: recordDate,
      time: safe(body.time, 8),
      sector,
      item: FRONT_LABELS[front],
      description,
      topic: description,
      risk: safe(body.risk, 500),
      action: safe(body.action, 1000),
      due: date(body.due),
      status,
      priority,
      conformity: safe(body.conformity, 80),
      owner: safe(body.owner, 160),
      evidence: [`ID: ${recordId}`, ...photoUrls].join(" | "),
      notes: [`ID do lançamento: ${recordId}`, safe(body.notes, 1400)].filter(Boolean).join(" · "),
      origin: `Site · ${FRONT_LABELS[front]} · ${recordId}`,
      shift: safe(body.shift, 80),
      participants: Math.max(0, Math.min(10000, Number(body.participants) || 0)) || "",
      registered,
    },
  };
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return reply(405, { error: "Método não permitido." });
  if (!protectedReady()) return reply(503, { error: "Para proteger os lançamentos, configure REPORTS_ACCESS_CODE e REPORTS_SESSION_SECRET no Netlify." });
  if (!isReportAuthenticated(event)) return reply(401, { error: "Entre na área de Relatórios antes de registrar dados." });
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) return reply(503, { error: "Configure a conta de serviço Google para gravar na planilha." });
  try {
    const parsed = JSON.parse(event.body || "{}");
    const record = normalizeRecord(parsed);
    await appendSiteRecord(process.env.GOOGLE_SHEET_ID, record.sheetKey, record.values);
    invalidateSnapshot();
    return reply(201, { saved: true, destination: record.sheetKey, front: record.front });
  } catch (error) {
    const validation = /Preencha|inválid/i.test(error.message);
    return reply(validation ? 400 : 502, { error: error.message || "Não foi possível gravar o registro na planilha." });
  }
}
