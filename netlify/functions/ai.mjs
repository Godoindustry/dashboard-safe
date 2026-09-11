import { getStore } from '@netlify/blobs';
import { handleAI } from './_shared/ai-service.mjs';
export default async function(request) {
  let store;
  try { store = getStore({ name: 'safe-ai-budget-v1', consistency: 'strong' }); } catch {}
  return handleAI(request, { store });
}
export const config = { rateLimit: { windowLimit: 3, windowSize: 60, aggregateBy: ['ip'] } };
