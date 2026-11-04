import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A fake `gdbus` so the portal backend can be driven headlessly. The real
// tool opens a window on the user's desktop, which is not acceptable during
// an automated run.
//
// `gdbus monitor` prints one line per signal, in the format
// `<object path>: <interface>.<member> <args>`, and g_variant_print escapes a
// single quote as `\'`. The fake reproduces both, so the backend's parsing is
// exercised against the real output shape rather than a convenient one.
export function writeFakeGdbus(dir: string, uri: string): void {
  const script = `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'call') {
  process.stdout.write("('/org/freedesktop/portal/desktop/request/:1.42/caltoken',)\\n");
  process.exit(0);
}
if (args[0] === 'monitor') {
  process.stdout.write("/org/freedesktop/portal/desktop/request/:1.42/caltoken: org.freedesktop.portal.Request.Response (uint32 0, {'uris': <['${uri}']>})\\n");
  setTimeout(() => process.exit(0), 5000);
  return;
}
process.exit(1);
`;
  const file = path.join(dir, 'gdbus');
  fs.writeFileSync(file, script);
  fs.chmodSync(file, 0o755);
}

// A temp directory holding a fake `gdbus`, with the directory prepended to
// PATH for the duration of the callback. PATH is restored afterwards.
export async function withFakeGdbus<T>(uri: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const base = fs.existsSync('/tmp/opencode') ? '/tmp/opencode' : os.tmpdir();
  const dir = fs.mkdtempSync(path.join(base, 'cal-gdbus-'));
  const previousPath = process.env.PATH;
  try {
    writeFakeGdbus(dir, uri);
    process.env.PATH = `${dir}${path.delimiter}${previousPath}`;
    return await fn(dir);
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
