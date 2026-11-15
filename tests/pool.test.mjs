import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { Pool, parseImport, creditUsage, retryDelay } from '../lib/pool.mjs';
import { safeHome, ROOT, locked } from '../lib/store.mjs';

async function fixture(t, query) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'firepool-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let time = 1_000_000, calls = 0;
  const pool = new Pool({ home: dir, now: () => time, query: async key => { calls++; return query ? query(key) : { status: 200, remaining: 100 }; } });
  return { dir, pool, advance: ms => { time += ms; }, calls: () => calls };
}
function rows() { return parseImport(JSON.stringify([{ id: 'first', apiKey: 'MOCK_INVALID_ONLY_FIRST', priority: 10 }, { id: 'second', apiKey: 'MOCK_INVALID_ONLY_SECOND', priority: 20 }])); }
function cli(args, env, input = '') {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts/firepool.mjs'), ...args], { env: { ...process.env, ...env } });
    let stdout = '', stderr = '';
    child.stdout.on('data', c => { stdout += c; }); child.stderr.on('data', c => { stderr += c; });
    child.on('close', code => resolve({ code, stdout, stderr })); child.stdin.end(input);
  });
}

test('imports deduplicate, preserve metadata, reject conflicts atomically and redact', async t => {
  const { pool } = await fixture(t);
  assert.equal((await pool.import(rows())).added, 2);
  assert.equal((await pool.import(rows())).added, 0);
  await assert.rejects(pool.import(parseImport(JSON.stringify([{ id: 'third', apiKey: 'MOCK_NEW_KEY' }, { id: 'first', apiKey: 'MOCK_OTHER_KEY' }]))), /import_conflict/);
  const status = await pool.status();
  assert.equal(status.accounts.length, 2); assert.ok(!JSON.stringify(status).includes('MOCK_'));
  assert.throws(() => parseImport('{broken'), /invalid_import/);
  assert.throws(() => parseImport('[{"apiKey":"MOCK_A","priority":0}]'), /invalid_import/);
  assert.throws(() => parseImport('[{"id":"__proto__","apiKey":"MOCK_A"}]'), /invalid_import/);
  assert.equal(parseImport('MOCK_A\nMOCK_B\n').length, 2);
});

test('sticky selection and cached balance avoid further network requests', async t => {
  const { pool, calls } = await fixture(t); await pool.import(rows());
  const first = await pool.acquire(); assert.equal(first.id, 'first');
  assert.deepEqual(await pool.report(first.round, first.id, 'success'), { ok: true, done: true });
  await pool.acquire(); await pool.status();
  assert.equal(calls(), 1);
});

test('failure report selects next account in one call; no repeats within round', async t => {
  const { pool } = await fixture(t); await pool.import(rows());
  const a = await pool.acquire(); const b = await pool.report(a.round, a.id, 'invalid');
  assert.equal(b.id, 'second'); assert.equal(b.round, a.round);
  const unavailable = await pool.report(b.round, b.id, 'exhausted');
  assert.equal(unavailable.error, 'pool_unavailable'); assert.ok(unavailable.retryNotBefore);
  await assert.rejects(pool.report(b.round, b.id, 'success'), /invalid_receipt/);
  await pool.manage('enable', 'first'); assert.equal((await pool.acquire()).id, 'first');
});

test('target errors close receipt without changing account, never querying backup', async t => {
  const { pool, calls } = await fixture(t); await pool.import(rows());
  const a = await pool.acquire(); await pool.report(a.round, a.id, 'target_error');
  assert.equal((await pool.acquire()).id, 'first'); assert.equal(calls(), 1);
});

test('exhaustion is refreshed after five minutes and replenishment recovers', async t => {
  let credits = 0;
  const { pool, advance, calls } = await fixture(t, () => ({ status: 200, remaining: credits }));
  await pool.import([rows()[0]]);
  assert.equal((await pool.acquire()).ok, false); assert.equal(calls(), 1);
  assert.equal((await pool.acquire()).ok, false); assert.equal(calls(), 1);
  credits = 50; advance(300_001);
  assert.equal((await pool.acquire()).id, 'first'); assert.equal(calls(), 2);
});

