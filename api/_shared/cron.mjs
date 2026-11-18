import crypto from 'node:crypto';

function same(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function saoPauloParts(now) {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
  return Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
}

// Na hora do agendamento em São Paulo (a Vercel Hobby dispara em qualquer minuto da hora).
export function withinScheduledHour(type, now = new Date()) {
  const parts = saoPauloParts(now);
  if (type === 'weekly') return parts.weekday === 'Fri' && parts.hour === '16';
  return type === 'monthly' && parts.hour === '15' && isLastDayInSaoPaulo(now);
}

// Com CRON_SECRET, vale o segredo. Sem ele, aceita só o agendador da Vercel e só na hora
// marcada: fora dela ninguém consegue antecipar um relatório (que não se repete no período).
export function cronAuthorized(request, type, now = new Date()) {
  const secret = String(process.env.CRON_SECRET || '');
  if (secret.length >= 16) {
    const provided = request.headers.get('authorization') || '';
    return same(provided, `Bearer ${secret}`) ? { ok: true } : { ok: false, status: 401, error: 'Agendamento não autorizado.' };
  }
  if (!/vercel-cron/i.test(request.headers.get('user-agent') || '')) return { ok: false, status: 401, error: 'Agendamento não autorizado.' };
  if (!withinScheduledHour(type, now)) return { ok: false, status: 403, error: 'Fora do horário do relatório automático.' };
  return { ok: true };
}

export function isLastDayInSaoPaulo(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  const current = `${parts.year}-${parts.month}-${parts.day}`;
  const next = new Date(`${current}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 7) !== current.slice(0, 7);
}

export function cronReply(payload, status = 200) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
