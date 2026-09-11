import { normalizeText, recordMonth, toDateKey, statusBucket, priorityBucket, isOverdue } from './shared.js';
export const TYPES = ['inspections', 'pending', 'dds', 'absences'];
export const TYPE_LABELS = { inspections: 'Inspeções', pending: 'Pendências', dds: 'DDS', absences: 'Ausências' };
export const STATUS_LABELS = { open: 'Em aberto', progress: 'Em andamento', resolved: 'Resolvida', cancelled: 'Cancelada' };
export const PRIORITY_LABELS = { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa', unknown: 'Não informada' };
export function emptyFilters() { return { months: [], sector: '', status: '', priority: '', search: '', start: '', end: '', overdue: false, shift: '', registered: '' }; }
export function recordDate(row, type) { return type === 'absences' ? row.interviewDate || row.absenceDate : row.date; }
export function validateFilters(input = {}) {
  const f = emptyFilters();
  for (const key of ['sector', 'search', 'shift']) if (typeof input[key] === 'string') f[key] = input[key].slice(0, 160);
  f.months = Array.isArray(input.months) ? [...new Set(input.months.filter(m => typeof m === 'string' && (/^\d{4}-(0[1-9]|1[0-2])$/.test(m) || m === 'undated')))].slice(0, 120) : [];
  for (const key of ['start', 'end']) f[key] = toDateKey(input[key]);
  f.status = Object.hasOwn(STATUS_LABELS, input.status) ? input.status : '';
  f.priority = Object.hasOwn(PRIORITY_LABELS, input.priority) ? input.priority : '';
  f.overdue = input.overdue === true;
  f.registered = ['yes', 'no'].includes(input.registered) ? input.registered : '';
  return f;
}
export function filterData(data, input = {}) {
  const f = validateFilters(input);
  return Object.fromEntries(TYPES.map(type => [type, (data?.[type] || []).filter(row => {
    const date = toDateKey(recordDate(row, type));
    if (f.months.length && !f.months.includes(recordMonth(row, type) || 'undated')) return false;
    if (f.start && (!date || date < f.start)) return false;
    if (f.end && (!date || date > f.end)) return false;
    // Contém, não igual: a planilha registra setores combinados ("Montagem, embarque, Logística"),
    // e a lista suspensa oferece cada setor separadamente.
    if (f.sector && !normalizeText(row.sector || 'Sem setor').includes(normalizeText(f.sector))) return false;
    if (f.search && !normalizeText(Object.values(row).join(' ')).includes(normalizeText(f.search))) return false;
    const action = ['inspections', 'pending'].includes(type);
    if (f.status && (!action || statusBucket(row.status) !== f.status)) return false;
    if (f.priority && (!action || priorityBucket(row.priority) !== f.priority)) return false;
    if (f.overdue && (!action || !isOverdue(row))) return false;
    if (f.shift && (type !== 'dds' || normalizeText(row.shift) !== normalizeText(f.shift))) return false;
    if (f.registered && (type !== 'dds' || row.registered !== (f.registered === 'yes'))) return false;
    return true;
  })]));
}
export function flattenRecords(data) { return TYPES.flatMap(type => (data[type] || []).map((row, index) => ({ ...row, type, rowKey: `${type}-${index}`, recordDate: toDateKey(recordDate(row, type)) }))); }
export function sortRecords(rows, sort = 'date-desc') {
  const copy = [...rows];
  if (sort === 'sector') return copy.sort((a, b) => String(a.sector).localeCompare(String(b.sector), 'pt-BR'));
  if (sort === 'due') return copy.sort((a, b) => (toDateKey(a.due) || '9999').localeCompare(toDateKey(b.due) || '9999'));
  if (sort === 'priority') { const rank = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 }; return copy.sort((a, b) => rank[priorityBucket(a.priority)] - rank[priorityBucket(b.priority)]); }
  return copy.sort((a, b) => (a.recordDate || '').localeCompare(b.recordDate || '') * (sort === 'date-asc' ? 1 : -1));
}
export function filterDescription(f) {
  return [f.months?.length ? `Meses: ${f.months.join(', ')}` : 'Todos os meses', f.sector && `Setor: ${f.sector}`, f.status && `Status: ${STATUS_LABELS[f.status]}`, f.priority && `Prioridade: ${PRIORITY_LABELS[f.priority]}`, f.start && `De: ${f.start}`, f.end && `Até: ${f.end}`, f.overdue && 'Somente vencidas', f.shift && `Turno: ${f.shift}`, f.registered && `DDS registrado: ${f.registered === 'yes' ? 'sim' : 'não'}`, f.search && `Busca: ${f.search}`].filter(Boolean).join(' · ');
}
export function validateActions(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).flatMap(action => {
    if (!action || typeof action !== 'object') return [];
    if (action.type === 'set_filters') return [{ type: action.type, filters: validateFilters(action.filters) }];
    if (action.type === 'set_theme' && ['light', 'dark'].includes(action.theme)) return [{ type: action.type, theme: action.theme }];
    if (action.type === 'set_sort' && ['date-desc', 'date-asc', 'sector', 'due', 'priority'].includes(action.sort)) return [{ type: action.type, sort: action.sort }];
    if (action.type === 'set_source' && ['all', ...TYPES].includes(action.source)) return [{ type: action.type, source: action.source }];
    if (['reset_filters', 'refresh', 'open_reports'].includes(action.type)) return [{ type: action.type }];
    return [];
  });
}
