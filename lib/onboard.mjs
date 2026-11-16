import { parseImport } from './pool.mjs';
import { prepareTool } from './tool.mjs';

export async function onboard(pool, raw, prepare = prepareTool) {
  let imported = { added: 0 }, received = 0;
  if (raw?.trim()) {
    const rows = parseImport(raw);
    received = rows.length;
    imported = await pool.import(rows);
  }
  const before = await pool.status();
  // With keys already in the pool, reuse their settings and the shared balance cache.
  // No keys: return the one missing step without downloading tools unnecessarily.
  if (!before.summary.total) return { ok: false, configured: false, toolReady: false, imported: 0, duplicate: 0, ...before.summary, error: 'keys_required', next: 'provide_keys' };
  let toolReady = false, toolError;
  try { await prepare(pool.home); toolReady = true; } catch (e) {
    toolError = ['npm_not_found', 'tool_install_failed', 'tool_verification_failed'].includes(e.message) ? e.message : 'tool_install_failed';
  }
  const checked = await pool.refresh(undefined, false);
  const { summary } = await pool.status();
  return { ok: toolReady && summary.available > 0, configured: true, toolReady, imported: imported.added, duplicate: received - imported.added, checked: checked.accounts.length, ...summary,
    ...(toolError ? { error: toolError, next: 'prepare_tool_then_setup_again' } : summary.available === 0 ? { error: 'no_verified_available_accounts', next: summary.coolingDown ? 'wait_until_retry_time' : summary.enabled === 0 ? 'enable_account_or_add_keys' : summary.invalid === summary.enabled ? 'replace_invalid_keys' : summary.unknown ? 'retry_verification_later' : 'check_account_status_or_retry_verification' } : {}) };
}
