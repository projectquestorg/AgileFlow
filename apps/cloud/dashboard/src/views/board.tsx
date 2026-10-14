// Kanban board: a view over the same story records as the list. Drag-and-drop and a
// per-card status select perform the same transition with the same checks.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { GripVerticalIcon } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, enc, get, newRequestId, tool, type ApiWarning } from '@/lib/api';
import { clean, PRIORITIES, STORY_STATUSES } from '@/lib/constants';
import { useApp, useProject } from '@/lib/app-context';
import { useLoad } from '@/lib/hooks';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Chip, Loaded, PageHeader, Section, SimpleSelect, StateBox, WarningsList } from '@/components/common';
import { EpicProgress } from '@/views/overview';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';

type Status = (typeof STORY_STATUSES)[number];
interface Filters {
  epic?: string;
  priority?: string;
  assignee?: string;
  search?: string;
}
interface Col {
  items: any[];
  total: number;
  shown: number;
  cursor: string | null;
  hasMore: boolean;
}
type Cols = Record<string, Col>;
type CardNote =
  | { kind: 'warnings'; warnings: ApiWarning[] }
  | { kind: 'error'; title: string; message: string; from: string; target: string; requestId: string; retry?: boolean; override?: boolean };

const LIMIT = 25;
const filtersByProject = new Map<string, Filters>();

