import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { safeHome, locked } from './store.mjs';

export const TOOL_VERSION = '1.29.0';
const ALLOWED = new Set(['scrape', 'search', 'map']);
export function childEnv(key) {
  const env = { ...process.env, FIRECRAWL_API_URL: 'https://api.firecrawl.dev', FIRECRAWL_NO_TELEMETRY: '1', FIRECRAWL_NO_UPDATE_CHECK: '1', NO_COLOR: '1', CI: '1' };
  delete env.FIRECRAWL_API_KEY; delete env.FIRECRAWL_BASE_URL; delete env.FIRECRAWL_API_BASE_URL; delete env.FORCE_COLOR; delete env.DEBUG;
  if (key) env.FIRECRAWL_API_KEY = key;
  return env;
}
export function launch(command, args, { env = childEnv(), timeout = 180_000, cwd } = {}) {
  return new Promise(resolve => {
    let output = '', error = '', size = 0, stopped = false;
    const child = spawn(command, args, { env, cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { stopped = true; child.kill(); }, timeout);
    const collect = name => data => {
      size += data.length;
      if (size > 4 * 1024 * 1024) { stopped = true; child.kill(); return; }
      if (name === 'stdout') output += data; else error += data;
    };
    child.stdout.on('data', collect('stdout')); child.stderr.on('data', collect('stderr'));
    child.on('error', () => { clearTimeout(timer); resolve({ code: -1, stdout: '', stderr: '', interrupted: true }); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout: output, stderr: error, interrupted: stopped }); });
  });
}
export async function toolPath(home) {
  return path.join(await safeHome(home), 'tools', 'node_modules', 'firecrawl-cli', 'dist', 'launcher.js');
}
export async function prepareTool(home, execute = launch) {
  const dir = await safeHome(home);
  return locked(dir, async () => {
    const tools = path.join(dir, 'tools'), manifest = path.join(tools, 'node_modules', 'firecrawl-cli', 'package.json');
    let installed = false;
    try { installed = JSON.parse(await fs.readFile(manifest, 'utf8')).version === TOOL_VERSION; } catch { /* install below */ }
    if (!installed) {
      await fs.mkdir(tools, { recursive: true, mode: 0o700 });
      // npm's JS entry avoids Windows .cmd/shell quoting and keeps package args out of a shell.
      const npm = path.resolve(path.dirname(process.execPath), process.platform === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : '../lib/node_modules/npm/bin/npm-cli.js');
      let npmEntry = process.env.npm_execpath;
      if (!npmEntry || !npmEntry.endsWith('npm-cli.js')) npmEntry = npm;
      try { await fs.access(npmEntry); } catch {
        npmEntry = null;
        for (const bin of (process.env.PATH || '').split(path.delimiter)) {
          try {
            const candidate = process.platform === 'win32' ? path.join(bin, 'node_modules', 'npm', 'bin', 'npm-cli.js') : await fs.realpath(path.join(bin, 'npm'));
            if (!candidate.endsWith('npm-cli.js')) continue;
            await fs.access(candidate); npmEntry = candidate; break;
          } catch { /* next PATH entry */ }
        }
        if (!npmEntry) throw Error('npm_not_found');
      }
      const r = await execute(process.execPath, [npmEntry, 'install', '--prefix', tools, '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', `firecrawl-cli@${TOOL_VERSION}`], { env: childEnv(), cwd: tools });
      if (r.code !== 0 || r.interrupted) throw Error('tool_install_failed');
    }
    const entry = await toolPath(home);
    const check = await execute(process.execPath, [entry, '--help'], { env: childEnv(), cwd: tools, timeout: 30_000 });
    if (check.code !== 0 || check.interrupted) throw Error('tool_verification_failed');
    return { ok: true, toolReady: true, version: TOOL_VERSION };
  });
}
export async function runTool(pool, request, execute = launch) {
  if (!request || !ALLOWED.has(request.command) || !Array.isArray(request.args) || request.args.some(a => typeof a !== 'string' || /[\r\n\0]/.test(a) || /^-k/.test(a) || /^--(?:api-key|api-url)(?:=|$)/.test(a))) throw Error('invalid_tool_request');
  let receipt;
  if (request.round) {
    if (!['invalid', 'exhausted', 'rate_limit'].includes(request.outcome)) throw Error('unsafe_tool_retry');
    receipt = await pool.report(request.round, request.id, request.outcome, request.retryAfter);
  } else receipt = await pool.acquire();
  if (!receipt.ok) return receipt;
  const redact = text => text.split(receipt.apiKey).join('[REDACTED]');
  const entry = await toolPath(pool.home);
  let result;
  try {
    await fs.access(entry);
    result = await execute(process.execPath, [entry, request.command, ...request.args], { env: childEnv(receipt.apiKey), cwd: os.tmpdir() });
  } catch {
    await pool.report(receipt.round, receipt.id, 'target_error');
    throw Error('tool_not_ready');
  }
  if (result.code === 0 && !result.interrupted) {
    await pool.report(receipt.round, receipt.id, 'success');
    return { ok: true, stdout: redact(result.stdout), stderr: redact(result.stderr) };
  }
  // CLI failure text is not a trusted account-status schema. Preserve the receipt;
  // only a verified auth/quota/throttle classification may route a retry.
  return { ok: false, error: result.interrupted ? 'tool_interrupted_no_auto_retry' : 'tool_failed', round: receipt.round, id: receipt.id, exitCode: result.code, stdout: redact(result.stdout), stderr: redact(result.stderr) };
}
