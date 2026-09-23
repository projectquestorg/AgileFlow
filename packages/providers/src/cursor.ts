import { createStandardAdapter, readSkillText } from './standard-agent-skills';
import { getSkillFrontmatter, setSkillFrontmatter } from './util';

/** Cursor reads `.agents/skills` natively; manual-only uses `disable-model-invocation`. */
export const cursorAdapter = createStandardAdapter({
  id: 'cursor',
  displayName: 'Cursor',
  support: 'native',
  detection: {
    executables: ['cursor-agent', 'cursor'],
    homeMarkers: ['.cursor'],
    projectMarkers: ['.cursor'],
  },
  manualInvocation: 'hard',
  manualMechanism: '`disable-model-invocation: true` in SKILL.md',
  applyManualActivation: (files) => setSkillFrontmatter(files, ['disable-model-invocation'], true),
  async hasManualFlag(skill) {
    const text = await readSkillText(skill);
    return !!text && getSkillFrontmatter(text, ['disable-model-invocation']) === true;
  },
});
