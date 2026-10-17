// Exit 0 if this runtime can create a directory and write a file in the temp dir.
// Some machines let a bundled bun.exe read files but fail every write with EPERM;
// bin\easyreview.cmd uses this to pick a bun that actually works.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

try {
  const dir = mkdtempSync(join(tmpdir(), 'easyreview-probe-'));
  writeFileSync(join(dir, 'probe'), '1');
  rmSync(dir, { recursive: true, force: true });
  process.exit(0);
} catch {
  process.exit(1);
}