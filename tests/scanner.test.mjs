import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../lib/store.mjs';

test('secret scanner blocks working-tree canaries and secrets in deleted history without echoing them', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'firepool-scanner-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.mkdir(path.join(dir, 'scripts'));
  await fs.copyFile(path.join(ROOT, 'scripts/scan-secrets.mjs'), path.join(dir, 'scripts/scan-secrets.mjs'));
  function git(args) {
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr); return r;
  }
  function scan() { return spawnSync(process.execPath, ['scripts/scan-secrets.mjs'], { cwd: dir, encoding: 'utf8' }); }
  git(['init']); git(['config', 'user.name', 'Mock Tester']); git(['config', 'user.email', 'mock@example.invalid']);
  assert.equal(scan().status, 0);
  // Synthetic all-zero canary, generated only in a disposable unrelated checkout.
  const canary = ['f', 'c', '-', '0'.repeat(8), '-', '0'.repeat(4), '-', '0'.repeat(4), '-', '0'.repeat(4), '-', '0'.repeat(12)].join('');
  const file = path.join(dir, 'probe.txt'); await fs.writeFile(file, canary);
  let r = scan(); assert.equal(r.status, 1); assert.ok(!r.stderr.includes(canary));
  git(['add', '.']); git(['commit', '-m', 'Synthetic scanner fixture']);
  await fs.rm(file); git(['add', '-u']); git(['commit', '-m', 'Remove synthetic fixture']);
  r = scan(); assert.equal(r.status, 1); assert.match(r.stderr, /history:probe/); assert.ok(!r.stderr.includes(canary));
});
