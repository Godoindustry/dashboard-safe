export const COLORS = {
  navy: "#10253f",
  blue: "#2878b5",
  cyan: "#3aa6a0",
  yellow: "#f5b82e",
  red: "#d94b4b",
  gray: "#9aa8b6",
};

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  if (typeof value === "number") {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return Number.isNaN(date.valueOf()) ? null : new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
  const text = String(value).trim();
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (!br && !iso) return null;
  const [y, m, d] = br ? [+br[3], +br[2], +br[1]] : [+iso[1], +iso[2], +iso[3]];
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

export function toDateKey(value) {
  const date = parseDate(value);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function monthKey(value) {
  return toDateKey(value).slice(0, 7);
}

export function monthLabel(key, compact = false) {
  const match = String(key).match(/^(\d{4})-(\d{2})$/);
  if (!match) return key || "Sem data";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return new Intl.DateTimeFormat("pt-BR", compact ? { month: "short", year: "2-digit" } : { month: "long", year: "numeric" }).format(date);
}

export function formatDate(value) {
  const date = parseDate(value);
  return date ? new Intl.DateTimeFormat("pt-BR").format(date) : "-";
}

export function statusBucket(value) {
  const status = normalizeText(value);
  if (/cancelad|nao aplic/.test(status)) return "cancelled";
  if (/nao |pendente|abert|aguard/.test(status)) return "open";
  if (/resolvid|concluid|finaliz|fechad|^ok$/.test(status)) return "resolved";
  if (/andamento|tratamento|execucao|iniciad/.test(status)) return "progress";
  if (/cancelad|nao aplic/.test(status)) return "cancelled";
  return "open";
}

export function priorityBucket(value) {
  const priority = normalizeText(value);
  if (/critic/.test(priority)) return "critical";
  if (/alt/.test(priority)) return "high";
  if (/medi/.test(priority)) return "medium";
  if (/baix/.test(priority)) return "low";
  return "unknown";
}

export function isOverdue(record, now = new Date()) {
  const due = parseDate(record.due);
  if (!due || ["resolved", "cancelled"].includes(statusBucket(record.status))) return false;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(p => [p.type, p.value]));
  return toDateKey(due) < `${parts.year}-${parts.month}-${parts.day}`;
}

export function recordMonth(record, type) {
  if (type === "inspections") return monthKey(record.date);
  if (type === "dds") return monthKey(record.date);
  if (type === "absences") return monthKey(record.interviewDate || record.absenceDate);
  return monthKey(record.date);
}

export function filterDataByMonths(data, selectedMonths) {
  const set = selectedMonths instanceof Set ? selectedMonths : new Set(selectedMonths || []);
  if (!set.size) return data;
  const filter = (records, type) => records.filter((record) => {
    const key = recordMonth(record, type);
    return set.has(key || "undated");
  });
  return {
    ...data,
    inspections: filter(data.inspections || [], "inspections"),
    dds: filter(data.dds || [], "dds"),
    absences: filter(data.absences || [], "absences"),
    pending: filter(data.pending || [], "pending"),
  };
}

export function calculateMetrics(data) {
  const actions = data.pending || [];
  const resolved = actions.filter((item) => statusBucket(item.status) === "resolved").length;
  const progress = actions.filter((item) => statusBucket(item.status) === "progress").length;
  const open = actions.filter((item) => statusBucket(item.status) === "open").length;
  const actionable = resolved + progress + open;
  const critical = actions.filter((item) => {
    const p = priorityBucket(item.priority);
    return !["resolved", "cancelled"].includes(statusBucket(item.status)) && (p === "critical" || p === "high");
  }).length;
  const participants = (data.dds || []).reduce((sum, item) => sum + (Number(item.participants) || 0), 0);
  const absenceDays = (data.absences || []).reduce((sum, item) => sum + (Number(item.days) || 0), 0);
  return {
    inspections: (data.inspections || []).length,
    dds: (data.dds || []).length,
    interviews: (data.absences || []).length,
    participants,
    absenceDays,
    actions: actionable,
    resolved,
    progress,
    open,
    critical,
    overdue: actions.filter((item) => isOverdue(item)).length,
    resolutionRate: actionable ? Math.round((resolved / actionable) * 100) : null,
  };
}

export async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 12000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, headers: { Accept: "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `Falha na requisição (${response.status})`);
      error.status = response.status;
      error.retryAfter = Number(response.headers.get("Retry-After")) || 0;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export function getPeriodRange(type, value) {
  const base = parseDate(/^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value) || new Date();
  if (type === "monthly") {
    return {
      start: new Date(base.getFullYear(), base.getMonth(), 1),
      end: new Date(base.getFullYear(), base.getMonth() + 1, 0),
    };
  }
  const day = base.getDay() || 7;
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate() - day + 1);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { start, end };
}

export function isWithin(value, start, end) {
  const date = parseDate(value);
  if (!date) return false;
  const time = new Date(date.getFullYear(), date.getMonth(), date.getDate()).valueOf();
  return time >= start.valueOf() && time <= end.valueOf();
}
