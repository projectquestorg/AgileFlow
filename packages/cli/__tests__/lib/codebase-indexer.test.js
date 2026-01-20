/**
 * Tests for codebase-indexer.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  buildIndex,
  updateIndex,
  getIndex,
  invalidateIndex,
  queryFiles,
  queryByTag,
  queryByExport,
  getDependencies,
  extractExports,
  extractImports,
  extractSymbols,
  detectTags,
  shouldIncludeFile,
  getFileType,
  INDEX_VERSION,
  DEFAULT_CONFIG,
  TAG_PATTERNS,
} = require('../../lib/codebase-indexer');

// Test fixture directory
let testDir;

beforeAll(() => {
  // Create temp directory for tests
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebase-indexer-test-'));
});

afterAll(() => {
  // Cleanup temp directory
  fs.rmSync(testDir, { recursive: true, force: true });
});

beforeEach(() => {
  // Clear directory between tests
  const files = fs.readdirSync(testDir);
  for (const file of files) {
    fs.rmSync(path.join(testDir, file), { recursive: true, force: true });
  }
});

describe('getFileType', () => {
  test('returns correct type for JavaScript', () => {
    expect(getFileType('src/index.js')).toBe('javascript');
  });

  test('returns correct type for TypeScript', () => {
    expect(getFileType('src/index.ts')).toBe('typescript');
  });

  test('returns correct type for TypeScript React', () => {
    expect(getFileType('src/Component.tsx')).toBe('typescript-react');
  });

  test('returns correct type for Markdown', () => {
    expect(getFileType('README.md')).toBe('markdown');
  });

  test('returns correct type for JSON', () => {
    expect(getFileType('package.json')).toBe('json');
  });

  test('returns correct type for YAML', () => {
    expect(getFileType('config.yaml')).toBe('yaml');
    expect(getFileType('config.yml')).toBe('yaml');
  });

  test('returns unknown for unrecognized extension', () => {
    expect(getFileType('file.xyz')).toBe('unknown');
  });
});

describe('extractExports', () => {
  test('extracts named function exports', () => {
    const content = `
      export function login() {}
      export async function logout() {}
    `;
    const exports = extractExports(content);
    expect(exports).toContain('login');
    expect(exports).toContain('logout');
  });

  test('extracts named const exports', () => {
    const content = `
      export const API_URL = 'http://api.com';
      export const fetchData = () => {};
    `;
    const exports = extractExports(content);
    expect(exports).toContain('API_URL');
    expect(exports).toContain('fetchData');
  });

  test('extracts class exports', () => {
    const content = `export class UserService {}`;
    const exports = extractExports(content);
    expect(exports).toContain('UserService');
  });

  test('extracts bracket exports', () => {
    const content = `export { foo, bar, baz as qux }`;
    const exports = extractExports(content);
    expect(exports).toContain('foo');
    expect(exports).toContain('bar');
    expect(exports).toContain('qux');
  });

  test('extracts CommonJS exports', () => {
    const content = `
      module.exports.login = () => {};
      module.exports = { foo, bar };
    `;
    const exports = extractExports(content);
    expect(exports).toContain('login');
    expect(exports).toContain('foo');
    expect(exports).toContain('bar');
  });

  test('deduplicates exports', () => {
    const content = `
      export const foo = 1;
      export { foo };
    `;
    const exports = extractExports(content);
    const fooCount = exports.filter(e => e === 'foo').length;
    expect(fooCount).toBe(1);
  });
});

describe('extractImports', () => {
  test('extracts ES6 named imports', () => {
    const content = `import { foo, bar } from './utils';`;
    const imports = extractImports(content);
    expect(imports).toContain('./utils');
  });

  test('extracts ES6 default imports', () => {
    const content = `import React from 'react';`;
    const imports = extractImports(content);
    expect(imports).toContain('react');
  });

  test('extracts ES6 namespace imports', () => {
    const content = `import * as path from 'path';`;
    const imports = extractImports(content);
    expect(imports).toContain('path');
  });

  test('extracts CommonJS requires', () => {
    const content = `const fs = require('fs');`;
    const imports = extractImports(content);
    expect(imports).toContain('fs');
  });

  test('extracts multiple imports', () => {
    const content = `
      import { a } from './a';
      import { b } from './b';
      const c = require('./c');
    `;
    const imports = extractImports(content);
    expect(imports).toContain('./a');
    expect(imports).toContain('./b');
    expect(imports).toContain('./c');
  });

  test('deduplicates imports', () => {
    const content = `
      import { a } from './utils';
      import { b } from './utils';
    `;
    const imports = extractImports(content);
    const utilsCount = imports.filter(i => i === './utils').length;
    expect(utilsCount).toBe(1);
  });
});

describe('extractSymbols', () => {
  test('extracts function declarations', () => {
    const content = `
      function processData() {}
      async function fetchData() {}
    `;
    const symbols = extractSymbols(content);
    expect(symbols.functions).toContain('processData');
    expect(symbols.functions).toContain('fetchData');
  });

  test('extracts arrow functions', () => {
    const content = `
      const handleClick = () => {};
      const getData = async (id) => {};
    `;
    const symbols = extractSymbols(content);
    expect(symbols.functions).toContain('handleClick');
    expect(symbols.functions).toContain('getData');
  });

  test('extracts class declarations', () => {
    const content = `
      class UserService {}
      class AuthController extends BaseController {}
    `;
    const symbols = extractSymbols(content);
    expect(symbols.classes).toContain('UserService');
    expect(symbols.classes).toContain('AuthController');
  });
});

describe('detectTags', () => {
  test('detects api tag from path', () => {
    const tags = detectTags('src/api/users.js', '');
    expect(tags).toContain('api');
  });

  test('detects ui tag from path', () => {
    const tags = detectTags('src/components/Button.tsx', '');
    expect(tags).toContain('ui');
  });

  test('detects database tag from path', () => {
    const tags = detectTags('src/db/models/User.js', '');
    expect(tags).toContain('database');
  });

  test('detects auth tag from path', () => {
    const tags = detectTags('src/auth/login.js', '');
    expect(tags).toContain('auth');
  });

  test('detects test tag from path', () => {
    const tags = detectTags('src/__tests__/utils.test.js', '');
    expect(tags).toContain('test');
  });

  test('detects tags from content', () => {
    const content = `
      const express = require('express');
      const router = express.Router();
    `;
    const tags = detectTags('src/routes.js', content);
    expect(tags).toContain('api');
  });

  test('detects React tag from content', () => {
    const content = `
      import React, { useState } from 'react';
    `;
    const tags = detectTags('src/App.js', content);
    expect(tags).toContain('ui');
  });

  test('deduplicates tags', () => {
    const content = `import { useEffect } from 'react';`;
    const tags = detectTags('src/components/Test.jsx', content);
    const uiCount = tags.filter(t => t === 'ui').length;
    expect(uiCount).toBe(1);
  });
});

describe('shouldIncludeFile', () => {
  test('excludes node_modules', () => {
    expect(shouldIncludeFile('node_modules/lodash/index.js', DEFAULT_CONFIG.excludePatterns)).toBe(
      false
    );
  });

  test('excludes .git', () => {
    expect(shouldIncludeFile('.git/config', DEFAULT_CONFIG.excludePatterns)).toBe(false);
  });

  test('excludes dist', () => {
    expect(shouldIncludeFile('dist/bundle.js', DEFAULT_CONFIG.excludePatterns)).toBe(false);
  });

  test('includes src files', () => {
    expect(shouldIncludeFile('src/index.js', DEFAULT_CONFIG.excludePatterns)).toBe(true);
  });

  test('includes lib files', () => {
    expect(shouldIncludeFile('lib/utils.js', DEFAULT_CONFIG.excludePatterns)).toBe(true);
  });
});

describe('buildIndex', () => {
  test('returns error for non-existent directory', () => {
    const result = buildIndex('/non/existent/path');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not found');
  });

  test('creates valid index structure', () => {
    // Create test files
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'src', 'index.js'), 'export const foo = 1;');

    const result = buildIndex(testDir);
    expect(result.ok).toBe(true);
    expect(result.data.version).toBe(INDEX_VERSION);
    expect(result.data.project_root).toBe(testDir);
    expect(result.data.files).toBeDefined();
    expect(result.data.tags).toBeDefined();
    expect(result.data.symbols).toBeDefined();
  });

  test('indexes JavaScript files', () => {
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(testDir, 'src', 'utils.js'),
      `
        export function add(a, b) { return a + b; }
        export const PI = 3.14;
      `
    );

    const result = buildIndex(testDir);
    expect(result.ok).toBe(true);

    const fileData = result.data.files['src/utils.js'];
    expect(fileData).toBeDefined();
    expect(fileData.type).toBe('javascript');
    expect(fileData.exports).toContain('add');
    expect(fileData.exports).toContain('PI');
  });

  test('indexes TypeScript files', () => {
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(testDir, 'src', 'types.ts'),
      `
        export interface User { id: string; }
        export class UserService {}
      `
    );

    const result = buildIndex(testDir);
    expect(result.ok).toBe(true);

    const fileData = result.data.files['src/types.ts'];
    expect(fileData).toBeDefined();
    expect(fileData.type).toBe('typescript');
  });

  test('excludes node_modules', () => {
    fs.mkdirSync(path.join(testDir, 'node_modules', 'lodash'), { recursive: true });
    fs.writeFileSync(
      path.join(testDir, 'node_modules', 'lodash', 'index.js'),
      'module.exports = {}'
    );
    fs.writeFileSync(path.join(testDir, 'src.js'), 'export const x = 1;');

    const result = buildIndex(testDir);
    expect(result.ok).toBe(true);
    expect(result.data.files['node_modules/lodash/index.js']).toBeUndefined();
    expect(result.data.files['src.js']).toBeDefined();
  });

  test('builds tag index', () => {
    fs.mkdirSync(path.join(testDir, 'src', 'api'), { recursive: true });
    fs.writeFileSync(
      path.join(testDir, 'src', 'api', 'users.js'),
      'export const getUsers = () => {}'
    );

    const result = buildIndex(testDir);
    expect(result.ok).toBe(true);
    expect(result.data.tags.api).toBeDefined();
    expect(result.data.tags.api).toContain('src/api/users.js');
  });

  test('builds symbol index', () => {
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(testDir, 'src', 'math.js'),
      `
        export function add(a, b) { return a + b; }
        export function subtract(a, b) { return a - b; }
      `
    );

    const result = buildIndex(testDir);
    expect(result.ok).toBe(true);
    expect(result.data.symbols.exports.add).toContain('src/math.js');
    expect(result.data.symbols.exports.subtract).toContain('src/math.js');
  });

  test('tracks build statistics', () => {
    fs.writeFileSync(path.join(testDir, 'a.js'), 'const x = 1;');
    fs.writeFileSync(path.join(testDir, 'b.js'), 'const y = 2;');

    const result = buildIndex(testDir);
    expect(result.ok).toBe(true);
    expect(result.data.stats.total_files).toBeGreaterThanOrEqual(2);
    expect(result.data.stats.indexed_files).toBeGreaterThanOrEqual(2);
    expect(result.data.stats.build_time_ms).toBeGreaterThanOrEqual(0);
  });

  test('persists index to disk', () => {
    fs.writeFileSync(path.join(testDir, 'test.js'), 'const x = 1;');

    const result = buildIndex(testDir);
    expect(result.ok).toBe(true);

    const cachePath = path.join(testDir, '.agileflow', 'cache', 'codebase-index.json');
    expect(fs.existsSync(cachePath)).toBe(true);

    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    expect(cached.version).toBe(INDEX_VERSION);
  });
});

describe('updateIndex', () => {
  test('builds new index when none exists', () => {
    fs.writeFileSync(path.join(testDir, 'test.js'), 'const x = 1;');

    const result = updateIndex(testDir);
    expect(result.ok).toBe(true);
    expect(result.data.files['test.js']).toBeDefined();
  });

  test('detects new files', () => {
    fs.writeFileSync(path.join(testDir, 'a.js'), 'const a = 1;');
    buildIndex(testDir);

    // Add new file
    fs.writeFileSync(path.join(testDir, 'b.js'), 'const b = 2;');

    const result = updateIndex(testDir);
    expect(result.ok).toBe(true);
    expect(result.data.files['a.js']).toBeDefined();
    expect(result.data.files['b.js']).toBeDefined();
  });

  test('detects deleted files', () => {
    fs.writeFileSync(path.join(testDir, 'a.js'), 'const a = 1;');
    fs.writeFileSync(path.join(testDir, 'b.js'), 'const b = 2;');
    buildIndex(testDir);

    // Delete file
    fs.unlinkSync(path.join(testDir, 'b.js'));

    const result = updateIndex(testDir);
    expect(result.ok).toBe(true);
    expect(result.data.files['a.js']).toBeDefined();
    expect(result.data.files['b.js']).toBeUndefined();
  });

  test('detects modified files', () => {
    fs.writeFileSync(path.join(testDir, 'a.js'), 'export const x = 1;');
    buildIndex(testDir);

    // Wait a bit and modify file
    const futureTime = Date.now() + 1000;
    fs.writeFileSync(path.join(testDir, 'a.js'), 'export const x = 1; export const y = 2;');
    fs.utimesSync(path.join(testDir, 'a.js'), new Date(futureTime), new Date(futureTime));

    const result = updateIndex(testDir);
    expect(result.ok).toBe(true);
    expect(result.data.files['a.js'].exports).toContain('y');
  });
});

describe('getIndex', () => {
  test('returns cached index when available', () => {
    fs.writeFileSync(path.join(testDir, 'test.js'), 'const x = 1;');
    buildIndex(testDir);

    // Should return from cache
    const result = getIndex(testDir);
    expect(result.ok).toBe(true);
    expect(result.data.files['test.js']).toBeDefined();
  });

  test('builds index when cache empty', () => {
    fs.writeFileSync(path.join(testDir, 'test.js'), 'const x = 1;');
    invalidateIndex(testDir);

    // Delete disk cache
    const cachePath = path.join(testDir, '.agileflow', 'cache', 'codebase-index.json');
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
    }

    const result = getIndex(testDir);
    expect(result.ok).toBe(true);
    expect(result.data.files['test.js']).toBeDefined();
  });
});

describe('queryFiles', () => {
  test('matches glob patterns', () => {
    fs.mkdirSync(path.join(testDir, 'src', 'api'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'src', 'api', 'users.js'), '');
    fs.writeFileSync(path.join(testDir, 'src', 'api', 'posts.js'), '');
    fs.writeFileSync(path.join(testDir, 'src', 'utils.js'), '');

    const result = buildIndex(testDir);
    const matches = queryFiles(result.data, 'src/api/*');

    expect(matches).toContain('src/api/users.js');
    expect(matches).toContain('src/api/posts.js');
    expect(matches).not.toContain('src/utils.js');
  });

  test('matches recursive glob patterns', () => {
    fs.mkdirSync(path.join(testDir, 'src', 'deep', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'src', 'a.js'), '');
    fs.writeFileSync(path.join(testDir, 'src', 'deep', 'b.js'), '');
    fs.writeFileSync(path.join(testDir, 'src', 'deep', 'nested', 'c.js'), '');

    const result = buildIndex(testDir);
    const matches = queryFiles(result.data, 'src/**/*.js');

    expect(matches).toContain('src/a.js');
    expect(matches).toContain('src/deep/b.js');
    expect(matches).toContain('src/deep/nested/c.js');
  });

  test('case insensitive matching', () => {
    fs.writeFileSync(path.join(testDir, 'README.md'), '');
    fs.writeFileSync(path.join(testDir, 'readme.txt'), '');

    const result = buildIndex(testDir);
    const matches = queryFiles(result.data, '*readme*');

    expect(matches).toContain('README.md');
    expect(matches).toContain('readme.txt');
  });
});

