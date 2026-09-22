import { handler } from '../netlify/functions/photos.mjs';
import { runLegacyHandler } from './_shared/adapter.mjs';

export default { fetch: (request) => runLegacyHandler(handler, request) };
