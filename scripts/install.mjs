#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { isMain } from '../lib/main.mjs';
import { ROOT } from '../lib/store.mjs';

const FILES = ['SKILL.md', 'AGENTS.md', 'README.md', 'README.en.md', 'README.zh-CN.md', 'LICENSE', 'SECURITY.md', 'package.json', 'package-lock.json', 'scripts', 'lib', 'docs'];
export function installTarget(agent, home = os.homedir(), env = process.env) {
  if (agent === 'codex') return path.join(env.CODEX_HOME || path.join(home, '.codex'), 'skills', 'firepool');
  if (agent === 'claude' || agent === 'claude-code') return path.join(home, '.claude', 'skills', 'firepool');
  // WorkBuddy's supported import mechanism varies by client. The agent must discover
  // its actual path or use the client's package importer, not invent a directory.
  throw Error(agent === 'workbuddy' ? 'workbuddy_target_or_package_import_required' : 'agent_target_required');
}
async function files(dir, prefix = '') {
  const found = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw Error('unsafe_install_source');
    const name = path.join(prefix, entry.name);
    if (entry.isDirectory()) found.push(...await files(path.join(dir, entry.name), name));
    else if (entry.isFile()) found.push(name);
  }
  return found;
}
export async function installSkill({ target, agent, source = ROOT, home, env } = {}) {
  target = path.resolve(target || installTarget(agent, home, env)); source = await fs.realpath(source);
  const rel = path.relative(source, target);
  if (!rel) return { ok: true, installed: true, changed: false, target };
  if (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)) throw Error('invalid_install_target');
  const entries = [];
  for (const file of FILES) {
    const stat = await fs.lstat(path.join(source, file));
    if (stat.isSymbolicLink()) throw Error('unsafe_install_source');
    if (stat.isDirectory()) entries.push(...(await files(path.join(source, file), file)));
    else entries.push(file);
  }
  const hashes = {};
  for (const file of entries) hashes[file] = createHash('sha256').update(await fs.readFile(path.join(source, file))).digest('hex');
  await fs.mkdir(path.dirname(target), { recursive: true });
  const lockPath = `${target}.install.lock`;
  let lock;
  try { lock = await fs.open(lockPath, 'wx', 0o600); } catch (e) { if (e.code === 'EEXIST') throw Error('installation_in_progress'); throw e; }
  const stage = `${target}.install-${randomUUID()}`, backup = `${target}.previous-${randomUUID()}`;
  let upgrading = false, backedUp = false;
  try {
    let exists = false;
    try { await fs.lstat(target); exists = true; } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (exists) {
      try {
        const stat = await fs.lstat(target);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error();
        const previous = JSON.parse(await fs.readFile(path.join(target, '.firepool-install.json'), 'utf8'));
        const existing = (await files(target)).filter(f => f !== '.firepool-install.json');
        if (!previous || Array.isArray(previous) || existing.length !== Object.keys(previous).length) throw Error();
        for (const file of existing) {
          if (!Object.hasOwn(previous, file) || createHash('sha256').update(await fs.readFile(path.join(target, file))).digest('hex') !== previous[file]) throw Error();
        }
        const identity = JSON.parse(await fs.readFile(path.join(target, 'package.json'), 'utf8'));
        if (identity.name !== 'firepool') throw Error();
        if (existing.length === entries.length && existing.every(f => previous[f] === hashes[f])) return { ok: true, installed: true, changed: false, target };
        upgrading = true;
      } catch { throw Error('existing_installation_conflict'); }
    }
    await fs.mkdir(stage);
    for (const file of entries) { await fs.mkdir(path.dirname(path.join(stage, file)), { recursive: true }); await fs.copyFile(path.join(source, file), path.join(stage, file)); }
    await fs.writeFile(path.join(stage, '.firepool-install.json'), JSON.stringify(hashes));
    if (upgrading) { await fs.rename(target, backup); backedUp = true; }
    try { await fs.rename(stage, target); }
    catch (e) { if (backedUp) { await fs.rename(backup, target); backedUp = false; } throw e; }
    if (backedUp) { await fs.rm(backup, { recursive: true }); backedUp = false; }
    return { ok: true, installed: true, changed: true, upgraded: upgrading, target };
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
    await lock.close(); await fs.rm(lockPath, { force: true });
  }

}
if (await isMain(import.meta.url)) {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--agent', '--target'].includes(args[i]) || !args[i + 1] || options[args[i].slice(2)]) { process.stderr.write('{"ok":false,"error":"invalid_arguments"}\n'); process.exit(1); }
    options[args[i].slice(2)] = args[i + 1];
  }
  installSkill(options).then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(e => {
    const known = new Set(['workbuddy_target_or_package_import_required', 'agent_target_required', 'invalid_install_target', 'existing_installation_conflict', 'unsafe_install_source', 'installation_in_progress']);
    process.stderr.write(`${JSON.stringify({ ok: false, error: known.has(e.message) ? e.message : 'installation_failed' })}\n`); process.exitCode = 1;
  });
}
