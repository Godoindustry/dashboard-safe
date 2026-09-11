import { calculateMetrics, formatDate, getPeriodRange, toDateKey } from './shared.js';
import { emptyFilters, filterData, filterDescription, validateFilters } from './filters.js';
export const OBJECTIVE = 'Registrar as condições de segurança identificadas durante o período, indicando os riscos observados e as ações corretivas recomendadas.';
export const REFERENCES = 'O documento-base indica NR-01, NR-11, NR-12, NR-23 e NR-35. A pessoa responsável deve verificar a versão vigente e a aplicabilidade antes da emissão. Esta prévia não atesta conformidade normativa.';
export function buildReport(data, options) {
  const range=getPeriodRange(options.type,options.date);
  const filters=validateFilters({...emptyFilters(),...options.filters,months:[],start:toDateKey(range.start),end:toDateKey(range.end)});
  const records=filterData(data,filters);
  return { type:options.type, title:`RELATÓRIO ${options.type==='monthly'?'MENSAL':'SEMANAL'} DE SEGURANÇA DO TRABALHO`, period:`${formatDate(range.start)} a ${formatDate(range.end)}`, filters, filterLabel:filterDescription(filters), owner:options.owner || 'Não informado', data:records, metrics:calculateMetrics(records), notes:options.notes || '', photos:Array.isArray(options.photos) ? options.photos : [], generatedAt:data.generatedAt, revision:data.revision, demo:options.demo===true, emittedAt:new Date().toISOString() };
}
