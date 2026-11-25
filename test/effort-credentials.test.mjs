// Credentials: only names that look like secrets count; settings and local passwords don't.
// An API is named only from a known list, or a clear prefix whose domain the README mentions;
// otherwise the estimate says "needs N credentials".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateEffort, KNOWN_APIS, BYTES_PER_LINE as L } from '../scripts/lib/effort.mjs';

const blob = (path, size = 1000) => ({ path, type: 'blob', size });
const est = (o) => estimateEffort({ readme: '', files: {}, kind: 'tool', pushedAt: '2025-06-01T00:00:00Z', now: Date.parse('2026-11-25T00:00:00Z'), tree: [blob('.env.example'), blob('main.py', 200 * L)], ...o });
const env = (text, readme = '') => est({ files: { '.env.example': text }, readme }).needs;

test('regression: AGENT_MAX_CONCURRENT_JOBS_PER_TOKEN is a setting, not a credential', () => {
  const n = env('AGENT_MAX_CONCURRENT_JOBS_PER_TOKEN=5\nREQUEST_TIMEOUT_TOKEN=30\nMAX_TOKEN=4096\nTOKEN_LIMIT=10\n');
  assert.deepEqual(n.credentials, []);
  assert.equal(n.credentialCount, 0);
});

test('regression: a dify-style .env counts only secret-looking names and names only known APIs', () => {
  const dify = [
    'SECRET_KEY=sk-9f73s', 'DB_PASSWORD=difyai123456', 'REDIS_PASSWORD=difyai123456', 'MYSQL_ROOT_PASSWORD=x', 'POSTGRES_PASSWORD=x',
    'PLUGIN_DAEMON_KEY=lYkiYYT6', 'PLUGIN_DIFY_INNER_API_KEY=QaHbT', 'CODE_EXECUTION_API_KEY=dify-sandbox', 'SANDBOX_API_KEY=dify-sandbox',
    'SENDGRID_API_KEY=', 'NOTION_CLIENT_ID=', 'NOTION_CLIENT_SECRET=', 'OPENAI_API_KEY=', 'S3_ACCESS_KEY=', 'S3_SECRET_KEY=',
    'TENCENT_COS_SECRET_KEY=', 'ALIYUN_OSS_ACCESS_KEY=', 'WEAVIATE_API_KEY=', 'QDRANT_API_KEY=', 'MILVUS_TOKEN=',
    'APP_MAX_ACTIVE_REQUESTS=0', 'API_TOOL_DEFAULT_CONNECT_TIMEOUT=10', 'WORKFLOW_MAX_EXECUTION_STEPS=500', 'GUNICORN_TIMEOUT=360',
    'SQLALCHEMY_POOL_SIZE=30', 'REDIS_PORT=6379', 'ACCESS_TOKEN_EXPIRE_MINUTES=60', 'REFRESH_TOKEN_EXPIRE_DAYS=30',
  ].join('\n');
  const n = env(dify);
  // Ignored: the app's own secret, local passwords, bare *_KEY, settings, and keys shipped with a working
  // default value (dify-sandbox, QaHbT…): those connect dify's own containers, not an outside service.
  assert.ok(!/PASSWORD|TIMEOUT|MAX|EXPIRE|POOL|PORT|DAEMON|SANDBOX|INNER|CODE_EXECUTION|^SECRET_KEY/.test(n.credentials.join(' ')), n.credentials.join(' '));
  assert.equal(n.credentialCount, 11, n.credentials.join(' '));
  assert.deepEqual(n.apis, ['AWS S3', 'Notion', 'OpenAI', 'Qdrant', 'SendGrid', 'Weaviate']);
});

test('local service passwords in docker examples are ignored', () => {
  const compose = 'services:\n  db:\n    image: postgres\n    environment:\n      POSTGRES_PASSWORD: postgres\n      MYSQL_ROOT_PASSWORD: root\n';
  const n = est({ tree: [blob('docker-compose.yml'), blob('main.py', 200 * L)], files: { 'docker-compose.yml': compose } }).needs;
  assert.deepEqual(n.credentials, []);
  assert.deepEqual(n.services, ['docker', 'database']);
});

test('a secret-looking name shipped with a real default value is a local setting; blanks and placeholders are not', () => {
  const n = env('LOCAL_API_KEY=dify-sandbox\nA_API_KEY=\nB_API_KEY=your-api-key-here\nC_TOKEN=<token>\nD_SECRET=changeme\nE_TOKEN=xxx\nF_API_KEY=${F}\n');
  assert.deepEqual(n.credentials, ['A_API_KEY', 'B_API_KEY', 'C_TOKEN', 'D_SECRET', 'E_TOKEN', 'F_API_KEY']);
});

test('secret-looking names: *_API_KEY, *_TOKEN, *_SECRET, *_ACCESS_KEY, *_PAT, OAuth client IDs', () => {
  const n = env('A_API_KEY=\nB_TOKEN=\nC_SECRET=\nD_ACCESS_KEY=\nE_PAT=\nF_CLIENT_ID=\nG_KEY=\nH_PASSWORD=\nI_SECRET_KEY=\nJ_ACCESS_TOKEN=\n');
  assert.deepEqual(n.credentials, ['A_API_KEY', 'B_TOKEN', 'C_SECRET', 'D_ACCESS_KEY', 'E_PAT', 'F_CLIENT_ID', 'I_SECRET_KEY', 'J_ACCESS_TOKEN']);
});

test('an API is named from the known list, or from a prefix whose domain is in the README; otherwise just counted', () => {
  assert.ok(KNOWN_APIS.STRIPE && KNOWN_APIS.OPENAI && KNOWN_APIS.GITHUB);
  assert.deepEqual(env('STRIPE_SECRET_KEY=\nSTRIPE_WEBHOOK_SECRET=\n').apis, ['Stripe']);
  assert.deepEqual(env('VITE_FIREBASE_API_KEY=\n').apis, ['Firebase']);
  assert.deepEqual(env('BALE_BOT_TOKEN=\n', 'Create a bot at https://bale.ai and paste its token.').apis, ['Bale']);
  const unknown = env('BALE_BOT_TOKEN=\nACME_API_KEY=\n', 'Works with our backend.');
  assert.deepEqual(unknown.apis, []);
  assert.equal(unknown.credentialCount, 2);
});

test('advice: an unnamed credential still ties a small repo to something external, said as "needs N credentials"', () => {
  const e = est({ files: { '.env.example': 'ACME_API_KEY=\nACME_SECRET=\n' } });
  assert.equal(e.advice, 'either');
  assert.match(e.reason, /needs 2 credentials/);
  const named = est({ files: { '.env.example': 'OPENAI_API_KEY=\n' } });
  assert.match(named.reason, /the OpenAI API/);
});