test('rate limiting honors Retry-After and cached balance is reused after cooldown', async t => {
  const { pool, advance, calls } = await fixture(t); await pool.import([rows()[0]]);
  const a = await pool.acquire(); const r = await pool.report(a.round, a.id, 'rate_limit', '120');
  assert.equal(r.retryNotBefore, 1_120_000);
  advance(120_001); assert.equal((await pool.acquire()).id, 'first'); assert.equal(calls(), 1);
  assert.equal(retryDelay(new Date(1_180_000).toUTCString(), 1_000_000), 180_000);
  assert.throws(() => retryDelay('not-a-date', 0), /invalid_retry_after/);
});

test('quota-query unknown is cached and usable; provider 403 disables account', async t => {
  const { pool, calls } = await fixture(t, key => {
    if (key === 'MOCK_INVALID_ONLY_FIRST') return { status: 403 };
    throw Error('MOCK_DO_NOT_LOG_THIS');
  });
  await pool.import(rows()); const a = await pool.acquire(); assert.equal(a.id, 'second');
  await pool.report(a.round, a.id, 'success'); await pool.acquire();
  assert.equal(calls(), 2); const status = await pool.status();
  assert.equal(status.accounts[0].status, 'invalid'); assert.equal(status.accounts[1].remaining, null);
});

test('late success cannot clear another process cooldown', async t => {
  const { pool } = await fixture(t); await pool.import([rows()[0]]);
  const a = await pool.acquire(), b = await pool.acquire();
  await pool.report(a.round, a.id, 'rate_limit', '120');
  await pool.report(b.round, b.id, 'success');
  assert.equal((await pool.acquire()).error, 'pool_unavailable');
});

test('round expiry, removal and management enforce receipt validity', async t => {
  const { pool, advance } = await fixture(t); await pool.import(rows());
  const a = await pool.acquire(); advance(3_600_001);
  await assert.rejects(pool.report(a.round, a.id, 'success'), /invalid_receipt/);
  await pool.manage('disable', 'first'); assert.equal((await pool.acquire()).id, 'second');
  await pool.manage('remove', 'second'); assert.equal((await pool.acquire()).ok, false);
});

test('corrupt storage fails closed and sensitive files use restrictive permissions', async t => {
  const { pool, dir } = await fixture(t); await pool.import(rows()); await pool.acquire();
  assert.ok(!(await fs.readFile(path.join(dir, 'state.json'), 'utf8')).includes('MOCK_'));
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(dir)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(path.join(dir, 'credentials.json'))).mode & 0o777, 0o600);
  }
  await fs.writeFile(path.join(dir, 'state.json'), '{broken');
  await assert.rejects(pool.status(), /invalid_storage/);
  assert.equal(await fs.readFile(path.join(dir, 'state.json'), 'utf8'), '{broken');
});

test('checkout storage is refused, including symlink redirect', async t => {
  await assert.rejects(safeHome(path.join(ROOT, 'private-data')), /storage_inside_repository/);
  if (process.platform !== 'win32') {
    const { dir } = await fixture(t); const link = path.join(dir, 'redirect');
    await fs.symlink(ROOT, link); await assert.rejects(safeHome(path.join(link, 'private-data')), /storage_inside_repository/);
  }
});

test('abandoned lock times out without unsafe automatic removal', async t => {
  const { dir } = await fixture(t); await fs.writeFile(path.join(dir, '.lock'), '');
  await assert.rejects(locked(dir, () => {}, 60), /lock_timeout/);
  assert.equal(await fs.readFile(path.join(dir, '.lock'), 'utf8'), '');
});

