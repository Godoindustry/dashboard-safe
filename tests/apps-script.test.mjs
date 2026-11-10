import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Executa o apps-script/Codigo.gs de verdade, com planilha e Drive em memória,
// e liga o fetch do servidor a ele: o caminho testado é o mesmo da produção.
function fakeGoogle() {
  const props = new Map();
  const sheets = {
    'Inspeções por Setor': [['Data', 'Setor', 'Item verificado', 'Situação encontra ', 'Situação', 'Ação necessária', 'Prioridades', 'Responsável', 'Prazo', 'Status', 'Foto/Evidência', 'Observações'], ['10/09/2026', 'Moinho', 'Telhado']],
    DDS: [['Data', 'Horário', 'Tema do DDS', 'Setor', 'Turno', 'Responsável', 'Participantes', 'Registro realizado?', 'Observações', '', 'Setores'], ['24/08/2026', '08:30', 'EPI', 'Todos'], ['', '', '', '', '', '', '', '', '', '', 'Moinho'], ['', '', '', '', '', '', '', '', '', '', 'Galpão']],
  };
  const files = new Map();
  let created = 0;
  const folder = { getId: () => 'pasta-safe', createFile(blob) {
    const id = `arquivo${String(++created).padStart(8, '0')}`;
    const file = { id, blob, description: '', created: new Date(Date.UTC(2026, 10, 10, 12, created)),
      getId: () => id, getName: () => blob.name, getMimeType: () => blob.mimeType, getSize: () => blob.bytes.length,
      getDateCreated: () => file.created, getUrl: () => `https://drive.google.com/file/d/${id}/view`,
      getDescription: () => file.description, setDescription: (d) => { file.description = d; return file; },
      getBlob: () => ({ getBytes: () => blob.bytes }), getParents: () => iterator([folder]) };
    files.set(id, file);
    return file;
  }, getFiles: () => iterator([...files.values()]) };
  function iterator(list) { let i = 0; return { hasNext: () => i < list.length, next: () => list[i++] }; }
  function range(rows, r, c, nr, nc) {
    return {
      getDisplayValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => String(rows[r - 1 + i]?.[c - 1 + j] ?? ''))),
      setNumberFormat() {},
      setValues(values) { values.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((v, j) => { rows[r - 1 + i][c - 1 + j] = v; }); }); },
    };
  }
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v) }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      base64Decode: (s) => [...Buffer.from(s, 'base64')],
      base64Encode: (b) => Buffer.from(b).toString('base64'),
      newBlob: (bytes, mimeType, name) => ({ bytes, mimeType, name }),
    },
    SpreadsheetApp: { openById: () => ({ getName: () => 'SAFE', getSheetByName: (name) => sheets[name] && {
      getLastRow: () => sheets[name].length,
      getLastColumn: () => Math.max(...sheets[name].map((row) => row.length)),
      getRange: (r, c, nr, nc) => range(sheets[name], r, c, nr, nc),
    } }) },
    DriveApp: { createFolder: () => folder, getFolderById: () => folder, getFileById: (id) => { if (!files.has(id)) throw new Error('não existe'); return files.get(id); } },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text) => ({ setMimeType: () => ({ text }) }) },
    Logger: { log() {} },
    JSON, Math, String, Object, Date, Error,
  };
  return { context, props, sheets, files };
}

