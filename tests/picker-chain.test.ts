import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MEDIA_NO_LISTEN = '1';
const { pickFolderNative, createPickerGate, defaultPickerChain } = await import('../server.ts');

// Restore a flag even when an assertion throws, so one failure cannot leave a
// gate flipped for the next test.
function restoreEnv(key: string, previous: string | undefined): void {
  if (previous === undefined) delete process.env[key];
  else process.env[key] = previous;
}

test('chain returns the path from the first backend that answers', async () => {
  const chain = [
    { id: 'first', run: async () => ({ canceled: false, path: '/tmp/picked' }) },
    { id: 'second', run: async () => ({ canceled: false, path: '/tmp/never' }) },
  ];
  assert.deepEqual(await pickFolderNative(chain), { canceled: false, path: '/tmp/picked' });
});

test('chain treats a thrown backend as unavailable and moves on', async () => {
  const chain = [
    { id: 'first', run: async () => { throw Object.assign(new Error('nope'), { code: 'ENOENT' }); } },
    { id: 'second', run: async () => ({ canceled: false, path: '/tmp/picked' }) },
  ];
  assert.deepEqual(await pickFolderNative(chain), { canceled: false, path: '/tmp/picked' });
});

test('chain reports cancellation', async () => {
  const chain = [{ id: 'only', run: async () => ({ canceled: true as const }) }];
  assert.deepEqual(await pickFolderNative(chain), { canceled: true });
});

test('chain reports cancellation when every backend cancels', async () => {
  const chain = [{ id: 'a', run: async () => ({ canceled: true as const }) }];
  assert.deepEqual(await pickFolderNative(chain), { canceled: true });
});

test('gate rejects a second concurrent run and releases after the first', async () => {
  const gate = createPickerGate();
  let release = () => {};
  const first = gate.run(() => new Promise<string>((r) => { release = () => r('done'); }));
  await assert.rejects(() => gate.run(async () => 'second'), /already open/);
  assert.equal(gate.isBusy(), true);
  release();
  assert.equal(await first, 'done');
  assert.equal(gate.isBusy(), false);
});

test('MEDIA_PICKER_BACKEND pins the chain to that one backend, case-insensitively', () => {
  const previous = process.env.MEDIA_PICKER_BACKEND;
  try {
    process.env.MEDIA_PICKER_BACKEND = 'zenity';
    assert.deepEqual(defaultPickerChain().map((b) => b.id), ['zenity']);
    process.env.MEDIA_PICKER_BACKEND = 'KDialog';
    assert.deepEqual(defaultPickerChain().map((b) => b.id), ['kdialog']);
    process.env.MEDIA_PICKER_BACKEND = 'ZENITY';
    assert.deepEqual(defaultPickerChain().map((b) => b.id), ['zenity']);
  } finally {
    restoreEnv('MEDIA_PICKER_BACKEND', previous);
  }
});

test('MEDIA_PICKER_BACKEND=none empties the chain and pickFolderNative throws 501', async () => {
  const previous = process.env.MEDIA_PICKER_BACKEND;
  try {
    process.env.MEDIA_PICKER_BACKEND = 'none';
    assert.deepEqual(defaultPickerChain(), []);
    await assert.rejects(
      () => pickFolderNative(),
      (err: any) =>
        err?.statusCode === 501 &&
        err?.message === 'No native folder picker is available. Paste the folder path instead.',
    );
  } finally {
    restoreEnv('MEDIA_PICKER_BACKEND', previous);
  }
});
