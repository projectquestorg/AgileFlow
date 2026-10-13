// Import Work files: folder picker -> preview -> conflict resolution -> commit.
// CLI-prepared previews open at #/p/:pid/import/:jobId and commit from the stored upload.
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FolderUpIcon } from 'lucide-react';
import { toast } from 'sonner';
import { enc, get, newRequestId, send } from '@/lib/api';
import { useApp, useProject } from '@/lib/app-context';
import { useAction, useLoad } from '@/lib/hooks';
import { ActionStatus, Chip, Loaded, Notice, PageHeader, Section, SimpleSelect, StateBox, TimeAgo } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const TOP = ['README.md', '00-product', '01-roadmap', '02-epics', '03-stories', '04-decisions'];
const MAX_FILE = 1024 * 1024;

/** Map picked files to Work-layout relative paths (the part starting at a known top-level entry). */
async function collect(list: FileList): Promise<{ files: Record<string, string>; skipped: string[] }> {
  const files: Record<string, string> = {};
  const skipped: string[] = [];
  for (const f of Array.from(list)) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const parts = rel.split('/');
    const i = parts.findIndex((p, idx) => TOP.includes(p) && (p !== 'README.md' || idx === parts.length - 1));
    if (i < 0 || !rel.endsWith('.md')) {
      skipped.push(rel);
      continue;
    }
    if (f.size > MAX_FILE) {
      skipped.push(`${rel} (over 1 MiB)`);
      continue;
    }
    files[parts.slice(i).join('/')] = await f.text();
  }
  return { files, skipped };
}

export function ImportView() {
  const { jobId } = useParams();
  const { isAdmin, canWrite } = useProject();
  if (!canWrite) return <StateBox title="Permission denied" message="Importing needs the editor role; committing an import needs an administrator." />;
  return jobId ? <ReviewJob key={jobId} jobId={jobId} /> : <Upload isAdmin={isAdmin} />;
}