test('multiple CLI processes import without lost updates and never echo input on errors', async t => {
  const { dir, pool } = await fixture(t);
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => cli(['add', '--id', `worker-${i}`], { FIREPOOL_HOME: dir }, `MOCK_CONCURRENT_${i}`)));
  assert.ok(results.every(r => r.code === 0 && !r.stdout.includes('MOCK_') && !r.stderr.includes('MOCK_')));
  assert.equal((await pool.status()).accounts.length, 8);
  const bad = await cli(['add', '--id', 'bad id'], { FIREPOOL_HOME: dir }, 'MOCK_SECRET_ERROR');
  assert.equal(bad.code, 1); assert.ok(!bad.stderr.includes('MOCK_SECRET'));
  const offline = await cli(['list'], { FIREPOOL_HOME: dir });
  assert.equal(offline.code, 0); assert.ok(!offline.stdout.includes('MOCK_'));
  assert.equal((await cli(['import', '--file', path.join(dir, 'missing')], { FIREPOOL_HOME: dir })).code, 1);
});

test('official quota query uses fixed endpoint, redirect refusal and sanitized response', async () => {
  let count = 0;
  const result = await creditUsage('MOCK_INVALID_TEST_KEY', async (url, opts) => {
    count++; assert.equal(url, 'https://api.firecrawl.dev/v2/team/credit-usage');
    assert.equal(opts.redirect, 'error'); assert.equal(opts.headers.Authorization, 'Bearer MOCK_INVALID_TEST_KEY');
    return new Response(JSON.stringify({ success: true, data: { remainingCredits: 90, ignored: 'MOCK_SECRET_SERVER_VALUE' } }), { status: 200 });
  });
  assert.deepEqual(result, { status: 200, remaining: 90 }); assert.equal(count, 1);
  await assert.rejects(creditUsage('MOCK_A', async () => new Response('{broken', { status: 200 })));
});

test('prototype property identifiers are rejected', () => {
  for (const id of ['constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
    assert.throws(() => parseImport(JSON.stringify([{ id, apiKey: 'MOCK_ONLY_KEY' }])), /invalid_import/);
  }
});

test('old receipts cannot modify replacements or explicitly re-enabled accounts', async t => {
  const { pool } = await fixture(t); await pool.import(rows());
  const a = await pool.acquire(); await pool.manage('remove', a.id);
  await pool.import(parseImport(JSON.stringify([{ id: a.id, apiKey: 'MOCK_REPLACEMENT_KEY' }])));
  await assert.rejects(pool.report(a.round, a.id, 'invalid'), /invalid_receipt/);
  const b = await pool.acquire(); await pool.manage('disable', b.id); await pool.manage('enable', b.id);
  await assert.rejects(pool.report(b.round, b.id, 'invalid'), /invalid_receipt/);
  assert.equal((await pool.status()).accounts.every(a => a.status !== 'invalid'), true);
});

test('agent bulk stdin onboarding imports without temporary files or credential output', async t => {
  const { dir, pool } = await fixture(t);
  const env = { FIREPOOL_HOME: dir };
  const first = await cli(['import', '--stdin'], env, 'MOCK_AGENT_FIRST\nMOCK_AGENT_SECOND\n');
  assert.equal(first.code, 0);
  assert.deepEqual(JSON.parse(first.stdout), { ok: true, added: 2, total: 2 });
  assert.ok(!first.stdout.includes('MOCK_')); assert.equal(first.stderr, '');
  const json = await cli(['import', '--stdin'], env, JSON.stringify({ accounts: [{ id: 'third', apiKey: 'MOCK_AGENT_THIRD' }] }));
  assert.equal(json.code, 0); assert.equal(JSON.parse(json.stdout).added, 1);
  assert.equal((await pool.status()).accounts.length, 3);
  const malformed = await cli(['import', '--stdin'], env, '{invalid MOCK_INPUT_SHOULD_NOT_ECHO');
  assert.equal(malformed.code, 1); assert.ok(!malformed.stderr.includes('MOCK_'));
  const conflict = await cli(['import', '--stdin', '--file', 'unused'], env, 'MOCK_NOT_IMPORTED');
  assert.equal(conflict.code, 1); assert.match(conflict.stderr, /invalid_arguments/);
  const duplicate = await cli(['import', '--stdin', '--stdin'], env, 'MOCK_NOT_IMPORTED');
  assert.equal(duplicate.code, 1);
  assert.deepEqual((await fs.readdir(dir)).sort(), ['credentials.json']);
});
