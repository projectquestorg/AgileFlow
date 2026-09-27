import { afterEach } from 'vitest';
import { createSandbox, type Sandbox } from '../helpers';

const open: Sandbox[] = [];
afterEach(() => {
  for (const sb of open.splice(0)) sb.cleanup();
});

/** A sandbox project, cleaned up after each test. */
export async function sandbox(fixture = 'clean-node'): Promise<Sandbox> {
  const sb = await createSandbox({ fixture });
  open.push(sb);
  return sb;
}

/** A sandbox with Work enabled (no skills) in docs/agile. */
export async function workSandbox(fixture = 'clean-node'): Promise<Sandbox> {
  const sb = await sandbox(fixture);
  const res = await sb.af(['work', 'init', '--yes', '--no-skills']);
  if (res.code !== 0) throw new Error(`work init failed: ${res.stderr}${res.stdout}`);
  return sb;
}

/** Run a command with --json and parse its output. */
export async function json<T = Record<string, unknown>>(sb: Sandbox, args: string[]): Promise<T> {
  const res = await sb.af([...args, '--json']);
  if (res.code !== 0) throw new Error(`${args.join(' ')} failed: ${res.stderr}`);
  return JSON.parse(res.stdout) as T;
}

/** Create an item and return its id. */
export async function create(sb: Sandbox, type: string, title: string, ...extra: string[]): Promise<string> {
  return (await json<{ id: string }>(sb, ['work', 'new', type, '--title', title, ...extra])).id;
}
