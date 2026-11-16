import { randomUUID } from 'node:crypto';
import { readJSON, writeJSON, locked, safeHome, defaultHome } from './store.mjs';

const TTL = 15 * 60_000;
const ROUND_TTL = 60 * 60_000;
const outcomes = new Set(['success', 'invalid', 'exhausted', 'rate_limit', 'temporary', 'target_error']);
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$/;
function validId(id) { return typeof id === 'string' && idPattern.test(id) && !Object.hasOwn(Object.prototype, id) && !/^(fc-|gh[opusr]_)/i.test(id); }
function normalizeKey(key) {
  if (typeof key !== 'string') throw Error('invalid_import');
  const value = key.trim().replace(/^Bearer\s+/i, '');
  if (!value || /\s/.test(value) || value.length > 512) throw Error('invalid_import');
  return value;
}
export function parseImport(raw) {
  let rows;
  try {
    const text = raw.trim();
    rows = /^[\[{]/.test(text) ? JSON.parse(text) : text.split(/\r?\n/).filter(s => s.trim());
    if (!Array.isArray(rows)) rows = rows.accounts;
    if (!Array.isArray(rows) || !rows.length) throw Error();
    return rows.map(row => {
      if (typeof row === 'string') row = { apiKey: row };
      if (!row || typeof row !== 'object') throw Error();
      const priority = row.priority ?? 100;
      if (!Number.isSafeInteger(priority) || priority < 1 || (row.id !== undefined && !validId(row.id)) || (row.enabled !== undefined && typeof row.enabled !== 'boolean')) throw Error();
      return { id: row.id, apiKey: normalizeKey(row.apiKey), priority, enabled: row.enabled ?? true };
    });
  } catch { throw Error('invalid_import'); }
}
export function retryDelay(value, now) {
  if (value === undefined) return 60_000;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  if (!Number.isFinite(delay) || delay < 0) throw Error('invalid_retry_after');
  return Math.min(Math.max(delay, 1000), 24 * 60 * 60_000);
}
export async function creditUsage(apiKey, fetcher = fetch) {
  // Fixed origin and no redirects: credentials never follow a redirect to another host.
  const response = await fetcher('https://api.firecrawl.dev/v2/team/credit-usage', {
    headers: { Authorization: `Bearer ${apiKey}` }, redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return { status: response.status, retryAfter: response.headers.get('retry-after') ?? undefined };
  const body = await response.json();
  const remaining = body?.data?.remainingCredits;
  if (body.success !== true || typeof remaining !== 'number' || !Number.isFinite(remaining)) throw Error('invalid_credit_response');
  return { status: 200, remaining };
}
export class Pool {
  constructor({ home = defaultHome(), now = () => Date.now(), query = creditUsage } = {}) { this.home = home; this.now = now; this.query = query; }
  async transaction(fn) {
    const dir = await safeHome(this.home);
    return locked(dir, async () => {
      const credentials = await readJSON(dir, 'credentials.json', { version: 1, accounts: [] });
      const state = await readJSON(dir, 'state.json', { version: 1, accounts: {}, rounds: {}, current: null });
      if (credentials.version !== 1 || !Array.isArray(credentials.accounts) || state.version !== 1 || !state.accounts || Array.isArray(state.accounts) || !state.rounds || Array.isArray(state.rounds)) throw Error('invalid_storage');
      const ids = new Set(), keys = new Set();
      for (const a of credentials.accounts) {
        if (!validId(a.id) || typeof a.apiKey !== 'string' || !a.apiKey || !Number.isSafeInteger(a.priority) || a.priority < 1 || typeof a.enabled !== 'boolean' || ids.has(a.id) || keys.has(a.apiKey)) throw Error('invalid_storage');
        ids.add(a.id); keys.add(a.apiKey);
      }
      for (const value of Object.values(state.accounts)) {
        if (!value || typeof value !== 'object' || Array.isArray(value) || (value.until !== undefined && !Number.isFinite(value.until)) || (value.checkedAt !== undefined && !Number.isFinite(value.checkedAt))) throw Error('invalid_storage');
      }
      const beforeCredentials = JSON.stringify(credentials), beforeState = JSON.stringify(state);
      for (const [id, round] of Object.entries(state.rounds)) {
        if (!round || !Number.isFinite(round.createdAt) || !Array.isArray(round.tried)) throw Error('invalid_storage');
        if (this.now() - round.createdAt >= ROUND_TTL) delete state.rounds[id];
      }
      const result = await fn(credentials.accounts, state);
      if (beforeCredentials !== JSON.stringify(credentials)) await writeJSON(dir, 'credentials.json', credentials);
      if (beforeState !== JSON.stringify(state)) await writeJSON(dir, 'state.json', state);
      return result;
    });
  }
  async import(rows) {
    return this.transaction(async accounts => {
      const pending = accounts.map(a => ({ ...a })); let added = 0;
      for (const row of rows) {
        const duplicate = pending.find(a => a.apiKey === row.apiKey);
        if (duplicate) {
          if (row.id && row.id !== duplicate.id) throw Error('import_conflict');
          continue;
        }
        const id = row.id || `account-${randomUUID().slice(0, 8)}`;
        if (!validId(id) || pending.some(a => a.id === id)) throw Error('import_conflict');
        pending.push({ ...row, id }); added++;
      }
      accounts.splice(0, accounts.length, ...pending);
      return { ok: true, added, total: accounts.length };
    });
  }
  async manage(action, id) {
    if (!validId(id)) throw Error('invalid_id');
    return this.transaction(async (accounts, state) => {
      const index = accounts.findIndex(a => a.id === id);
      if (index < 0) throw Error('unknown_account');
      if (action === 'remove') accounts.splice(index, 1);
      else accounts[index].enabled = action === 'enable';
      delete state.accounts[id];
      for (const [receipt, round] of Object.entries(state.rounds)) {
        if (round.pending === id) delete state.rounds[receipt];
      }
      if (state.current === id) state.current = null;
      return { ok: true, id, action };
    });
  }
  async status() {
    return this.transaction(async (accounts, state) => {
      const now = this.now();
      const rows = accounts.map(a => {
        const s = state.accounts[a.id] || {};
        const status = !a.enabled ? 'disabled' : s.disabled ? 'invalid' : s.until > now ? s.reason : Number.isFinite(s.remaining) && s.remaining <= 0 ? 'exhausted' : s.queryUnknown ? 'unknown' : s.checkedAt === undefined ? 'unverified' : now - s.checkedAt >= TTL ? 'stale' : 'ready';
        return { id: a.id, enabled: a.enabled, priority: a.priority, status, remaining: s.remaining ?? null, checkedAt: s.checkedAt ?? null, retryNotBefore: s.until > now ? s.until : null };
      });
      const count = status => rows.filter(a => a.status === status).length;
      const waits = rows.filter(a => a.enabled && a.status !== 'invalid' && a.retryNotBefore).map(a => a.retryNotBefore);
      const summary = { total: rows.length, enabled: rows.filter(a => a.enabled).length, available: count('ready'), disabled: count('disabled'), invalid: count('invalid'), exhausted: count('exhausted'), coolingDown: count('rate_limit') + count('temporary'), unknown: count('unknown'), unverified: count('unverified'), stale: count('stale'), retryNotBefore: waits.length ? Math.min(...waits) : null };
      return { ok: true, current: state.current, summary, accounts: rows };
    });
  }

  apply(state, id, outcome, retryAfter) {
    const now = this.now(), s = state.accounts[id] ||= {};
    if (outcome === 'invalid') { s.disabled = true; s.reason = 'invalid'; }
    else if (outcome === 'exhausted') { s.remaining = 0; s.checkedAt = now; s.until = now + 300_000; s.reason = 'exhausted'; }
    else if (outcome === 'rate_limit' || outcome === 'temporary') { s.until = now + retryDelay(retryAfter, now); s.reason = outcome; }
    // A late success must not clear a newer failure reported by another process.
  }
  async refreshOne(account, state, force = false) {
    const s = state.accounts[account.id] ||= {}, now = this.now();
    if (!force && (s.disabled || s.until > now)) return;
    if (!force && s.checkedAt !== undefined && now - s.checkedAt < TTL && !(Number.isFinite(s.remaining) && s.remaining <= 0 && (!s.until || s.until <= now))) return;
    try {
      const result = await this.query(account.apiKey);
      if (result.status === 200 && Number.isFinite(result.remaining)) {
        s.remaining = result.remaining; s.checkedAt = now; delete s.queryUnknown;
        if (result.remaining <= 0) this.apply(state, account.id, 'exhausted');
        else if (s.reason === 'exhausted') { delete s.until; delete s.reason; }
      } else if ([401, 403].includes(result.status)) this.apply(state, account.id, 'invalid');
      else if (result.status === 402) this.apply(state, account.id, 'exhausted');
      else if (result.status === 429) this.apply(state, account.id, 'rate_limit', result.retryAfter);
      else { s.queryUnknown = true; s.checkedAt = now; s.remaining = null; }
    } catch { s.queryUnknown = true; s.checkedAt = now; s.remaining = null; }
  }
  async refresh(id, force = true) {
    return this.transaction(async (accounts, state) => {
      if (id && !accounts.some(a => a.id === id)) throw Error('unknown_account');
      const results = [];
      for (const a of accounts.filter(a => a.enabled && (!id || a.id === id))) {
        await this.refreshOne(a, state, force);
        const s = state.accounts[a.id];
        results.push({ id: a.id, remaining: s.remaining ?? null, unknown: !!s.queryUnknown, disabled: !!s.disabled });
      }
      return { ok: true, accounts: results };
    });
  }
  async select(accounts, state, roundId) {
    const round = state.rounds[roundId], now = this.now();
    const sorted = [...accounts].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    const current = sorted.findIndex(a => a.id === state.current);
    if (current > 0) sorted.unshift(...sorted.splice(current, 1));
    for (const a of sorted) {
      const s = state.accounts[a.id] || {};
      if (!a.enabled || round.tried.includes(a.id) || s.disabled || s.until > now) continue;
      await this.refreshOne(a, state);
      const updated = state.accounts[a.id];
      if (updated.disabled || updated.until > now || (updated.remaining !== null && updated.remaining <= 0)) continue;
      state.current = a.id; round.tried.push(a.id); round.pending = a.id;
      return { ok: true, round: roundId, id: a.id, apiKey: a.apiKey };
    }
    const waits = accounts.filter(a => a.enabled && !state.accounts[a.id]?.disabled).map(a => state.accounts[a.id]?.until).filter(t => t > now);
    delete state.rounds[roundId];
    return { ok: false, error: 'pool_unavailable', retryNotBefore: waits.length ? Math.min(...waits) : null };
  }
  async acquire() {
    return this.transaction(async (accounts, state) => {
      if (Object.keys(state.rounds).length >= 1000) throw Error('too_many_rounds');
      const id = randomUUID(); state.rounds[id] = { createdAt: this.now(), tried: [] };
      return this.select(accounts, state, id);
    });
  }
  async report(roundId, id, outcome, retryAfter) {
    if (!outcomes.has(outcome)) throw Error('invalid_outcome');
    if (retryAfter !== undefined) retryDelay(retryAfter, this.now());
    return this.transaction(async (accounts, state) => {
      const round = state.rounds[roundId];
      if (!round || round.pending !== id || !accounts.some(a => a.id === id)) throw Error('invalid_receipt');
      this.apply(state, id, outcome, retryAfter);
      if (outcome === 'success' || outcome === 'target_error') {
        delete state.rounds[roundId]; return { ok: true, done: true };
      }
      delete round.pending;
      return this.select(accounts, state, roundId);
    });
  }
}
