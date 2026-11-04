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

// Run a chain call while capturing console.warn: keeps the suite output
// pristine even though every classification branch now logs, and lets a test
// assert that the log trace exists.
async function runCaptured<T>(fn: () => Promise<T>): Promise<{ value: T | null; error: any; warns: string[] }> {
  const warns: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => { warns.push(args.map(String).join(' ')); };
  try {
    return { value: await fn(), error: null, warns };
  } catch (err) {
    return { value: null, error: err, warns };
  } finally {
    console.warn = original;
  }
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
  const { value, warns } = await runCaptured(() => pickFolderNative(chain));
  assert.deepEqual(value, { canceled: false, path: '/tmp/picked' });
  assert.ok(warns.some((w) => w.includes('first') && w.includes('ENOENT')), 'ENOENT fall-through is logged');
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

test('zenity exit code 1 is a cancellation through its own predicate', async () => {
  const previous = process.env.MEDIA_PICKER_BACKEND;
  try {
    process.env.MEDIA_PICKER_BACKEND = 'auto';
    const zenity = defaultPickerChain().find((b) => b.id === 'zenity');
    assert.ok(zenity, 'zenity backend is in the default chain');
    assert.equal(zenity.isCancellation?.(Object.assign(new Error('exited 1'), { code: 1 })), true);
    const chain = [{ ...zenity, run: async () => { throw Object.assign(new Error('exited 1'), { code: 1 }); } }];
    const { value, warns } = await runCaptured(() => pickFolderNative(chain));
    assert.deepEqual(value, { canceled: true });
    assert.ok(warns.some((w) => w.includes('zenity') && w.includes('code=1')), 'cancellation is logged with id and exit code');
  } finally {
    restoreEnv('MEDIA_PICKER_BACKEND', previous);
  }
});

test('an error with no predicate is never a cancellation, even at exit code 1', async () => {
  const chain = [
    { id: 'no-predicate', run: async () => { throw Object.assign(new Error('exited 1'), { code: 1 }); } },
    { id: 'next', run: async () => ({ canceled: false, path: '/tmp/picked' }) },
  ];
  const { value, warns } = await runCaptured(() => pickFolderNative(chain));
  assert.deepEqual(value, { canceled: false, path: '/tmp/picked' });
  assert.ok(warns.some((w) => w.includes('no-predicate') && w.includes('code=1')), 'fall-through failure is logged');
});

test('a timeout (Node killed the process) is a cancellation for every backend', async () => {
  const chain = [
    { id: 'slow', run: async () => { throw Object.assign(new Error('timed out'), { killed: true, signal: 'SIGTERM' }); } },
  ];
  const { value, warns } = await runCaptured(() => pickFolderNative(chain));
  assert.deepEqual(value, { canceled: true });
  assert.ok(warns.some((w) => w.includes('slow') && w.includes('SIGTERM') && w.includes('killed=true')), 'timeout is logged');
});

test('a crash (signal without killed) falls through, it is not a cancellation', async () => {
  const chain = [
    {
      id: 'crasher',
      // A predicate that would match must not rescue a crash: signal wins.
      isCancellation: (err: any) => err?.code === 1,
      run: async () => { throw Object.assign(new Error('segmentation fault'), { signal: 'SIGSEGV', code: 1 }); },
    },
    { id: 'next', run: async () => ({ canceled: false, path: '/tmp/picked' }) },
  ];
  const { value, warns } = await runCaptured(() => pickFolderNative(chain));
  assert.deepEqual(value, { canceled: false, path: '/tmp/picked' });
  assert.ok(warns.some((w) => w.includes('crasher') && w.includes('SIGSEGV')), 'crash is logged with signal');
});

test('osascript -128 stderr cancels, plain exit 1 does not', async () => {
  const previous = process.env.MEDIA_PICKER_BACKEND;
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
  try {
    process.env.MEDIA_PICKER_BACKEND = 'auto';
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    const osascript = defaultPickerChain().find((b) => b.id === 'osascript');
    assert.ok(osascript, 'osascript backend is in the darwin chain');
    const cancelErr = Object.assign(new Error('execution error: User canceled. (-128)'), {
      code: 1,
      stderr: 'execution error: User canceled. (-128)',
    });
    assert.equal(osascript.isCancellation?.(cancelErr), true);
    assert.equal(
      osascript.isCancellation?.(Object.assign(new Error('osascript failed'), { code: 1, stderr: 'syntax error' })),
      false,
      'osascript exit 1 without a cancel message is not a cancellation',
    );

    const { value, warns } = await runCaptured(() => pickFolderNative([{ ...osascript, run: async () => { throw cancelErr; } }]));
    assert.deepEqual(value, { canceled: true });
    assert.ok(warns.some((w) => w.includes('osascript') && w.includes('code=1')), 'osascript cancellation is logged');

    // Plain exit 1 must fall all the way through to the 501, not read as cancel.
    const plain = Object.assign(new Error('osascript failed'), { code: 1, stderr: 'syntax error' });
    const rejected = await runCaptured(() => pickFolderNative([{ ...osascript, run: async () => { throw plain; } }]));
    assert.equal(rejected.value, null);
    assert.equal(rejected.error?.statusCode, 501);
    assert.ok(rejected.warns.some((w) => w.includes('osascript') && w.includes('code=1')), 'osascript failure is logged');
  } finally {
    restoreEnv('MEDIA_PICKER_BACKEND', previous);
    Object.defineProperty(process, 'platform', descriptor);
  }
});
