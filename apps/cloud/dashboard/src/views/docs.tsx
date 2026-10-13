// Product and roadmap editors. The editor is enabled only after the complete document loads.
import { Link, useParams } from 'react-router-dom';
import { allPages, enc, fullContent, tool } from '@/lib/api';
import { HORIZONS } from '@/lib/constants';
import { useApp, useProject } from '@/lib/app-context';
import { useLoad } from '@/lib/hooks';
import { Chip, Loaded, PageHeader, Section, StateBox, StatusBadge, TimeAgo, WorkLink } from '@/components/common';
import { MarkdownEditor } from '@/components/markdown-editor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function DocView() {
  const { which = '' } = useParams();
  const { pid, canWrite, project } = useProject();
  const { refresh } = useApp();
  const valid = which === 'product' || which === 'roadmap';
  const load = () => fullContent((cursor) => tool(pid, 'agileflow_document_get', { document: which, ...(cursor ? { contentCursor: cursor } : {}) }));
  const state = useLoad(async () => {
    if (!valid) return null;
    const doc = await load();
    const epics = which === 'roadmap' ? (await allPages(pid, 'agileflow_work_list', { type: 'epic' }, 10)).items : [];
    return { doc, epics };
  }, [pid, which]);
  if (!valid) return <StateBox title="Page not found" message={`There is no document named ${which}.`} />;
  const label = which === 'product' ? 'product document' : 'roadmap';
  return (
    <Loaded state={state}>
      {(d) =>
        d && (
          <>
            <PageHeader
              title={which === 'product' ? 'Product' : 'Roadmap'}
              description={
                <>
                  {which === 'product' ? 'The product description, including the Definition of Done. Agents read this as task data.' : "The roadmap document. The epic horizon view below comes from each epic's horizon field."} Last saved{' '}
                  <TimeAgo iso={d.doc.updatedAt} />.
                </>
              }
            />
            <Card>
              <CardContent>
                <MarkdownEditor
                  label={label}
                  dirtyKey={`doc:${which}`}
                  doc={{ body: d.doc.content.body, version: d.doc.version, contentHash: d.doc.contentHash, complete: d.doc.content.complete }}
                  canEdit={canWrite && !project.archived}
                  reload={async () => {
                    const x = await load();
                    return { body: x.content.body, version: x.version, contentHash: x.contentHash, complete: true };
                  }}
                  save={(body, base, requestId) => tool(pid, 'agileflow_document_update', { document: which, body, expectedVersion: base.version, priorContentHash: base.contentHash, requestId })}
                  onSaved={() => setTimeout(refresh, 50)}
                />
              </CardContent>
            </Card>
            {which === 'roadmap' ? (
              <Section title="Epics by horizon">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {[...HORIZONS, null].map((hz) => {
                    const list = d.epics.filter((e: any) => (e.horizon ?? null) === hz);
                    return (
                      <Card key={hz ?? 'none'} size="sm">
                        <CardHeader>
                          <CardTitle>{hz ?? 'No horizon'}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {list.length ? (
                            <ul className="flex flex-col gap-2 text-sm">
                              {list.map((e: any) => (
                                <li key={e.id} className="flex flex-wrap items-center gap-2">
                                  <WorkLink pid={pid} id={e.id}>
                                    <span className="font-mono text-xs text-muted-foreground">{e.id}</span> {e.title}
                                  </WorkLink>
                                  <StatusBadge status={e.status} />
                                  {e.priority ? <Chip>{e.priority.toUpperCase()}</Chip> : null}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-muted-foreground">None.</p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </Section>
            ) : null}
            <p className="mt-6 text-sm text-muted-foreground">
              Revision history:{' '}
              <Link className="underline underline-offset-4" to={`/p/${enc(pid)}/notes`}>
                see Notes and history
              </Link>{' '}
              (document updates are recorded as activity).
            </p>
          </>
        )
      }
    </Loaded>
  );
}
