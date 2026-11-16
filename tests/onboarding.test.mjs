import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Pool } from '../lib/pool.mjs';
import { onboard } from '../lib/onboard.mjs';
import { prepareTool, runTool, TOOL_VERSION, childEnv } from '../lib/tool.mjs';
import { installSkill, installTarget } from '../scripts/install.mjs';
import { startConfiguration } from '../scripts/configure.mjs';

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'firepool-onboard-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return { dir, pool: new Pool({ home: path.join(dir, 'data'), query: async () => ({ status: 200, remaining: 20 }) }) };
}

test('directly pasted keys complete setup without another input channel or existing plugin', async t => {
  const { pool } = await fixture(t); let prepared = 0;
  const result = await onboard(pool, 'MOCK_PASTED_ONE\nMOCK_PASTED_TWO', async () => { prepared++; });
  assert.equal(result.ok, true); assert.equal(result.available, 2); assert.equal(prepared, 1);
  assert.ok(!JSON.stringify(result).includes('MOCK_'));
  const again = await onboard(pool, 'MOCK_PASTED_ONE', async () => {});
  assert.equal(again.imported, 0); assert.equal(again.available, 1);
});

test('installation failure preserves keys and gives a concrete resumable step', async t => {
  const { pool } = await fixture(t);
  const result = await onboard(pool, 'MOCK_PRESERVED', async () => { throw Error('npm_not_found'); });
  assert.equal(result.ok, false); assert.equal(result.error, 'npm_not_found');
  assert.equal(result.configured, true); assert.equal((await pool.status()).accounts.length, 1);
  assert.equal((await onboard(pool, undefined, async () => {})).ok, true);
});

test('invalid and unknown credentials are not announced as ready', async t => {
  const { pool } = await fixture(t);
  pool.query = async () => ({ status: 401 });
  assert.equal((await onboard(pool, 'MOCK_INVALID', async () => {})).invalid, 1);
  pool.query = async () => { throw Error('MOCK_PRIVATE_SERVER_ERROR'); };
  const result = await onboard(pool, 'MOCK_UNKNOWN', async () => {});
  assert.equal(result.ok, false); assert.equal(result.unknown, 1);
  assert.ok(!JSON.stringify(result).includes('MOCK_'));
});

test('private tool preparation uses pinned package, no lifecycle scripts or global credentials', async t => {
  const { pool } = await fixture(t); const calls = [];
  const execute = async (cmd, args, opts) => {
    calls.push(args); assert.equal(opts.env.FIRECRAWL_API_KEY, undefined);
    if (args.includes('install')) {
      assert.ok(args.includes('--ignore-scripts')); assert.ok(args.includes(`firecrawl-cli@${TOOL_VERSION}`)); assert.ok(!args.includes('--global'));
      const folder = path.join(pool.home, 'tools', 'node_modules', 'firecrawl-cli');
      await fs.mkdir(path.join(folder, 'dist'), { recursive: true });
      await fs.writeFile(path.join(folder, 'package.json'), JSON.stringify({ version: TOOL_VERSION }));
      await fs.writeFile(path.join(folder, 'dist', 'launcher.js'), '// mock');
    }
    return { code: 0, stdout: '', stderr: '' };
  };
  await prepareTool(pool.home, execute); await prepareTool(pool.home, execute);
  assert.equal(calls.filter(args => args.includes('install')).length, 1);
});

test('local adapter hands key through child env only, redacts output and switches in code', async t => {
  const { pool } = await fixture(t);
  await onboard(pool, 'MOCK_LOCAL_A\nMOCK_LOCAL_B', async () => {});
  const entry = path.join(pool.home, 'tools', 'node_modules', 'firecrawl-cli', 'dist', 'launcher.js');
  await fs.mkdir(path.dirname(entry), { recursive: true }); await fs.writeFile(entry, '// mock');
  let calls = 0;
  const execute = async (_cmd, args, { env }) => {
    calls++; assert.ok(!args.some(a => a.includes('MOCK_')));
    assert.equal(env.FIRECRAWL_API_URL, 'https://api.firecrawl.dev');
    return { code: calls === 1 ? 1 : 0, stdout: `content ${env.FIRECRAWL_API_KEY}`, stderr: env.FIRECRAWL_API_KEY };
  };
  const first = await runTool(pool, { command: 'scrape', args: ['https://example.com'] }, execute);
  assert.equal(first.ok, false); assert.ok(!JSON.stringify(first).includes('MOCK_'));
  const next = await runTool(pool, { command: 'scrape', args: ['https://example.com'], round: first.round, id: first.id, outcome: 'exhausted' }, execute);
  assert.equal(next.ok, true); assert.equal(calls, 2); assert.ok(!JSON.stringify(next).includes('MOCK_'));
  for (const args of [['-k', 'MOCK_OVERRIDE'], ['--api-url=https://example.com'], ['--api-key', 'MOCK_OVERRIDE']]) {
    await assert.rejects(runTool(pool, { command: 'scrape', args }), /invalid_tool_request/);
  }
  await assert.rejects(runTool(pool, { command: 'login', args: [] }), /invalid_tool_request/);
  await assert.rejects(runTool(pool, { command: 'scrape', args: [], round: 'unused', outcome: 'temporary' }), /unsafe_tool_retry/);
  assert.equal(childEnv('MOCK_KEY').FIRECRAWL_API_KEY, 'MOCK_KEY');
});

