import crypto from 'node:crypto';

function same(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function cronAuthorized(request) {
  const secret = String(process.env.CRON_SECRET || '');
  if (secret.length < 16) return { ok: false, status: 503, error: 'Configure CRON_SECRET na Vercel com pelo menos 16 caracteres.' };
  const provided = request.headers.get('authorization') || '';
  return same(provided, `Bearer ${secret}`) ? { ok: true } : { ok: false, status: 401, error: 'Agendamento não autorizado.' };
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