function Upload({ isAdmin }: { isAdmin: boolean }) {
  const { pid } = useProject();
  const navigate = useNavigate();
  const [picked, setPicked] = useState<{ files: Record<string, string>; skipped: string[] } | null>(null);
  const [reading, setReading] = useState(false);
  const [opKey] = useState(() => newRequestId());
  const a = useAction();
  const count = picked ? Object.keys(picked.files).length : 0;

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setReading(true);
    try {
      setPicked(await collect(e.target.files));
    } finally {
      setReading(false);
    }
  };
  const preview = async () => {
    if (!picked) return;
    try {
      const r = await a.run(() => send('POST', `/api/projects/${enc(pid)}/import/preview`, { files: picked.files, operationKey: opKey }));
      navigate(`/p/${enc(pid)}/import/${enc(r.jobId)}`);
    } catch {
      /* shown */
    }
  };

  return (
    <>
      <PageHeader title="Import Work files" description="Upload an existing docs/agile folder. Nothing changes until an administrator reviews the preview and commits it." />
      <Card>
        <CardHeader>
          <CardTitle>Choose files</CardTitle>
          <CardDescription>Select the Work folder (docs/agile). Only Markdown files under README.md, 00-product, 01-roadmap, 02-epics, 03-stories and 04-decisions are uploaded; each must be under 1 MiB.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="imp-folder">Work folder</FieldLabel>
            <Input id="imp-folder" type="file" multiple onChange={onPick} {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} />
            <FieldDescription>Your browser asks to confirm uploading the folder. Files stay in your browser until you request a preview.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="imp-files">Or individual files</FieldLabel>
            <Input id="imp-files" type="file" multiple accept=".md,text/markdown" onChange={onPick} />
          </Field>
          {reading ? <p className="text-sm text-muted-foreground">Reading files...</p> : null}
          {picked ? (
            <div className="flex flex-col gap-2 text-sm">
              <p role="status">
                {count} Work file(s) selected{picked.skipped.length ? `, ${picked.skipped.length} skipped` : ''}.
              </p>
              {picked.skipped.length ? (
                <details>
                  <summary className="cursor-pointer text-muted-foreground">Skipped files</summary>
                  <ul className="mt-2 list-disc pl-5 font-mono text-xs text-muted-foreground">
                    {picked.skipped.slice(0, 100).map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}
          <ActionStatus action={a} onRetried={(r) => navigate(`/p/${enc(pid)}/import/${enc(r.jobId)}`)} />
        </CardContent>
        <CardFooter className="flex-wrap gap-2">
          <Button disabled={!count || a.pending} onClick={() => void preview()}>
            <FolderUpIcon data-icon="inline-start" />
            Preview import
          </Button>
          {!isAdmin ? <span className="text-sm text-muted-foreground">An administrator commits previews.</span> : null}
        </CardFooter>
      </Card>
      <p className="mt-4 text-sm text-muted-foreground">
        Using the CLI? <span className="font-mono">agileflow cloud import</span> prepares a preview and prints a review link that opens here.
      </p>
    </>
  );
}

function ReviewJob({ jobId }: { jobId: string }) {
  const { pid, isAdmin } = useProject();
  const state = useLoad(() => get(`/api/projects/${enc(pid)}/import/${enc(jobId)}`), [pid, jobId]);
  return (
    <>
      <PageHeader title="Review import" description={<span className="font-mono">{jobId}</span>} actions={<Button variant="outline" render={<Link to={`/p/${enc(pid)}/import`} />} nativeButton={false}>New import</Button>} />
      <Loaded state={state}>{(job: any) => <Preview job={job} isAdmin={isAdmin} onCommitted={state.reload} />}</Loaded>
    </>
  );
}

const ACTION_TONE: Record<string, 'strong' | 'solid' | 'warn' | 'dashed' | 'plain'> = { create: 'solid', update: 'plain', unchanged: 'dashed', conflict: 'warn', 'possible-removal': 'dashed' };

function Preview({ job, isAdmin, onCommitted }: { job: any; isAdmin: boolean; onCommitted: () => void }) {
  const { pid } = useProject();
  const { refresh } = useApp();
  const p = job.preview;
  const changes: any[] = p?.changes ?? [];
  const conflicts = changes.filter((c) => c.action === 'conflict');
  const removals = changes.filter((c) => c.action === 'possible-removal');
  const [resolutions, setResolutions] = useState<Record<string, '' | 'cloud' | 'incoming'>>({});
  const [archive, setArchive] = useState<Set<string>>(new Set());
  const [showUnchanged, setShowUnchanged] = useState(false);
  const a = useAction();
  const expired = job.expires_at && new Date(job.expires_at) < new Date();
  const unresolved = conflicts.filter((c) => !resolutions[c.id]);
  const visible = useMemo(() => (showUnchanged ? changes : changes.filter((c) => c.action !== 'unchanged')), [changes, showUnchanged]);
  const counts = changes.reduce<Record<string, number>>((m, c) => ({ ...m, [c.action]: (m[c.action] ?? 0) + 1 }), {});

  if (job.status === 'committed') {
    const r = job.result ?? {};
    return (
      <StateBox title="Import committed" message={`${r.created ?? 0} created, ${r.updated ?? 0} updated, ${r.archived ?? 0} archived, ${r.issues ?? 0} validation issue(s).`}>
        <Button render={<Link to={`/p/${enc(pid)}/board`} />} nativeButton={false}>Open board</Button>
        <Button variant="outline" render={<Link to={`/p/${enc(pid)}/work`} />} nativeButton={false}>Work list</Button>
      </StateBox>
    );
  }
  if (!p) return <StateBox title="No preview" message="This import job has no preview." />;

  const commit = async () => {
    const res = Object.fromEntries(Object.entries(resolutions).filter(([, v]) => v));
    try {
      const r = await a.run((requestId) => send('POST', `/api/projects/${enc(pid)}/import/${enc(job.id)}/commit`, { resolutions: res, archive: [...archive], requestId }));
      toast(`Imported: ${r.created} created, ${r.updated} updated.`);
      onCommitted();
      refresh();
    } catch {
      /* shown */
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Notice title="Source of truth">{p.authority}</Notice>
      {expired ? <Notice role="alert" title="Preview expired">This preview expired <TimeAgo iso={job.expires_at} />. Preview the import again.</Notice> : null}
      {p.blocked ? <Notice role="alert" title="Blocked">The preview has blocking problems (duplicate IDs, invalid references, or unreadable files). Fix them and preview again.</Notice> : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Epics', p.counts.epics],
          ['Stories', p.counts.stories],
          ['Decisions', p.counts.decisions],
          ['Documents', p.counts.documents],
        ].map(([l, n]) => (
          <Card key={l} size="sm">
            <CardHeader>
              <CardDescription>{l}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{n}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {Object.entries(counts)
          .map(([k, v]) => `${v} ${k}`)
          .join(', ') || 'No changes'}
        . Validation: {p.errors} error(s), {p.warnings} warning(s). Expires <TimeAgo iso={job.expires_at} />.
      </p>

      {p.issues?.length ? (
        <Section title="Validation issues" className="mt-2">
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Level</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Path</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.issues.slice(0, 200).map((i: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Chip tone={i.level === 'error' ? 'warn' : 'plain'}>{i.level}</Chip>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {i.message}
                      {i.detail?.length ? <div className="text-xs text-muted-foreground">{i.detail.join('; ')}</div> : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{i.path ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>
      ) : null}

      <Section
        title="Changes"
        className="mt-2"
        actions={
          <Field orientation="horizontal" className="w-auto">
            <Checkbox id="show-unchanged" checked={showUnchanged} onCheckedChange={(v) => setShowUnchanged(!!v)} />
            <FieldLabel htmlFor="show-unchanged">Show unchanged</FieldLabel>
          </Field>
        }
      >
        {visible.length ? (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((c) => (
                  <TableRow key={`${c.type}:${c.id}`} className="align-top">
                    <TableCell className="font-mono text-xs">{c.id}</TableCell>
                    <TableCell>{c.type}</TableCell>
                    <TableCell>
                      <Chip tone={ACTION_TONE[c.action] ?? 'plain'}>{c.action}</Chip>
                    </TableCell>
                    <TableCell className="whitespace-normal text-sm">
                      {c.title ?? ''}
                      {c.fields?.length ? <div className="text-xs text-muted-foreground">fields: {c.fields.join(', ')}</div> : null}
                    </TableCell>
                    <TableCell className="w-56">
                      {c.action === 'conflict' ? (
                        <SimpleSelect
                          size="sm"
                          ariaLabel={`Resolution for ${c.id}`}
                          value={resolutions[c.id] ?? ''}
                          onChange={(v) => setResolutions({ ...resolutions, [c.id]: v as '' | 'cloud' | 'incoming' })}
                          options={[['', 'Choose...'], ['cloud', 'Keep cloud record'], ['incoming', 'Take incoming file']]}
                        />
                      ) : c.action === 'possible-removal' ? (
                        <Field orientation="horizontal">
                          <Checkbox
                            id={`arch-${c.id}`}
                            checked={archive.has(c.id)}
                            onCheckedChange={(v) => {
                              const n = new Set(archive);
                              if (v) n.add(c.id);
                              else n.delete(c.id);
                              setArchive(n);
                            }}
                          />
                          <FieldLabel htmlFor={`arch-${c.id}`}>Archive (never deleted)</FieldLabel>
                        </Field>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Everything in the upload matches the project.</p>
        )}
        {removals.length ? <p className="text-sm text-muted-foreground">A missing file means no change; possible removals are only archived when you select them.</p> : null}
      </Section>

      {isAdmin ? (
        <div className="flex flex-col gap-3">
          {unresolved.length ? <p className="text-sm">Resolve {unresolved.length} conflict(s) before committing.</p> : null}
          <div>
            <Button disabled={a.pending || p.blocked || expired || unresolved.length > 0} onClick={() => void commit()}>
              Commit import
            </Button>
          </div>
          <ActionStatus action={a} onRetried={() => { onCommitted(); refresh(); }} />
        </div>
      ) : (
        <Notice title="Waiting for an administrator">Only administrators commit imports. Share this page's link with one.</Notice>
      )}
    </div>
  );
}
