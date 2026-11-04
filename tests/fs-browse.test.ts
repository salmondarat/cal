import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const TMP_BASE = fs.existsSync('/tmp/opencode') ? '/tmp/opencode' : os.tmpdir();
fs.mkdirSync(TMP_BASE, { recursive: true });
const ROOT = fs.mkdtempSync(path.join(TMP_BASE, 'cal-fs-'));
process.env.MEDIA_NO_LISTEN = '1';
process.env.MEDIA_BROWSE_ROOTS = ROOT;
process.env.MEDIA_BROWSE = '1';
process.env.MEDIA_BROWSE_REMOTE = '1';
process.env.FS_LIST_LIMIT = '1000';

const { app } = await import('../server.ts');

let base = '';
let server: import('node:http').Server;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
after(async () => {
  await new Promise((resolve) => {
    server.close(() => resolve(undefined));
    server.closeAllConnections();
  });
  fs.rmSync(ROOT, { recursive: true, force: true });
});

async function get(p: string) {
  const res = await fetch(`${base}${p}`);
  return { status: res.status, body: await res.json() };
}

test('lists directories only, hides dotfiles, sorts numerically', async () => {
  fs.mkdirSync(path.join(ROOT, 'Folder 2'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'Folder 10'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, '.hidden'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'a.txt'), 'x');
  const { status, body } = await get('/api/fs/dirs');
  assert.equal(status, 200);
  assert.deepEqual(body.entries.map((e: any) => e.name), ['Folder 2', 'Folder 10']);
  assert.equal(body.path, ROOT);
  assert.equal(body.isRoot, true);
  assert.equal(body.parent, null);
  assert.ok(Array.isArray(body.places));
});

test('unicode and spaces round-trip through the query string', async () => {
  const weird = path.join(ROOT, 'My Videos 🎬');
  fs.mkdirSync(weird, { recursive: true });
  const { status, body } = await get(`/api/fs/dirs?path=${encodeURIComponent(weird)}`);
  assert.equal(status, 200);
  assert.equal(body.path, weird);
  assert.equal(body.name, 'My Videos 🎬');
});

test('rejects a path outside the browse roots with 403', async () => {
  const { status, body } = await get('/api/fs/dirs?path=' + encodeURIComponent('/etc'));
  assert.equal(status, 403);
  assert.equal(body.error, 'That folder is outside the folders this app is allowed to browse.');
});

test('rejects traversal out of the browse root with 403', async () => {
  const { status } = await get('/api/fs/dirs?path=' + encodeURIComponent(path.join(ROOT, '..', '..', 'etc')));
  assert.equal(status, 403);
});

test('rejects a symlink that escapes the browse root with 403', async () => {
  const link = path.join(ROOT, 'escape');
  try { fs.symlinkSync('/etc', link, 'dir'); } catch { return; } // no symlink support: skip
  const { status, body } = await get('/api/fs/dirs?path=' + encodeURIComponent(link));
  assert.equal(status, 403);
  assert.equal(body.error, 'That folder is outside the folders this app is allowed to browse.');
});

test('missing folder is 404 and a file is 400', async () => {
  const missing = await get('/api/fs/dirs?path=' + encodeURIComponent(path.join(ROOT, 'nope')));
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, 'That folder could not be found. Check the path and try again.');
  const file = await get('/api/fs/dirs?path=' + encodeURIComponent(path.join(ROOT, 'a.txt')));
  assert.equal(file.status, 400);
  assert.equal(file.body.error, 'That path points to a file, not a folder.');
});

test('truncates long listings and flags it', async () => {
  const big = path.join(ROOT, 'big');
  fs.mkdirSync(big, { recursive: true });
  for (let i = 0; i < 12; i++) fs.mkdirSync(path.join(big, `d${i}`));
  process.env.FS_LIST_LIMIT = '3';
  const { body } = await get('/api/fs/dirs?path=' + encodeURIComponent(big));
  assert.equal(body.entries.length, 3);
  assert.equal(body.truncated, true);
  process.env.FS_LIST_LIMIT = '1000';
});

test('MEDIA_BROWSE_ROOTS replaces the defaults and never yields the cwd', async () => {
  const { body } = await get('/api/fs/dirs');
  assert.deepEqual(body.places.map((p: any) => p.path), [ROOT]);
  assert.ok(!body.places.some((p: any) => p.path === process.cwd()));
});

// `fetch` silently drops a custom Host header (forbidden header name), so the
// remote gate can only be exercised through node:http.
function getWithHost(path: string, host: string): Promise<{ status: number; body: any }> {
  const port = new URL(base).port;
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, headers: { Host: host } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => resolve({ status: res.statusCode || 0, body: JSON.parse(d || '{}') }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('refuses to browse when MEDIA_BROWSE is off', async () => {
  process.env.MEDIA_BROWSE = '0';
  const { status, body } = await get('/api/fs/dirs');
  assert.equal(status, 403);
  assert.equal(body.error, 'Folder browsing is turned off on this computer. Paste the folder path instead.');
  process.env.MEDIA_BROWSE = '1';
});

test('refuses a remote host when MEDIA_BROWSE_REMOTE is off', async () => {
  process.env.MEDIA_BROWSE_REMOTE = '0';
  const { status, body } = await getWithHost('/api/fs/dirs', 'example.com');
  assert.equal(status, 403);
  assert.equal(body.error, 'Folder browsing from other devices is turned off. Set MEDIA_BROWSE_REMOTE=1 on the computer running the app to allow it.');
  process.env.MEDIA_BROWSE_REMOTE = '1';
});

test('allows a loopback host even when remote browsing is off', async () => {
  process.env.MEDIA_BROWSE_REMOTE = '0';
  const { status } = await getWithHost('/api/fs/dirs', 'localhost');
  assert.equal(status, 200);
  process.env.MEDIA_BROWSE_REMOTE = '1';
});