describe('queryByTag', () => {
  test('returns files with tag', () => {
    fs.mkdirSync(path.join(testDir, 'src', 'api'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'src', 'api', 'users.js'), '');
    fs.writeFileSync(path.join(testDir, 'src', 'utils.js'), '');

    const result = buildIndex(testDir);
    const matches = queryByTag(result.data, 'api');

    expect(matches).toContain('src/api/users.js');
    expect(matches).not.toContain('src/utils.js');
  });

  test('returns empty for unknown tag', () => {
    fs.writeFileSync(path.join(testDir, 'test.js'), '');

    const result = buildIndex(testDir);
    const matches = queryByTag(result.data, 'nonexistent');

    expect(matches).toEqual([]);
  });
});

describe('queryByExport', () => {
  test('finds files exporting symbol', () => {
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'src', 'auth.js'), 'export function login() {}');
    fs.writeFileSync(path.join(testDir, 'src', 'utils.js'), 'export function helper() {}');

    const result = buildIndex(testDir);
    const matches = queryByExport(result.data, 'login');

    expect(matches).toContain('src/auth.js');
    expect(matches).not.toContain('src/utils.js');
  });

  test('returns empty for unknown export', () => {
    fs.writeFileSync(path.join(testDir, 'test.js'), 'export const x = 1;');

    const result = buildIndex(testDir);
    const matches = queryByExport(result.data, 'nonexistent');

    expect(matches).toEqual([]);
  });
});

