/**
 * Unit tests for the pure buildPluginsMap helper.
 *
 * The interactive pickPlugins flow is hard to test headlessly (Clack
 * needs a TTY), so we extracted the pure merge logic. Same logic also
 * backs the --yes path's pluginsFromCsv.
 */
import { describe, it, expect } from 'vitest';

import pluginPicker from '../../../src/cli/wizard/plugin-picker.js';

const { buildPluginsMap } = pluginPicker;

const discovered = [
  { id: 'core', cannotDisable: true },
  { id: 'seo' },
  { id: 'ads' },
  { id: 'audit' },
];

describe('buildPluginsMap', () => {
  it('forces cannotDisable plugins to enabled regardless of selection', () => {
    const result = buildPluginsMap(discovered, new Set());
    expect(result.core.enabled).toBe(true);
    expect(result.seo.enabled).toBe(false);
  });

  it('enables plugins that are in the selected set', () => {
    const result = buildPluginsMap(discovered, new Set(['seo', 'audit']));
    expect(result.core.enabled).toBe(true);
    expect(result.seo.enabled).toBe(true);
    expect(result.audit.enabled).toBe(true);
    expect(result.ads.enabled).toBe(false);
  });

  it('preserves custom (non-discovered) plugin entries from existing config', () => {
    const existing = {
      core: { enabled: true },
      myplugin: { enabled: true, settings: { apiKey: 'xxx' } },
      anothercustom: { enabled: false },
    };
    const result = buildPluginsMap(discovered, new Set(['seo']), existing);
    expect(result.myplugin).toEqual({ enabled: true, settings: { apiKey: 'xxx' } });
    expect(result.anothercustom).toEqual({ enabled: false });
    expect(result.seo.enabled).toBe(true);
  });

  it('does not let existing config override the selected set for bundled plugins', () => {
    const existing = { seo: { enabled: true } }; // user had it enabled
    const result = buildPluginsMap(discovered, new Set() /* unselected */, existing);
    // Selected set wins: seo is no longer enabled.
    expect(result.seo.enabled).toBe(false);
  });

  it('is a no-op for empty inputs (beyond core)', () => {
    const result = buildPluginsMap(discovered, new Set(), {});
    expect(Object.keys(result).sort()).toEqual(['ads', 'audit', 'core', 'seo']);
  });

  it('skips invalid existing entries (null / non-object / array)', () => {
    const existing = {
      broken: null,
      alsoBroken: 'not an object',
      arrayMasqueradingAsObject: [true],
      okCustom: { enabled: true },
    };
    const result = buildPluginsMap(discovered, new Set(), /** @type {any} */ (existing));
    expect(result.broken).toBeUndefined();
    expect(result.alsoBroken).toBeUndefined();
    // Arrays pass `typeof === 'object'` but are not valid plugin entries.
    expect(result.arrayMasqueradingAsObject).toBeUndefined();
    expect(result.okCustom).toEqual({ enabled: true });
  });

  it('preserves settings on discovered plugins across reruns', () => {
    const existing = {
      core: { enabled: true },
      seo: { enabled: true, settings: { crawlDepth: 3, baseUrl: 'https://x.com' } },
    };
    const result = buildPluginsMap(discovered, new Set(['seo']), existing);
    expect(result.seo).toEqual({
      enabled: true,
      settings: { crawlDepth: 3, baseUrl: 'https://x.com' },
    });
  });

  it('does not attach settings when existing entry has no settings sub-object', () => {
    const existing = { seo: { enabled: true } };
    const result = buildPluginsMap(discovered, new Set(['seo']), existing);
    expect(result.seo).toEqual({ enabled: true });
    expect('settings' in result.seo).toBe(false);
  });

  it('preserves settings even when the plugin is now disabled', () => {
    // User deselects seo in the wizard, but had previously configured settings.
    // The enabled flag flips to false; settings stay in case they re-enable.
    const existing = {
      seo: { enabled: true, settings: { crawlDepth: 5 } },
    };
    const result = buildPluginsMap(discovered, new Set() /* seo NOT selected */, existing);
    expect(result.seo.enabled).toBe(false);
    expect(result.seo.settings).toEqual({ crawlDepth: 5 });
  });
});
