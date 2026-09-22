import { generateScheduledReport } from '../../netlify/functions/_shared/report-scheduler.mjs';
import { cronAuthorized, cronReply, isLastDayInSaoPaulo } from '../_shared/cron.mjs';

export default {
  async fetch(request) {
    const auth = cronAuthorized(request);
    if (!auth.ok) return cronReply({ error: auth.error }, auth.status);
    const now = new Date();
    if (!isLastDayInSaoPaulo(now)) return cronReply({ status: 'skipped', reason: 'not-last-day-in-sao-paulo' });
    try {
      return cronReply(await generateScheduledReport('monthly', now, { enforceSchedule: false }));
    } catch (error) {
      console.error('vercel-monthly-report', error);
      return cronReply({ error: error.message || 'Falha no relatório mensal.' }, 500);
    }
  },
};
