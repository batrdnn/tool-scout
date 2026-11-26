// Preloaded into every test process by test/run-tests.mjs (NODE_OPTIONS=--import=...). The tests are offline:
// they use mocks. A real request would make a test depend on the internet, so it is recorded here and
// the process exits non-zero when it ends, even if the code under test swallowed the error.
import net from 'node:net';

const hits = [];
const local = (h) => /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|0\.0\.0\.0)$/i.test(String(h || 'localhost'));
const trip = (what) => { hits.push(what); return new Error(`network tripwire: a test made a real network request to ${what}. Tests must use a mock (an injected fetchImpl, or a replaced globalThis.fetch).`); };

const realFetch = globalThis.fetch;
globalThis.fetch = function tripwireFetch(input, init) {
  let url; try { url = new URL(String(input?.url ?? input)); } catch { return realFetch(input, init); }
  if (local(url.hostname)) return realFetch(input, init);
  return Promise.reject(trip(url.host));
};

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function tripwireConnect(...args) {
  let a = args[0];
  if (Array.isArray(a)) a = a[0]; // net.connect passes already-normalized arguments: [options, callback]
  const host = a && typeof a === 'object' ? (a.path ? null : (a.host ?? 'localhost')) : typeof a === 'number' ? (typeof args[1] === 'string' ? args[1] : 'localhost') : null; // a path (unix socket) is local
  if (host != null && !local(host)) throw trip(String(host));
  return connect.apply(this, args);
};

process.on('exit', () => {
  if (!hits.length) return;
  process.stderr.write(`network tripwire: ${hits.length} real network request(s) from a test: ${[...new Set(hits)].join(', ')}\n`);
  process.exitCode = 1;
});
