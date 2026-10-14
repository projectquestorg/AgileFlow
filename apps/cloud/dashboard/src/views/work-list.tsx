// Work list and decisions, with the shared create dialog and paged table.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import { allPages, enc, tool } from '@/lib/api';
import { clean, DECISION_STATUSES, EPIC_STATUSES, HORIZONS, PRIORITIES, STORY_STATUSES } from '@/lib/constants';
import { useProject } from '@/lib/app-context';
import { useAction, useLoad } from '@/lib/hooks';
import { ActionStatus, Chip, LoadMoreButton, Loaded, PageHeader, SimpleSelect, StateBox, StatusBadge, TimeAgo, WorkLink } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button as UIButton } from '@/components/ui/button';

export async function epicOptions(pid: string) {
  return (await allPages(pid, 'agileflow_work_list', { type: 'epic' }, 5)).items as any[];
}

// --------------------------------------------------------------- create

export function CreateWorkDialog({ kinds = ['story', 'epic', 'decision'], epics = [], label = 'Create work' }: { kinds?: string[]; epics?: any[]; label?: string }) {
  const { pid } = useProject();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(kinds[0]);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('');
  const [epic, setEpic] = useState('');
  const a = useAction();

  const done = (r: any) => {
    toast(`Created ${r.data.id}.`);
    setOpen(false);
    navigate(`/p/${enc(pid)}/work/${enc(r.data.id)}`);
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      done(await a.run((requestId) => tool(pid, 'agileflow_work_create', clean({ kind, title: title.trim(), priority, epic: kind === 'story' ? epic : '', requestId }))));
    } catch {
      /* shown */
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) a.reset(); }}>
      <DialogTrigger render={<Button />}>
        <PlusIcon data-icon="inline-start" />
        {label}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>New items start in their first lifecycle status. You can edit the body after creating.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {kinds.length > 1 ? (
              <Field>
                <FieldLabel htmlFor="cw-kind">Type</FieldLabel>
                <SimpleSelect id="cw-kind" value={kind} onChange={setKind} options={kinds} />
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="cw-title">Title</FieldLabel>
              <Input id="cw-title" required maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </Field>
            <Field>
              <FieldLabel htmlFor="cw-prio">Priority</FieldLabel>
              <SimpleSelect id="cw-prio" value={priority} onChange={setPriority} options={[['', 'No priority'], ...PRIORITIES.map((p) => [p, p.toUpperCase()] as const)]} />
            </Field>
            {kind === 'story' ? (
              <Field>
                <FieldLabel htmlFor="cw-epic">Epic</FieldLabel>
                <SimpleSelect id="cw-epic" value={epic} onChange={setEpic} options={[['', 'No epic (standalone)'], ...epics.map((e) => [e.id, `${e.id} ${e.title}`] as const)]} />
              </Field>
            ) : null}
          </FieldGroup>
          <ActionStatus action={a} onRetried={done} />
          <DialogFooter>
            <Button type="submit" disabled={a.pending || !title.trim()}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- table

export function WorkTable({ rows }: { rows: any[] }) {
  const { pid } = useProject();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {['ID', 'Type', 'Title', 'Status', 'Priority', 'Epic / horizon', 'Readiness', 'Updated'].map((t) => (
            <TableHead key={t} scope="col">
              {t}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((w) => (
          <TableRow key={w.id}>
            <TableCell className="font-mono text-xs">
              <WorkLink pid={pid} id={w.id} />
            </TableCell>
            <TableCell>
              <Chip>{w.type}</Chip>
            </TableCell>
            <TableCell className="max-w-80 whitespace-normal">
              <WorkLink pid={pid} id={w.id}>
                {w.title}
              </WorkLink>{' '}
              {w.archived ? <Chip tone="dashed">archived</Chip> : null}
            </TableCell>
            <TableCell>
              <StatusBadge status={w.status} />
            </TableCell>
            <TableCell>{w.priority ? w.priority.toUpperCase() : <span className="text-muted-foreground">none</span>}</TableCell>
            <TableCell>{w.type === 'story' ? w.epic ? <WorkLink pid={pid} id={w.epic} /> : <span className="text-muted-foreground">standalone</span> : w.horizon ?? ''}</TableCell>
            <TableCell>{w.readiness ? w.readiness.ready ? <Chip tone="solid">ready</Chip> : w.readiness.waitingOn?.length ? <Chip tone="dashed">waiting: {w.readiness.waitingOn.join(', ')}</Chip> : null : null}</TableCell>
            <TableCell>
              <TimeAgo iso={w.updatedAt} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function PagedList({ args, emptyTitle, emptyMsg }: { args: Record<string, unknown>; emptyTitle: string; emptyMsg: string }) {
  const { pid } = useProject();
  const state = useLoad(() => tool(pid, 'agileflow_work_list', { ...args, limit: 50 }).then((r) => r.data), [pid, args]);
  return <Loaded state={state}>{(first) => <PagedRows key={JSON.stringify(args)} first={first} args={args} emptyTitle={emptyTitle} emptyMsg={emptyMsg} />}</Loaded>;
}

function PagedRows({ first, args, emptyTitle, emptyMsg }: { first: any; args: Record<string, unknown>; emptyTitle: string; emptyMsg: string }) {
  const { pid } = useProject();
  const [rows, setRows] = useState<any[]>(first.items);
  const [cursor, setCursor] = useState<string | null>(first.nextCursor);
  const [hasMore, setHasMore] = useState<boolean>(first.hasMore);
  const [loadingAll, setLoadingAll] = useState(false);
  useEffect(() => {
    // In-place refresh: keep extra pages only if the first page did not change shape.
    setRows(first.items);
    setCursor(first.nextCursor);
    setHasMore(first.hasMore);
  }, [first]);

  if (!rows.length) return <StateBox title={emptyTitle} message={emptyMsg} />;
  const fetchNext = async (c: string | null) => {
    const page = (await tool(pid, 'agileflow_work_list', { ...args, cursor: c, limit: 100 })).data;
    setRows((r) => [...r, ...page.items]);
    setCursor(page.nextCursor);
    setHasMore(page.hasMore);
    return { more: page.hasMore as boolean, next: page.nextCursor as string | null };
  };
  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="text-sm text-muted-foreground">
        {hasMore ? `Showing ${rows.length}; more available.` : `All ${rows.length} shown.`}
      </p>
      <div className="rounded-xl border">
        <WorkTable rows={rows} />
      </div>
      {hasMore ? (
        <div className="flex flex-wrap gap-2">
          <LoadMoreButton more={async () => (await fetchNext(cursor)).more} />
          <UIButton
            variant="ghost"
            size="sm"
            disabled={loadingAll}
            onClick={async () => {
              setLoadingAll(true);
              try {
                let c = cursor;
                for (;;) {
                  const r = await fetchNext(c);
                  if (!r.more) break;
                  c = r.next;
                }
              } catch (err) {
                toast((err as Error).message);
              } finally {
                setLoadingAll(false);
              }
            }}
          >
            {loadingAll ? 'Loading all...' : 'Load all'}
          </UIButton>
        </div>
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------------- views

interface ListFilters {
  type?: string;
  status?: string;
  priority?: string;
  readiness?: string;
  horizon?: string;
  search?: string;
  includeArchived?: boolean;
}
const listFilters = new Map<string, ListFilters>();
const ALL_STATUSES = [...new Set([...STORY_STATUSES, ...EPIC_STATUSES, ...DECISION_STATUSES])];

export function WorkList() {
  const { pid, canWrite } = useProject();
  const [applied, setApplied] = useState<ListFilters>(() => listFilters.get(pid) ?? {});
  const [f, setF] = useState<ListFilters>(applied);
  const epics = useLoad(() => (canWrite ? epicOptions(pid) : Promise.resolve([])), [pid, canWrite]);
  const args = clean(applied as Record<string, unknown>);
  const has = Object.keys(args).length > 0;
  return (
    <>
      <PageHeader
        title="Work list"
        description="Epics, stories, and decisions sorted by type and ID. Results page until every item is loaded."
        actions={canWrite ? <CreateWorkDialog epics={epics.data ?? []} /> : null}
      />
      <form
        role="search"
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const next = { ...f, search: f.search?.trim() };
          listFilters.set(pid, next);
          setApplied(next);
        }}
      >
        <Field className="w-36">
          <FieldLabel htmlFor="wl-type">Type</FieldLabel>
          <SimpleSelect id="wl-type" value={f.type ?? ''} onChange={(v) => setF({ ...f, type: v })} options={[['', 'All types'], 'epic', 'story', 'decision']} />
        </Field>
        <Field className="w-40">
          <FieldLabel htmlFor="wl-status">Status</FieldLabel>
          <SimpleSelect id="wl-status" value={f.status ?? ''} onChange={(v) => setF({ ...f, status: v })} options={[['', 'Any status'], ...ALL_STATUSES]} />
        </Field>
        <Field className="w-32">
          <FieldLabel htmlFor="wl-prio">Priority</FieldLabel>
          <SimpleSelect id="wl-prio" value={f.priority ?? ''} onChange={(v) => setF({ ...f, priority: v })} options={[['', 'Any priority'], ...PRIORITIES]} />
        </Field>
        <Field className="w-36">
          <FieldLabel htmlFor="wl-ready">Readiness</FieldLabel>
          <SimpleSelect id="wl-ready" value={f.readiness ?? ''} onChange={(v) => setF({ ...f, readiness: v })} options={[['', 'Any readiness'], 'ready', 'waiting']} />
        </Field>
        <Field className="w-32">
          <FieldLabel htmlFor="wl-horizon">Horizon</FieldLabel>
          <SimpleSelect id="wl-horizon" value={f.horizon ?? ''} onChange={(v) => setF({ ...f, horizon: v })} options={[['', 'Any horizon'], ...HORIZONS]} />
        </Field>
        <Field className="w-48">
          <FieldLabel htmlFor="wl-search">Search</FieldLabel>
          <Input id="wl-search" type="search" value={f.search ?? ''} onChange={(e) => setF({ ...f, search: e.target.value })} />
        </Field>
        <Field orientation="horizontal" className="w-auto">
          <Checkbox id="wl-arch" checked={!!f.includeArchived} onCheckedChange={(c) => setF({ ...f, includeArchived: !!c })} />
          <FieldLabel htmlFor="wl-arch">Include archived</FieldLabel>
        </Field>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>
      <PagedList args={args} emptyTitle={has ? 'No results' : 'No work yet'} emptyMsg={has ? 'Nothing matches these filters.' : 'Create an epic or story to begin.'} />
    </>
  );
}

export function Decisions() {
  const { pid, canWrite } = useProject();
  const key = `${pid}:decisions`;
  const [status, setStatus] = useState(() => listFilters.get(key)?.status ?? '');
  const args = clean({ type: 'decision', status });
  return (
    <>
      <PageHeader
        title="Decisions"
        description="Proposed, accepted, superseded, and rejected decisions. Superseding links a replacement and keeps history. Decision-proposal notes can be promoted from Notes and history."
        actions={canWrite ? <CreateWorkDialog kinds={['decision']} label="Record a decision" /> : null}
      />
      <div className="mb-4 flex items-end gap-3">
        <Field className="w-44">
          <FieldLabel htmlFor="dc-status">Status</FieldLabel>
          <SimpleSelect
            id="dc-status"
            value={status}
            onChange={(v) => {
              listFilters.set(key, { status: v });
              setStatus(v);
            }}
            options={[['', 'Any status'], ...DECISION_STATUSES]}
          />
        </Field>
      </div>
      <PagedList args={args} emptyTitle="No decisions" emptyMsg="Record one here or promote a decision-proposal note." />
    </>
  );
}
