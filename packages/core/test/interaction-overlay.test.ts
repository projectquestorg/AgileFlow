import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import {
  INTERACTION_OVERLAYS,
  interactionOverlay,
  renderSkill,
  splitFrontmatter,
  type InteractionPreference,
  type TreeFile,
} from '@agileflow/core';
import { allAdapters } from '@agileflow/providers';

const file = (p: string, content: string): TreeFile => ({ path: p, content: Buffer.from(content), executable: false });
const pkg = (interaction: 'none' | 'optional' | 'required', mode: 'auto' | 'manual' = 'auto') => [
  file('SKILL.md', '---\nname: demo\ndescription: Demo. Use when testing.\n---\n\n# Demo\n\nBody.\n'),
  file(
    'agileflow.skill.yaml',
    `schema: 1\npackage:\n  name: "@agileflow/demo"\n  version: "1.0.0"\nactivation:\n  mode: ${mode}\ncapabilities:\n  userInteraction: ${interaction}\n`,
  ),
];
const skillText = (files: TreeFile[]) => files.find((f) => f.path === 'SKILL.md')!.content.toString();
const render = (files: TreeFile[], questionPreference: InteractionPreference, activation: 'auto' | 'manual' = 'auto') =>
  renderSkill(files, { id: 'demo', managed: true, activation, interactionPreference: questionPreference, adapters: allAdapters() });

describe('interaction overlays (interaction.questionPreference)', () => {
  it('provider-default adds nothing to any skill', () => {
    for (const kind of ['none', 'optional', 'required'] as const) {
      const text = skillText(render(pkg(kind), 'provider-default'));
      expect(text).not.toContain('Question preference');
    }
  });

  it('prefer and minimize produce different overlays in skills with decision points', () => {
    const base = skillText(render(pkg('optional'), 'provider-default'));
    const prefer = skillText(render(pkg('optional'), 'prefer'));
    const minimize = skillText(render(pkg('optional'), 'minimize'));
    expect(new Set([base, prefer, minimize]).size).toBe(3);
    expect(prefer).toContain(INTERACTION_OVERLAYS.optional.prefer);
    expect(minimize).toContain(INTERACTION_OVERLAYS.optional.minimize);
    // The overlay sits in the skill body, after the frontmatter: loaded only when the skill is active.
    expect(splitFrontmatter(prefer).body).toContain(INTERACTION_OVERLAYS.optional.prefer);
    expect(splitFrontmatter(prefer).frontmatter).not.toContain('Question preference');
  });

  it('encodes the intended semantics', () => {
    const { prefer, minimize } = INTERACTION_OVERLAYS.optional;
    // prefer: three gates (several options, material change, not answerable from evidence).
    expect(prefer).toMatch(/multiple reasonable choices would materially change the result/);
    expect(prefer).toMatch(/First resolve anything you can from the repository and available tools/);
    expect(prefer).toMatch(/structured question tool when available; otherwise ask briefly in plain text/);
    // minimize: proceed, but not recklessly, and only report assumptions that mattered.
    expect(minimize).toMatch(/make reasonable assumptions and continue/);
    expect(minimize).toMatch(/Ask only when blocked or when an unresolved ambiguity could materially change the result/);
    expect(minimize).toMatch(/State consequential assumptions/);
  });

  it('the skill contract wins: minimize never turns off a required interaction', () => {
    const required = skillText(render(pkg('required'), 'minimize'));
    expect(required).toContain(INTERACTION_OVERLAYS.required.minimize);
    expect(required).toMatch(/ask the questions this workflow requires/);
    expect(required).not.toContain('make reasonable assumptions');
    expect(INTERACTION_OVERLAYS.required.prefer).toBe(INTERACTION_OVERLAYS.optional.prefer);
  });

  it('interactionOverlay covers the whole matrix', () => {
    for (const pref of ['provider-default', 'prefer', 'minimize'] as const) {
      expect(interactionOverlay('none', pref)).toBeNull();
    }
    for (const kind of ['optional', 'required'] as const) {
      expect(interactionOverlay(kind, 'provider-default')).toBeNull();
      expect(interactionOverlay(kind, 'prefer')).toBe(INTERACTION_OVERLAYS[kind].prefer);
      expect(interactionOverlay(kind, 'minimize')).toBe(INTERACTION_OVERLAYS[kind].minimize);
    }
  });

  it('leaves report-only skills (userInteraction: none) unchanged', () => {
    const base = skillText(render(pkg('none'), 'provider-default'));
    expect(skillText(render(pkg('none'), 'prefer'))).toBe(base);
    expect(skillText(render(pkg('none'), 'minimize'))).toBe(base);
  });

  it('never changes activation: a manual skill stays manual under prefer', () => {
    const files = render(pkg('required', 'manual'), 'prefer', 'manual');
    const fm = YAML.parse(splitFrontmatter(skillText(files)).frontmatter!);
    expect(fm['disable-model-invocation']).toBe(true);
    // OpenCode has no manual-only switch; nothing is written for it.
    expect(fm.metadata?.['opencode/autoinvoke']).toBeUndefined();
    expect(YAML.parse(files.find((f) => f.path === 'agents/openai.yaml')!.content.toString())).toEqual({
      policy: { allow_implicit_invocation: false },
    });
    const auto = render(pkg('required', 'auto'), 'prefer', 'auto');
    expect(YAML.parse(splitFrontmatter(skillText(auto)).frontmatter!)['disable-model-invocation']).toBeUndefined();
  });
});
