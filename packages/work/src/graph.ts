import type { Story } from './types';

/**
 * Find dependency cycles among stories. Each cycle is reported once, starting
 * at its smallest ID. Iterative depth-first search, so arbitrarily long
 * dependency chains cannot overflow the call stack.
 */
export function findDependencyCycles(stories: Story[]): string[][] {
  const edges = new Map<string, string[]>();
  for (const s of stories) if (!edges.has(s.id)) edges.set(s.id, (s.depends_on ?? []).filter((d) => d !== s.id));
  const cycles = new Map<string, string[]>();
  const done = new Set<string>();
  /** Position of each story on the current path (only while it is being visited). */
  const onPath = new Map<string, number>();
  const path: string[] = [];
  const frames: Array<{ id: string; next: number }> = [];
  const enter = (id: string) => {
    onPath.set(id, path.length);
    path.push(id);
    frames.push({ id, next: 0 });
  };
  for (const root of [...edges.keys()].sort()) {
    if (done.has(root)) continue;
    enter(root);
    while (frames.length) {
      const frame = frames[frames.length - 1]!;
      const targets = edges.get(frame.id)!;
      if (frame.next < targets.length) {
        const next = targets[frame.next++]!;
        if (!edges.has(next) || done.has(next)) continue;
        const at = onPath.get(next);
        if (at === undefined) {
          enter(next);
          continue;
        }
        const cycle = path.slice(at);
        let min = 0;
        for (let i = 1; i < cycle.length; i++) if (cycle[i]! < cycle[min]!) min = i;
        const rotated = [...cycle.slice(min), ...cycle.slice(0, min)];
        cycles.set(rotated.join('>'), rotated);
      } else {
        frames.pop();
        path.pop();
        onPath.delete(frame.id);
        done.add(frame.id);
      }
    }
  }
  return [...cycles.values()];
}

/**
 * Validate workspace integrity: structure, frontmatter, duplicate IDs, epic,
 * dependency, and decision references, dependency cycles, done epics with
 * unfinished stories, and done stories with unchecked acceptance criteria.
 * Reports only; never changes a status.
 */
