import { generateScheduledReport } from '../../netlify/functions/_shared/report-scheduler.mjs';
import { cronAuthorized, cronReply } from '../_shared/cron.mjs';

export default {
  async fetch(request) {
    const auth = cronAuthorized(request);
    if (!auth.ok) return cronReply({ error: auth.error }, auth.status);
    try {
      return cronReply(await generateScheduledReport('weekly', new Date(), { enforceSchedule: false }));
    } catch (error) {
      console.error('vercel-weekly-report', error);
      return cronReply({ error: error.message || 'Falha no relatório semanal.' }, 500);
    }
  },
};
