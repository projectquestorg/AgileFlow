import { describe, expect, it } from 'vitest';
import { frontmatter } from '@agileflow/work';

const STORY = `---
schema: 1
type: story
id: STORY-3Q7MX2PK
title: Add Google sign-in
status: ready   # agreed in planning
priority: p1
epic: EPIC-7M4K2P9Q
depends_on: []
---

# Add Google sign-in

## Acceptance Criteria

- [ ] Google appears as an authentication option.
  Trailing spaces stay.${'   '}
---
Not frontmatter: a thematic break in the body.
`;

describe('parse', () => {
  it('separates frontmatter and body; the body is exact', () => {
    const doc = frontmatter.parse(STORY);
    expect(doc.data).toMatchObject({ schema: 1, type: 'story', id: 'STORY-3Q7MX2PK', status: 'ready', depends_on: [] });
    expect(doc.body).toBe(STORY.slice(STORY.indexOf('\n# Add Google')));
    expect(doc.body).toContain('Trailing spaces stay.   \n---\nNot frontmatter');
  });

  it('handles CRLF, BOM, missing, and broken frontmatter', () => {
    const crlf = STORY.replace(/\n/g, '\r\n');
    expect(frontmatter.parse(crlf).data?.id).toBe('STORY-3Q7MX2PK');
    expect(frontmatter.parse(`﻿${STORY}`).data?.id).toBe('STORY-3Q7MX2PK');
    expect(frontmatter.parse('# No frontmatter\n')).toMatchObject({ data: null, body: '# No frontmatter\n' });
    expect(frontmatter.parse('---\nid: [unclosed\n---\nbody').error).toBeTruthy();
    expect(frontmatter.parse('---\n- a list\n---\nbody').error).toMatch(/not a YAML mapping/);
  });
});

describe('validate', () => {
  const base = { schema: 1, type: 'story', id: 'STORY-3Q7MX2PK', title: 'T', status: 'ready' };

  it('accepts required fields only, and the optional ones', () => {
    expect(frontmatter.validate(base)).toEqual([]);
    expect(frontmatter.validate({ ...base, priority: 'p0', epic: 'EPIC-7M4K2P9Q', depends_on: ['STORY-H5D2V8NA'] })).toEqual([]);
    expect(frontmatter.validate({ schema: 1, type: 'epic', id: 'EPIC-7M4K2P9Q', title: 'E', status: 'active', horizon: 'now' })).toEqual([]);
    expect(frontmatter.validate({ schema: 1, type: 'decision', id: 'DEC-4C8M2Q7K', title: 'D', status: 'accepted', related: ['EPIC-7M4K2P9Q'] })).toEqual([]);
  });

  it('rejects missing fields, unknown statuses, and malformed ids', () => {
    const messages = (d: Record<string, unknown>) => frontmatter.validate(d).map((p) => `${p.level}: ${p.message}`);
    expect(messages({ ...base, title: undefined })).toEqual(['error: title is required']);
    expect(messages({ ...base, status: 'grooming' })[0]).toMatch(/^error: status:/);
    expect(messages({ ...base, id: 'STORY-123' })[0]).toMatch(/^error: id: must look like STORY-XXXXXXXX/);
    expect(messages({ ...base, epic: 'STORY-3Q7MX2PK' })[0]).toMatch(/^error: epic:/);
    expect(messages({ ...base, priority: 'urgent' })[0]).toMatch(/^error: priority:/);
    expect(messages({ ...base, schema: undefined })).toEqual(['error: schema: 1 is required']);
    expect(messages({ ...base, schema: 2 })).toEqual(['error: schema 2 is newer than this AgileFlow understands (schema 1)']);
    expect(messages({ ...base, type: 'task' })[0]).toMatch(/type must be epic, story, or decision/);
    expect(messages({ ...base, type: 'epic', status: 'active', id: 'EPIC-7M4K2P9Q' }).length).toBe(0);
    expect(frontmatter.validate(base, 'epic')[0]!.message).toMatch(/is in the epic folder/);
  });

  it('warns (does not fail) on fields outside schema 1', () => {
    expect(frontmatter.validate({ ...base, assignee: 'agent-3', storyPoints: 5 })).toEqual([
      { level: 'warn', message: 'unknown fields assignee, storyPoints (not part of story schema 1)' },
    ]);
  });
});

