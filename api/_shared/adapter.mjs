export async function runLegacyHandler(handler, request) {
  const url = new URL(request.url);
  const body = ['GET', 'HEAD'].includes(request.method) ? '' : await request.text();
  const result = await handler({
    httpMethod: request.method,
    headers: Object.fromEntries(request.headers),
    queryStringParameters: Object.fromEntries(url.searchParams),
    body,
  });
  const headers = new Headers(result.headers || {});
  const responseBody = result.isBase64Encoded ? Buffer.from(result.body || '', 'base64') : result.body || null;
  return new Response(request.method === 'HEAD' ? null : responseBody, { status: result.statusCode || 200, headers });
}
