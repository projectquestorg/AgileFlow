// Agent activity: reported runs, work claims, access connections.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { enc, get, send, tool } from '@/lib/api';
import { safeHref } from '@/lib/constants';
import { useProject } from '@/lib/app-context';
import { useAction, useLoad } from '@/lib/hooks';
import { ActionStatus, Chip, LoadMoreButton, Loaded, Notice, PageHeader, Section, StateBox, StatusBadge, TimeAgo, WorkLink } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function AgentsView() {
  const { pid, isAdmin } = useProject();
  const state = useLoad(async () => {
    const [conns, runs, claims] = await Promise.all([
      get('/api/connections').catch((err) => ({ error: err as Error })),
      tool(pid, 'agileflow_run_list', { limit: 25 }),
      get(`/api/projects/${enc(pid)}/claims`).catch(() => ({ items: [] })),
    ]);
    return { conns, runs: runs.data, claims: (claims.items || []) as any[] };
  }, [pid]);

  return (
    <>
      <PageHeader title="Agent activity" description="What connected agents reported. A reported state is what the agent said, not proof that code is running." />
      <Loaded state={state}>
        {(d) => {
          const active = d.claims.filter((c) => c.active);
          const runCount = new Map<string, number>();
          for (const r of d.runs.items) runCount.set(r.connectionId, (runCount.get(r.connectionId) ?? 0) + 1);
          return (
            <>
              <Section title="Reported runs" className="mt-0">
                {d.runs.items.length ? <RunList first={d.runs} /> : <StateBox title="No reported runs" message="Connected agents appear here when they start a run. A connection can be authorized and idle." />}
              </Section>
              <Section title="Work claims">
                {active.length ? (
                  <div className="rounded-xl border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {['Story', 'Run', 'Connection', 'Generation', 'Expires'].map((t) => (
                            <TableHead key={t}>{t}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {active.map((c) => (
                          <TableRow key={`${c.storyId}:${c.generation}`}>
                            <TableCell>
                              <WorkLink pid={pid} id={c.storyId} />
                            </TableCell>
                            <TableCell className="font-mono text-xs">{c.runId}</TableCell>
                            <TableCell className="font-mono text-xs">{c.connectionId}</TableCell>
                            <TableCell>{c.generation}</TableCell>
                            <TableCell>
                              <TimeAgo iso={c.expiresAt} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No active claims.</p>
                )}
              </Section>
              <Section title="Access connections">
                {'error' in d.conns ? (
                  <Notice role="alert" title="Could not load connections">
                    {d.conns.error.message}
                  </Notice>
                ) : !d.conns.length ? (
                  <StateBox title="No connections" message="Nobody has connected an agent or CLI yet.">
                    <Button variant="outline" render={<Link to={`/p/${enc(pid)}/connect`} />} nativeButton={false}>
                      Connect an agent
                    </Button>
                  </StateBox>
                ) : (
                  <>
                    <div className="rounded-xl border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {['Client', 'User', 'Resource', 'State', 'Last request', 'Recent runs here'].map((t) => (
                              <TableHead key={t}>{t}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(d.conns as any[]).map((c) => (
                            <TableRow key={c.id}>
                              <TableCell className="font-mono text-xs">{c.clientId}</TableCell>
                              <TableCell>{c.userName ?? c.userId}</TableCell>
                              <TableCell>{c.resource}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {c.disabled ? <Chip tone="dashed">disabled</Chip> : <Chip tone="solid">enabled</Chip>}
                                  {c.allowedProjects ? <Chip>restricted to {c.allowedProjects.length}</Chip> : null}
                                </div>
                              </TableCell>
                              <TableCell>
                                <TimeAgo iso={c.lastRequestAt} />
                              </TableCell>
                              <TableCell>{runCount.get(c.id) ? runCount.get(c.id) : <span className="text-muted-foreground">{c.disabled ? 'revoked' : 'connected, idle'}</span>}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {isAdmin ? (
                        <>
                          Disable or restrict connections in{' '}
                          <Link className="underline underline-offset-4" to={`/p/${enc(pid)}/admin`}>
                            Administration
                          </Link>
                          .
                        </>
                      ) : (
                        'You can disable your own connections on the Connect page; administrators manage all of them.'
                      )}
                    </p>
                  </>
                )}
              </Section>
            </>
          );
        }}
      </Loaded>
    </>
  );
}

function RunList({ first }: { first: any }) {
  const { pid } = useProject();
  const [items, setItems] = useState<any[]>(first.items);
  const [cursor, setCursor] = useState<string | null>(first.nextCursor);
  return (
    <div className="flex flex-col gap-3">
      {items.map((r) => (
        <RunCard key={r.id} run={r} />
      ))}
      {first.hasMore ? (
        <LoadMoreButton
          more={async () => {
            const p = (await tool(pid, 'agileflow_run_list', { cursor, limit: 50 })).data;
            setItems((x) => [...x, ...p.items]);
            setCursor(p.nextCursor);
            return p.hasMore;
          }}
        />
      ) : null}
    </div>
  );
}

function RunCard({ run: initial }: { run: any }) {
  const { pid, canWrite } = useProject();
  const [r, setR] = useState(initial);
  const a = useAction();
  const terminal = !!r.endedAt;
  const cancel = async () => {
    try {
      const run2 = await a.run((requestId) => send('POST', `/api/projects/${enc(pid)}/runs/${enc(r.id)}/cancel`, { requestId }), { success: 'Cancellation requested. This asks the agent to stop; it is not proof that it stopped.' });
      setR({ ...r, ...run2 });
    } catch {
      /* shown */
    }
  };
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{r.name}</CardTitle>
        <CardDescription>{r.intent}</CardDescription>
        <CardAction className="flex gap-1">
          <StatusBadge status={r.state} />
          {r.stale ? <Chip tone="warn">stale report</Chip> : null}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {r.workIds?.length ? (
          <div>
            Work:{' '}
            {r.workIds.map((w: string, i: number) => (
              <span key={w}>
                {i ? ', ' : ''}
                <WorkLink pid={pid} id={w} />
              </span>
            ))}
          </div>
        ) : null}
        {r.summary ? (
          <div>
            <span className="font-medium">Summary: </span>
            {r.summary}
          </div>
        ) : null}
        {r.blocker ? (
          <div>
            <span className="font-medium">Blocker: </span>
            {r.blocker}
          </div>
        ) : null}
        {r.evidence?.length ? (
          <ul className="flex flex-col gap-1">
            {r.evidence.map((e: any, i: number) => {
              const href = safeHref(e.url);
              return (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <Chip>{e.kind}</Chip>
                  {href ? (
                    <a className="underline underline-offset-4" href={href} target="_blank" rel="noopener noreferrer">
                      {e.summary || e.url}
                    </a>
                  ) : (
                    <span>{e.summary || ''}</span>
                  )}
                  <span className="text-xs text-muted-foreground">({e.provenance ?? 'reported'})</span>
                </li>
              );
            })}
          </ul>
        ) : null}
        <div className="text-xs text-muted-foreground">
          Started <TimeAgo iso={r.startedAt} /> - last report <TimeAgo iso={r.lastReportAt} />
          {r.endedAt ? (
            <>
              {' '}
              - ended <TimeAgo iso={r.endedAt} />
            </>
          ) : null}{' '}
          - connection <span className="font-mono">{r.connectionId}</span>
        </div>
        {r.stale ? <div className="text-xs text-muted-foreground">No report for over 90 seconds. The agent may be busy, offline, or finished without reporting.</div> : null}
        {r.cancellation ? (
          <Notice title="Cancellation">
            {r.cancellation.acknowledgedAt ? (
              <>
                Requested <TimeAgo iso={r.cancellation.requestedAt} />, acknowledged by the agent <TimeAgo iso={r.cancellation.acknowledgedAt} />.
              </>
            ) : (
              <>
                Requested <TimeAgo iso={r.cancellation.requestedAt} />; not acknowledged yet. The agent sees it at its next report. AgileFlow cannot stop a process it does not own.
              </>
            )}
          </Notice>
        ) : null}
        <ActionStatus action={a} onRetried={(run2) => setR({ ...r, ...run2 })} />
      </CardContent>
      {!r.cancellation && !terminal && canWrite ? (
        <CardFooter>
          <Button size="sm" variant="outline" disabled={a.pending} onClick={cancel}>
            Request cancellation
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
