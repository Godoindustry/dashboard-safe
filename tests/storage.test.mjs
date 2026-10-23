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
  listLocalPhotos
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
