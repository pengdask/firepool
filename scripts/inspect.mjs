#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { ROOT, defaultHome } from '../lib/store.mjs';
import { Pool } from '../lib/pool.mjs';

// Inspect known locations only. Never dump credentials or search the user's disk.
export async function inspect({ home = os.homedir(), env = process.env, dataHome = env.FIREPOOL_HOME || defaultHome() } = {}) {
  const candidates = [...new Set([ROOT, path.join(env.CODEX_HOME || path.join(home, '.codex'), 'skills', 'firepool'), path.join(home, '.claude', 'skills', 'firepool'), path.join(home, '.agents', 'skills', 'firepool')])];
  const installations = [];
  for (const dir of candidates) {
    try {
      const text = await fs.readFile(path.join(dir, 'SKILL.md'), 'utf8');
      if (/^name:\s*firepool\s*$/m.test(text)) installations.push(dir);
    } catch (e) { if (!['ENOENT', 'ENOTDIR'].includes(e.code)) throw Error('inspection_failed'); }
  }
  let accounts = [], configured = false;
  try {
    await fs.access(path.join(dataHome, 'credentials.json'));
    accounts = (await new Pool({ home: dataHome }).status()).accounts;
    configured = true;
  } catch (e) { if (e.code !== 'ENOENT') throw Error('existing_pool_unreadable'); }
  return { ok: true, installations, configured, accounts, environmentKeyPresent: Boolean(env.FIRECRAWL_API_KEY), next: configured && accounts.length ? 'reuse_pool_merge_new_keys' : 'setup' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  inspect().then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(e => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: e.message === 'existing_pool_unreadable' ? e.message : 'inspection_failed' })}\n`); process.exitCode = 1;
  });
}
