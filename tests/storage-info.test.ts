import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(fs.existsSync('/tmp/opencode') ? '/tmp/opencode' : os.tmpdir(), 'cal-disk-'));
process.env.MEDIA_NO_LISTEN = '1';
process.env.RELATE_DATA_DIR = path.join(TMP, 'data');
process.env.APP_PASSWORD = ''; // dotenv will not overwrite a set value

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

test('storage info reports real disk space alongside the per-file cap', async () => {
  const info = await (await fetch(`${base}/api/storage/info`)).json();
  assert.equal(info.maxFileBytes, 1024 * 1024 * 1024);
  assert.equal(typeof info.diskTotalBytes, 'number');
  assert.equal(typeof info.diskFreeBytes, 'number');
  assert.ok(info.diskTotalBytes > 0);
  assert.ok(info.diskFreeBytes > 0);
  assert.ok(info.diskTotalBytes >= info.diskFreeBytes);
});

test('stored bytes are counted after an upload', async () => {
  const before = await (await fetch(`${base}/api/storage/info`)).json();
  const date = new Date().toISOString().slice(0, 10);
  const buf = Buffer.from('hello-disk-test');
  const res = await fetch(`${base}/api/storage/media?date=${date}&name=disk-test.png`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(buf),
  });
  assert.equal(res.status, 201);
  const after = await (await fetch(`${base}/api/storage/info`)).json();
  assert.equal(after.totalBytes, before.totalBytes + buf.length);
  assert.ok(after.diskFreeBytes <= after.diskTotalBytes);
});