describe('patch', () => {
  it('changes only the status: the body and every other line are byte-for-byte identical', () => {
    const next = frontmatter.patch(STORY, { status: 'in-progress' });
    expect(next).toBe(STORY.replace('status: ready   # agreed in planning', 'status: in-progress   # agreed in planning'));
    expect(frontmatter.parse(next).body).toBe(frontmatter.parse(STORY).body);
  });

  it('preserves CRLF line endings and a BOM', () => {
    const crlf = `﻿${STORY.replace(/\n/g, '\r\n')}`;
    const next = frontmatter.patch(crlf, { status: 'done' });
    expect(next.startsWith('﻿---\r\n')).toBe(true);
    expect(next).not.toMatch(/[^\r]\n/);
    expect(frontmatter.parse(next).data?.status).toBe('done');
    expect(frontmatter.parse(next).body).toBe(frontmatter.parse(crlf).body);
  });

  it('adds, replaces block lists, and removes keys', () => {
    let text = frontmatter.patch(STORY, { depends_on: ['STORY-H5D2V8NA', 'STORY-F8Q4N6JC'] });
    expect(frontmatter.parse(text).data?.depends_on).toEqual(['STORY-H5D2V8NA', 'STORY-F8Q4N6JC']);
    text = frontmatter.patch(text, { depends_on: ['STORY-H5D2V8NA'] });
    expect(frontmatter.parse(text).data?.depends_on).toEqual(['STORY-H5D2V8NA']);
    expect(text).toContain('epic: EPIC-7M4K2P9Q\ndepends_on:\n  - STORY-H5D2V8NA\n---');
    text = frontmatter.patch(text, { priority: undefined, horizon: 'now' });
    const data = frontmatter.parse(text).data!;
    expect(data.priority).toBeUndefined();
    expect(data.horizon).toBe('now');
    expect(() => frontmatter.patch('# none\n', { status: 'x' })).toThrow(/no frontmatter/);
  });

  it('does not mistake # inside a quoted title for a comment', () => {
    const text = STORY.replace('title: Add Google sign-in', 'title: "Fix #12: login"');
    const next = frontmatter.patch(text, { title: 'Fix #13: login' });
    expect(frontmatter.parse(next).data?.title).toBe('Fix #13: login');
  });
});

