import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKeyInSaoPaulo, monthStartInSaoPaulo } from '../dist/assets/shared.js';

// O painel é de acompanhamento diário: o dia tem que virar pelo relógio de
// São Paulo, não pelo relógio de quem abre a página.
test('a meia-noite de São Paulo é o que vira o dia, não a de UTC', () => {
  // 02:00 UTC ainda é o dia anterior em São Paulo (23:00).
  assert.equal(dayKeyInSaoPaulo(0, new Date('2026-09-15T02:00:00Z')), '2026-09-14');
  // 03:30 UTC já passou da meia-noite em São Paulo (00:30).
  assert.equal(dayKeyInSaoPaulo(0, new Date('2026-09-15T03:30:00Z')), '2026-09-15');
  // Meio-dia em São Paulo, sem ambiguidade.
  assert.equal(dayKeyInSaoPaulo(0, new Date('2026-09-15T15:00:00Z')), '2026-09-15');
});

test('ontem atravessa a virada do mês e do ano', () => {
  assert.equal(dayKeyInSaoPaulo(-1, new Date('2026-09-01T15:00:00Z')), '2026-08-31');
  assert.equal(dayKeyInSaoPaulo(-1, new Date('2027-01-01T15:00:00Z')), '2026-12-31');
  // "Últimos 7 dias" conta o dia de hoje: 09 a 15 de setembro são sete dias.
  assert.equal(dayKeyInSaoPaulo(-6, new Date('2026-09-15T15:00:00Z')), '2026-09-09');
});

test('início do mês corrente segue o dia de São Paulo', () => {
  assert.equal(monthStartInSaoPaulo(new Date('2026-09-15T15:00:00Z')), '2026-09-01');
  // 01/09 às 02:00 UTC ainda é 31/08 em São Paulo: o mês corrente é agosto.
  assert.equal(monthStartInSaoPaulo(new Date('2026-09-01T02:00:00Z')), '2026-08-01');
});
