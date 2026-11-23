// Shared test helpers (not a test file: no node:test registrations here).

const NOW = Date.parse("2026-11-23T12:00:00Z");

/** fetch stand-in: routes(url) returns a JSON body, a string, undefined (404) or {__status}. */
export function mockFetch(routes, { remaining = 4999 } = {}) {
  const calls = [];
  const fn = async (url, { headers }) => {
    calls.push({ url, headers });
    const body = routes(url);
    const status = body === undefined ? 404 : body?.__status || 200;
    return {
      ok: status < 300, status,
      headers: { get: (k) => ({ 'x-ratelimit-remaining': String(remaining), 'x-ratelimit-reset': String(Math.floor(NOW / 1000) + 3600) })[k.toLowerCase()] ?? null },
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  };
  fn.calls = calls;
  return fn;
}