test('platform installer supports Codex, Claude and discovered WorkBuddy target without overwriting changes', async t => {
  const { dir } = await fixture(t);
  assert.equal(installTarget('codex', dir, { CODEX_HOME: path.join(dir, 'custom') }), path.join(dir, 'custom', 'skills', 'firepool'));
  assert.equal(installTarget('claude', dir, {}), path.join(dir, '.claude', 'skills', 'firepool'));
  assert.throws(() => installTarget('workbuddy', dir, {}), /target_or_package/);
  for (const agent of ['codex', 'claude', 'workbuddy']) {
    const target = path.join(dir, agent, 'skills', 'firepool');
    const result = await installSkill({ agent, target });
    assert.equal(result.changed, true);
    assert.ok((await fs.readFile(path.join(target, 'SKILL.md'), 'utf8')).includes('name: firepool'));
    assert.equal((await installSkill({ agent, target })).changed, false);
    await fs.appendFile(path.join(target, 'SKILL.md'), '\nLocal customization');
    await assert.rejects(installSkill({ agent, target }), /existing_installation_conflict/);
    assert.ok((await fs.readFile(path.join(target, 'SKILL.md'), 'utf8')).includes('Local customization'));
  }
});

test('optional localhost form enforces CSRF, origin and host; keys stay out of page and result', async t => {
  const { pool } = await fixture(t); let received;
  const form = await startConfiguration({ pool, ttl: 10_000, setup: async (_pool, raw) => { received = JSON.parse(raw); return { ok: true, available: 1 }; } });
  t.after(() => form.close());
  const url = new URL(form.url), origin = url.origin;
  const html = await fetch(origin);
  assert.match(html.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(html.headers.get('cache-control'), 'no-store');
  const body = await html.text();
  const script = body.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(script)); assert.ok(!body.includes(url.hash.slice(1))); assert.ok(!body.includes('MOCK_LOCAL_FORM'));
  assert.equal((await fetch(`${origin}/configure`, { method: 'POST', body: '[]' })).status, 403);
  assert.equal((await fetch(`${origin}/configure`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://example.com', 'X-Firepool-Token': url.hash.slice(1) }, body: '[]' })).status, 403);
  const result = await fetch(`${origin}/configure`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'X-Firepool-Token': url.hash.slice(1) }, body: JSON.stringify(['MOCK_LOCAL_FORM']) });
  assert.equal(result.status, 200); assert.equal((await result.json()).available, 1);
  assert.deepEqual(received, ['MOCK_LOCAL_FORM']);
});


test('setup never announces cached positive balances as usable during provider cooldown', async t => {
  const { pool } = await fixture(t);
  await onboard(pool, 'MOCK_LIMITED', async () => {});
  pool.query = async () => ({ status: 429, retryAfter: '120' });
  const result = await onboard(pool, undefined, async () => {});
  assert.equal(result.ok, false); assert.equal(result.available, 0); assert.equal(result.coolingDown, 1);
  assert.equal((await pool.acquire()).error, 'pool_unavailable');
});

test('inspection reuses existing pool without network or revealing keys; repeated setup preserves old metadata', async t => {
  const { dir, pool } = await fixture(t);
  const { inspect } = await import('../scripts/inspect.mjs');
  const missing = path.join(dir, 'not-created');
  const first = await inspect({ home: dir, env: {}, dataHome: missing });
  assert.equal(first.configured, false);
  await assert.rejects(fs.access(missing), { code: 'ENOENT' });
  await pool.import([{ id: 'old-account', apiKey: 'MOCK_EXISTING', enabled: false, priority: 7 }]);
  await onboard(pool, 'MOCK_EXISTING\nMOCK_NEW', async () => {});
  const result = await inspect({ home: dir, env: { FIRECRAWL_API_KEY: 'MOCK_ENV' }, dataHome: pool.home });
  assert.equal(result.accounts.length, 2); assert.equal(result.environmentKeyPresent, true);
  assert.equal(result.next, 'reuse_pool_merge_new_keys');
  const old = result.accounts.find(a => a.id === 'old-account');
  assert.equal(old.enabled, false); assert.equal(old.priority, 7);
  assert.ok(!JSON.stringify(result).includes('MOCK_'));
  const original = await fs.readFile(path.join(pool.home, 'credentials.json'), 'utf8');
  await fs.writeFile(path.join(pool.home, 'state.json'), 'broken');
  await assert.rejects(inspect({ home: dir, env: {}, dataHome: pool.home }), /existing_pool_unreadable/);
  assert.equal(await fs.readFile(path.join(pool.home, 'credentials.json'), 'utf8'), original);
});

test('installer CLI executes from temporary and aliased download paths', async t => {
  const { dir } = await fixture(t);
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { fileURLToPath } = await import('node:url');
  const run = promisify(execFile);
  const source = fileURLToPath(new URL('../', import.meta.url));
  const downloaded = path.join(dir, 'download');
  await fs.cp(source, downloaded, { recursive: true, filter: name => !name.includes(`${path.sep}.git`) });
  let input = downloaded;
  if (process.platform !== 'win32') {
    input = path.join(dir, 'download-alias');
    await fs.symlink(downloaded, input);
  }
  const target = path.join(dir, 'installed', 'firepool');
  const installed = await run(process.execPath, [path.join(input, 'scripts', 'install.mjs'), '--target', target]);
  assert.equal(JSON.parse(installed.stdout).installed, true);
  await fs.access(path.join(target, 'scripts', 'firepool.mjs'));
  const inspected = await run(process.execPath, [path.join(input, 'scripts', 'inspect.mjs')], { env: { ...process.env, FIREPOOL_HOME: path.join(dir, 'empty') } });
  assert.equal(JSON.parse(inspected.stdout).configured, false);
});
