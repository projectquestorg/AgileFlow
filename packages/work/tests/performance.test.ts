import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildBoard,
  epicProgress,
  frontmatter,
  listEpics,
  listStories,
  readyToStart,
  scanWorkspace,
  storyReadiness,
  validateWorkspace,
} from '@agileflow/work';
import { project } from './helpers';

const STORIES = 10_000;
const EPICS = 1_000;
const suffix = (i: number) => i.toString(32).toUpperCase().replace(/I/g, 'X').replace(/L/g, 'Y').replace(/O/g, 'Z').replace(/U/g, 'W').padStart(8, '0');

describe('performance at 10,000 stories', () => {
  it(
    'scan, validate (10k-deep dependency chain), board, and list finish well within a generous bound',
    async () => {
      const { paths } = project();
      const epicDir = path.join(paths.abs, '02-epics');
      const storyDir = path.join(paths.abs, '03-stories');
      fs.mkdirSync(epicDir, { recursive: true });
      fs.mkdirSync(storyDir, { recursive: true });
      for (const f of ['README.md', '00-product/product.md', '01-roadmap/roadmap.md']) {
        fs.mkdirSync(path.dirname(path.join(paths.abs, f)), { recursive: true });
        fs.writeFileSync(path.join(paths.abs, f), '# x\n');
      }
      for (let e = 0; e < EPICS; e++) {
        const id = `EPIC-${suffix(e)}`;
        fs.writeFileSync(
          path.join(epicDir, `${id}.md`),
          frontmatter.serialize({ schema: 1, type: 'epic', id, title: `Epic ${e}`, status: 'active', horizon: 'now' }, `# Epic ${e}\n`),
        );
      }
      const storyId = (i: number) => `STORY-${suffix(i)}`;
      for (let i = 0; i < STORIES; i++) {
        const id = storyId(i);
        fs.writeFileSync(
          path.join(storyDir, `${id}.md`),
          frontmatter.serialize(
            {
              schema: 1,
              type: 'story',
              id,
              title: `Story ${i}`,
              status: i % 3 === 0 ? 'done' : 'ready',
              priority: `p${i % 4}`,
              epic: `EPIC-${suffix(i % EPICS)}`,
              // One unbroken chain through every story: the worst case for cycle detection.
              depends_on: i ? [storyId(i - 1)] : [],
            },
            `# Story ${i}\n\n## Acceptance Criteria\n\n- [ ] one\n- [x] two\n`,
          ),
        );
      }

      const started = Date.now();
      const scan = await scanWorkspace(paths);
      const scanned = Date.now();
      expect(scan.stories).toHaveLength(STORIES);
      expect(scan.epics).toHaveLength(EPICS);

      const v = validateWorkspace(scan);
      expect(v.errors).toBe(0);
      const board = buildBoard(scan);
      expect(board.groups[0]!.epics).toHaveLength(EPICS);
      for (const e of listEpics(scan)) epicProgress(scan, e.id);
      const stories = listStories(scan);
      for (const s of stories) storyReadiness(scan, s);
      expect(readyToStart(scan).length).toBeGreaterThan(0);
      const finished = Date.now();

      // Measured: roughly 1-3 s to scan and well under 1 s for everything else.
      // The bounds are ~10x that so slow CI machines pass, while the old
      // quadratic board (37 s at 10k) and recursive cycle check (stack overflow) would fail.
      expect(scanned - started).toBeLessThan(30_000);
      expect(finished - scanned).toBeLessThan(10_000);
    },
    180_000,
  );
});
