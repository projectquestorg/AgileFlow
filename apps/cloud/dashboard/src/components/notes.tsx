import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ApiError, enc, send, tool } from '@/lib/api';
import { actorLabel, clean, NOTE_KINDS } from '@/lib/constants';
import { useApp, useProject } from '@/lib/app-context';
import { useAction } from '@/lib/hooks';
import { ActionStatus, Chip, Notice, SimpleSelect, TimeAgo, WorkLink } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { Textarea } from '@/components/ui/textarea';

/** One note with author, kind, edit (own notes), redact (admins) and promote (decision proposals). */
export function NoteRow({ note: initial, showWork = true }: { note: any; showWork?: boolean }) {
  const { pid, canWrite, isAdmin } = useProject();
  const { me, refresh } = useApp();
  const [n, setN] = useState(initial);
  const [mode, setMode] = useState<'view' | 'edit' | 'redact' | 'promote'>('view');
  const [text, setText] = useState('');
  const [promoted, setPromoted] = useState<string | null>(n.promotedDecisionId ?? null);
  const a = useAction();
  const mine = n.author?.kind === 'user' && n.author?.userId === me.user.id;

  const start = (m: typeof mode) => {
    a.reset();
    setText(m === 'edit' ? n.body : m === 'promote' ? n.body.split('\n')[0].slice(0, 120) : '');
    setMode(m);
  };

  const saveEdit = async () => {
    try {
      const r = await a.run((requestId) => send('POST', `/api/projects/${enc(pid)}/notes/${enc(n.id)}/edit`, { body: text, expectedVersion: n.version, requestId }), { success: 'Note updated.' });
      setN({ ...n, body: text, version: r?.version ?? n.version + 1 });
      setMode('view');
    } catch {
      /* shown */
    }
  };
  const redact = async () => {
    if (!text.trim()) return;
    try {
      await a.run((requestId) => send('POST', `/api/projects/${enc(pid)}/notes/${enc(n.id)}/redact`, { reason: text.trim(), requestId }), { success: 'Redacted. The body was removed from the note, its revisions, and future exports.' });
      setN({ ...n, body: '[redacted]', redacted: true });
      setMode('view');
    } catch {
      /* shown */
    }
  };
  const promote = async () => {
    try {
      const r = await a.run((requestId) => send('POST', `/api/projects/${enc(pid)}/notes/${enc(n.id)}/promote`, { title: text.trim(), requestId }));
      toast(`Created ${r.decisionId}.`);
      setPromoted(r.decisionId);
      setMode('view');
    } catch {
      /* shown */
    }
  };

  const conflict = a.status === 'error' && a.error instanceof ApiError && a.error.code === 'VERSION_CONFLICT';

  return (
    <Item variant="outline" className="flex-col items-stretch">
      <ItemContent>
        <ItemTitle className="flex flex-wrap items-center gap-2 text-xs font-normal text-muted-foreground">
          <Chip>{n.kind}</Chip>
          <span>{n.author ? actorLabel(n.author) : 'removed author'}</span>
          <span>
            <TimeAgo iso={n.createdAt} />
          </span>
          {n.version > 1 ? <span>(edited)</span> : null}
          {n.redacted ? <Chip tone="dashed">redacted</Chip> : null}
          {showWork && n.workId ? <WorkLink pid={pid} id={n.workId} /> : null}
          {n.runId ? <span>run {n.runId}</span> : null}
          {n.correctsNoteId ? <span>corrects {n.correctsNoteId}</span> : null}
          {promoted ? (
            <span>
              promoted to <WorkLink pid={pid} id={promoted} />
            </span>
          ) : null}
        </ItemTitle>
        {mode === 'edit' ? (
          <div className="flex flex-col gap-2">
            <Textarea aria-label="Edit note" value={text} onChange={(e) => setText(e.target.value)} className="min-h-20" />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdit} disabled={a.pending}>Save</Button>
              <Button size="sm" variant="outline" onClick={() => setMode('view')}>Cancel</Button>
            </div>
          </div>
        ) : (
          <ItemDescription className="line-clamp-none whitespace-pre-wrap text-foreground">{n.body}</ItemDescription>
        )}
        {mode === 'redact' ? (
          <div className="flex flex-wrap items-end gap-2">
            <Field className="max-w-sm">
              <FieldLabel htmlFor={`rd-${n.id}`}>Reason (kept in the redaction event)</FieldLabel>
              <Input id={`rd-${n.id}`} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            <Button size="sm" variant="destructive" onClick={redact} disabled={!text.trim() || a.pending}>Redact note</Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('view')}>Cancel</Button>
          </div>
        ) : null}
        {mode === 'promote' ? (
          <div className="flex flex-wrap items-end gap-2">
            <Field className="max-w-md">
              <FieldLabel htmlFor={`pr-${n.id}`}>Decision title</FieldLabel>
              <Input id={`pr-${n.id}`} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            <Button size="sm" onClick={promote} disabled={!text.trim() || a.pending}>Create proposed decision</Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('view')}>Cancel</Button>
          </div>
        ) : null}
        {conflict ? (
          <Notice role="alert" title="This note changed" action={<Button size="sm" variant="outline" onClick={refresh}>Reload notes</Button>}>
            {a.error?.message}
          </Notice>
        ) : (
          <ActionStatus action={a} />
        )}
      </ItemContent>
      {mode === 'view' ? (
        <ItemActions>
          {mine && !n.redacted && canWrite ? <Button size="xs" variant="ghost" onClick={() => start('edit')}>Edit</Button> : null}
          {isAdmin && !n.redacted ? <Button size="xs" variant="ghost" onClick={() => start('redact')}>Redact</Button> : null}
          {n.kind === 'decision-proposal' && !promoted && !n.redacted && canWrite ? <Button size="xs" variant="ghost" onClick={() => start('promote')}>Promote to decision</Button> : null}
          {promoted ? (
            <Button size="xs" variant="ghost" render={<Link to={`/p/${enc(pid)}/work/${enc(promoted)}`} />} nativeButton={false}>
              Open {promoted}
            </Button>
          ) : null}
        </ItemActions>
      ) : null}
    </Item>
  );
}

