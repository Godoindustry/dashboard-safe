import { handler } from '../netlify/functions/sheets-data.mjs';
import { runLegacyHandler } from './_shared/adapter.mjs';

export default { fetch: (request) => runLegacyHandler(handler, request) };
