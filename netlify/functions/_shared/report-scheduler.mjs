import { buildReport } from "../../../dist/assets/report-model.js";
import { getPeriodRange, toDateKey } from "../../../dist/assets/shared.js";
import { createReportPdf } from "../../../src/pdf.js";
import { fileToPhoto, getDriveFile, listDriveFiles, uploadDriveFile } from "./google-drive.mjs";
import { getSnapshot } from "./snapshot.mjs";

const TIME_ZONE = "America/Sao_Paulo";

function localParts(now = new Date()) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now).map((part) => [part.type, part.value]));
}

function nextDateKey(dateKey) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function scheduledReportDue(type, now = new Date()) {
  const parts = localParts(now);
  const key = `${parts.year}-${parts.month}-${parts.day}`;
  if (parts.minute !== "00") return false;
  if (type === "weekly") return parts.weekday === "Fri" && parts.hour === "16";
  return type === "monthly" && parts.hour === "15" && nextDateKey(key).slice(0, 7) !== key.slice(0, 7);
}

export function scheduledDateKey(now = new Date()) {
  const parts = localParts(now);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function automaticNotes(report) {
  const metrics = report.metrics;
  const rate = metrics.resolutionRate === null ? "sem base suficiente para cálculo" : `${metrics.resolutionRate}% de resolução`;
  return `Relatório gerado automaticamente pelo SAFE a partir dos lançamentos do site e da planilha Google. No período foram registrados ${metrics.inspections} inspeção(ões), ${metrics.dds} DDS, ${metrics.actions} pendência(s) acompanhada(s), ${metrics.resolved} resolvida(s) e ${metrics.overdue} com prazo vencido; ${rate}. O conteúdo deve ser revisado e aprovado pela pessoa responsável antes de distribuição externa.`;
}

async function reportPhotos(start, end) {
  const files = (await listDriveFiles({ kind: "photo", start, end, limit: 200 })).slice(0, 12).sort((a, b) => {
    const front = String(a.appProperties?.front || "").localeCompare(String(b.appProperties?.front || ""), "pt-BR");
    return front || String(a.appProperties?.reportDate || "").localeCompare(String(b.appProperties?.reportDate || ""));
  });
  return Promise.all(files.map(async (file) => {
    const photo = fileToPhoto(file);
    const { metadata, bytes } = await getDriveFile(file.id);
    return { ...photo, dataUrl: `data:${metadata.mimeType};base64,${bytes.toString("base64")}` };
  }));
}

export async function generateScheduledReport(type, now = new Date(), { enforceSchedule = true } = {}) {
  if (!['weekly', 'monthly'].includes(type)) throw new Error("Tipo de relatório automático inválido.");
  if (enforceSchedule && !scheduledReportDue(type, now)) return { status: "skipped", reason: "outside-local-schedule" };
  const day = scheduledDateKey(now);
  const selected = type === "monthly" ? day.slice(0, 7) : day;
  const range = getPeriodRange(type, selected);
  const start = toDateKey(range.start), end = toDateKey(range.end);
  const reportKey = `${type}:${start}:${end}`;
  const existing = await listDriveFiles({ kind: "report", reportKey, limit: 1 });
  if (existing.length) return { status: "exists", id: existing[0].id, reportKey };
  const data = await getSnapshot("report");
  const photos = await reportPhotos(start, end);
  let report = buildReport(data, {
    type,
    date: selected,
    owner: process.env.REPORT_OWNER || "Técnica de Segurança do Trabalho",
    filters: {},
    photos,
  });
  report = { ...report, notes: automaticNotes(report), automatic: true };
  const pdf = createReportPdf(report);
  const bytes = Buffer.from(pdf.output("arraybuffer"));
  const label = type === "monthly" ? "Mensal" : "Semanal";
  const uploaded = await uploadDriveFile({
    name: `SAFE_Relatorio_${label}_${start}_${end}.pdf`,
    mimeType: "application/pdf",
    bytes,
    kind: "report",
    reportDate: day,
    reportKey,
    details: { type, period: report.period, start, end, photoCount: photos.length, generatedAt: new Date().toISOString() },
  });
  return { status: "created", id: uploaded.id, name: uploaded.name, reportKey, photoCount: photos.length };
}
