/**
 * Unit tests for the v4 config loader.
 *
 * Source is CJS (package.json `type: commonjs`); Vitest requires ESM-style
 * imports in test files. Vitest handles the CJS→ESM interop for our source
 * modules automatically.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import loaderModule from '../../../src/runtime/config/loader.js';
import defaultsModule from '../../../src/runtime/config/defaults.js';

const { CONFIG_FILENAME, loadConfig, mergeConfig } = loaderModule;
const { defaultConfig } = defaultsModule;

describe('config loader', () => {
  /** @type {string} */
  let scratch;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-config-'));
  });

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it('returns defaults when agileflow.config.json is absent', async () => {
    const result = await loadConfig(scratch);
    expect(result.source).toBe('defaults');
    expect(result.path).toBeNull();
    expect(result.config).toEqual(defaultConfig());
    expect(result.config.plugins.core.enabled).toBe(true);
  });

  it('loads and merges a valid user config', async () => {
    const file = path.join(scratch, CONFIG_FILENAME);
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        plugins: { seo: { enabled: true } },
        personalization: { tone: 'detailed' },
      }),
    );

    const result = await loadConfig(scratch);
    expect(result.source).toBe('file');
    expect(result.path).toBe(file);
    expect(result.config.plugins.core.enabled).toBe(true);
    expect(result.config.plugins.seo.enabled).toBe(true);
    expect(result.config.personalization.tone).toBe('detailed');
    expect(result.config.personalization.ask_level).toBe('decision_points');
    expect(result.config.language).toBe('en');
  });

  it('throws on malformed JSON with the file path in the message', async () => {
    const file = path.join(scratch, CONFIG_FILENAME);
    fs.writeFileSync(file, '{ not json');
    await expect(loadConfig(scratch)).rejects.toThrow(/Invalid JSON/);
    await expect(loadConfig(scratch)).rejects.toThrow(file);
  });

  it('throws on schema violation with a JSON Pointer in the message', async () => {
    const file = path.join(scratch, CONFIG_FILENAME);
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        personalization: { tone: 'shouty' },
      }),
    );
    await expect(loadConfig(scratch)).rejects.toThrow(/Config validation failed/);
    await expect(loadConfig(scratch)).rejects.toThrow('/personalization/tone');
  });

  it('forces core.enabled = true even if user sets it false', async () => {
    const file = path.join(scratch, CONFIG_FILENAME);
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        plugins: { core: { enabled: false } },
      }),
    );
    const result = await loadConfig(scratch);
    expect(result.config.plugins.core.enabled).toBe(true);
  });

  it('rejects unknown top-level fields (additionalProperties: false)', async () => {
    const file = path.join(scratch, CONFIG_FILENAME);
    fs.writeFileSync(
      file,
      JSON.stringify({ version: 1, unknownField: 'oops' }),
    );
    await expect(loadConfig(scratch)).rejects.toThrow(/unknownField|additional/i);
  });

  describe('mergeConfig', () => {
    it('deep-merges plugins map', () => {
      const merged = mergeConfig(defaultConfig(), {
        plugins: { seo: { enabled: true } },
      });
      expect(merged.plugins.core.enabled).toBe(true);
      expect(merged.plugins.seo.enabled).toBe(true);
    });

    it('overrides scalar fields', () => {
      const merged = mergeConfig(defaultConfig(), { language: 'es' });
      expect(merged.language).toBe('es');
    });
  });
});
