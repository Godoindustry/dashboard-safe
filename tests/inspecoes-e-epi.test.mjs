import test from 'node:test';
import assert from 'node:assert/strict';
import { mapEpiInspections, transformWorkbook } from '../netlify/functions/_shared/data.mjs';
import { TYPE_LABELS } from '../dist/assets/filters.js';
import { buildReport } from '../dist/assets/report-model.js';

// Cabeçalhos exatamente como a planilha escreve hoje: "Situação encontra " sem o
// "da", "Prioridades" no plural e a coluna "Situação" separada do "Status".
const inspecao = {
  'Data': '14/09/2026',
  'Setor': 'Produção linha n° 01',
  'Item verificado': 'Máquina n° 07',
  'Situação encontra ': 'Poça de água na máquina',
  'Situação': 'Não conforme',
  'Ação necessária': 'Verificar a causa com o líder',
  'Prioridades': 'Médio',
  'Responsável': 'Líder/Produção',
  'Prazo': 'Imediato',
  'Status': 'Em andamento',
};

test('prioridade da coluna G é lida mesmo com o cabeçalho no plural', () => {
  const dados = transformWorkbook({ inspections: [inspecao] });
  assert.equal(dados.inspections[0].priority, 'Médio');
  assert.equal(dados.inspections[0].condition, 'Poça de água na máquina');
  // "Situação" é a conformidade e não pode ser confundida com o Status.
  assert.equal(dados.inspections[0].conformity, 'Não conforme');
  assert.equal(dados.inspections[0].status, 'Em andamento');
});

test('a prioridade chega ao relatório que gera o PDF', () => {
  const relatorio = buildReport(transformWorkbook({ inspections: [inspecao] }), { type: 'monthly', date: '2026-09', owner: 'Poliana', filters: {} });
  assert.equal(relatorio.data.inspections.length, 1);
  assert.equal(relatorio.data.inspections[0].priority, 'Médio');
});

// Aba Inspeção de EPI: a coluna da data não tem título e o cabeçalho começa em "Nome".
const epiRows = [
  ['', 'Nome ', 'Setor', 'Descrição', 'Ação necessaria ', 'Responsável', 'Prazo', 'Status', 'Observação'],
  ['14/09/2026', 'Gustavo Martins', 'Produção linha n°01', 'Sem viseira facial', 'Orientar o colaborador', 'Leandro', 'imediato', 'ok', ''],
  ['14/09/2026', 'Lara Mariano', 'Produção linha n°02', 'Piercing na boca', 'Orientada a retirar', 'Líder', 'imediato', 'em andameto', ''],
  ['', '', '', '', '', '', '', '', ''],
];

test('inspeção de EPI é lida mesmo com a coluna da data sem título', () => {
  const registros = mapEpiInspections(epiRows);
  assert.equal(registros.length, 2);
  assert.equal(registros[0].date, '14/09/2026');
  assert.equal(registros[0].sector, 'Produção linha n°01');
  assert.equal(registros[0].description, 'Sem viseira facial');
  assert.equal(registros[0].status, 'ok');
});

test('o nome do colaborador fica fora do painel público e só sai no relatório', () => {
  assert.equal(mapEpiInspections(epiRows)[0].name, undefined);
  assert.equal(mapEpiInspections(epiRows, { detail: 'report' })[0].name, 'Gustavo Martins');
  const publico = transformWorkbook({ epi: epiRows });
  assert.equal(publico.epi.length, 2);
  assert.equal(publico.epi[0].name, undefined);
});

test('o relatório recorta a inspeção de EPI pelo período pedido', () => {
  const dados = transformWorkbook({ epi: epiRows }, { detail: 'report' });
  const dentro = buildReport(dados, { type: 'monthly', date: '2026-09', owner: 'Poliana', filters: {} });
  const fora = buildReport(dados, { type: 'monthly', date: '2026-08', owner: 'Poliana', filters: {} });
  assert.equal(dentro.data.epi.length, 2);
  assert.equal(dentro.data.epi[0].name, 'Gustavo Martins');
  assert.equal(fora.data.epi.length, 0);
});

test('o rótulo do tipo passou a ser Absenteísmo', () => {
  assert.equal(TYPE_LABELS.absences, 'Absenteísmo');
});
