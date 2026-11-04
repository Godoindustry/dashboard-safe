import test from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage para ambiente node
const memoryStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => memoryStorage.get(key) ?? null,
  setItem: (key, val) => memoryStorage.set(key, String(val)),
  removeItem: (key) => memoryStorage.delete(key),
  clear: () => memoryStorage.clear(),
};

import {
  saveFrontDraft,
  getFrontDraft,
  clearFrontDraft,
  hasFrontDraft,
  saveReportToHistory,
  listSavedReports,
  getSavedReport,
  deleteSavedReport,
  saveLocalRecord,
  listLocalRecords,
  saveLocalPhotos,
  listLocalPhotos,
  removeLocalRecord,
  listDraftPhotos,
  putDraftPhoto,
  removeDraftPhoto,
  clearDraftPhotos,
  migrateDraftPhotos
} from '../dist/assets/storage.js';

test('rascunhos de frentes mantêm fotos e dados salvos no cache', () => {
  memoryStorage.clear();
  assert.equal(hasFrontDraft('safety'), false);

  const draftData = {
    front: 'safety',
    sector: 'Produção',
    description: 'Vazamento de óleo perto da injetora',
    photos: [
      { id: 'p1', name: 'oleo.jpg', dataUrl: 'data:image/jpeg;base64,1234' }
    ]
  };

  saveFrontDraft('safety', draftData);
  assert.equal(hasFrontDraft('safety'), true);

  const retrieved = getFrontDraft('safety');
  assert.equal(retrieved.sector, 'Produção');
  assert.equal(retrieved.photos.length, 1);
  assert.equal(retrieved.photos[0].name, 'oleo.jpg');

  clearFrontDraft('safety');
  assert.equal(hasFrontDraft('safety'), false);
  assert.equal(getFrontDraft('safety'), null);
});

test('histórico de relatórios guarda relatórios diários e suas fotos para acesso posterior', () => {
  memoryStorage.clear();
  assert.equal(listSavedReports().length, 0);

  const mockReport = {
    id: 'rep-daily-01',
    type: 'daily',
    title: 'RELATÓRIO DIÁRIO DE SEGURANÇA DO TRABALHO',
    period: '23/10/2026',
    owner: 'Técnica de Segurança',
    notes: 'Rotina cumprida sem acidentes.',
    metrics: { inspections: 3, dds: 1, resolved: 2 },
    data: { inspections: [{ sector: 'Moinho' }], pending: [], dds: [] },
    photos: [
      { id: 'f1', name: 'foto1.jpg', dataUrl: 'data:image/jpeg;base64,abc' }
    ]
  };

  saveReportToHistory(mockReport);
  const list = listSavedReports();
  assert.equal(list.length, 1);
  assert.equal(list[0].type, 'daily');
  assert.equal(list[0].period, '23/10/2026');
  assert.equal(list[0].photos.length, 1);

  const single = getSavedReport('rep-daily-01');
  assert.ok(single);
  assert.equal(single.title, 'RELATÓRIO DIÁRIO DE SEGURANÇA DO TRABALHO');

  deleteSavedReport('rep-daily-01');
  assert.equal(listSavedReports().length, 0);
});

test('registros e fotos locais ficam gravados para frentes quando sem servidor remoto', () => {
  memoryStorage.clear();
  saveLocalRecord({ front: 'epi', sector: 'Usinagem', condition: 'Uso de protetor auricular' });
  const records = listLocalRecords('epi');
  assert.equal(records.length, 1);
  assert.equal(records[0].sector, 'Usinagem');

  saveLocalPhotos([{ front: 'epi', name: 'epi_inspecao.jpg', dataUrl: 'data:image/jpeg;base64,xyz' }]);
  const photos = listLocalPhotos('epi');
  assert.equal(photos.length, 1);
  assert.equal(photos[0].name, 'epi_inspecao.jpg');
});

test('as 20 fotos do rascunho ficam separadas por frente e na ordem em que entraram', async () => {
  const silenciar = console.warn;
  console.warn = () => {};
  try {
    for (let index = 0; index < 20; index++) await putDraftPhoto({ id: `f${index}`, front: 'fire', addedAt: index, dataUrl: 'x'.repeat(500000) });
    await putDraftPhoto({ id: 'outra', front: 'epi', addedAt: 1 });
    assert.equal((await listDraftPhotos('fire')).length, 20);
    assert.equal((await listDraftPhotos('fire'))[19].id, 'f19');
    await removeDraftPhoto('f0');
    assert.equal((await listDraftPhotos('fire')).length, 19);
    await clearDraftPhotos('fire');
    assert.equal((await listDraftPhotos('fire')).length, 0);
    assert.equal((await listDraftPhotos('epi')).length, 1);
    await clearDraftPhotos('epi');
  } finally {
    console.warn = silenciar;
  }
});