export function BoardView() {
  const { pid, canWrite } = useProject();
  const [filters, setFilters] = useState<Filters>(() => filtersByProject.get(pid) ?? {});
  const active = clean(filters as Record<string, unknown>);
  const state = useLoad(async () => {
    const [r, claims] = await Promise.all([
      tool(pid, 'agileflow_board_get', { ...active, limit: LIMIT }),
      get(`/api/projects/${enc(pid)}/claims`).catch(() => ({ items: [] })),
    ]);
    return { board: r.data, claims: (claims.items || []) as any[] };
  }, [pid, active]);

  const apply = (f: Filters) => {
    filtersByProject.set(pid, f);
    setFilters(f);
  };

  return (
    <>
      <PageHeader title="Board" description={canWrite ? 'Drag a card by its handle or use its status menu to move it.' : 'Read only: your role cannot move cards.'} />
      <Loaded state={state}>
        {(d) => (
          <>
            <FilterBar key={JSON.stringify(filters)} epics={d.board.epics} initial={filters} onApply={apply} />
            <Board data={d} filters={active} hasFilters={Object.keys(active).length > 0} />
            {d.board.epics.length ? (
              <Section title="Epic progress">
                <div className="grid gap-4 md:grid-cols-2">
                  {d.board.epics.map((e: any) => (
                    <Card key={e.id} size="sm">
                      <CardContent>
                        <EpicProgress pid={pid} epic={e} />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </Section>
            ) : null}
          </>
        )}
      </Loaded>
    </>
  );
}

function FilterBar({ epics, initial, onApply }: { epics: any[]; initial: Filters; onApply: (f: Filters) => void }) {
  const [f, setF] = useState<Filters>(initial);
  const has = Object.keys(clean(initial as Record<string, unknown>)).length > 0;
  return (
    <form
      role="search"
      aria-label="Board filters"
      className="mb-4 flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onApply({ ...f, assignee: f.assignee?.trim(), search: f.search?.trim() });
      }}
    >
      <Field className="w-48">
        <FieldLabel htmlFor="bf-epic">Epic</FieldLabel>
        <SimpleSelect id="bf-epic" value={f.epic ?? ''} onChange={(v) => setF({ ...f, epic: v })} options={[['', 'All epics'], ...epics.map((e: any) => [e.id, `${e.id} ${e.title}`] as const)]} />
      </Field>
      <Field className="w-36">
        <FieldLabel htmlFor="bf-prio">Priority</FieldLabel>
        <SimpleSelect id="bf-prio" value={f.priority ?? ''} onChange={(v) => setF({ ...f, priority: v })} options={[['', 'Any priority'], ...PRIORITIES.map((p) => [p, p.toUpperCase()] as const)]} />
      </Field>
      <Field className="w-40">
        <FieldLabel htmlFor="bf-assignee">Assignee</FieldLabel>
        <Input id="bf-assignee" value={f.assignee ?? ''} placeholder="user id" onChange={(e) => setF({ ...f, assignee: e.target.value })} />
      </Field>
      <Field className="w-48">
        <FieldLabel htmlFor="bf-search">Search</FieldLabel>
        <Input id="bf-search" type="search" value={f.search ?? ''} placeholder="Title or ID" onChange={(e) => setF({ ...f, search: e.target.value })} />
      </Field>
      <Button type="submit" variant="outline">
        Apply
      </Button>
      {has ? (
        <Button type="button" variant="ghost" onClick={() => onApply({})}>
          Clear filters
        </Button>
      ) : null}
    </form>
  );
}

function colsFrom(columns: Record<string, any>): Cols {
  const out: Cols = {};
  for (const s of STORY_STATUSES) {
    const c = columns[s] ?? { items: [], hasMore: false, nextCursor: null, total: 0 };
    out[s] = { items: c.items.map((x: any) => ({ ...x })), total: c.total, shown: c.items.length, cursor: c.nextCursor ?? null, hasMore: !!c.hasMore };
  }
  return out;
}

/** Move a card between columns (immutably). `index` inserts at a position, otherwise prepends. */
function relocate(cols: Cols, id: string, from: string, to: string, patch: Record<string, unknown> = {}, index?: number): Cols {
  const card = cols[from]?.items.find((x) => x.id === id);
  if (!card) return cols;
  const next = { ...cols };
  next[from] = { ...cols[from], items: cols[from].items.filter((x) => x.id !== id), total: cols[from].total - 1, shown: cols[from].shown - 1 };
  const items = [...(from === to ? next[from].items : cols[to].items)];
  const moved = { ...card, ...patch, status: to };
  if (index === undefined || index < 0) items.unshift(moved);
  else items.splice(Math.min(index, items.length), 0, moved);
  const base = from === to ? next[from] : cols[to];
  next[to] = { ...base, items, total: base.total + 1, shown: base.shown + 1 };
  return next;
}

function findCard(cols: Cols, id: string): { card: any; status: string; index: number } | null {
  for (const s of STORY_STATUSES) {
    const index = cols[s].items.findIndex((x) => x.id === id);
    if (index >= 0) return { card: cols[s].items[index], status: s, index };
  }
  return null;
}

function Board({ data, filters, hasFilters }: { data: { board: any; claims: any[] }; filters: Record<string, unknown>; hasFilters: boolean }) {
  const { pid, canWrite, isAdmin } = useProject();
  const { announce } = useApp();
  const isMobile = useIsMobile();
  const [cols, setCols] = useState<Cols>(() => colsFrom(data.board.columns));
  const colsRef = useRef(cols);
  colsRef.current = cols;
  const [pending, setPending] = useState<Set<string>>(new Set());
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const [notes, setNotes] = useState<Record<string, CardNote | undefined>>({});
  const [moveStatus, setMoveStatus] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<string | null>(null);

  // Refreshed data (polling or filters) replaces the board when nothing is in flight.
  useEffect(() => {
    if (!pendingRef.current.size) setCols(colsFrom(data.board.columns));
  }, [data]);

  const activeClaims = new Map(data.claims.filter((c) => c.active).map((c) => [c.storyId, c]));
  const total = STORY_STATUSES.reduce((a, s) => a + cols[s].total, 0);

  const setNote = (id: string, n?: CardNote) => setNotes((m) => ({ ...m, [id]: n }));
  const setPend = (id: string, on: boolean) =>
    setPending((p) => {
      const n = new Set(p);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  async function move(id: string, target: string, opts: { override?: boolean; requestId?: string } = {}) {
    const found = findCard(colsRef.current, id);
    if (!found) return;
    const { card, status: from, index } = found;
    if (target === from && !opts.override) return;
    if (pendingRef.current.has(id)) return;
    const requestId = opts.requestId ?? newRequestId();
    // Optimistic placement; rolled back visibly on failure.
    setNote(id, undefined);
    setPend(id, true);
    setCols((c) => relocate(c, id, from, target));
    announce(`Moving ${id} to ${target}.`);
    try {
      const r = await tool(pid, 'agileflow_work_transition', {
        workId: id,
        expectedVersion: card.version,
        targetStatus: target,
        requestId,
        ...(opts.override ? { override: true, reason: 'Administrator override from the board' } : {}),
      });
      setCols((c) => {
        const f = findCard(c, id);
        if (!f) return c;
        const items = c[f.status].items.map((x) => (x.id === id ? { ...x, version: r.data.version, status: target } : x));
        return { ...c, [f.status]: { ...c[f.status], items } };
      });
      setPend(id, false);
      const w = r.warnings ?? [];
      if (w.length) setNote(id, { kind: 'warnings', warnings: w });
      setMoveStatus(`${id} moved from ${from} to ${target}.${w.length ? ` ${w.length} warning(s).` : ''}`);
      announce(`${id} moved to ${target}.${w.length ? ` Warnings: ${w.map((x) => x.message).join(' ')}` : ''}`);
    } catch (err) {
      // Roll back to the original column and position.
      setCols((c) => {
        const f = findCard(c, id);
        return f ? relocate(c, id, f.status, from, { version: card.version }, index) : c;
      });
      setPend(id, false);
      const e = err instanceof ApiError ? err : new ApiError(0, { message: String((err as Error)?.message ?? err) });
      let note: CardNote;
      if (e.code === 'VERSION_CONFLICT') {
        note = { kind: 'error', title: 'Not moved: changed elsewhere.', message: `${id} was edited by someone else since the board loaded. The card was returned to ${from}; review it and try again.`, from, target, requestId };
        try {
          const fresh = (await tool(pid, 'agileflow_work_get', { workId: id })).data;
          setCols((c) => {
            const f = findCard(c, id);
            if (!f) return c;
            if (fresh.status !== f.status && c[fresh.status]) return relocate(c, id, f.status, fresh.status, { version: fresh.version });
            const items = c[f.status].items.map((x) => (x.id === id ? { ...x, version: fresh.version } : x));
            return { ...c, [f.status]: { ...c[f.status], items } };
          });
          if (fresh.status !== from) note = { ...note, message: `${note.message} It is now in ${fresh.status}.` };
        } catch {
          /* keep message */
        }
      } else if (e.code === 'OVERRIDE_REQUIRED') {
        note = { kind: 'error', title: 'Not moved: lifecycle rules block this.', message: `${e.message} The card stays in ${from}.${isAdmin ? '' : ' An agent or editor can request a lifecycle override approval.'}`, from, target, requestId, override: isAdmin };
      } else if (e.code === 'FORBIDDEN') {
        note = { kind: 'error', title: 'Not moved: permission denied.', message: e.message, from, target, requestId };
      } else if (e.code === 'NETWORK' || e.retryable) {
        note = { kind: 'error', title: 'Not moved.', message: e.message, from, target, requestId, retry: true };
      } else {
        note = { kind: 'error', title: 'Not moved.', message: e.message, from, target, requestId };
      }
      setNote(id, note);
      setMoveStatus(`${id} was not moved. ${note.title} ${note.message}`);
      announce(`${id} was not moved and was returned to ${from}. ${e.message}`);
    }
  }

  async function loadMore(status: string) {
    setLoadingMore(status);
    try {
      const page = (await tool(pid, 'agileflow_board_get', { ...filters, limit: LIMIT, columnCursors: { [status]: colsRef.current[status].cursor } })).data.columns[status];
      setCols((c) => {
        const seen = new Set(STORY_STATUSES.flatMap((s) => c[s].items.map((x) => x.id)));
        const add = page.items.filter((x: any) => !seen.has(x.id));
        return { ...c, [status]: { ...c[status], items: [...c[status].items, ...add], shown: c[status].shown + page.items.length, cursor: page.nextCursor ?? null, hasMore: !!page.hasMore } };
      });
      announce(`Loaded ${page.items.length} more ${status} stories.`);
    } catch (err) {
      toast(`Could not load more: ${(err as Error).message}`);
    } finally {
      setLoadingMore(null);
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const target = e.over?.id;
    if (target && typeof target === 'string') void move(String(e.active.id), target);
  };

  if (!total)
    return hasFilters ? (
      <StateBox title="No stories match these filters" message="Change or clear the filters." />
    ) : (
      <StateBox title="No stories yet" message="Create stories from the work list; they appear here by status.">
        <Button variant="outline" render={<Link to={`/p/${enc(pid)}/work`} />} nativeButton={false}>
          Open work list
        </Button>
      </StateBox>
    );

  const renderCard = (it: any, overlay = false) => (
    <StoryCard
      key={it.id}
      it={it}
      pid={pid}
      canMove={canWrite}
      pending={pending.has(it.id)}
      claimed={activeClaims.has(it.id)}
      note={notes[it.id]}
      overlay={overlay}
      hidden={dragging === it.id && !overlay}
      draggable={!isMobile}
      onMove={(s) => void move(it.id, s)}
      onRetry={(n) => void move(it.id, n.target, { requestId: n.requestId })}
      onOverride={(n) => void move(it.id, n.target, { override: true })}
      onDismiss={() => setNote(it.id, undefined)}
    />
  );

  const countLabel = (s: string) => (cols[s].shown < cols[s].total ? `${cols[s].shown} of ${cols[s].total}` : String(cols[s].total));
  const moreButton = (s: string) =>
    cols[s].hasMore ? (
      <Button variant="ghost" size="sm" disabled={loadingMore === s} onClick={() => void loadMore(s)}>
        {loadingMore === s ? <Spinner data-icon="inline-start" /> : null}
        {loadingMore === s ? 'Loading...' : 'Load more'}
      </Button>
    ) : null;

  return (
    <>
      <div role="status" aria-live="assertive" className="mb-3 min-h-5 text-sm text-muted-foreground">
        {moveStatus}
      </div>
      {isMobile ? (
        <div className="flex flex-col gap-6">
          {STORY_STATUSES.map((s) => (
            <section key={s} aria-label={`${s} stories`} className="flex flex-col gap-2">
              <h2 className="flex items-center justify-between text-sm font-medium">
                <span>{s}</span>
                <span className="text-muted-foreground">{countLabel(s)}</span>
              </h2>
              <div role="list" className="flex flex-col gap-2">
                {cols[s].items.map((it) => renderCard(it))}
              </div>
              {moreButton(s)}
            </section>
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={(e) => setDragging(String(e.active.id))} onDragCancel={() => setDragging(null)} onDragEnd={onDragEnd}>
          <ScrollArea className="w-full pb-3">
            <div className="flex gap-3">
              {STORY_STATUSES.map((s) => (
                <Column key={s} status={s} count={countLabel(s)} canDrop={canWrite}>
                  {cols[s].items.map((it) => renderCard(it))}
                  {moreButton(s)}
                </Column>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          <DragOverlay>{dragging ? (() => { const f = findCard(cols, dragging); return f ? renderCard(f.card, true) : null; })() : null}</DragOverlay>
        </DndContext>
      )}
    </>
  );
}

function Column({ status, count, canDrop, children }: { status: Status; count: string; canDrop: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !canDrop });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${status} column`}
      className={cn('flex w-72 shrink-0 flex-col gap-2 rounded-xl border bg-muted/30 p-2 transition-colors', isOver && 'border-primary bg-muted/70')}
    >
      <header className="flex items-center justify-between px-1 py-1 text-sm">
        <span className="font-medium">{status}</span>
        <span className="tabular-nums text-muted-foreground">{count}</span>
      </header>
      <div role="list" className="flex min-h-24 flex-col gap-2">
        {children}
      </div>
    </section>
  );
}

function StoryCard({
  it,
  pid,
  canMove,
  pending,
  claimed,
  note,
  overlay,
  hidden,
  draggable,
  onMove,
  onRetry,
  onOverride,
  onDismiss,
}: {
  it: any;
  pid: string;
  canMove: boolean;
  pending: boolean;
  claimed: boolean;
  note?: CardNote;
  overlay: boolean;
  hidden: boolean;
  draggable: boolean;
  onMove: (s: string) => void;
  onRetry: (n: Extract<CardNote, { kind: 'error' }>) => void;
  onOverride: (n: Extract<CardNote, { kind: 'error' }>) => void;
  onDismiss: () => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: it.id, disabled: !canMove || pending || !draggable || overlay });
  return (
    <article
      ref={overlay ? undefined : setNodeRef}
      role="listitem"
      aria-label={`${it.id} ${it.title}`}
      data-pending={pending ? 'true' : undefined}
      data-dragging={overlay ? 'true' : undefined}
      className={cn(
        'flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm shadow-xs',
        pending && 'opacity-60',
        note?.kind === 'error' && 'border-foreground/50 border-dashed',
        hidden && 'opacity-30',
        overlay && 'rotate-1 shadow-lg ring-1 ring-primary',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {canMove && draggable ? (
            <button type="button" aria-label={`Drag ${it.id}`} className="-ml-1 cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none" {...listeners} {...attributes}>
              <GripVerticalIcon className="size-4" />
            </button>
          ) : null}
          <span className="font-mono text-xs text-muted-foreground">{it.id}</span>
        </div>
        {it.priority ? <Chip tone={it.priority === 'p0' ? 'warn' : 'plain'}>{it.priority.toUpperCase()}</Chip> : <Chip tone="dashed">no priority</Chip>}
      </div>
      <Link to={`/p/${enc(pid)}/work/${enc(it.id)}`} className="font-medium leading-snug underline-offset-4 hover:underline">
        {it.title}
      </Link>
      <div className="flex flex-wrap gap-1">
        {it.epic ? <Chip>{it.epic}</Chip> : null}
        {it.assignee ? <Chip>@{it.assignee}</Chip> : null}
        {it.criteria?.total ? (
          <Chip>
            {it.criteria.checked}/{it.criteria.total} criteria
          </Chip>
        ) : null}
        {it.readiness && !it.readiness.ready && it.readiness.waitingOn?.length ? <Chip tone="dashed">waiting on {it.readiness.waitingOn.join(', ')}</Chip> : null}
        {claimed ? <Chip tone="solid">claimed by agent</Chip> : null}
      </div>
      <div className="text-xs text-muted-foreground">Updated {new Date(it.updatedAt).toLocaleDateString()}</div>
      <SimpleSelect size="sm" ariaLabel={`Status of ${it.id}`} value={it.status} disabled={!canMove || pending} onChange={onMove} options={STORY_STATUSES} />
      {pending ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner />
          Moving...
        </div>
      ) : null}
      {note?.kind === 'warnings' ? <WarningsList warnings={note.warnings} /> : null}
      {note?.kind === 'error' ? (
        <Alert role="alert">
          <AlertTitle>{note.title}</AlertTitle>
          <AlertDescription>
            <p>{note.message}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {note.retry ? (
                <Button size="xs" variant="outline" onClick={() => onRetry(note)}>
                  Retry move
                </Button>
              ) : null}
              {note.override ? (
                <Button size="xs" variant="outline" onClick={() => onOverride(note)}>
                  Override as administrator
                </Button>
              ) : null}
              <Button size="xs" variant="ghost" onClick={onDismiss}>
                Dismiss
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
    </article>
  );
}
