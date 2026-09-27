import { describe, expect, it } from 'vitest';
import { displayBackupDir } from '../../src/commands/migrate';

describe('migrate backup path display', () => {
  it('prints project backups relative to the project and user backups from ~', () => {
    expect(displayBackupDir('/home/u/repo', '/home/u', '/home/u/repo/.agileflow-v4-backup-1')).toBe('.agileflow-v4-backup-1');
    expect(displayBackupDir('/home/u/repo', '/home/u', '/home/u/.agileflow-v4-backup-1')).toBe('~/.agileflow-v4-backup-1');
    expect(displayBackupDir('/srv/repo', '/home/u', '/tmp/b')).toBe('/tmp/b');
  });
});
