import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const TMP_BASE = fs.existsSync('/tmp/opencode') ? '/tmp/opencode' : os.tmpdir();
fs.mkdirSync(TMP_BASE, { recursive: true });
const ROOT = fs.mkdtempSync(path.join(TMP_BASE, 'cal-roots-'));
const OUTSIDE = fs.mkdtempSync(path.join(TMP_BASE, 'cal-outside-'));
fs.mkdirSync(path.join(ROOT, 'clips'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'clips', 'a.txt'), 'x');

process.env.MEDIA_NO_LISTEN = '1';
// Keep library-roots.json in a scratch dir; the tests register real roots.
process.env.RELATE_DATA_DIR = path.join(ROOT, 'data');
process.env.MEDIA_BROWSE_ROOTS = ROOT;
process.env.MEDIA_BROWSE = '1';
process.env.MEDIA_BROWSE_REMOTE = '1';
process.env.APP_PASSWORD = ''; // dotenv will not overwrite a set value

const { app } = await import('../server.ts');

let base = '';
let server: http.Server | null = null;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server!.once('listening', r));
  base = `http://127.0.0.1:${(server!.address() as any).port}`;
});
after(async () => {
  await new Promise((r) => server?.close(() => r(undefined)));
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.rmSync(OUTSIDE, { recursive: true, force: true });
});

// `fetch` silently drops a custom Host header (forbidden header name), so the
// remote gate can only be exercised through node:http.
function request(method: string, p: string, host: string, body?: unknown): Promise<{ status: number; body: any }> {
  const port = new URL(base).port;
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: p, method, headers: { Host: host, ...(body ? { 'Content-Type': 'application/json' } : {}) } },
      (res) => {
        let d = '';
        res.on('data', (c) => { d += c; });
        res.on('end', () => resolve({ status: res.statusCode || 0, body: d ? JSON.parse(d) : {} }));
      },
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const REMOTE = 'example.com';
const IMPORT_MSG = 'Folders from other devices are added by importing them, not by path.';
const HOST_ONLY_MSG = 'This folder lives on the computer running Relate Social and is only available there. Import a folder to share it across devices.';
const IMPORTS = path.join(ROOT, 'data', 'imports');

test('a remote client cannot register a host folder by path', async () => {
  const { status, body } = await request('POST', '/api/library/roots', REMOTE, { path: OUTSIDE });
  assert.equal(status, 403);
  assert.equal(body.error, IMPORT_MSG);
});

test('traversal-shaped remote registration is refused before the filesystem is probed', async () => {
  const { status, body } = await request('POST', '/api/library/roots', REMOTE, { path: path.join(ROOT, '..', 'etc') });
  assert.equal(status, 403);
  assert.equal(body.error, IMPORT_MSG);
});

test('remote registration is refused even inside the browse roots — imports only', async () => {
  process.env.MEDIA_BROWSE_REMOTE = '0';
  const { status, body } = await request('POST', '/api/library/roots', REMOTE, { path: path.join(ROOT, 'clips') });
  assert.equal(status, 403);
  assert.equal(body.error, IMPORT_MSG);
  process.env.MEDIA_BROWSE_REMOTE = '1';
});

test('a remote client may register a collection inside the imports directory', async () => {
  fs.mkdirSync(path.join(IMPORTS, 'clips'), { recursive: true });
  const { status, body } = await request('POST', '/api/library/roots', REMOTE, { path: path.join(IMPORTS, 'clips') });
  assert.equal(status, 201);
  assert.equal(body.path, path.join(IMPORTS, 'clips'));
});

test('the loopback client keeps paste-any-path freedom', async () => {
  const { status, body } = await request('POST', '/api/library/roots', 'localhost', { path: OUTSIDE });
  assert.equal(status, 201);
  assert.equal(body.path, OUTSIDE);
});

test('remote clients see only imported collections in the root list', async () => {
  const remote = await request('GET', '/api/library/roots', REMOTE, undefined);
  assert.equal(remote.status, 200);
  const names = remote.body.map((r: any) => r.path);
  assert.ok(names.some((p: string) => p.startsWith(IMPORTS)), 'imports collection visible');
  assert.ok(!names.includes(OUTSIDE), 'host root hidden from remote');
  assert.ok(!names.includes(path.join(ROOT, 'clips')) || names.includes(path.join(IMPORTS, 'clips')));
});

test('a remote client cannot read a host root but can read an imported one', async () => {
  const roots = await request('GET', '/api/library/roots', 'localhost', undefined);
  const outsideRoot = roots.body.find((r: any) => r.path === OUTSIDE);
  const { status, body } = await request('GET', `/api/library/list?root=${outsideRoot.id}`, REMOTE, undefined);
  assert.equal(status, 403);
  assert.equal(body.error, HOST_ONLY_MSG);
  const importRoot = roots.body.find((r: any) => r.path === path.join(IMPORTS, 'clips'));
  const ok = await request('GET', `/api/library/list?root=${importRoot.id}`, REMOTE, undefined);
  assert.equal(ok.status, 200);
});

test('imported collections stay reachable with remote browsing off', async () => {
  process.env.MEDIA_BROWSE_REMOTE = '0';
  const roots = await request('GET', '/api/library/roots', 'localhost', undefined);
  const importRoot = roots.body.find((r: any) => r.path === path.join(IMPORTS, 'clips'));
  const listed = await request('GET', `/api/library/list?root=${importRoot.id}`, REMOTE, undefined);
  assert.equal(listed.status, 200);
  process.env.MEDIA_BROWSE_REMOTE = '1';
});

test('the loopback client reads every registered root regardless of scope', async () => {
  const roots = await request('GET', '/api/library/roots', 'localhost', undefined);
  const outsideRoot = roots.body.find((r: any) => r.path === OUTSIDE);
  const listed = await request('GET', `/api/library/list?root=${outsideRoot.id}`, 'localhost', undefined);
  assert.equal(listed.status, 200);
});
