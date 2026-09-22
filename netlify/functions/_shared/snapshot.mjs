import { createHash } from 'node:crypto';
import { readWorkbook } from './google-sheets.mjs';
import { containsSensitiveAbsenceFields, transformWorkbook } from './data.mjs';
let cached, inFlight;
export function invalidateSnapshot() { cached = undefined; }
export async function getSnapshot(detail = 'public') {
  if (!cached || Date.now() - cached.time >= 10000) {
    if (!inFlight) inFlight = readWorkbook(process.env.GOOGLE_SHEET_ID || '1BcHzuaOFOm2MMs11l-BNBzMmlnzdHdPrnhSnIPk7z30')
      .then(source => { cached = { ...source, time: Date.now() }; }).finally(() => { inFlight = null; });
    await inFlight;
  }
  const data = transformWorkbook(cached.data, { detail });
  if (containsSensitiveAbsenceFields(data)) throw new Error('Falha na proteção dos dados pessoais.');
  const count = ['inspections', 'dds', 'pending', 'absences'].reduce((sum, key) => sum + data[key].length, 0);
  const revision = createHash('sha256').update(JSON.stringify(cached.data)).digest('hex').slice(0, 24);
  return { ...data, revision, generatedAt: new Date(cached.time).toISOString(), source: cached.mode, message: count ? 'Google Sheets conectado. Edição dos dados feita na planilha.' : 'Planilha conectada, ainda sem lançamentos nas abas de dados.' };
}
