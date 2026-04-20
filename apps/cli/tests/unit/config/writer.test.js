/**
 * Unit tests for the config writer — round-trip loader↔writer parity.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import writerModule from '../../../src/runtime/config/writer.js';
import loaderModule from '../../../src/runtime/config/loader.js';
import defaultsModule from '../../../src/runtime/config/defaults.js';

const { writeConfig, SCHEMA_REF } = writerModule;
const { loadConfig, CONFIG_FILENAME } = loaderModule;
const { defaultConfig } = defaultsModule;

describe('config writer', () => {
  /** @type {string} */
  let scratch;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-writer-'));
  });

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it('writes a valid config JSON the loader can round-trip', async () => {
    const file = await writeConfig(scratch, {
      ...defaultConfig(),
      plugins: { core: { enabled: true }, seo: { enabled: true } },
      personalization: {
        tone: 'detailed',
        ask_level: 'always',
        verbosity: 'high',
      },
    });

    expect(file).toBe(path.join(scratch, CONFIG_FILENAME));

    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.$schema).toBe(SCHEMA_REF);
    expect(parsed.version).toBe(1);

    // Loader accepts what writer produces.
    const loaded = await loadConfig(scratch);
    expect(loaded.source).toBe('file');
    expect(loaded.config.plugins.seo.enabled).toBe(true);
    expect(loaded.config.personalization.tone).toBe('detailed');
    expect(loaded.config.personalization.verbosity).toBe('high');
  });

  it('produces stable JSON formatting (2-space indent + trailing newline)', async () => {
    const file = await writeConfig(scratch, defaultConfig());
    const raw = fs.readFileSync(file, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    // 2-space indent: first nested key should be 2 spaces in.
    expect(raw).toMatch(/\n {2}"version":/);
  });

  it('does not leak internal loader fields (source, path) into the file', async () => {
    const file = await writeConfig(scratch, {
      ...defaultConfig(),
      // @ts-ignore — intentionally add internal junk
      source: 'file',
      // @ts-ignore
      path: '/junk',
    });
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(parsed.source).toBeUndefined();
    expect(parsed.path).toBeUndefined();
  });
});
