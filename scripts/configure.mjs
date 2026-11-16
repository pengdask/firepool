#!/usr/bin/env node
import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Pool } from '../lib/pool.mjs';
import { onboard } from '../lib/onboard.mjs';
import { isMain } from '../lib/main.mjs';

export async function startConfiguration({ pool = new Pool({ home: process.env.FIREPOOL_HOME }), setup = onboard, ttl = 600_000 } = {}) {
  const token = randomBytes(32).toString('hex'), nonce = randomBytes(24).toString('base64');
  let busy = false, closed = false, origin;
  const server = http.createServer(async (req, res) => {
    const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'` };
    const reply = (status, body, type = 'application/json') => { res.writeHead(status, { ...headers, 'Content-Type': `${type}; charset=utf-8` }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
    if (req.headers.host !== new URL(origin).host) return reply(403, { ok: false });
    if (req.method === 'GET' && req.url === '/') {
      return reply(200, `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>firepool 本机配置</title><style nonce="${nonce}">body{font:17px system-ui;max-width:640px;margin:64px auto;padding:20px;line-height:1.7}input,button{font:inherit;padding:12px;box-sizing:border-box;width:100%;margin:10px 0}small{color:#666}</style><h1>配置 firepool</h1><p>粘贴你要使用的 API Key，多个可用空格或逗号分隔。</p><p><small>密钥写入本机用户配置目录，不经过 Agent 对话，不提交仓库。验证时仅发送给对应服务；本机文件按用户权限保存，未额外加密。</small></p><form id="form"><input id="keys" type="password" autocomplete="off" spellcheck="false" placeholder="在这里粘贴 Key" required><button>保存并验证</button></form><p id="status" role="status"></p><script nonce="${nonce}">const token=location.hash.slice(1);history.replaceState(null,'','/');const form=document.getElementById('form'),input=document.getElementById('keys'),status=document.getElementById('status');input.addEventListener('paste',e=>{const t=e.clipboardData.getData('text');if(/[\\r\\n]/.test(t)){e.preventDefault();input.setRangeText(t.replace(/[\\r\\n]+/g,' '),input.selectionStart,input.selectionEnd,'end');}});form.addEventListener('submit',async e=>{e.preventDefault();const keys=input.value.trim().split(/[\\s,，;；]+/).filter(Boolean);input.value='';form.querySelector('button').disabled=true;status.textContent='正在保存、准备工具并验证，请稍候…';try{const response=await fetch('/configure',{method:'POST',headers:{'Content-Type':'application/json','X-Firepool-Token':token},body:JSON.stringify(keys)});const r=await response.json();status.textContent=r.ok?'已完成，可以回到 Agent 继续。':r.configured?'已保存。尚有工具或账号未验证成功，请回到 Agent 查看脱敏结果。':'未完成，请重新输入或回到 Agent 查看原因。';if(!r.ok)form.querySelector('button').disabled=false;}catch{status.textContent='本机配置服务已停止或请求失败，请回到 Agent 继续。';}});</script></html>`, 'text/html');
    }
    const supplied = req.headers['x-firepool-token'];
    const validToken = typeof supplied === 'string' && Buffer.byteLength(supplied) === Buffer.byteLength(token) && timingSafeEqual(Buffer.from(supplied), Buffer.from(token));
    if (req.method !== 'POST' || req.url !== '/configure' || req.headers.origin !== origin || req.headers['content-type'] !== 'application/json' || !validToken) return reply(403, { ok: false });
    if (busy) return reply(409, { ok: false, error: 'configuration_in_progress' });
    busy = true;
    try {
      let size = 0, chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 1024 * 1024) throw Error('input_too_large'); chunks.push(chunk); }
      const result = await setup(pool, Buffer.concat(chunks).toString('utf8'));
      chunks = [];
      reply(200, result);
      process.stdout.write(`${JSON.stringify({ event: 'configuration_result', ...result })}\n`);
      if (result.ok) setTimeout(close, 1500).unref();
    } catch (error) {
      const code = ['invalid_import', 'import_conflict', 'input_too_large'].includes(error.message) ? error.message : 'configuration_failed';
      reply(400, { ok: false, error: code });
      process.stdout.write(`${JSON.stringify({ event: 'configuration_result', ok: false, error: code })}\n`);
    } finally { busy = false; }
  });
  server.requestTimeout = 30_000; server.headersTimeout = 15_000;
  function close() { if (!closed) { closed = true; clearTimeout(timer); server.close(); server.closeIdleConnections(); } }
  const timer = setTimeout(close, ttl);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { url: `${origin}/#${token}`, close, server };
}
if (await isMain(import.meta.url)) {
  startConfiguration().then(({ url }) => {
    process.stdout.write(`${JSON.stringify({ event: 'local_key_form', url, expiresInSeconds: 600 })}\n`);
    if (process.argv.includes('--open')) {
      const [command, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]] : ['xdg-open', [url]];
      const child = spawn(command, args, { shell: false, stdio: 'ignore', windowsHide: true });
      child.on('error', () => process.stdout.write('{"event":"open_url_in_browser"}\n'));
    }
  }).catch(() => { process.stderr.write('{"ok":false,"error":"local_form_unavailable"}\n'); process.exitCode = 1; });
}
