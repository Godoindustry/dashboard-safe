export const LIMITS = Object.freeze({ dailyTokens: 60000, dailyCalls: 30, perCall: 6000, intervalMs: 65000 });
export class BudgetError extends Error { constructor(message, retryAfter = 65) { super(message); this.status = 429; this.retryAfter = retryAfter; } }
// Reserve the upper bound atomically, across BOTH keys, before contacting Groq.
// Never refund: a timeout may still have consumed provider tokens.
export async function reserveBudget(store, tokens, now = Date.now()) {
  if (!Number.isInteger(tokens) || tokens < 1 || tokens > LIMITS.perCall) throw new BudgetError('Pedido muito grande para a cota protegida. Encurte a pergunta.');
  const day = new Date(now).toISOString().slice(0, 10);
  for (let attempt = 0; attempt < 6; attempt++) {
    const entry = await store.getWithMetadata('global', { type: 'json', consistency: 'strong' });
    const previous = entry?.data;
    const lastAt = previous?.lastAt || 0;
    if (lastAt && now - lastAt < LIMITS.intervalMs) throw new BudgetError('A IA está em intervalo de proteção da cota. Tente novamente em instantes.', Math.ceil((LIMITS.intervalMs - now + lastAt) / 1000));
    const current = previous?.day === day ? previous : { day, tokens: 0, calls: 0 };
    const reset = Math.ceil((Date.parse(`${day}T00:00:00Z`) + 86400000 - now) / 1000);
    if (current.tokens + tokens > LIMITS.dailyTokens || current.calls >= LIMITS.dailyCalls) throw new BudgetError('Cota diária protegida da IA atingida. Gráficos, filtros e PDF sem IA continuam disponíveis.', reset);
    const next = { day, tokens: current.tokens + tokens, calls: current.calls + 1, lastAt: now };
    const result = await store.setJSON('global', next, entry ? { onlyIfMatch: entry.etag } : { onlyIfNew: true });
    if (result.modified) return { remainingTokens: LIMITS.dailyTokens - next.tokens, remainingCalls: LIMITS.dailyCalls - next.calls, reservedTokens: tokens, resetsAt: new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString() };
  }
  throw new BudgetError('Outra consulta está em processamento. Aguarde antes de repetir.');
}
export function estimateUpperBound(messages, maxOutput) { return Buffer.byteLength(JSON.stringify(messages), 'utf8') + 512 + maxOutput; }
