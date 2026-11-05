import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(fs.existsSync('/tmp/opencode') ? '/tmp/opencode' : os.tmpdir(), 'cal-posts-'));
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

async function call(method: string, p: string, body?: unknown) {
  const res = await fetch(`${base}${p}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function postBody(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: 'Agent demo',
    scheduledDate: '2026-12-24',
    scheduledTime: '09:00',
    platforms: ['instagram'],
    format: 'image',
    media: [],
    baseCaption: 'Written by an agent.',
    baseHashtags: ['#agenttest'],
    platformOverrides: {},
    status: 'draft',
    ...extra,
  };
}

test('POST /api/posts creates a post that reads back', async () => {
  const created = await call('POST', '/api/posts', postBody('post-api-test-1'));
  assert.equal(created.status, 201);
  assert.equal(created.body.post.baseCaption, 'Written by an agent.');
  const got = await call('GET', '/api/posts/post-api-test-1');
  assert.equal(got.status, 200);
  assert.equal(got.body.id, 'post-api-test-1');
});

test('duplicate id is refused with 409 pointing at PUT', async () => {
  const dup = await call('POST', '/api/posts', postBody('post-api-test-1'));
  assert.equal(dup.status, 409);
  assert.match(dup.body.error, /PUT/);
});

test('invalid id and missing platforms are 400', async () => {
  assert.equal((await call('POST', '/api/posts', postBody('x'))).status, 400);
  assert.equal((await call('POST', '/api/posts', postBody('post-api-test-2', { platforms: [] }))).status, 400);
});

test('inline base64 media is stored to today and referenced', async () => {
  const created = await call('POST', '/api/posts', postBody('post-api-test-3', {
    media: [{ name: 'agent-shot.png', type: 'image/png', data: `data:image/png;base64,${PNG_B64}` }],
  }));
  assert.equal(created.status, 201);
  const refs = created.body.post.mediaRefs;
  assert.equal(refs.length, 1);
  assert.equal(refs[0].kind, 'media');
  const date = new Date().toISOString().slice(0, 10);
  assert.ok(fs.existsSync(path.join(TMP, 'data', 'media', date, 'agent-shot.png')));
});

test('unknown inline media type is refused', async () => {
  const bad = await call('POST', '/api/posts', postBody('post-api-test-4', {
    media: [{ name: 'doc.pdf', data: 'data:application/pdf;base64,AAAA' }],
  }));
  assert.equal(bad.status, 400);
});

test('publish:true on an all-unsupported post is refused with 400 and stores nothing', async () => {
  const created = await call('POST', '/api/posts', postBody('post-api-test-5', {
    platforms: ['tiktok'],
    media: [{ name: 'agent-shot-2.png', data: `data:image/png;base64,${PNG_B64}` }],
    publish: true,
  }));
  assert.equal(created.status, 400);
  assert.match(created.body.error, /cannot publish to TikTok/i);
  const date = new Date().toISOString().slice(0, 10);
  assert.ok(!fs.existsSync(path.join(TMP, 'data', 'media', date, 'agent-shot-2.png')), 'no orphaned media');
  const gone = await call('GET', '/api/posts/post-api-test-5');
  assert.ok(gone.status === 404 || !gone.body?.id);
});

test('scheduling an unsupported platform without publish:true still works', async () => {
  const created = await call('POST', '/api/posts', postBody('post-api-test-5b', { platforms: ['tiktok'] }));
  assert.equal(created.status, 201);
  assert.ok(created.body.post.warnings.some((w: string) => /not sent by this build/i.test(w)));
});

test('manual publish of an all-unsupported post is refused with 400', async () => {
  await call('POST', '/api/posts', postBody('post-api-test-7', { platforms: ['tiktok'] }));
  const attempt = await call('POST', '/api/posts/post-api-test-7/publish');
  assert.equal(attempt.status, 400);
  assert.match(attempt.body.error, /cannot publish to TikTok/i);
});

test('manual publish of an unsupported subset of a mixed post is refused', async () => {
  await call('POST', '/api/posts', postBody('post-api-test-8', { platforms: ['instagram', 'tiktok'] }));
  const attempt = await call('POST', '/api/posts/post-api-test-8/publish', { platforms: ['tiktok'] });
  assert.equal(attempt.status, 400);
  const post = await call('GET', '/api/posts/post-api-test-8');
  assert.notEqual(post.body.status, 'publishing');
});

test('validate endpoint explains an agent post before publishing', async () => {
  await call('POST', '/api/posts', postBody('post-api-test-6', { media: [] }));
  const v = await call('POST', '/api/posts/post-api-test-6/validate');
  assert.equal(v.status, 200);
  assert.equal(v.body.ready, false);
  assert.ok(v.body.checks.some((c: any) => /No media/.test(c.detail)));
});

test('text-format Threads posts validate without media', async () => {
  const created = await call('POST', '/api/posts', postBody('post-api-test-text-1', { platforms: ['threads'], format: 'text' }));
  assert.equal(created.status, 201);
  assert.equal(created.body.post.format, 'text');
  const v = await call('POST', '/api/posts/post-api-test-text-1/validate');
  const media = v.body.checks.find((c: any) => c.label === 'Media files');
  assert.equal(media.ok, true);
  assert.match(media.detail, /no file needed/i);
  const dl = v.body.checks.find((c: any) => c.label === 'Public download');
  assert.equal(dl.ok, true);
});

test('text format with Instagram fails the media check with a specific sentence', async () => {
  await call('POST', '/api/posts', postBody('post-api-test-text-2', { platforms: ['instagram'], format: 'text' }));
  const v = await call('POST', '/api/posts/post-api-test-text-2/validate');
  const media = v.body.checks.find((c: any) => c.label === 'Media files');
  assert.equal(media.ok, false);
  assert.match(media.detail, /Instagram cannot take a text-only post/);
});

test('Threads Text Thread override lifts the media requirement (the composer path)', async () => {
  await call('POST', '/api/posts', postBody('post-api-test-text-3', {
    platforms: ['threads'],
    format: 'image',
    platformOverrides: { threads: { caption: 'words only', hashtags: [], scheduledTime: '09:00', format: 'text' } },
    media: [],
  }));
  const v = await call('POST', '/api/posts/post-api-test-text-3/validate');
  const media = v.body.checks.find((c: any) => c.label === 'Media files');
  assert.equal(media.ok, true);
  assert.match(media.detail, /no file needed/i);
});

test('Text Thread override with other channels still requires media', async () => {
  await call('POST', '/api/posts', postBody('post-api-test-text-4', {
    platforms: ['threads', 'instagram'],
    format: 'image',
    platformOverrides: { threads: { caption: 'words', hashtags: [], scheduledTime: '09:00', format: 'text' } },
    media: [],
  }));
  const v = await call('POST', '/api/posts/post-api-test-text-4/validate');
  const media = v.body.checks.find((c: any) => c.label === 'Media files');
  assert.equal(media.ok, false);
  assert.match(media.detail, /Threads-only/);
});
