import { Link } from 'react-router-dom';
import { allPages, enc, send, tool } from '@/lib/api';
import { actorLabel } from '@/lib/constants';
import { useProject } from '@/lib/app-context';
import { useLoad } from '@/lib/hooks';
import { Chip, excerpt, Loaded, PageHeader, SafeMarkdown, StateBox, StatusBadge, TimeAgo, WorkLink } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
        const stat = (label: string, n: number | string, to: string) => (
          <Link to={to} className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Card size="sm" className="h-full transition-colors hover:bg-muted/40">
              <CardHeader>
                <CardDescription>{label}</CardDescription>
                <CardTitle className="text-3xl font-semibold tabular-nums">{n}</CardTitle>
              </CardHeader>
            </Card>
          </Link>
        );
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
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              {stat('Ready', cols.ready?.total ?? 0, `${base}/board`)}
              {stat('In progress', (cols['in-progress']?.total ?? 0) + (cols['in-review']?.total ?? 0), `${base}/board`)}
              {stat('Blocked', cols.blocked?.total ?? 0, `${base}/board`)}
              {stat('Done', cols.done?.total ?? 0, `${base}/board`)}
              {d.waiting ? stat('Waiting on dependencies', d.waiting.items.length ? (d.waiting.hasMore ? '1+' : '1') : 0, `${base}/work`) : null}
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Product</CardTitle>
                  <CardAction>
                    <Button size="sm" variant="ghost" render={<Link to={`${base}/docs/product`} />} nativeButton={false}>Open</Button>
                  </CardAction>
                </CardHeader>
                <CardContent>{d.product.content.body.trim() ? <SafeMarkdown>{excerpt(d.product.content.body)}</SafeMarkdown> : <p className="text-sm text-muted-foreground">No product description yet.</p>}</CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Epic progress</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {epics.length ? epics.map((e) => <EpicProgress key={e.id} pid={pid} epic={e} />) : <p className="text-sm text-muted-foreground">No epics yet.</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Reported runs</CardTitle>
                  <CardAction>
                    <Button size="sm" variant="ghost" render={<Link to={`${base}/agents`} />} nativeButton={false}>All runs</Button>
                  </CardAction>
                </CardHeader>
                <CardContent>
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
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Recent notes</CardTitle>
                  <CardAction>
                    <Button size="sm" variant="ghost" render={<Link to={`${base}/notes`} />} nativeButton={false}>All notes</Button>
                  </CardAction>
                </CardHeader>
                <CardContent>
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
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Latest activity</CardTitle>
                </CardHeader>
                <CardContent>
                  {d.events.length ? (
                    <ul className="flex flex-col gap-2 text-sm">
                      {d.events.map((e: any) => (
                        <li key={e.seq} className="flex flex-col">
                          <span>{e.summary}</span>
                          <span className="text-xs text-muted-foreground">
                            {actorLabel(e.actor)} - <TimeAgo iso={e.at} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No activity.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        );
      }}
    </Loaded>
  );
}
