#!/usr/bin/env node
import fs from 'node:fs/promises';
import readline from 'node:readline/promises';
import { Writable } from 'node:stream';
import { Pool, parseImport } from '../lib/pool.mjs';

const help = `firepool (Node.js 22+) — local account pool; JSON output
  add [--id NAME] [--priority N]  Read one key from hidden prompt / stdin
  import --stdin | --file PATH   Import JSON or newline-separated keys
  list                          Show redacted state (no network)
  enable|disable|remove --id ID
  refresh [--id ID]              Explicit credit refresh (network)
  acquire                       Start round; returns key + receipt
  report --round UUID --id ID --outcome OUTCOME [--retry-after VALUE]
Outcomes: success, invalid, exhausted, rate_limit, temporary, target_error
acquire/report can return credentials: keep tool output private.
Default: system user config directory; override with FIREPOOL_HOME (outside checkout).
Lock timeout: 60s. Abandoned locks require manual recovery; see docs/protocol.md.
`;
async function readStdin(limit) {
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > limit) throw Error('input_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8').trim();
}
async function secretInput() {
  if (!process.stdin.isTTY) return readStdin(4096);
  process.stderr.write('API key (hidden): ');
  const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const rl = readline.createInterface({ input: process.stdin, output: muted, terminal: true, historySize: 0 });
  try { return (await rl.question('')).trim(); }
  finally { rl.close(); process.stderr.write('\n'); }
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === 'help') { process.stdout.write(help); return; }
  const allowed = {
    add: ['id', 'priority'], import: ['file', 'stdin'], list: [], enable: ['id'], disable: ['id'], remove: ['id'], refresh: ['id'], acquire: [], report: ['round', 'id', 'outcome', 'retry-after'],
  };
  if (!Object.hasOwn(allowed, command)) throw Error('unknown_command');
  const options = {};
  for (let i = 0; i < args.length;) {
    const flag = args[i];
    if (command === 'import' && flag === '--stdin') {
      if (options.stdin !== undefined) throw Error('invalid_arguments');
      options.stdin = true; i++; continue;
    }
    if (!flag?.startsWith('--') || !allowed[command].includes(flag.slice(2)) || options[flag.slice(2)] !== undefined || args[i + 1] === undefined) throw Error('invalid_arguments');
    options[flag.slice(2)] = args[i + 1];
    i += 2;
  }
  const pool = new Pool({ home: process.env.FIREPOOL_HOME });
  let result;
  if (command === 'add') result = await pool.import(parseImport(JSON.stringify([{ id: options.id, apiKey: await secretInput(), priority: options.priority === undefined ? 100 : Number(options.priority) }])));
  else if (command === 'import') {
    if (options.stdin && options.file) throw Error('invalid_arguments');
    if (options.stdin) {
      if (process.stdin.isTTY) throw Error('stdin_pipe_required');
      result = await pool.import(parseImport(await readStdin(10 * 1024 * 1024)));
    } else {
      if (!options.file) throw Error('missing_file');
      const stat = await fs.stat(options.file);
      if (!stat.isFile() || stat.size > 10 * 1024 * 1024) throw Error('invalid_import_file');
      result = await pool.import(parseImport(await fs.readFile(options.file, 'utf8')));
    }
  } else if (command === 'list') result = await pool.status();
  else if (['enable', 'disable', 'remove'].includes(command)) result = await pool.manage(command, options.id);
  else if (command === 'refresh') result = await pool.refresh(options.id);
  else if (command === 'acquire') result = await pool.acquire();
  else result = await pool.report(options.round, options.id, options.outcome, options['retry-after']);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 2;
}
const errors = new Set(['stdin_pipe_required', 'input_too_large', 'unknown_command', 'invalid_arguments', 'missing_file', 'invalid_import_file', 'invalid_import', 'import_conflict', 'invalid_id', 'unknown_account', 'invalid_outcome', 'invalid_retry_after', 'invalid_receipt', 'too_many_rounds', 'invalid_storage', 'unsafe_storage', 'storage_unavailable', 'storage_inside_repository', 'lock_timeout', 'lock_unavailable']);
main().catch(error => {
  // Never print raw exceptions, argv, imports, server bodies or response headers.
  process.stderr.write(`${JSON.stringify({ ok: false, error: errors.has(error.message) ? error.message : 'operation_failed' })}\n`);
  process.exitCode = 1;
});
