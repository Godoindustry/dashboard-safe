import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduledReportDue, scheduledDateKey } from '../netlify/functions/_shared/report-scheduler.mjs';
import { recordDestination, normalizeRecord } from '../netlify/functions/records.mjs';
import { decodePhoto, validDate } from '../netlify/functions/photos.mjs';
import { parseGvizRows } from '../netlify/functions/_shared/google-sheets.mjs';
import { runLegacyHandler } from '../api/_shared/adapter.mjs';
import { cronAuthorized, isLastDayInSaoPaulo } from '../api/_shared/cron.mjs';

test('agendamento semanal respeita sexta-feira às 16h em São Paulo', () => {
  assert.equal(scheduledReportDue('weekly', new Date('2026-09-25T19:00:00Z')), true);
  assert.equal(scheduledReportDue('weekly', new Date('2026-09-25T18:00:00Z')), false);
  assert.equal(scheduledReportDue('weekly', new Date('2026-09-24T19:00:00Z')), false);
  assert.equal(scheduledDateKey(new Date('2026-09-25T02:00:00Z')), '2026-09-24');
});

test('agendamento mensal roda somente no último dia às 15h em São Paulo', () => {
  assert.equal(scheduledReportDue('monthly', new Date('2026-09-30T18:00:00Z')), true);
  assert.equal(scheduledReportDue('monthly', new Date('2026-09-29T18:00:00Z')), false);
  assert.equal(scheduledReportDue('monthly', new Date('2026-09-30T19:00:00Z')), false);
  assert.equal(scheduledReportDue('monthly', new Date('2028-02-29T18:00:00Z')), true);
});

test('cada frente é gravada na aba estruturada correta', () => {
  assert.equal(recordDestination('actions'), 'pending');
  assert.equal(recordDestination('training'), 'dds');
  assert.equal(recordDestination('machines'), 'inspections');
  const record = normalizeRecord({ front: 'machines', recordId: 'SAFE-20260922-machines-abc123xyz', date: '2026-09-22', sector: 'Produção', description: 'Proteção aberta', status: 'Em aberto', priority: 'Alta', photoUrls: ['https://drive.google.com/file/d/abc/view'] });
  assert.equal(record.values.item, 'Máquinas/Injetoras');
  assert.match(record.values.evidence, /SAFE-20260922-machines-abc123xyz/);
  assert.match(record.values.evidence, /drive\.google\.com/);
});

test('validação de foto rejeita conteúdo disfarçado e datas inválidas', () => {
  assert.equal(validDate('2026-09-22'), '2026-09-22');
  assert.equal(validDate('22/09/2026'), '');
  assert.throws(() => decodePhoto('data:image/jpeg;base64,SGVsbG8='), /não é uma imagem válida/);
  const tinyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
  assert.equal(decodePhoto(`data:image/jpeg;base64,${tinyJpeg}`).mimeType, 'image/jpeg');
});

test('abas livres do Sheets preservam título e cabeçalho como linhas', () => {
  const body = 'google.visualization.Query.setResponse(' + JSON.stringify({ status: 'ok', table: { cols: [{ id: 'A' }, { id: 'B' }], rows: [{ c: [{ v: 'Título' }, null] }, { c: [{ v: 'Atividade' }, { v: 'Status' }] }] } }) + ');';
  assert.deepEqual(parseGvizRows(body), [['Título', ''], ['Atividade', 'Status']]);
});

test('adaptador da Vercel preserva JSON e respostas binárias', async () => {
  const json = await runLegacyHandler(async (event) => ({ statusCode: 201, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: event.httpMethod, query: event.queryStringParameters.x }) }), new Request('https://safe.test/api/test?x=1', { method: 'POST', body: '{}' }));
  assert.equal(json.status, 201);
  assert.deepEqual(await json.json(), { method: 'POST', query: '1' });
  const binary = await runLegacyHandler(async () => ({ statusCode: 200, isBase64Encoded: true, headers: { 'Content-Type': 'image/jpeg' }, body: Buffer.from('foto').toString('base64') }), new Request('https://safe.test/api/foto'));
  assert.equal(Buffer.from(await binary.arrayBuffer()).toString(), 'foto');
});

test('cron da Vercel exige segredo e reconhece o último dia em São Paulo', () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'segredo-de-teste-com-mais-de-16';
  try {
    assert.equal(cronAuthorized(new Request('https://safe.test/api/cron', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })).ok, true);
    assert.equal(cronAuthorized(new Request('https://safe.test/api/cron')).status, 401);
    assert.equal(isLastDayInSaoPaulo(new Date('2026-09-30T18:37:00Z')), true);
    assert.equal(isLastDayInSaoPaulo(new Date('2026-09-29T18:37:00Z')), false);
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous;
  }
});
