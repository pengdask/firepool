import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function defaultHome() {
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'firepool');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'firepool');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'firepool');
}
function inside(root, dest) {
  const rel = path.relative(root, dest);
  return !rel || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}
export async function safeHome(input) {
  const dest = path.resolve(input);
  // Resolve existing ancestors so a symlink cannot redirect secrets into the checkout.
  let ancestor = dest, suffix = [];
  while (true) {
    try { ancestor = await fs.realpath(ancestor); break; }
    catch (e) { if (e.code !== 'ENOENT') throw Error('storage_unavailable'); suffix.unshift(path.basename(ancestor)); const next = path.dirname(ancestor); if (next === ancestor) throw Error('storage_unavailable'); ancestor = next; }
  }
  const real = path.join(ancestor, ...suffix);
  const root = await fs.realpath(ROOT);
  if (inside(root, real)) throw Error('storage_inside_repository');
  await fs.mkdir(real, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') await fs.chmod(real, 0o700);
  return real;
}
export async function readJSON(dir, name, fallback) {
  const file = path.join(dir, name);
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('unsafe_storage');
    if (process.platform !== 'win32') await fs.chmod(file, 0o600);
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (e) { if (e.code === 'ENOENT') return fallback; throw Error('invalid_storage'); }
}
export async function writeJSON(dir, name, data) {
  const temp = path.join(dir, `.${name}.${randomUUID()}.tmp`);
  try {
    const handle = await fs.open(temp, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(data)); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temp, path.join(dir, name));
  } finally { await fs.rm(temp, { force: true }).catch(() => {}); }
}
export async function locked(dir, fn, timeout = 60000) {
  const lock = path.join(dir, '.lock');
  const start = Date.now();
  let handle;
  while (!handle) {
    try { handle = await fs.open(lock, 'wx', 0o600); }
    catch (e) {
      if (e.code !== 'EEXIST') throw Error('lock_unavailable');
      if (Date.now() - start >= timeout) throw Error('lock_timeout');
      await new Promise(resolve => setTimeout(resolve, 40));
    }
  }
  try { return await fn(); }
  finally { await handle.close(); await fs.rm(lock, { force: true }); }
}
