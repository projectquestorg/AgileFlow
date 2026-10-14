import { Link } from 'react-router-dom';
import { allPages, enc, send, tool } from '@/lib/api';
import { actorLabel } from '@/lib/constants';
import { useProject } from '@/lib/app-context';
import { useLoad } from '@/lib/hooks';
import { Chip, excerpt, Loaded, PageHeader, SafeMarkdown, StateBox, StatusBadge, TimeAgo, WorkLink } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Panel, PanelGrid, StatPanel } from '@/components/panel-grid';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Progress } from '@/components/ui/progress';

export function EpicProgress({ pid, epic }: { pid: string; epic: any }) {
  const p = epic.progress;
  const pct = p.total ? Math.round(((p.done + p.cancelled) / p.total) * 100) : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <WorkLink pid={pid} id={epic.id}>
          <span className="font-mono text-xs text-muted-foreground">{epic.id}</span> {epic.title}
        </WorkLink>
        <StatusBadge status={epic.status} />
      </div>
      <Progress value={pct} aria-label={`${epic.title} progress`} />
      <span className="text-xs text-muted-foreground">
        {p.done} done, {p.cancelled} cancelled, {p.open} open of {p.total}
      </span>
    </div>
  );
}

export function Overview() {
  const { pid, project, isAdmin } = useProject();
  const state = useLoad(async () => {
    const [boardR, product, runs, changes] = await Promise.all([
      tool(pid, 'agileflow_board_get', { limit: 1 }),
      tool(pid, 'agileflow_document_get', { document: 'product' }),
      tool(pid, 'agileflow_run_list', { limit: 5 }),
      send('GET', `/api/projects/${enc(pid)}/changes`).catch(() => ({ latestSeq: 0 })),
    ]);
    const latestSeq = changes.latestSeq ?? 0;
    const [recent, notes, waiting] = await Promise.all([
      tool(pid, 'agileflow_activity_list', { sinceSeq: Math.max(0, latestSeq - 8), limit: 8 }),
      allPages(pid, 'agileflow_note_list', {}, 5).catch(() => ({ items: [] as any[] })),
      tool(pid, 'agileflow_work_list', { type: 'story', readiness: 'waiting', limit: 1 }).catch(() => null),
    ]);
    return { board: boardR.data, product: product.data, runs: runs.data, latestSeq, events: recent.data.items.slice().reverse(), notes: notes.items, waiting: waiting?.data };
  }, [pid]);

  return (
    <Loaded state={state}>
      {(d) => {
        const cols = d.board.columns;
        const epics = d.board.epics as any[];
        const totalStories = Object.values(cols).reduce((a: number, c: any) => a + c.total, 0);
        const last = d.events[0];
        const base = `/p/${enc(pid)}`;
        return (
          <>
            <PageHeader
              title={project.name}
              description={
                <>
                  Last activity: {last ? <TimeAgo iso={last.at} /> : 'none yet'} - activity #{d.latestSeq}
                </>
              }
              actions={
                <>
                  {project.archived ? <Chip tone="dashed">archived</Chip> : null}
                  {project.clientWritesPaused ? <Chip tone="warn">connected-client changes paused</Chip> : null}
                  <Chip>role: {project.role}</Chip>
                </>
              }
            />
            {!totalStories && !epics.length ? (
              <div className="mb-6">
                <StateBox title="This project is empty" message="Describe the product, add an epic, or import existing Work files.">
                  <Button variant="outline" render={<Link to={`${base}/docs/product`} />} nativeButton={false}>Edit product</Button>
                  <Button variant="outline" render={<Link to={`${base}/work`} />} nativeButton={false}>Create work</Button>
                  {isAdmin ? <Button variant="outline" render={<Link to={`${base}/import`} />} nativeButton={false}>Import</Button> : null}
                </StateBox>
              </div>
            ) : null}
            <PanelGrid className={d.waiting ? "sm:grid-cols-2 lg:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-4"}>
              <StatPanel label="Ready" value={cols.ready?.total ?? 0} to={`${base}/board`} />
              <StatPanel label="In progress" value={(cols['in-progress']?.total ?? 0) + (cols['in-review']?.total ?? 0)} to={`${base}/board`} />
              <StatPanel label="Blocked" value={cols.blocked?.total ?? 0} to={`${base}/board`} />
              <StatPanel label="Done" value={cols.done?.total ?? 0} hint={totalStories ? `${Math.round(((cols.done?.total ?? 0) / totalStories) * 100)}% of ${totalStories}` : undefined} to={`${base}/board`} />
              {d.waiting ? <StatPanel label="Waiting on dependencies" value={d.waiting.items.length ? (d.waiting.hasMore ? '1+' : '1') : 0} to={`${base}/work`} /> : null}
              <Panel
                className="sm:col-span-2 lg:col-span-full"
                title="Stories by status"
                description={`${totalStories} ${totalStories === 1 ? 'story' : 'stories'} across ${epics.length} ${epics.length === 1 ? 'epic' : 'epics'}`}
                action={<Button size="sm" variant="ghost" render={<Link to={`${base}/board`} />} nativeButton={false}>Board</Button>}
              >
                <StatusChart columns={cols} />
              </Panel>
            </PanelGrid>
            <PanelGrid className="mt-6 lg:grid-cols-2">
              <Panel title="Product" contentClassName="max-h-72 overflow-hidden [mask-image:linear-gradient(to_bottom,black_75%,transparent)]" action={<Button size="sm" variant="ghost" render={<Link to={`${base}/docs/product`} />} nativeButton={false}>Open</Button>}>
                {d.product.content.body.trim() ? <SafeMarkdown>{excerpt(d.product.content.body)}</SafeMarkdown> : <p className="text-sm text-muted-foreground">No product description yet.</p>}
              </Panel>
              <Panel title="Epic progress" contentClassName="flex flex-col gap-4">
                {epics.length ? epics.map((e) => <EpicProgress key={e.id} pid={pid} epic={e} />) : <p className="text-sm text-muted-foreground">No epics yet.</p>}
              </Panel>
              <Panel title="Reported runs" action={<Button size="sm" variant="ghost" render={<Link to={`${base}/agents`} />} nativeButton={false}>All runs</Button>}>
                {d.runs.items.length ? (
                  <ul className="flex flex-col gap-2 text-sm">
                    {d.runs.items.map((r: any) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{r.name}</span>
                        <StatusBadge status={r.state} />
                        {r.stale ? <Chip tone="warn">stale report</Chip> : null}
                        <span className="text-muted-foreground">
                          last report <TimeAgo iso={r.lastReportAt} />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No agent has reported a run in this project. Connected agents appear here when they start work.</p>
                )}
              </Panel>
              <Panel title="Recent notes" action={<Button size="sm" variant="ghost" render={<Link to={`${base}/notes`} />} nativeButton={false}>All notes</Button>}>
                {d.notes.length ? (
                  <ul className="flex flex-col gap-3 text-sm">
                    {d.notes.slice(-5).reverse().map((n: any) => (
                      <li key={n.id} className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Chip>{n.kind}</Chip>
                          <span className="truncate">{n.body.slice(0, 140)}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {actorLabel(n.author)} - <TimeAgo iso={n.createdAt} />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No notes yet.</p>
                )}
              </Panel>
              <Panel className="lg:col-span-2" title="Latest activity">
                {d.events.length ? (
                  <ul className="flex flex-col divide-y text-sm">
                    {d.events.map((e: any) => (
                      <li key={e.seq} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
                        <span className="min-w-0 truncate">{e.summary}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {actorLabel(e.actor)} - <TimeAgo iso={e.at} />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No activity.</p>
                )}
              </Panel>
            </PanelGrid>
          </>
        );
      }}
    </Loaded>
  );
}

const STATUS_ORDER: Array<[string, string]> = [
  ['backlog', 'Backlog'],
  ['ready', 'Ready'],
  ['in-progress', 'In progress'],
  ['in-review', 'In review'],
  ['blocked', 'Blocked'],
  ['done', 'Done'],
];
const statusChartConfig = { stories: { label: 'Stories', color: 'var(--chart-1)' } } satisfies ChartConfig;

/** Story counts per board column. */
function StatusChart({ columns }: { columns: Record<string, { total: number }> }) {
  const rows = STATUS_ORDER.filter(([key]) => key in columns).map(([key, label]) => ({ status: label, stories: columns[key]?.total ?? 0 }));
  return (
    <ChartContainer config={statusChartConfig} className="aspect-auto h-56 w-full">
      <BarChart data={rows} margin={{ left: 0, right: 0, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="status" tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="stories" fill="var(--color-stories)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
