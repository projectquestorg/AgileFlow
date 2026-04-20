/**
 * Unit tests for the config writer — atomic writes + per-field round trips.
 *
 * Each schema field gets an explicit test so a writer-forgets-a-field
 * regression can't hide behind the loader's default-merge behavior.
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

  describe('per-field round trip', () => {
    it('preserves hooks map with per-hook timeout / skipOnError', async () => {
      await writeConfig(scratch, {
        ...defaultConfig(),
        hooks: {
          'damage-control-bash': { timeout: 3000, skipOnError: true },
          'archive-stories': { enabled: false },
        },
      });
      const { config } = await loadConfig(scratch);
      expect(config.hooks['damage-control-bash'].timeout).toBe(3000);
      expect(config.hooks['damage-control-bash'].skipOnError).toBe(true);
      expect(config.hooks['archive-stories'].enabled).toBe(false);
    });

    it('preserves ide.primary', async () => {
      await writeConfig(scratch, {
        ...defaultConfig(),
        ide: { primary: 'cursor' },
      });
      const { config } = await loadConfig(scratch);
      expect(config.ide.primary).toBe('cursor');
    });

    it('preserves language', async () => {
      await writeConfig(scratch, {
        ...defaultConfig(),
        language: 'pt-BR',
      });
      const { config } = await loadConfig(scratch);
      expect(config.language).toBe('pt-BR');
    });

    it('preserves plugin settings sub-objects verbatim', async () => {
      await writeConfig(scratch, {
        ...defaultConfig(),
        plugins: {
          core: { enabled: true },
          seo: {
            enabled: true,
            settings: {
              baseUrl: 'https://example.com',
              crawlDepth: 3,
              include: ['a', 'b'],
            },
          },
        },
      });
      const { config } = await loadConfig(scratch);
      expect(config.plugins.seo.enabled).toBe(true);
      expect(config.plugins.seo.settings.baseUrl).toBe('https://example.com');
      expect(config.plugins.seo.settings.crawlDepth).toBe(3);
      expect(config.plugins.seo.settings.include).toEqual(['a', 'b']);
    });

    it('preserves personalization tone=teaching', async () => {
      await writeConfig(scratch, {
        ...defaultConfig(),
        personalization: {
          tone: 'teaching',
          ask_level: 'always',
          verbosity: 'low',
        },
      });
      const { config } = await loadConfig(scratch);
      expect(config.personalization.tone).toBe('teaching');
      expect(config.personalization.ask_level).toBe('always');
      expect(config.personalization.verbosity).toBe('low');
    });
  });

  describe('atomic write', () => {
    it('uses temp file + rename (no tmp file lingers on success)', async () => {
      await writeConfig(scratch, defaultConfig());
      const entries = fs.readdirSync(scratch);
      // Only the final file should exist; no .tmp-* lingering.
      expect(entries.filter((e) => e.includes('.tmp-'))).toEqual([]);
      expect(entries).toContain(CONFIG_FILENAME);
    });

    it('cleans up temp file when rename destination is unavailable', async () => {
      // Make destination a directory so rename fails with EISDIR.
      const dest = path.join(scratch, CONFIG_FILENAME);
      fs.mkdirSync(dest);
      await expect(writeConfig(scratch, defaultConfig())).rejects.toThrow();
      const entries = fs.readdirSync(scratch);
      expect(entries.filter((e) => e.includes('.tmp-'))).toEqual([]);
    });
  });
});
