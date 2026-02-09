const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

describe('damage-control hook bootstrap', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-dc-hook-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const scripts = ['damage-control-bash.js', 'damage-control-edit.js', 'damage-control-write.js'];

  for (const scriptName of scripts) {
    it(`${scriptName} fails open when utils module is unavailable`, () => {
      const scriptPath = path.resolve(__dirname, '../../scripts', scriptName);
      const result = spawnSync('node', [scriptPath], {
        cwd: tempDir,
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
    });
  }
});
