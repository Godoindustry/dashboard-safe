import { isReportAuthenticated } from './_shared/auth.mjs';
import { getSnapshot } from './_shared/snapshot.mjs';
export async function handler(event) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
  const reply = (statusCode, body) => ({ statusCode, headers, body: body ? JSON.stringify(body) : '' });
  if (event.httpMethod !== 'GET') return reply(405, { error: 'Método não permitido.' });
  const detail = event.queryStringParameters?.detail === 'report' ? 'report' : 'public';
  if (detail === 'report') {
    headers['Cache-Control'] = 'private, no-store';
    if (!isReportAuthenticated(event)) return reply(401, { error: 'Entre na área de relatórios.' });
  } else headers['Netlify-CDN-Cache-Control'] = 'public, s-maxage=5, must-revalidate';
  try {
    const data = await getSnapshot(detail);
    headers.ETag = `"${data.revision}"`;
    if (event.headers?.['if-none-match'] === headers.ETag) return reply(304);
    return reply(200, data);
  } catch (error) {
    headers['Cache-Control'] = 'no-store';
    headers['Netlify-CDN-Cache-Control'] = 'no-store';
    return reply(502, { error: error.message || 'Google Sheets indisponível. Tente novamente.' });
  }
}
