import { createStandardAdapter, readSkillText } from './standard-agent-skills';
import { getSkillFrontmatter, setSkillFrontmatter } from './util';

/** OpenCode discovers `.agents/skills` natively; manual-only uses `metadata.opencode/autoinvoke`. */
export const opencodeAdapter = createStandardAdapter({
  id: 'opencode',
  displayName: 'OpenCode',
  support: 'native',
  detection: {
    executables: ['opencode'],
    homeMarkers: ['.config/opencode'],
    projectMarkers: ['.opencode', 'opencode.json', 'opencode.jsonc'],
  },
  manualInvocation: 'hard',
  manualMechanism: '`metadata.opencode/autoinvoke: false` in SKILL.md',
  applyManualActivation: (files) => setSkillFrontmatter(files, ['metadata', 'opencode/autoinvoke'], false),
  async hasManualFlag(skill) {
    const text = await readSkillText(skill);
    return !!text && getSkillFrontmatter(text, ['metadata', 'opencode/autoinvoke']) === false;
  },
});
