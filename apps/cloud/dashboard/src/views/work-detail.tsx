// Epic / story / decision detail.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { allPages, ApiError, enc, fullContent, get, tool } from '@/lib/api';
import { actorLabel, clean, HORIZONS, idsFrom, PRIORITIES, STATUSES } from '@/lib/constants';
import { useApp, useProject } from '@/lib/app-context';
import { useAction, useLoad } from '@/lib/hooks';
import { ActionStatus, Chip, IdList, Loaded, Notice, PageHeader, Section, SimpleSelect, StateBox, StatusBadge, TimeAgo, WarningsList, WorkLink } from '@/components/common';
import { MarkdownEditor } from '@/components/markdown-editor';
import { AddNoteForm, NotesList } from '@/components/notes';
import { WorkTable, epicOptions } from '@/views/work-list';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ChevronRightIcon } from 'lucide-react';

export function WorkDetail() {
  const { wid = '' } = useParams();
  const { pid, canWrite } = useProject();
  const state = useLoad(async () => {
    const loadFull = () => fullContent((cursor) => tool(pid, 'agileflow_work_get', { workId: wid, ...(cursor ? { contentCursor: cursor } : {}) }));
    const item = await loadFull();
    const type = item.type;
    const canEdit = canWrite && !item.archived;
    const [notes, history, claims, epics, children] = await Promise.all([
      allPages(pid, 'agileflow_note_list', { workId: wid }, 5),
      allPages(pid, 'agileflow_activity_list', { objectId: wid }, 5),
      type === 'story' ? get(`/api/projects/${enc(pid)}/claims`).catch(() => ({ items: [] })) : { items: [] },
      canEdit && type === 'story' ? epicOptions(pid) : [],
      type === 'epic' ? allPages(pid, 'agileflow_work_list', { type: 'story', epic: wid }, 10) : null,
    ]);
    return { item, notes: notes.items, history: history.items, claims: (claims.items || []) as any[], epics, children: children?.items ?? null };
  }, [pid, wid]);
  return <Loaded state={state}>{(d) => <Detail d={d} wid={wid} />}</Loaded>;
}

