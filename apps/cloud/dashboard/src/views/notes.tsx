// Notes and the project activity history.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { enc, send, tool } from '@/lib/api';
import { actorLabel } from '@/lib/constants';
import { useProject } from '@/lib/app-context';
import { useLoad } from '@/lib/hooks';
import { LoadMoreButton, Loaded, PageHeader, Section, SimpleSelect, StateBox, TimeAgo } from '@/components/common';
import { AddNoteForm, NoteRow } from '@/components/notes';
import { Field, FieldLabel } from '@/components/ui/field';

const noteFilters = new Map<string, string>();
const WORK_TYPES = new Set(['story', 'epic', 'decision']);
const WINDOW = 50;

export function NotesView() {
  const { pid, canWrite } = useProject();
  const [kind, setKind] = useState(() => noteFilters.get(pid) ?? '');
  const state = useLoad(async () => {
    const [first, changes] = await Promise.all([tool(pid, 'agileflow_note_list', { ...(kind ? { kind } : {}), limit: 50 }), send('GET', `/api/projects/${enc(pid)}/changes`)]);
    return { first: first.data, latestSeq: changes.latestSeq as number };
  }, [pid, kind]);

  return (
    <>
      <PageHeader title="Notes and history" description="Notes from people and agents, oldest first, and every attributable project event." />
      <Section title="Notes" className="mt-0">
        <div className="flex items-end gap-3">
          <Field className="w-52">
            <FieldLabel htmlFor="nf-kind">Kind</FieldLabel>
            <SimpleSelect
              id="nf-kind"
              value={kind}
              onChange={(v) => {
                noteFilters.set(pid, v);
                setKind(v);
              }}
              options={[['', 'All kinds'], 'comment', 'progress', 'blocker', 'handoff', 'decision-proposal', 'correction']}
            />
          </Field>
        </div>
        <Loaded state={state}>{(d) => <NotesPaged key={`${kind}:${d.first.items.length}:${d.latestSeq}`} first={d.first} kind={kind} />}</Loaded>
        {canWrite ? (
          <div className="mt-4 flex flex-col gap-2">
            <h3 className="font-medium">Add a project note</h3>
            <AddNoteForm />
          </div>
        ) : null}
      </Section>
      <Section title="Activity history">
        <Loaded state={state}>{(d) => <ActivityFeed key={d.latestSeq} latestSeq={d.latestSeq} />}</Loaded>
      </Section>
    </>
  );
}

function NotesPaged({ first, kind }: { first: any; kind: string }) {
  const { pid } = useProject();
  const [items, setItems] = useState<any[]>(first.items);
  const [cursor, setCursor] = useState<string | null>(first.nextCursor);
  if (!items.length) return <StateBox title="No notes" message={kind ? 'No notes of this kind.' : 'Notes from people and agents appear here, oldest first.'} />;
  return (
    <div className="flex flex-col gap-2">
      {items.map((n) => (
        <NoteRow key={`${n.id}:${n.version}`} note={n} />
      ))}
      {first.hasMore ? (
        <LoadMoreButton
          label="Load newer notes"
          more={async () => {
            const p = (await tool(pid, 'agileflow_note_list', { ...(kind ? { kind } : {}), cursor, limit: 50 })).data;
            setItems((x) => [...x, ...p.items]);
            setCursor(p.nextCursor);
            return p.hasMore;
          }}
        />
      ) : null}
    </div>
  );
}

/** Activity feed, newest window first; "Load earlier" pages backwards by sequence. */
function ActivityFeed({ latestSeq }: { latestSeq: number }) {
  const { pid } = useProject();
  const [events, setEvents] = useState<any[]>([]);
  const [start, setStart] = useState(latestSeq);
  const state = useLoad(async () => {
    const from = Math.max(0, latestSeq - WINDOW);
    const r = (await tool(pid, 'agileflow_activity_list', { sinceSeq: from, limit: Math.max(1, latestSeq - from) })).data;
    return { items: r.items.filter((e: any) => e.seq <= latestSeq).reverse(), from };
  }, [pid, latestSeq]);
  if (latestSeq <= 0) return <StateBox title="No activity" message="Nothing has happened in this project yet." />;
  return (
    <Loaded state={state}>
      {(first) => {
        const all = [...first.items, ...events];
        const cur = events.length ? start : first.from;
        return (
          <div className="flex flex-col gap-3">
            <ol className="flex flex-col gap-2 text-sm">
              {all.map((e: any) => (
                <li key={e.seq} className="flex gap-3">
                  <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">#{e.seq}</span>
                  <div className="flex flex-col">
                    <span>{e.summary}</span>
                    <span className="text-xs text-muted-foreground">
                      {actorLabel(e.actor)} - {e.operation} - <TimeAgo iso={e.at} />
                      {e.objectId ? (
                        <>
                          {' - '}
                          {WORK_TYPES.has(e.objectType) ? (
                            <Link className="underline-offset-4 hover:underline" to={`/p/${enc(pid)}/work/${enc(e.objectId)}`}>
                              {e.objectId}
                            </Link>
                          ) : (
                            e.objectId
                          )}
                        </>
                      ) : null}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
            {cur > 0 ? (
              <LoadMoreButton
                label="Load earlier activity"
                more={async () => {
                  const to = cur;
                  const from = Math.max(0, to - WINDOW);
                  const r = (await tool(pid, 'agileflow_activity_list', { sinceSeq: from, limit: Math.max(1, to - from) })).data;
                  setEvents((x) => [...x, ...r.items.filter((e: any) => e.seq <= to).reverse()]);
                  setStart(from);
                  return from > 0;
                }}
              />
            ) : null}
          </div>
        );
      }}
    </Loaded>
  );
}
