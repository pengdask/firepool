#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function git(args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
// Values are deliberately never included in diagnostics.
const patterns = [
  /\bfc-[A-Za-z0-9][A-Za-z0-9_-]{15,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /(?:apiKey|api_key|password|totp_secret)\s*["']?\s*[:=]\s*["'](?!(?:MOCK_|mock-|YOUR_|<|\$|\{))[^"'\s]{16,}["']/i,
];
const sensitive = /(?:^|\/)(?:\.env(?:\..*)?|credentials(?:\..*)?|state\.json|config\.json)$|\.(?:tsv|csv|log|pem)$/i;
let checked = 0, findings = 0;
function check(name, text) {
  checked++;
  if (sensitive.test(name) || patterns.some(p => p.test(text))) { findings++; process.stderr.write(`Potential secret in ${name}; value withheld\n`); }
}
try {
  const files = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean);
  for (const file of new Set(files)) if (fs.existsSync(path.join(root, file))) check(file, fs.readFileSync(path.join(root, file), 'utf8'));
  let history = '';
  try { history = git(['rev-list', '--objects', '--all']); } catch { /* initial repository */ }
  for (const line of history.split('\n').filter(Boolean)) {
    const split = line.indexOf(' '), oid = split < 0 ? line : line.slice(0, split), name = split < 0 ? '[history]' : line.slice(split + 1);
    if (git(['cat-file', '-t', oid]).trim() === 'blob') check(`history:${name}`, git(['cat-file', 'blob', oid]));
  }
  if (findings) process.exitCode = 1;
  else process.stdout.write(`Secret scan passed (${checked} files/blobs). Pattern scanning is not a proof of absence; review staged files before publication.\n`);
} catch { process.stderr.write('Secret scan failed; initialize Git and retry.\n'); process.exitCode = 1; }
