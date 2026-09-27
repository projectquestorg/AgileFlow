import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { frontmatter } from '@agileflow/work';
import { workSandbox } from './helpers';

const STORIES = 5_000;
const EPICS = 500;
const suffix = (i: number) => i.toString(32).toUpperCase().replace(/I/g, 'X').replace(/L/g, 'Y').replace(/O/g, 'Z').replace(/U/g, 'W').padStart(8, '0');

describe('work commands on a 5,000-story workspace', () => {
  it(
    'board, list, show, status, and check stay fast (no per-epic or per-dependency rescans)',
    async () => {
      const sb = await workSandbox();
      const root = path.join(sb.project, 'docs/agile');
      fs.mkdirSync(path.join(root, '02-epics'), { recursive: true });
      fs.mkdirSync(path.join(root, '03-stories'), { recursive: true });
      for (let e = 0; e < EPICS; e++) {
        const id = `EPIC-${suffix(e)}`;
        const horizon = ['now', 'next', 'later'][e % 3];
        fs.writeFileSync(path.join(root, '02-epics', `${id}.md`), frontmatter.serialize({ schema: 1, type: 'epic', id, title: `Epic ${e}`, status: 'active', horizon }, `# Epic ${e}\n`));
      }
      const storyId = (i: number) => `STORY-${suffix(i)}`;
      for (let i = 0; i < STORIES; i++) {
        const id = storyId(i);
        const data = {
          schema: 1,
          type: 'story',
          id,
          title: `Story ${i}`,
          status: i % 2 ? 'ready' : 'done',
          epic: `EPIC-${suffix(i % EPICS)}`,
          depends_on: i ? [storyId(i - 1)] : [],
        };
        fs.writeFileSync(path.join(root, '03-stories', `${id}.md`), frontmatter.serialize(data, `# Story ${i}\n\n## Acceptance Criteria\n\n- [x] one\n`));
      }

      const started = Date.now();
      const board = await sb.af(['work', 'board', '--json']);
      expect(board.code).toBe(0);
      expect(JSON.parse(board.stdout).groups).toHaveLength(3);
      expect((await sb.af(['work', 'list', '--type', 'epic'])).code).toBe(0);
      expect(JSON.parse((await sb.af(['work', 'list', '--ready', '--json'])).stdout)).toHaveLength(STORIES / 2);
      expect((await sb.af(['work', 'show', `EPIC-${suffix(1)}`, '--json'])).code).toBe(0);
      expect((await sb.af(['work', 'status', storyId(STORIES - 1), 'in-progress'])).code).toBe(0);
      const check = await sb.af(['check']);
      expect(check.stdout).toContain(`[ok] ${STORIES} stories`);
      expect(check.stdout).toContain('[ok] dependency graph valid');
      // Six full scans of 5,500 files. Measured at a few seconds in total; the old
      // implementation needed about 10 s for `board` alone at this size.
      expect(Date.now() - started).toBeLessThan(60_000);
    },
    240_000,
  );
});
