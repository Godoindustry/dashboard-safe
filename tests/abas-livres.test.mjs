import test from 'node:test';
import assert from 'node:assert/strict';
import { mapDailyIndicator, mapMonthlySummary, transformWorkbook } from '../netlify/functions/_shared/data.mjs';

// Linhas reais da aba Indicativo Diário: título, identificação, cabeçalho na 3ª linha
// e a coluna Período mesclada (vem vazia nas linhas seguintes).
const diario = [
  ['INDICATIVO DIÁRIO DE ATIVIDADES – SEGURANÇA DO TRABALHO', '', '', '', '', '', ''],
  ['Empresa: SAFE', '', '', 'Responsável:', '', 'Data:', '____/____/______'],
  ['Período', 'Horário', 'Atividade', 'Setor', 'Detalhamento', 'Status', 'Observações'],
  ['Manhã (08:00 - 09:00)', '08:00–09:00', 'Organização do dia', 'Geral', 'Verificar pendências', 'ok', 'Email para o RH'],
  ['Manhã (09:00 - 11:40)', '09:00 - 09:15', 'Inspeção dos EPIS', '', '', '', ''],
  ['', '09:15 - 09:30', 'DDS (por dia)', '', 'Tema do dia', '', ''],
  ['', '', '', '', '', '', ''],
];

test('indicativo diário acha o cabeçalho fora da primeira linha e herda o período mesclado', () => {
  const resultado = mapDailyIndicator(diario);
  assert.equal(resultado.items.length, 3);
  assert.equal(resultado.items[0].activity, 'Organização do dia');
  assert.equal(resultado.items[0].done, true);
  assert.equal(resultado.items[1].done, false);
  // Período mesclado: a 3ª atividade herda o período da linha anterior.
  assert.equal(resultado.items[2].period, 'Manhã (09:00 - 11:40)');
  assert.equal(resultado.items[2].activity, 'DDS (por dia)');
});

test('campo em branco não vira data e um rótulo não vira o valor do rótulo anterior', () => {
  const resultado = mapDailyIndicator(diario);
  // "____/____/______" é campo em branco do formulário, não uma data.
  assert.equal(resultado.date, '');
  // "Responsável:" está vazio; a célula seguinte preenchida é o rótulo "Data:",
  // que não pode ser lido como o nome do responsável.
  assert.equal(resultado.owner, '');
});

test('indicativo diário preenchido devolve responsável e data', () => {
  const preenchido = diario.map((linha) => [...linha]);
  preenchido[1] = ['Empresa: SAFE', '', '', 'Responsável:', 'Poliana', 'Data:', '11/09/2026'];
  const resultado = mapDailyIndicator(preenchido);
  assert.equal(resultado.owner, 'Poliana');
  assert.equal(resultado.date, '11/09/2026');
});

test('aba ausente ou sem cabeçalho não quebra a leitura', () => {
  assert.deepEqual(mapDailyIndicator(), { owner: '', date: '', items: [] });
  assert.deepEqual(mapDailyIndicator([['qualquer coisa']]), { owner: '', date: '', items: [] });
  assert.deepEqual(mapMonthlySummary(), { items: [] });
});

test('resumo mensal separa indicador preenchido de indicador em branco', () => {
  const resultado = mapMonthlySummary([
    ['RESUMO MENSAL – SEGURANÇA DO TRABALHO', '', ''],
    ['Indicador', 'Quantidade', 'Observações'],
    ['Inspeções realizadas', '12', 'Somente turno da manhã'],
    ['DDS realizados', '', ''],
    ['', '', ''],
  ]);
  assert.equal(resultado.items.length, 2);
  assert.deepEqual(resultado.items[0], { indicator: 'Inspeções realizadas', amount: '12', filled: true, notes: 'Somente turno da manhã' });
  assert.equal(resultado.items[1].filled, false);
});

test('as seis abas chegam ao painel e as duas novas não inventam registros', () => {
  const dados = transformWorkbook({
    inspections: [], dds: [], absences: [], pending: [],
    daily: diario,
    summary: [['RESUMO MENSAL', '', ''], ['Indicador', 'Quantidade', 'Observações'], ['Pendências em aberto', '3', '']],
  });
  assert.equal(dados.daily.items.length, 3);
  assert.equal(dados.summary.items.length, 1);
  // O indicativo diário não tem histórico: não pode entrar na linha do tempo por mês.
  assert.deepEqual(dados.months, []);
  assert.equal(dados.inspections.length, 0);
});