function Detail({ d, wid }: { d: any; wid: string }) {
  const { pid, canWrite, isAdmin } = useProject();
  const { refresh } = useApp();
  const item = d.item;
  const type: string = item.type;
  const canEdit = canWrite && !item.archived;
  const listHref = type === 'decision' ? `/p/${enc(pid)}/decisions` : `/p/${enc(pid)}/work`;
  const loadFull = () => fullContent((cursor) => tool(pid, 'agileflow_work_get', { workId: wid, ...(cursor ? { contentCursor: cursor } : {}) }));

  return (
    <>
      <Breadcrumb className="mb-3">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to={listHref} />}>{type === 'decision' ? 'Decisions' : 'Work list'}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-mono">{item.id}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <PageHeader
        title={item.title}
        description={!canWrite ? 'You can view this item. Editing needs the editor role.' : item.archived ? 'This item is archived and read-only.' : undefined}
        actions={
          <>
            <Chip>{type}</Chip>
            <StatusBadge status={item.status} />
            {item.priority ? <Chip>{item.priority.toUpperCase()}</Chip> : <Chip tone="dashed">no priority</Chip>}
            {item.archived ? <Chip tone="dashed">archived</Chip> : null}
            <Chip>v{item.version}</Chip>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>
              Updated <TimeAgo iso={item.updatedAt} />
              {item.legacyId ? ` - legacy ID ${item.legacyId}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {type === 'story' ? (
                <>
                  <dt className="text-muted-foreground">Epic</dt>
                  <dd>{item.epic ? <WorkLink pid={pid} id={item.epic} /> : 'standalone'}</dd>
                  <dt className="text-muted-foreground">Depends on</dt>
                  <dd>
                    <IdList pid={pid} ids={item.dependsOn} none="nothing" />
                  </dd>
                  <dt className="text-muted-foreground">Readiness</dt>
                  <dd>
                    {item.readiness ? (
                      item.readiness.ready ? (
                        <Chip tone="solid">ready</Chip>
                      ) : item.readiness.waitingOn?.length ? (
                        <>
                          waiting on <IdList pid={pid} ids={item.readiness.waitingOn} none="" />
                        </>
                      ) : (
                        <StatusBadge status={item.status} />
                      )
                    ) : (
                      <span className="text-muted-foreground">unknown</span>
                    )}
                  </dd>
                  <dt className="text-muted-foreground">Acceptance criteria</dt>
                  <dd>{item.criteria?.total ? `${item.criteria.checked} of ${item.criteria.total} checked` : 'none found in the body'}</dd>
                  <dt className="text-muted-foreground">Assignee</dt>
                  <dd>{item.assignee ?? 'unassigned'}</dd>
                </>
              ) : null}
              {type === 'epic' ? (
                <>
                  <dt className="text-muted-foreground">Horizon</dt>
                  <dd>{item.horizon ?? 'not set'}</dd>
                </>
              ) : null}
              {type === 'decision' ? (
                <>
                  <dt className="text-muted-foreground">Related</dt>
                  <dd>
                    <IdList pid={pid} ids={item.related} none="none" />
                  </dd>
                  <dt className="text-muted-foreground">Superseded by</dt>
                  <dd>{item.supersededBy ? <WorkLink pid={pid} id={item.supersededBy} /> : 'not superseded'}</dd>
                </>
              ) : null}
            </dl>
          </CardContent>
        </Card>
        {canWrite ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Status</CardTitle>
              <CardDescription>Transitions are checked against lifecycle rules. Administrators can override with a reason.</CardDescription>
            </CardHeader>
            <CardContent>
              <TransitionForm item={item} isAdmin={isAdmin} onDone={refresh} />
            </CardContent>
          </Card>
        ) : null}
      </div>

      {canEdit ? <FieldsForm item={item} epics={d.epics} onDone={refresh} /> : null}

      <Section title="Body" actions={<span className="text-xs text-muted-foreground">{item.content.totalBytes} bytes</span>}>
        <Card>
          <CardContent>
            <MarkdownEditor
              label="body"
              dirtyKey={`work:${wid}`}
              doc={{ body: item.content.body, version: item.version, contentHash: item.contentHash, complete: item.content.complete }}
              canEdit={canEdit}
              reload={async () => {
                const x = await loadFull();
                return { body: x.content.body, version: x.version, contentHash: x.contentHash, complete: true };
              }}
              save={(body, base, requestId) => tool(pid, 'agileflow_work_update', { workId: wid, expectedVersion: base.version, priorContentHash: base.contentHash, patch: { body }, requestId })}
              onSaved={() => setTimeout(refresh, 50)}
            />
          </CardContent>
        </Card>
      </Section>

      {d.children ? <EpicChildren epic={item} items={d.children} /> : null}

      {type === 'story' ? (
        <Section title="Agent claims">
          {(() => {
            const mine = d.claims.filter((c: any) => c.storyId === wid);
            return mine.length ? (
              <ul className="flex flex-col gap-2 text-sm">
                {mine.map((c: any) => (
                  <li key={c.id ?? `${c.runId}:${c.generation}`} className="flex flex-wrap items-center gap-2">
                    {c.active ? <Chip tone="solid">active</Chip> : <Chip tone="dashed">{c.releasedAt ? 'released' : 'expired'}</Chip>}
                    <span>
                      run <span className="font-mono">{c.runId}</span>, generation {c.generation},{' '}
                    </span>
                    {c.active ? (
                      <span>
                        expires <TimeAgo iso={c.expiresAt} />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{c.releaseReason ?? ''}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No agent has claimed this story. A claim coordinates agents; it does not block your edits.</p>
            );
          })()}
        </Section>
      ) : null}

      <Section title="Notes">
        <NotesList items={d.notes} showWork={false} />
        {canWrite ? <AddNoteForm workId={wid} /> : null}
      </Section>

      <Section title="History">
        {d.history.length ? (
          <ol className="flex flex-col gap-2 text-sm">
            {d.history
              .slice()
              .reverse()
              .map((e: any) => (
                <li key={e.seq} className="flex flex-col">
                  <span>{e.summary}</span>
                  <span className="text-xs text-muted-foreground">
                    {actorLabel(e.actor)} - <TimeAgo iso={e.at} />
                    {e.objectVersion ? ` (v${e.objectVersion})` : ''}
                  </span>
                </li>
              ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">No history.</p>
        )}
      </Section>
    </>
  );
}

function TransitionForm({ item, isAdmin, onDone }: { item: any; isAdmin: boolean; onDone: () => void }) {
  const { pid } = useProject();
  const [target, setTarget] = useState(item.status);
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState<any[] | null>(() => {
    const s = sessionStorage.getItem(`af.warn.${item.id}`);
    sessionStorage.removeItem(`af.warn.${item.id}`);
    return s ? JSON.parse(s) : null;
  });
  const a = useAction();
  useEffect(() => setTarget(item.status), [item.status, item.version]);

  const finish = (r: any) => {
    toast(`${item.id} is now ${target}.${r.warnings?.length ? ` ${r.warnings.length} warning(s).` : ''}`);
    if (r.warnings?.length) sessionStorage.setItem(`af.warn.${item.id}`, JSON.stringify(r.warnings));
    setSaved(r.warnings?.length ? r.warnings : null);
    onDone();
  };
  const go = async (override = false) => {
    try {
      finish(
        await a.run((requestId) =>
          tool(pid, 'agileflow_work_transition', clean({ workId: item.id, expectedVersion: item.version, targetStatus: target, reason: reason.trim() || (override ? 'Administrator override from the dashboard' : ''), override, requestId })),
        ),
      );
    } catch {
      /* shown below */
    }
  };
  const code = a.status === 'error' && a.error instanceof ApiError ? a.error.code : null;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void go();
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-44">
          <FieldLabel htmlFor="tr-status">New status</FieldLabel>
          <SimpleSelect id="tr-status" value={target} onChange={setTarget} options={STATUSES[item.type] ?? []} />
        </Field>
        <Field className="min-w-48 flex-1">
          <FieldLabel htmlFor="tr-reason">Reason (optional)</FieldLabel>
          <Input id="tr-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Button type="submit" variant="outline" disabled={a.pending || target === item.status}>
          Change status
        </Button>
      </div>
      {code === 'OVERRIDE_REQUIRED' ? (
        <Notice
          role="alert"
          title="Lifecycle rules block this change"
          action={isAdmin ? <Button size="sm" variant="outline" onClick={() => void go(true)}>Override as administrator</Button> : undefined}
        >
          {a.error?.message} {isAdmin ? '' : 'Finish or cancel the unfinished work first, or ask for a lifecycle override approval.'}
        </Notice>
      ) : code === 'VERSION_CONFLICT' ? (
        <Notice role="alert" title="Changed elsewhere" action={<Button size="sm" variant="outline" onClick={onDone}>Reload</Button>}>
          {a.error?.message}
        </Notice>
      ) : (
        <ActionStatus action={a} onRetried={finish} />
      )}
      {saved ? <WarningsList warnings={saved} /> : null}
    </form>
  );
}

function FieldsForm({ item, epics, onDone }: { item: any; epics: any[]; onDone: () => void }) {
  const { pid } = useProject();
  const { setDirty } = useApp();
  const type = item.type;
  const initial = () => ({
    title: item.title,
    priority: item.priority ?? '',
    horizon: item.horizon ?? '',
    epic: item.epic ?? '',
    deps: (item.dependsOn ?? []).join(', '),
    related: (item.related ?? []).join(', '),
    superseded: item.supersededBy ?? '',
    assignee: item.assignee ?? '',
  });
  const [v, setV] = useState(initial);
  const [dirty, setD] = useState(false);
  const [nothing, setNothing] = useState(false);
  const a = useAction();
  const key = `fields:${item.id}`;
  useEffect(() => {
    if (!dirty) setV(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.version]);
  useEffect(() => {
    setDirty(key, dirty);
    return () => setDirty(key, false);
  }, [dirty, key, setDirty]);
  const upd = (patch: Partial<ReturnType<typeof initial>>) => {
    setV({ ...v, ...patch });
    setD(true);
    setNothing(false);
  };

  const epicOpts: Array<readonly [string, string]> = [['', 'Standalone'], ...epics.map((e: any) => [e.id, `${e.id} ${e.title}`] as const), ...(item.epic && !epics.some((e: any) => e.id === item.epic) ? [[item.epic, item.epic] as const] : [])];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const patch: Record<string, unknown> = {};
    if (v.title.trim() !== item.title) patch.title = v.title.trim();
    if ((v.priority || null) !== (item.priority ?? null)) patch.priority = v.priority || null;
    if (type !== 'story' && (v.horizon || null) !== (item.horizon ?? null)) patch.horizon = v.horizon || null;
    if (type === 'story') {
      if ((v.epic || null) !== (item.epic ?? null)) patch.epic = v.epic || null;
      if (idsFrom(v.deps).join(',') !== (item.dependsOn ?? []).join(',')) patch.dependsOn = idsFrom(v.deps);
      if ((v.assignee.trim() || null) !== (item.assignee ?? null)) patch.assignee = v.assignee.trim() || null;
    }
    if (type === 'decision') {
      if (idsFrom(v.related).join(',') !== (item.related ?? []).join(',')) patch.related = idsFrom(v.related);
      if ((v.superseded.trim() || null) !== (item.supersededBy ?? null)) patch.supersededBy = v.superseded.trim() || null;
    }
    if (!Object.keys(patch).length) {
      setNothing(true);
      return;
    }
    try {
      await a.run((requestId) => tool(pid, 'agileflow_work_update', { workId: item.id, expectedVersion: item.version, patch, requestId }));
      setD(false);
      toast(`${item.id} updated.`);
      onDone();
    } catch {
      /* shown */
    }
  };
  const conflict = a.status === 'error' && a.error instanceof ApiError && a.error.code === 'VERSION_CONFLICT';

  return (
    <Collapsible className="mt-6 rounded-xl border">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 p-4 text-left font-medium">
        <ChevronRightIcon className="size-4 transition-transform group-data-[panel-open]:rotate-90" />
        Edit details
        {dirty ? <span className="text-xs font-normal text-muted-foreground">Unsaved changes</span> : null}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <form onSubmit={submit} className="flex flex-col gap-4 px-4 pb-4">
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="ed-title">Title</FieldLabel>
              <Input id="ed-title" maxLength={300} value={v.title} onChange={(e) => upd({ title: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="ed-prio">Priority</FieldLabel>
              <SimpleSelect id="ed-prio" value={v.priority} onChange={(x) => upd({ priority: x })} options={[['', 'None'], ...PRIORITIES]} />
            </Field>
            {type !== 'story' ? (
              <Field>
                <FieldLabel htmlFor="ed-hz">Horizon</FieldLabel>
                <SimpleSelect id="ed-hz" value={v.horizon} onChange={(x) => upd({ horizon: x })} options={[['', 'None'], ...HORIZONS]} />
              </Field>
            ) : null}
            {type === 'story' ? (
              <>
                <Field>
                  <FieldLabel htmlFor="ed-epic">Epic</FieldLabel>
                  <SimpleSelect id="ed-epic" value={v.epic} onChange={(x) => upd({ epic: x })} options={epicOpts} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ed-deps">Depends on (IDs, comma separated)</FieldLabel>
                  <Input id="ed-deps" placeholder="STORY-..., STORY-..." value={v.deps} onChange={(e) => upd({ deps: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ed-assignee">Assignee</FieldLabel>
                  <Input id="ed-assignee" value={v.assignee} onChange={(e) => upd({ assignee: e.target.value })} />
                </Field>
              </>
            ) : null}
            {type === 'decision' ? (
              <>
                <Field>
                  <FieldLabel htmlFor="ed-related">Related (IDs)</FieldLabel>
                  <Input id="ed-related" value={v.related} onChange={(e) => upd({ related: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ed-sup">Superseded by (replacement decision ID; history is kept)</FieldLabel>
                  <Input id="ed-sup" placeholder="DECISION-..." value={v.superseded} onChange={(e) => upd({ superseded: e.target.value })} />
                </Field>
              </>
            ) : null}
          </FieldGroup>
          <div className="flex gap-2">
            <Button type="submit" disabled={a.pending}>
              Save details
            </Button>
            {dirty ? (
              <Button type="button" variant="ghost" onClick={() => { setV(initial()); setD(false); }}>
                Reset
              </Button>
            ) : null}
          </div>
          {nothing ? <p className="text-sm text-muted-foreground">Nothing changed.</p> : null}
          {conflict ? (
            <Notice role="alert" title="Changed elsewhere" action={<Button size="sm" variant="outline" onClick={() => { setD(false); onDone(); }}>Reload</Button>}>
              {a.error?.message} Reload to see the latest values, then re-apply your change.
            </Notice>
          ) : (
            <ActionStatus action={a} onRetried={() => { setD(false); onDone(); }} />
          )}
        </form>
      </CollapsibleContent>
    </Collapsible>
  );
}

function EpicChildren({ epic, items }: { epic: any; items: any[] }) {
  const { pid, canWrite } = useProject();
  const { refresh } = useApp();
  const [title, setTitle] = useState('');
  const a = useAction();
  const done = items.filter((s) => s.status === 'done').length;
  const cancelled = items.filter((s) => s.status === 'cancelled').length;
  const unfinished = items.length - done - cancelled;
  const finish = () => {
    setTitle('');
    refresh();
  };
  return (
    <Section title="Stories in this epic">
      {items.length ? (
        <>
          <p className="text-sm text-muted-foreground">
            {done} done, {cancelled} cancelled, {unfinished} unfinished of {items.length}.{unfinished && epic.status !== 'done' ? ' Completing this epic with unfinished stories needs an override.' : ''}
          </p>
          <div className="rounded-xl border">
            <WorkTable rows={items} />
          </div>
        </>
      ) : (
        <StateBox title="No stories" message="This epic has no child stories yet." />
      )}
      {canWrite ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await a.run((requestId) => tool(pid, 'agileflow_work_create', { kind: 'story', title: title.trim(), epic: epic.id, requestId }));
              finish();
            } catch {
              /* shown */
            }
          }}
        >
          <Field className="max-w-md">
            <FieldLabel htmlFor="add-story">Add a story to this epic</FieldLabel>
            <Input id="add-story" required maxLength={300} placeholder="Story title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Button type="submit" variant="outline" disabled={a.pending || !title.trim()}>
            Add story
          </Button>
          <ActionStatus action={a} onRetried={finish} />
        </form>
      ) : null}
    </Section>
  );
}