export function NotesList({ items, showWork }: { items: any[]; showWork?: boolean }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">No notes yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      {items.map((n) => (
        <NoteRow key={`${n.id}:${n.version}`} note={n} showWork={showWork} />
      ))}
    </div>
  );
}

export function AddNoteForm({ workId }: { workId?: string }) {
  const { pid } = useProject();
  const { refresh, setDirty } = useApp();
  const [kind, setKind] = useState('comment');
  const [body, setBody] = useState('');
  const [about, setAbout] = useState('');
  const a = useAction();
  const done = () => {
    setBody('');
    setDirty(`note:${workId ?? 'project'}`, false);
    refresh();
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await a.run((requestId) => tool(pid, 'agileflow_note_add', clean({ kind, body, workId: workId ?? about.trim(), requestId })), { success: 'Note added.' });
      done();
    } catch {
      /* shown */
    }
  };
  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-3">
      <FieldGroup className="flex-row flex-wrap gap-3">
        <Field className="w-48">
          <FieldLabel htmlFor={`nk-${workId ?? 'p'}`}>Kind</FieldLabel>
          <SimpleSelect id={`nk-${workId ?? 'p'}`} value={kind} onChange={setKind} options={NOTE_KINDS} />
        </Field>
        {!workId ? (
          <Field className="w-48">
            <FieldLabel htmlFor="note-about">About (optional work ID)</FieldLabel>
            <Input id="note-about" maxLength={40} value={about} onChange={(e) => setAbout(e.target.value)} />
          </Field>
        ) : null}
      </FieldGroup>
      <Field>
        <FieldLabel htmlFor={`nb-${workId ?? 'p'}`}>Note</FieldLabel>
        <Textarea
          id={`nb-${workId ?? 'p'}`}
          required
          maxLength={10000}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setDirty(`note:${workId ?? 'project'}`, !!e.target.value);
          }}
          className="min-h-24"
        />
      </Field>
      <div>
        <Button type="submit" disabled={a.pending || !body.trim()}>
          Add note
        </Button>
      </div>
      <ActionStatus action={a} onRetried={done} />
    </form>
  );
}
