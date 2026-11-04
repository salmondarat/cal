import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { withFakeGdbus } from './fake-gdbus.ts';

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

async function post(p: string) {
  const res = await fetch(`${base}${p}`, { method: 'POST' });
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
function getWithHost(path: string, host: string, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  const port = new URL(base).port;
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, headers: { ...headers, Host: host } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => resolve({ status: res.statusCode || 0, body: JSON.parse(d || '{}') }));
    });
    req.on('error', reject);
    req.end();
  });
}

// Restore a flag even when an assertion throws, so one failure cannot leave a
// gate flipped for the next test.
function restoreEnv(key: string, previous: string | undefined): void {
  if (previous === undefined) delete process.env[key];
  else process.env[key] = previous;
}

test('refuses to browse when MEDIA_BROWSE is off', async () => {
  const previous = process.env.MEDIA_BROWSE;
  process.env.MEDIA_BROWSE = '0';
  try {
    const { status, body } = await get('/api/fs/dirs');
    assert.equal(status, 403);
    assert.equal(body.error, 'Folder browsing is turned off on this computer. Paste the folder path instead.');
  } finally {
    restoreEnv('MEDIA_BROWSE', previous);
  }
});

test('refuses a remote host when MEDIA_BROWSE_REMOTE is off', async () => {
  const previous = process.env.MEDIA_BROWSE_REMOTE;
  process.env.MEDIA_BROWSE_REMOTE = '0';
  try {
    const { status, body } = await getWithHost('/api/fs/dirs', 'example.com');
    assert.equal(status, 403);
    assert.equal(body.error, 'Folder browsing from other devices is turned off. Set MEDIA_BROWSE_REMOTE=1 on the computer running the app to allow it.');
  } finally {
    restoreEnv('MEDIA_BROWSE_REMOTE', previous);
  }
});

test('allows a loopback host even when remote browsing is off', async () => {
  const previous = process.env.MEDIA_BROWSE_REMOTE;
  process.env.MEDIA_BROWSE_REMOTE = '0';
  try {
    const { status } = await getWithHost('/api/fs/dirs', 'localhost');
    assert.equal(status, 200);
  } finally {
    restoreEnv('MEDIA_BROWSE_REMOTE', previous);
  }
});

test('MEDIA_BROWSE off spellings (trimmed, case-insensitive) refuse browsing', async () => {
  const previous = process.env.MEDIA_BROWSE;
  try {
    for (const value of ['off', 'false', 'no', ' OFF ']) {
      process.env.MEDIA_BROWSE = value;
      const { status, body } = await get('/api/fs/dirs');
      assert.equal(status, 403, `MEDIA_BROWSE=${JSON.stringify(value)}`);
      assert.equal(body.error, 'Folder browsing is turned off on this computer. Paste the folder path instead.');
    }
  } finally {
    restoreEnv('MEDIA_BROWSE', previous);
  }
});

test('MEDIA_BROWSE unset or any other value leaves browsing on', async () => {
  const previous = process.env.MEDIA_BROWSE;
  try {
    delete process.env.MEDIA_BROWSE;
    const unset = await get('/api/fs/dirs');
    assert.equal(unset.status, 200, 'MEDIA_BROWSE unset');
    process.env.MEDIA_BROWSE = '2';
    const other = await get('/api/fs/dirs');
    assert.equal(other.status, 200, 'MEDIA_BROWSE=2');
  } finally {
    restoreEnv('MEDIA_BROWSE', previous);
  }
});

// Locality tests run before the probe tests: the probe tests flip MEDIA_BROWSE
// and would leave it off for anything running after them if they ever fail.
test('a forwarded request is not local even with a loopback Host', async () => {
  const previous = process.env.MEDIA_BROWSE_REMOTE;
  process.env.MEDIA_BROWSE_REMOTE = '0';
  try {
    const { status, body } = await getWithHost('/api/fs/dirs', '127.0.0.1', { 'x-forwarded-for': '203.0.113.7' });
    assert.equal(status, 403);
    assert.equal(body.error, 'Folder browsing from other devices is turned off. Set MEDIA_BROWSE_REMOTE=1 on the computer running the app to allow it.');
  } finally {
    restoreEnv('MEDIA_BROWSE_REMOTE', previous);
  }
});

test('a non-loopback Origin is not local even with a loopback Host', async () => {
  const previous = process.env.MEDIA_BROWSE_REMOTE;
  process.env.MEDIA_BROWSE_REMOTE = '0';
  try {
    const { status, body } = await getWithHost('/api/fs/dirs', '127.0.0.1', { origin: 'https://evil.example.com' });
    assert.equal(status, 403);
    assert.equal(body.error, 'Folder browsing from other devices is turned off. Set MEDIA_BROWSE_REMOTE=1 on the computer running the app to allow it.');
  } finally {
    restoreEnv('MEDIA_BROWSE_REMOTE', previous);
  }
});

