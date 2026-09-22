import { handler } from '../netlify/functions/reports-auth.mjs';
import { runLegacyHandler } from './_shared/adapter.mjs';

export default { fetch: (request) => runLegacyHandler(handler, request) };
