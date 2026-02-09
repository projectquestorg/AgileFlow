/**
 * Tests for process-cleanup.js
 */

const fs = require('fs');

jest.mock('fs');
jest.mock('child_process', () => ({
  execFileSync: jest.fn(),
  spawnSync: jest.fn(),
}));

const processCleanup = require('../../../scripts/lib/process-cleanup');

function makeStat(pid, ppid, command = 'node', state = 'S') {
  return `${pid} (${command}) ${state} ${ppid} 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0`;
}

describe('process-cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findClaudeAncestorPid', () => {
    it('finds Claude as a grandparent when direct parent is a shell', () => {
      fs.readFileSync.mockImplementation(filePath => {
        if (filePath === '/proc/500/stat') return makeStat(500, 400, 'node');
        if (filePath === '/proc/400/stat') return makeStat(400, 300, 'bash');
        if (filePath === '/proc/400/cmdline') return '/bin/bash\0-c\0node\0';
        if (filePath === '/proc/300/cmdline') return '/usr/local/bin/claude\0--resume\0';
        throw new Error(`Unexpected path: ${filePath}`);
      });

      expect(processCleanup.findClaudeAncestorPid(500)).toBe(300);
    });

    it('returns null when no Claude ancestor exists', () => {
      fs.readFileSync.mockImplementation(filePath => {
        if (filePath === '/proc/500/stat') return makeStat(500, 400, 'node');
        if (filePath === '/proc/400/stat') return makeStat(400, 1, 'bash');
        if (filePath === '/proc/400/cmdline') return '/bin/bash\0-c\0node\0';
        throw new Error(`Unexpected path: ${filePath}`);
      });

      expect(processCleanup.findClaudeAncestorPid(500)).toBeNull();
    });
  });

  describe('cleanupDuplicateProcesses', () => {
    it('skips auto-kill when current Claude session PID cannot be determined', () => {
      const shellPid = 65000;
      const duplicatePid = 55000;
      const processKillSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);

      fs.readdirSync.mockImplementation(dirPath => {
        if (dirPath === '/proc') return [String(duplicatePid)];
        throw new Error(`Unexpected path: ${dirPath}`);
      });
      fs.existsSync.mockImplementation(filePath => filePath === `/proc/${duplicatePid}/cmdline`);
      fs.readlinkSync.mockImplementation(filePath => {
        if (filePath === `/proc/${duplicatePid}/cwd`) return process.cwd();
        throw new Error(`Unexpected path: ${filePath}`);
      });
      fs.statSync.mockImplementation(filePath => {
        if (filePath === `/proc/${duplicatePid}`) return { ctimeMs: 1234 };
        throw new Error(`Unexpected path: ${filePath}`);
      });
      fs.readFileSync.mockImplementation(filePath => {
        if (filePath === `/proc/${process.pid}/stat`) return makeStat(process.pid, shellPid, 'node');
        if (filePath === `/proc/${shellPid}/stat`) return makeStat(shellPid, 1, 'bash');
        if (filePath === `/proc/${shellPid}/cmdline`) return '/bin/bash\0-c\0node\0';
        if (filePath === `/proc/${duplicatePid}/cmdline`) return '/usr/local/bin/claude\0--resume\0';
        throw new Error(`Unexpected path: ${filePath}`);
      });

      const result = processCleanup.cleanupDuplicateProcesses({
        rootDir: process.cwd(),
        autoKill: true,
      });

      expect(result.duplicates).toBe(1);
      expect(result.currentPid).toBeNull();
      expect(result.autoKillEnabled).toBe(false);
      expect(result.killed).toEqual([]);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            error: expect.stringContaining('auto-kill skipped'),
          }),
        ])
      );
      expect(processKillSpy).not.toHaveBeenCalled();

      processKillSpy.mockRestore();
    });

    it('skips auto-kill when duplicate process is newer than current session', () => {
      const shellPid = 65000;
      const claudeAncestorPid = 54000;
      const duplicatePid = 55000;
      const processKillSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);

      fs.readdirSync.mockImplementation(dirPath => {
        if (dirPath === '/proc') return [String(duplicatePid)];
        throw new Error(`Unexpected path: ${dirPath}`);
      });
      fs.existsSync.mockImplementation(filePath => filePath === `/proc/${duplicatePid}/cmdline`);
      fs.readlinkSync.mockImplementation(filePath => {
        if (filePath === `/proc/${duplicatePid}/cwd`) return process.cwd();
        throw new Error(`Unexpected path: ${filePath}`);
      });
      fs.statSync.mockImplementation(filePath => {
        if (filePath === `/proc/${duplicatePid}`) return { ctimeMs: 3000 };
        if (filePath === `/proc/${claudeAncestorPid}`) return { ctimeMs: 2000 };
        throw new Error(`Unexpected path: ${filePath}`);
      });
      fs.readFileSync.mockImplementation(filePath => {
        if (filePath === `/proc/${process.pid}/stat`) return makeStat(process.pid, shellPid, 'node');
        if (filePath === `/proc/${shellPid}/stat`) return makeStat(shellPid, claudeAncestorPid, 'bash');
        if (filePath === `/proc/${shellPid}/cmdline`) return '/bin/bash\0-c\0node\0';
        if (filePath === `/proc/${claudeAncestorPid}/cmdline`)
          return '/usr/local/bin/claude\0--resume\0';
        if (filePath === `/proc/${duplicatePid}/cmdline`) return '/usr/local/bin/claude\0--resume\0';
        throw new Error(`Unexpected path: ${filePath}`);
      });

      const result = processCleanup.cleanupDuplicateProcesses({
        rootDir: process.cwd(),
        autoKill: true,
      });

      expect(result.duplicates).toBe(1);
      expect(result.currentPid).toBe(claudeAncestorPid);
      expect(result.currentStartTime).toBe(2000);
      expect(result.killed).toEqual([]);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            error: expect.stringContaining('older duplicate processes'),
          }),
        ])
      );
      expect(processKillSpy).not.toHaveBeenCalled();

      processKillSpy.mockRestore();
    });
  });
});