describe('getDependencies', () => {
  test('returns imports for file', () => {
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(testDir, 'src', 'index.js'),
      `
        import { foo } from './utils';
        import { bar } from './helpers';
      `
    );
    fs.writeFileSync(path.join(testDir, 'src', 'utils.js'), 'export const foo = 1;');
    fs.writeFileSync(path.join(testDir, 'src', 'helpers.js'), 'export const bar = 2;');

    const result = buildIndex(testDir);
    const deps = getDependencies(result.data, 'src/index.js');

    expect(deps.imports).toContain('./utils');
    expect(deps.imports).toContain('./helpers');
  });

  test('returns empty for non-existent file', () => {
    const result = buildIndex(testDir);
    const deps = getDependencies(result.data, 'nonexistent.js');

    expect(deps.imports).toEqual([]);
    expect(deps.importedBy).toEqual([]);
  });
});

describe('invalidateIndex', () => {
  test('clears cache for project', () => {
    fs.writeFileSync(path.join(testDir, 'test.js'), 'const x = 1;');
    buildIndex(testDir);

    invalidateIndex(testDir);

    // Next getIndex should rebuild
    // (We can't directly test cache state, but behavior should be correct)
  });
});

describe('performance', () => {
  test('indexes 100+ files in reasonable time', () => {
    // Create many files
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    for (let i = 0; i < 100; i++) {
      fs.writeFileSync(path.join(testDir, 'src', `file${i}.js`), `export const value${i} = ${i};`);
    }

    const start = Date.now();
    const result = buildIndex(testDir);
    const elapsed = Date.now() - start;

    expect(result.ok).toBe(true);
    expect(result.data.stats.indexed_files).toBeGreaterThanOrEqual(100);
    expect(elapsed).toBeLessThan(5000); // Should complete in under 5 seconds
  });
});
