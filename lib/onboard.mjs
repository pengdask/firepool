import { parseImport } from './pool.mjs';
import { prepareTool } from './tool.mjs';

export async function onboard(pool, raw, prepare = prepareTool) {
  let imported = { added: 0 };
  let ids;
  if (raw?.trim()) {
    const rows = parseImport(raw);
    imported = await pool.import(rows);
    const keys = new Set(rows.map(a => a.apiKey));
    ids = await pool.transaction(async accounts => accounts.filter(a => keys.has(a.apiKey) && a.enabled).map(a => a.id));
  } else {
    ids = (await pool.status()).accounts.filter(a => a.enabled).map(a => a.id);
  }
  let toolReady = false, toolError;
  try { await prepare(pool.home); toolReady = true; } catch (e) {
    toolError = ['npm_not_found', 'tool_install_failed', 'tool_verification_failed'].includes(e.message) ? e.message : 'tool_install_failed';
  }
  const checked = [];
  for (const id of ids) checked.push(...(await pool.refresh(id)).accounts);
  const states = new Map((await pool.status()).accounts.map(a => [a.id, a]));
  const available = checked.filter(a => !a.disabled && !a.unknown && a.remaining > 0 && states.get(a.id)?.status === 'ready').length;
  const coolingDown = checked.filter(a => ['rate_limit', 'temporary'].includes(states.get(a.id)?.status)).length;
  const waits = [...states.values()].filter(a => ids.includes(a.id) && a.retryNotBefore > pool.now()).map(a => a.retryNotBefore);
  const summary = { total: states.size, retryNotBefore: waits.length ? Math.min(...waits) : null, imported: imported.added, checked: checked.length, available, coolingDown, invalid: checked.filter(a => a.disabled).length, exhausted: checked.filter(a => !a.disabled && !a.unknown && a.remaining !== null && a.remaining <= 0).length, unknown: checked.filter(a => a.unknown && !a.disabled).length };
  return { ok: toolReady && available > 0, configured: true, toolReady, ...summary, ...(toolError ? { error: toolError, next: 'prepare_tool_then_setup_again' } : available === 0 ? { error: ids.length ? 'no_verified_available_accounts' : 'keys_required', next: ids.length ? 'check_account_status_or_retry_verification' : 'open_local_key_form' } : {}) };
}