test('both loopback Host forms are local when remote browsing is off', async () => {
  const previous = process.env.MEDIA_BROWSE_REMOTE;
  process.env.MEDIA_BROWSE_REMOTE = '0';
  try {
    const v4 = await getWithHost('/api/fs/dirs', '127.0.0.1');
    assert.equal(v4.status, 200, 'Host: 127.0.0.1');
    const v6 = await getWithHost('/api/fs/dirs', '[::1]');
    assert.equal(v6.status, 200, 'Host: [::1]');
  } finally {
    restoreEnv('MEDIA_BROWSE_REMOTE', previous);
  }
});

test('probe reports a stable shape and honours MEDIA_PICKER_BACKEND=none', async () => {
  const { status, body } = await get('/api/fs/folder-picker');
  assert.equal(status, 200);
  assert.equal(typeof body.platform, 'string');
  assert.equal(typeof body.available, 'boolean');
  assert.ok('backend' in body && 'detail' in body);

  const previous = process.env.MEDIA_PICKER_BACKEND;
  try {
    process.env.MEDIA_PICKER_BACKEND = 'none';
    const off = await get('/api/fs/folder-picker?refresh=1');
    assert.equal(off.body.available, false);
    assert.equal(off.body.backend, null);
  } finally {
    restoreEnv('MEDIA_PICKER_BACKEND', previous);
  }
});

test('probe reports browsing disabled when MEDIA_BROWSE is off', async () => {
  const previous = process.env.MEDIA_BROWSE;
  try {
    process.env.MEDIA_BROWSE = '0';
    const { body } = await get('/api/fs/folder-picker');
    assert.equal(body.available, false);
    assert.equal(body.detail, 'Folder browsing is turned off on this computer. Paste the folder path instead.');
  } finally {
    restoreEnv('MEDIA_BROWSE', previous);
  }
});

test('places never offer hidden folders or filesystem artifacts', async () => {
  // An NTFS/FUSE mount exposes $RECYCLE.BIN and .Recycle.bin next to the real
  // volumes. They are not places a user means to browse, and they would
  // otherwise fill the Places list.
  const previous = process.env.MEDIA_BROWSE_ROOTS;
  try {
    // Configured roots replace the defaults, so unset them to exercise the
    // default discovery (home + mounted volumes) where the filter applies.
    delete process.env.MEDIA_BROWSE_ROOTS;
    const { body } = await get('/api/fs/dirs');
    const names = body.places.map((p: any) => p.name);
    assert.ok(names.includes('Home'), `Home is always a place: ${names.join(', ')}`);
    assert.ok(!names.some((n: string) => n.startsWith('.')), `hidden place offered: ${names.join(', ')}`);
    assert.ok(!names.some((n: string) => n.toLowerCase() === '$recycle.bin'), `$RECYCLE.BIN offered: ${names.join(', ')}`);
    assert.ok(!names.some((n: string) => n.toLowerCase() === 'lost+found'), `lost+found offered: ${names.join(', ')}`);
    assert.ok(!names.some((n: string) => n.toLowerCase() === 'system volume information'), `System Volume Information offered: ${names.join(', ')}`);
  } finally {
    restoreEnv('MEDIA_BROWSE_ROOTS', previous);
  }
});

test('every offered volume is a real mount point', async () => {
  // A volume is a mount, not a folder that happens to sit under /media or
  // /mnt. Offering "Program Files" or "Recovery" as a browsable place would
  // be noise: those are directories inside a mounted disk.
  if (process.platform !== 'linux') return;
  const previous = process.env.MEDIA_BROWSE_ROOTS;
  try {
    delete process.env.MEDIA_BROWSE_ROOTS;
    const mounts = new Set(
      fs
        .readFileSync('/proc/mounts', 'utf8')
        .split('\n')
        .map((line) => line.trim().split(/\s+/)[1])
        .filter(Boolean)
        .map((point) => point!.replace(/\\040/g, ' ')),
    );
    const mediaMounts = [...mounts].filter((point) => /^\/(media|mnt|run\/media)\/.+/.test(point));
    if (mediaMounts.length === 0) return; // this machine has no mounted volume to check
    const { body } = await get('/api/fs/dirs');
    const volumes = body.places.filter((p: any) => p.kind === 'volume');
    assert.ok(volumes.length > 0, 'this machine has at least one mounted volume');
    for (const volume of volumes) {
      assert.ok(mounts.has(volume.path), `${volume.path} is offered as a volume but is not a mount point`);
    }
  } finally {
    restoreEnv('MEDIA_BROWSE_ROOTS', previous);
  }
});

test('a NUL byte in the path is a 400, not a confusing 404', async () => {
  const { status, body } = await get('/api/fs/dirs?path=' + encodeURIComponent(`${ROOT}\0x`));
  assert.equal(status, 400);
  assert.equal(body.error, 'That path points to a file, not a folder.');
});

