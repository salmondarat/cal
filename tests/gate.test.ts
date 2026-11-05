import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(fs.existsSync('/tmp/opencode') ? '/tmp/opencode' : os.tmpdir(), 'cal-gate-'));
process.env.MEDIA_NO_LISTEN = '1';
process.env.RELATE_DATA_DIR = path.join(TMP, 'data');
process.env.APP_PASSWORD = ''; // dotenv will not overwrite; tests set it explicitly

const { app } = await import('../server.ts');

let base = '';
let server: import('node:http').Server | null = null;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server!.once('listening', r));
  base = `http://127.0.0.1:${(server!.address() as any).port}`;
});
after(async () => {
  await new Promise((r) => server?.close(() => r(undefined)));
  fs.rmSync(TMP, { recursive: true, force: true });
});

async function get(p: string, opts: { cookie?: string; accept?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.Cookie = opts.cookie;
  if (opts.accept) headers.Accept = opts.accept;
  const res = await fetch(`${base}${p}`, { headers });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, headers: res.headers };
}

async function login(password: string) {
  const res = await fetch(`${base}/gate/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  return { status: res.status, cookie: res.headers.get('set-cookie') };
}

test('gate is open when APP_PASSWORD is unset', async () => {
  const status = await get('/api/gate/status');
  assert.equal(status.status, 200);
  assert.deepEqual(status.body, { required: false, authenticated: true });
  const roots = await get('/api/library/roots');
  assert.equal(roots.status, 200);
});

test('with a password set, API calls demand a session', async () => {
  process.env.APP_PASSWORD = 'hunter2';
  const status = await get('/api/gate/status');
  assert.equal(status.body.required, true);
  assert.equal(status.body.authenticated, false);
  const roots = await get('/api/library/roots');
  assert.equal(roots.status, 401);
  assert.equal(roots.body.error, 'This Relate Social server is password protected.');
  delete process.env.APP_PASSWORD;
});

test('browser navigations get the login page, not bare JSON', async () => {
  process.env.APP_PASSWORD = 'hunter2';
  const page = await get('/auth/meta/start', { accept: 'text/html' });
  assert.equal(page.status, 401);
  assert.ok(typeof page.body === 'string' && page.body.includes('password protected'));
  delete process.env.APP_PASSWORD;
});

test('wrong password is refused; right password sets a working session cookie', async () => {
  process.env.APP_PASSWORD = 'hunter2';
  const bad = await login('nope');
  assert.equal(bad.status, 401);
  assert.equal(bad.cookie, null);
  const good = await login('hunter2');
  assert.equal(good.status, 200);
  assert.ok(good.cookie && good.cookie.includes('relate_session') && good.cookie.includes('HttpOnly'));
  const cookie = good.cookie!.split(';')[0];
  const roots = await get('/api/library/roots', { cookie });
  assert.equal(roots.status, 200);
  delete process.env.APP_PASSWORD;
});

test('changing the password invalidates issued sessions', async () => {
  process.env.APP_PASSWORD = 'hunter2';
  const good = await login('hunter2');
  const cookie = good.cookie!.split(';')[0];
  process.env.APP_PASSWORD = 'changed';
  const roots = await get('/api/library/roots', { cookie });
  assert.equal(roots.status, 401);
  delete process.env.APP_PASSWORD;
});

test('signed public media downloads stay exempt from the gate', async () => {
  process.env.APP_PASSWORD = 'hunter2';
  const res = await get('/api/public-media/bogus');
  assert.notEqual(res.status, 401);
  delete process.env.APP_PASSWORD;
});
