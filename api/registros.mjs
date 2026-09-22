import { handler } from '../netlify/functions/records.mjs';
import { runLegacyHandler } from './_shared/adapter.mjs';

export default { fetch: (request) => runLegacyHandler(handler, request) };