describe('patch: non-canonical frontmatter (never appends a duplicate key)', () => {
  const body = '\n# Story\n\n- [ ] one\n';
  const status = (text: string) => frontmatter.parse(text).data?.status;

  it('quoted keys: only the value changes', () => {
    const text = `---\nschema: 1\ntype: story\nid: STORY-AAAAAAA9\ntitle: q\n"status": backlog\n---\n${body}`;
    const next = frontmatter.patch(text, { status: 'ready' });
    expect(next).toBe(text.replace('"status": backlog', '"status": ready'));
    expect(next.match(/status/g)).toHaveLength(1);
    const single = text.replace('"status": backlog', "'status': 'backlog'");
    expect(frontmatter.patch(single, { status: 'ready' })).toBe(text.replace('"status": backlog', "'status': ready"));
  });

  it('flow-style mappings keep their shape', () => {
    const text = `---\n{schema: 1, type: story, id: STORY-AAAAAAA9, title: q, status: backlog}\n---\n${body}`;
    const next = frontmatter.patch(text, { status: 'in-progress' });
    expect(next).toBe(text.replace('status: backlog}', 'status: in-progress}'));
    expect(frontmatter.parse(next).data).toEqual({ schema: 1, type: 'story', id: 'STORY-AAAAAAA9', title: 'q', status: 'in-progress' });
    // A missing key is added inside the braces, not after them.
    const added = frontmatter.patch(text, { priority: 'p1' });
    expect(frontmatter.parse(added).data?.priority).toBe('p1');
    expect(added).toContain('status: backlog, priority: p1}');
    const titled = frontmatter.patch(text, { title: 'a, {b}' });
    expect(frontmatter.parse(titled).data?.title).toBe('a, {b}');
    expect(titled).toContain('title: "a, {b}"');
  });

  it('CRLF, BOM, comments, and quoted keys together', () => {
    const text = `\uFEFF---\r\n# leading comment\r\nschema: 1\r\ntype: story\r\nid: STORY-AAAAAAA9\r\ntitle: "Fix #12"\r\n"status": ready  # agreed\r\n---\r\n\r\n# Body\r\n`;
    const next = frontmatter.patch(text, { status: 'done' });
    expect(next).toBe(text.replace('"status": ready  # agreed', '"status": done  # agreed'));
    expect(status(next)).toBe('done');
  });

  it('explicit keys, empty values, block scalars, and indented mappings', () => {
    const explicit = `---\nschema: 1\n? status\n: backlog\n---\n`;
    expect(status(frontmatter.patch(explicit, { status: 'ready' }))).toBe('ready');
    const empty = `---\nschema: 1\nstatus:\ntitle: x\n---\n`;
    const e = frontmatter.patch(empty, { status: 'ready' });
    expect(e).toBe('---\nschema: 1\nstatus: ready\ntitle: x\n---\n');
    const block = `---\nstatus: >-\n  backlog\ntitle: x\n---\n`;
    expect(frontmatter.patch(block, { status: 'ready' })).toBe('---\nstatus: ready\ntitle: x\n---\n');
    const indented = `---\n  schema: 1\n  title: x\n---\n`;
    const added = frontmatter.patch(indented, { status: 'ready' });
    expect(added).toBe('---\n  schema: 1\n  title: x\n  status: ready\n---\n');
  });

  it('refuses instead of writing something that does not re-parse to the requested values', () => {
    expect(() => frontmatter.patch('---\nstatus: a\nstatus: b\n---\n', { status: 'ready' })).toThrow(/does not parse/);
    expect(() => frontmatter.patch('---\n- a\n---\n', { status: 'ready' })).toThrow(/not a YAML mapping/);
    // Trailing comma in a flow mapping: inserting a key would produce invalid YAML.
    expect(() => frontmatter.patch('---\n{a: 1,}\n---\n', { status: 'ready' })).toThrow(/could not update status safely/);
  });
});

describe('parse: title comments', () => {
  it('flags an unquoted title cut by " #"', () => {
    expect(frontmatter.parse('---\ntitle: Fix #123 crash\n---\n')).toMatchObject({ data: { title: 'Fix' }, titleComment: '#123 crash' });
    expect(frontmatter.parse('---\ntitle: "Fix #123 crash"\n---\n').titleComment).toBeUndefined();
    expect(frontmatter.parse('---\ntitle: Fix#123\n---\n').titleComment).toBeUndefined();
  });
});

describe('validate: wrong types are not reported as missing', () => {
  const base = { schema: 1, type: 'story', id: 'STORY-3Q7MX2PK', title: 'T', status: 'ready' };
  it('names the received type', () => {
    const [p] = frontmatter.validate({ ...base, title: 2024 });
    expect(p!.message).toMatch(/^title: .*\(got number 2024\)$/);
    const [d] = frontmatter.validate({ ...base, depends_on: 'STORY-H5D2V8NA' });
    expect(d!.message).toMatch(/^depends_on: .*\(got string "STORY-H5D2V8NA"\)$/);
    expect(frontmatter.validate({ ...base, title: undefined })[0]!.message).toBe('title is required');
  });
});

describe('serialize', () => {
  it('writes canonical key order and round-trips through parse', () => {
    const text = frontmatter.serialize(
      { title: 'Use Auth.js: yes', related: ['EPIC-7M4K2P9Q'], status: 'accepted', id: 'DEC-4C8M2Q7K', type: 'decision', schema: 1 },
      '# Body\n',
    );
    expect(text.split('\n').slice(0, 6)).toEqual(['---', 'schema: 1', 'type: decision', 'id: DEC-4C8M2Q7K', 'title: "Use Auth.js: yes"', 'status: accepted']);
    const doc = frontmatter.parse(text);
    expect(doc.data).toEqual({ schema: 1, type: 'decision', id: 'DEC-4C8M2Q7K', title: 'Use Auth.js: yes', status: 'accepted', related: ['EPIC-7M4K2P9Q'] });
    expect(doc.body).toBe('\n# Body\n');
    expect(frontmatter.validate(doc.data!)).toEqual([]);
  });
});
