import { describe, expect, it } from 'vitest';
import { parse } from 'smol-toml';
import { readTomlValue, removeTomlValue, setTomlValue, TomlEditError } from '@agileflow/providers';

const T = 'features';
const K = 'default_mode_request_user_input';

/** Every successful edit must be TOML 1.0 that Codex (toml_edit) would load. */
function assertValid(text: string, expected: boolean | undefined) {
  const doc = parse(text) as Record<string, Record<string, unknown> | undefined>;
  expect(doc[T]?.[K]).toBe(expected);
}

describe('TOML patching: shapes real Codex configs use', () => {
  it('adds a dotted key instead of a duplicate [features] table when features uses root dotted keys', () => {
    const src = 'model = "gpt-5"\nfeatures.web_search_request = true\n\n[mcp_servers.x]\ncommand = "x"\n';
    const { text, createdTable } = setTomlValue(src, T, K, true);
    expect(createdTable).toBe(false);
    expect(text).toBe(
      'model = "gpt-5"\nfeatures.web_search_request = true\nfeatures.default_mode_request_user_input = true\n\n[mcp_servers.x]\ncommand = "x"\n',
    );
    expect(text).not.toContain('[features]');
    assertValid(text, true);
    expect(removeTomlValue(text, T, K, false)).toBe(src);
  });

  it('keeps indentation and comments on dotted and table keys, including `key=value#comment`', () => {
    expect(setTomlValue(`  features.${K} = false # mine\n`, T, K, true).text).toBe(`  features.${K} = true # mine\n`);
    expect(setTomlValue(`[features]\n${K}=false#c\n`, T, K, true).text).toBe(`[features]\n${K}=true#c\n`);
  });

  it('accepts TOML 1.0 that older parsers reject: BOM, mixed arrays, local times', () => {
    const bom = '\uFEFFmodel = "o3"\n';
    expect(readTomlValue(bom, T, K)).toEqual({ existed: false });
    const withBom = setTomlValue(bom, T, K, true).text;
    expect(withBom.startsWith('\uFEFFmodel = "o3"\n')).toBe(true);
    assertValid(withBom, true);
    expect(removeTomlValue(withBom, T, K, true)).toBe(bom);

    const modern = 'mixed = ["a", 1]\nwake = 07:32:00\nday = 1979-05-27\n';
    const edited = setTomlValue(modern, T, K, true).text;
    expect(edited.startsWith(modern)).toBe(true);
    assertValid(edited, true);
    expect(removeTomlValue(edited, T, K, true)).toBe(modern);
  });

  it('keeps each line ending as it was in a mixed LF/CRLF file', () => {
    const src = 'a = 1\r\nb = 2\n\n[features]\r\nweb = true\n';
    const { text } = setTomlValue(src, T, K, true);
    expect(text.replace(`${K} = true\r\n`, '')).toBe(src);
    expect(removeTomlValue(text, T, K, false)).toBe(src);
  });

  it('keeps "no newline at end of file"', () => {
    const src = '[features]\nweb = true';
    const { text } = setTomlValue(src, T, K, true);
    expect(text).toBe(`[features]\n${K} = true\nweb = true`);
    expect(removeTomlValue(`[features]\nweb = true\n${K} = true`, T, K, false)).toBe(src);
  });

  it('ignores `[features]` inside multi-line strings', () => {
    const src = 'notes = """\n[features]\n"""\n';
    const { text, createdTable } = setTomlValue(src, T, K, true);
    expect(createdTable).toBe(true);
    assertValid(text, true);
    expect((parse(text) as { notes: string }).notes).toBe('[features]\n');
  });

  it('refuses quoted keys and headers with an "edit manually" message', () => {
    expect(() => setTomlValue(`[features]\n"${K}" = false\n`, T, K, true)).toThrow(/quoted default_mode_request_user_input key.*manually/);
    expect(() => setTomlValue('["features"]\nweb = true\n', T, K, true)).toThrow(/quoted \[features\] header.*manually/);
    expect(() => setTomlValue(`features."${K}" = false\n`, T, K, true)).toThrow(/quoted features\.\* keys/);
  });

  it('refuses invalid TOML with the line number, without guessing', () => {
    let error: unknown;
    try {
      setTomlValue('a = 1\na = 2\n', T, K, true);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(TomlEditError);
    expect((error as Error).message).toMatch(/not valid TOML \(line 2/);
    // A duplicate [features] table (what the old patcher produced) is rejected.
    expect(() => readTomlValue('features.a = true\n\n[features]\nb = true\n', T, K)).toThrow(TomlEditError);
  });

  it('refuses an edit that would change anything else (array of tables named features)', () => {
    expect(() => setTomlValue('[[features]]\nname = "a"\n', T, K, true)).toThrow(TomlEditError);
  });

  it('never writes invalid TOML: every shape either round-trips or is refused', () => {
    const shapes = [
      '',
      '\n\n',
      'model = "x"',
      'model = "x"\n\n\n',
      '[features]\n',
      '[features] # c\n# note\nweb = true\n\n[other]\nk = 1\n',
      'features.web = true\n',
      'features.web = true\n[features.sub]\nx = 1\n',
      '[features.sub]\nx = 1\n',
      '[profiles.a.features]\nweb = true\n',
      '[a]\nfeatures.x = 1\n',
      `[features]\n${K} = false\n`,
      `features.${K} = false\n`,
      'features = { web = true }\n',
      '"features".web = true\n',
      'x = """\n[features]\ny = 1\n"""\n',
      "x = '''\n[features]\n'''\n[features]\nweb = true\n",
      'arr = [\n  [1, 2],\n  [3],\n]\n[features]\nweb = true\n',
      '\uFEFF[features]\r\nweb = true\r\n',
    ];
    for (const src of shapes) {
      for (const value of [true, false]) {
        let text: string;
        try {
          text = setTomlValue(src, T, K, value).text;
        } catch (err) {
          expect(err, src).toBeInstanceOf(TomlEditError);
          continue;
        }
        assertValid(text, value);
        const removed = removeTomlValue(text, T, K, true);
        expect(readTomlValue(removed, T, K), src).toEqual({ existed: false });
      }
    }
  });
});