test('a folder that links to itself is not offered as a subfolder', async () => {
  // `ln -s . loop` would let the user walk the tree forever.
  const loop = path.join(ROOT, 'loop');
  try { fs.symlinkSync('.', loop, 'dir'); } catch { return; } // no symlink support: skip
  const { status, body } = await get('/api/fs/dirs?path=' + encodeURIComponent(ROOT));
  assert.equal(status, 200);
  assert.ok(!body.entries.some((e: any) => e.name === 'loop'), 'the self-referencing link is not listed');
});

test('a symlink that stays inside a root is still listed', async () => {
  const inner = path.join(ROOT, 'inner');
  fs.mkdirSync(inner, { recursive: true });
  const link = path.join(ROOT, 'inside-link');
  try { fs.symlinkSync(inner, link, 'dir'); } catch { return; }
  const { body } = await get('/api/fs/dirs?path=' + encodeURIComponent(ROOT));
  assert.ok(body.entries.some((e: any) => e.name === 'inside-link'), 'a link inside the root is listed');
});

test('an unknown MEDIA_PICKER_BACKEND reports unavailable instead of a phantom backend', async () => {
  const previous = process.env.MEDIA_PICKER_BACKEND;
  try {
    process.env.MEDIA_PICKER_BACKEND = 'typo';
    const { body } = await get('/api/fs/folder-picker?refresh=1');
    assert.equal(body.available, false);
    assert.equal(body.backend, null);
  } finally {
    restoreEnv('MEDIA_PICKER_BACKEND', previous);
  }
});

test('the browse payloads match the frontend client types', async () => {
  // Guards the contract between the server's JSON and the client's
  // ServerFolderListing / FolderPickerCapability: a renamed field would
  // otherwise only surface as undefined at runtime, in the modal.
  const { body } = await get('/api/fs/dirs');
  assert.deepEqual(Object.keys(body).sort(), ['entries', 'isRoot', 'limit', 'name', 'parent', 'path', 'places', 'truncated']);
  assert.deepEqual(Object.keys(body.entries[0] ?? {}).sort(), ['name', 'path']);
  assert.deepEqual(Object.keys(body.places[0] ?? {}).sort(), ['kind', 'name', 'path']);

  const probe = await get('/api/fs/folder-picker');
  assert.deepEqual(Object.keys(probe.body).sort(), ['available', 'backend', 'detail', 'platform']);
});

test('probe lowercases a mixed-case forced backend id', async () => {
  const previous = process.env.MEDIA_PICKER_BACKEND;
  try {
    process.env.MEDIA_PICKER_BACKEND = 'Zenity';
    const { body } = await get('/api/fs/folder-picker?refresh=1');
    assert.equal(body.backend, 'zenity');
    assert.equal(body.available, true);
  } finally {
    restoreEnv('MEDIA_PICKER_BACKEND', previous);
  }
});

test('POST /api/library/pick-folder is refused by the browse guard with 403', async () => {
  const previous = process.env.MEDIA_BROWSE;
  try {
    process.env.MEDIA_BROWSE = '0';
    const { status, body } = await post('/api/library/pick-folder');
    assert.equal(status, 403);
    assert.equal(body.error, 'Folder browsing is turned off on this computer. Paste the folder path instead.');
  } finally {
    restoreEnv('MEDIA_BROWSE', previous);
  }
});

test('POST /api/library/pick-folder surfaces a backend refusal to the client', async () => {
  // The mandated refusal copy must reach the user, not just the server log: a
  // network-folder pick used to be reported as "no native folder picker is
  // available", moments after a picker had opened.
  const previous = process.env.MEDIA_PICKER_BACKEND;
  const warns: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warns.push(args.map(String).join(' ')); };
  try {
    process.env.MEDIA_PICKER_BACKEND = 'portal';
    await withFakeGdbus('smb://server/share', async () => {
      const { status, body } = await post('/api/library/pick-folder');
      assert.equal(status, 400);
      assert.equal(body.error, 'That folder is a network or device location this app cannot read. Choose a folder on this computer.');
    });
    assert.ok(warns.some((w) => w.includes('refused')), 'the refusal is logged');
  } finally {
    console.warn = originalWarn;
    restoreEnv('MEDIA_PICKER_BACKEND', previous);
  }
});

test('POST /api/library/pick-folder returns 501 when no picker backend exists', async () => {
  const previous = process.env.MEDIA_PICKER_BACKEND;
  const warns: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warns.push(args.map(String).join(' ')); };
  try {
    process.env.MEDIA_PICKER_BACKEND = 'none';
    const { status, body } = await post('/api/library/pick-folder');
    assert.equal(status, 501);
    assert.equal(body.error, 'No native folder picker is available on this system. Paste the folder path instead.');
    assert.ok(warns.some((w) => w.includes('folder picker failed')), 'the route logs the failure');
  } finally {
    console.warn = originalWarn;
    restoreEnv('MEDIA_PICKER_BACKEND', previous);
  }
});
