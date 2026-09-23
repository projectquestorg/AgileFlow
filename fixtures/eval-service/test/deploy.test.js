import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploy, parseArgs } from '../src/deploy.js';

test('parseArgs defaults to the public directory', () => {
  assert.deepEqual(parseArgs([]), { dir: 'public' });
  assert.deepEqual(parseArgs(['--dir', 'dist']), { dir: 'dist' });
});

test('deploy uploads every file in the directory', async () => {
  const uploaded = [];
  const uploader = { upload: async (file) => uploaded.push(file) };
  const result = await deploy({ dir: 'public', uploader, log: () => {} });
  assert.deepEqual(uploaded, ['app.css', 'index.html']);
  assert.deepEqual(result.files, uploaded);
});
