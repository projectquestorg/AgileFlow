import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Run `fn` unless another run of the same job holds the lock. The lock is a
 * file in the host's temp directory, so it only protects against overlap on
 * this one machine.
 */
export async function withLock(name, fn) {
  const file = path.join(os.tmpdir(), `ops-dashboard-${name}.lock`);
  let fd;
  try {
    fd = fs.openSync(file, 'wx');
  } catch {
    console.log(`${name}: previous run still active, skipping`);
    return false;
  }
  try {
    await fn();
    return true;
  } finally {
    fs.closeSync(fd);
    fs.rmSync(file, { force: true });
  }
}