test('rascunho antigo com fotos no localStorage é migrado sem perder os campos', async () => {
  const silenciar = console.warn;
  console.warn = () => {};
  memoryStorage.clear();
  const realGet = globalThis.localStorage;
  globalThis.localStorage = { ...realGet, get length() { return memoryStorage.size; }, key: (index) => [...memoryStorage.keys()][index] ?? null };
  try {
    saveFrontDraft('fire', { sector: 'Moinho', photos: [{ id: 'antiga', name: 'a.jpg', dataUrl: 'data:image/jpeg;base64,abc' }] });
    await migrateDraftPhotos();
    assert.equal(getFrontDraft('fire').sector, 'Moinho');
    assert.equal(getFrontDraft('fire').photos, undefined);
    assert.equal((await listDraftPhotos('fire'))[0].id, 'antiga');
    await clearDraftPhotos('fire');
  } finally {
    globalThis.localStorage = realGet;
    console.warn = silenciar;
  }
});

test('registro enviado sai do aparelho junto com as fotos dele', () => {
  memoryStorage.clear();
  saveLocalRecord({ recordId: 'SAFE-1', front: 'epi' });
  saveLocalRecord({ recordId: 'SAFE-2', front: 'epi' });
  saveLocalPhotos([{ id: 'a', recordId: 'SAFE-1' }, { id: 'b', recordId: 'SAFE-2' }]);
  removeLocalRecord('SAFE-1');
  assert.deepEqual(listLocalRecords().map((record) => record.recordId), ['SAFE-2']);
  assert.deepEqual(listLocalPhotos().map((photo) => photo.id), ['b']);
});

test('histórico cheio tira as imagens que estão no Drive antes de recusar', () => {
  memoryStorage.clear();
  const real = globalThis.localStorage;
  globalThis.localStorage = { ...real, setItem: (key, value) => { if (String(value).length > 2000) throw new Error('quota'); real.setItem(key, value); } };
  try {
    const entry = saveReportToHistory({ id: 'rep-1', title: 'T', photos: [{ id: 'f', contentUrl: '/api/fotos?id=1', dataUrl: `data:image/jpeg;base64,${'a'.repeat(3000)}` }] });
    assert.equal(entry.id, 'rep-1');
    assert.equal(listSavedReports()[0].photos[0].dataUrl, '');
    assert.equal(listSavedReports()[0].photos[0].contentUrl, '/api/fotos?id=1');
  } finally {
    globalThis.localStorage = real;
  }
});

test('o site informa o que falta configurar sem revelar valores', async () => {
  const { handler } = await import('../netlify/functions/reports-auth.mjs');
  const nomes = ['REPORTS_ACCESS_CODE', 'REPORTS_SESSION_SECRET', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'GOOGLE_SHEET_ID', 'GOOGLE_DRIVE_FOLDER_ID'];
  const antes = Object.fromEntries(nomes.map((nome) => [nome, process.env[nome]]));
  try {
    nomes.forEach((nome) => delete process.env[nome]);
    let body = JSON.parse((await handler({ httpMethod: 'GET', headers: {} })).body);
    assert.equal(body.writeEnabled, false);
    assert.equal(body.setup.sheet, false);
    assert.match(body.setup.driveError, /GOOGLE_DRIVE_FOLDER_ID/);

    Object.assign(process.env, { REPORTS_ACCESS_CODE: 'codigo-secreto-123456', REPORTS_SESSION_SECRET: 's'.repeat(32), GOOGLE_SERVICE_ACCOUNT_EMAIL: 'conta@teste', GOOGLE_PRIVATE_KEY: 'chave-secreta', GOOGLE_SHEET_ID: 'planilha' });
    const raw = (await handler({ httpMethod: 'GET', headers: {} })).body;
    body = JSON.parse(raw);
    assert.equal(body.writeEnabled, true);
    assert.equal(body.setup.sheet, true);
    assert.equal(body.setup.drive, false);
    assert.ok(!raw.includes('chave-secreta') && !raw.includes('codigo-secreto'));
  } finally {
    for (const [nome, valor] of Object.entries(antes)) {
      if (valor === undefined) delete process.env[nome];
      else process.env[nome] = valor;
    }
  }
});