test('script da planilha grava registros e fotos pelo mesmo caminho da produção', async () => {
  const google = fakeGoogle();
  vm.createContext(google.context);
  vm.runInContext(await readFile(new URL('../apps-script/Codigo.gs', import.meta.url), 'utf8'), google.context);
  google.context.configurar();
  const token = google.props.get('SAFE_TOKEN');
  assert.ok(token.length >= 32);

  const url = 'https://script.google.com/macros/s/AKfy-teste_123/exec';
  const realFetch = globalThis.fetch;
  const env = { ...process.env };
  globalThis.fetch = async (target, init) => {
    assert.equal(String(target), url);
    return new Response(google.context.doPost({ postData: { contents: init.body } }).text);
  };
  Object.assign(process.env, { GOOGLE_APPS_SCRIPT_URL: url, GOOGLE_APPS_SCRIPT_TOKEN: token, REPORTS_ACCESS_CODE: 'codigo-de-teste-123', REPORTS_SESSION_SECRET: 's'.repeat(32) });
  delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  delete process.env.GOOGLE_PRIVATE_KEY;
  delete process.env.GOOGLE_DRIVE_FOLDER_ID;
  try {
    const auth = await import('../netlify/functions/reports-auth.mjs');
    const setup = JSON.parse((await auth.handler({ httpMethod: 'GET', headers: {} })).body).setup;
    assert.deepEqual([setup.sheet, setup.drive], [true, true]);

    const login = await auth.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ code: 'codigo-de-teste-123' }) });
    const cookie = login.headers['Set-Cookie'].split(';')[0];
    const headers = { cookie };

    const photos = await import('../netlify/functions/photos.mjs');
    const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]).toString('base64')}`;
    const recordId = 'SAFE-20261110-safety-teste123abc';
    const sent = await photos.handler({ httpMethod: 'POST', headers, body: JSON.stringify({ front: 'safety', date: '2026-11-10', recordId, dataUrl: jpeg, caption: 'Piso' }) });
    assert.equal(sent.statusCode, 201, sent.body);
    const photo = JSON.parse(sent.body).photo;
    assert.match(photo.driveUrl, /^https:\/\/drive\.google\.com\//);

    const listed = JSON.parse((await photos.handler({ httpMethod: 'GET', headers, queryStringParameters: { front: 'safety', start: '2026-11-01', end: '2026-11-30' } })).body);
    assert.equal(listed.photos.length, 1);
    assert.equal(listed.photos[0].caption, 'Piso');
    const content = await photos.handler({ httpMethod: 'GET', headers, queryStringParameters: { id: photo.id, content: '1' } });
    assert.equal(content.statusCode, 200);
    assert.deepEqual([...Buffer.from(content.body, 'base64')], [0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);

    const records = await import('../netlify/functions/records.mjs');
    const saved = await records.handler({ httpMethod: 'POST', headers, body: JSON.stringify({ front: 'safety', recordId, date: '2026-11-10', sector: 'Moinho', description: 'Piso escorregadio', status: 'Em aberto', priority: 'Alta', photoUrls: [photo.driveUrl] }) });
    assert.equal(saved.statusCode, 201, saved.body);
    const row = google.sheets['Inspeções por Setor'][2];
    assert.equal(row[0], '2026-11-10');
    assert.equal(row[1], 'Moinho');
    assert.equal(row[3], 'Piso escorregadio');
    assert.match(row[10], new RegExp(`ID: ${recordId}.*drive\\.google\\.com`));

    // DDS tem uma lista de setores na coluna K: o lançamento entra logo após o último DDS.
    const dds = await records.handler({ httpMethod: 'POST', headers, body: JSON.stringify({ front: 'training', recordId: 'SAFE-20261110-training-teste123abc', date: '2026-11-10', sector: 'Moinho', description: 'Ruído', registered: true }) });
    assert.equal(dds.statusCode, 201, dds.body);
    assert.equal(google.sheets.DDS[2][2], 'Ruído');
    assert.equal(google.sheets.DDS[2][10], 'Moinho');

    globalThis.fetch = async (target, init) => new Response(google.context.doPost({ postData: { contents: init.body.replace(token, 'errado') } }).text);
    const refused = await records.handler({ httpMethod: 'POST', headers, body: JSON.stringify({ front: 'safety', recordId, date: '2026-11-10', sector: 'Moinho', description: 'x' }) });
    assert.equal(refused.statusCode, 502);
    assert.match(JSON.parse(refused.body).error, /token do script não confere/);
  } finally {
    globalThis.fetch = realFetch;
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
  }
});
