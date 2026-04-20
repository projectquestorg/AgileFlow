/**
 * Unit tests for the pluginsFromCsv helper extracted from setup.js.
 *
 * The full setup flow is exercised by integration tests; here we cover
 * the CSV parsing + unknown-plugin detection logic in isolation.
 */
import { describe, it, expect } from 'vitest';

import setupModule from '../../../src/cli/commands/setup.js';

const { pluginsFromCsv } = setupModule;

describe('pluginsFromCsv', () => {
  it('enables core even if CSV is empty', () => {
    const { plugins, unknownPlugins } = pluginsFromCsv('');
    expect(plugins.core.enabled).toBe(true);
    expect(unknownPlugins).toEqual([]);
  });

  it('enables listed discovered plugins', () => {
    const { plugins, unknownPlugins } = pluginsFromCsv('seo,audit');
    expect(plugins.core.enabled).toBe(true);
    expect(plugins.seo.enabled).toBe(true);
    expect(plugins.audit.enabled).toBe(true);
    expect(plugins.ads.enabled).toBe(false);
    expect(unknownPlugins).toEqual([]);
  });

  it('surfaces typos / unknown plugin ids', () => {
    const { plugins, unknownPlugins } = pluginsFromCsv('seo,typo,another-typo');
    expect(plugins.seo.enabled).toBe(true);
    expect(unknownPlugins.sort()).toEqual(['another-typo', 'typo']);
  });

  it('ignores whitespace-only CSV entries', () => {
    const { plugins, unknownPlugins } = pluginsFromCsv('  ,  ,seo,  ');
    expect(plugins.seo.enabled).toBe(true);
    expect(unknownPlugins).toEqual([]);
  });

  it('preserves custom plugin entries in existing config', () => {
    const existing = {
      core: { enabled: true },
      mycustom: { enabled: true, settings: { key: 'value' } },
    };
    const { plugins, unknownPlugins } = pluginsFromCsv('seo', existing);
    expect(plugins.mycustom).toEqual({ enabled: true, settings: { key: 'value' } });
    expect(plugins.seo.enabled).toBe(true);
    expect(unknownPlugins).toEqual([]);
  });
});
