import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(fs.existsSync('/tmp/opencode') ? '/tmp/opencode' : os.tmpdir(), 'cal-imp-'));
process.env.MEDIA_NO_LISTEN = '1';
process.env.RELATE_DATA_DIR = path.join(TMP, 'data');
process.env.MEDIA_BROWSE_ROOTS = TMP;

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

const IMPORTS = path.join(path.join(TMP, 'data'), 'imports');

async function upload(collection: string, rel: string, body: Buffer, type = 'image/png') {
  const params = new URLSearchParams({ collection, path: rel });
  const res = await fetch(`${base}/api/imports?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': type },
    body: new Uint8Array(body),
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function get(p: string) {
  const res = await fetch(`${base}${p}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('a nested import lands under the collection and registers a root', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const { status, body } = await upload('Holiday Trip', 'day 1/beach.png', png);
  assert.equal(status, 201);
  assert.equal(body.collection, 'Holiday Trip');
  assert.equal(body.path, 'day 1/beach.png');
  assert.ok(fs.existsSync(path.join(IMPORTS, 'Holiday Trip', 'day 1', 'beach.png')));

  const roots = await get('/api/library/roots');
  const root = roots.body.find((r: any) => r.name === 'Holiday Trip');
  assert.ok(root, 'import root should be auto-registered');
  assert.equal(root.exists, true);

  const listed = await get(`/api/library/list?root=${root.id}`);
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.folders.map((f: any) => f.name), ['day 1']);
});

test('the same file twice gets a collision suffix', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const second = await upload('Holiday Trip', 'day 1/beach.png', png);
  assert.equal(second.status, 201);
  assert.equal(second.body.path, 'day 1/beach-1.png');
});

test('traversal out of the collection is refused', async () => {
  const r1 = await upload('Holiday Trip', '../escape.png', Buffer.from('x'));
  assert.equal(r1.status, 400);
  assert.equal(r1.body.error, 'That file path is not valid.');
  const r2 = await upload('Holiday Trip', 'a/../../escape.png', Buffer.from('x'));
  assert.equal(r2.status, 400);
  assert.ok(!fs.existsSync(path.join(TMP, 'data', 'escape.png')));
});

test('hidden segments are refused', async () => {
  const r = await upload('Holiday Trip', '.hidden/x.png', Buffer.from('x'));
  assert.equal(r.status, 400);
});

test('non-media extensions and empty bodies are refused', async () => {
  const r = await upload('Holiday Trip', 'notes.txt', Buffer.from('hello'), 'text/plain');
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'That file type is not supported. Choose an image or video.');
  const empty = await upload('Holiday Trip', 'blank.png', Buffer.alloc(0));
  assert.equal(empty.status, 400);
  assert.equal(empty.body.error, 'No file was included in the upload.');
});

test('a hostile collection name cannot escape the imports directory', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const r = await upload('../../evil', 'x.png', png);
  assert.equal(r.status, 201);
  assert.notEqual(r.body.collection, '../../evil');
  assert.ok(r.body.collection.startsWith(IMPORTS) || fs.existsSync(path.join(IMPORTS, r.body.collection)));
});

test('GET /api/imports summarises collections', async () => {
  const { status, body } = await get('/api/imports');
  assert.equal(status, 200);
  const trip = body.find((c: any) => c.name === 'Holiday Trip');
  assert.ok(trip.files >= 2);
  assert.ok(trip.bytes > 0);
});
