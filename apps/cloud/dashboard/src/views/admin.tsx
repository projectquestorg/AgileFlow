// Workspace and project administration: project settings, members and grants,
// connections, workspace policy, export, archive and deletion.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DownloadIcon, KeyRoundIcon } from 'lucide-react';
import { toast } from 'sonner';
import { enc, get, send } from '@/lib/api';
import { downloadJson } from '@/lib/constants';
import { useApp, useProject, type Project } from '@/lib/app-context';
import { useAction, useLoad } from '@/lib/hooks';
import { ActionStatus, Chip, Loaded, PageHeader, Section, SimpleSelect, StateBox, TimeAgo } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function AdminView() {
  const { isAdmin, project } = useProject();
  if (!isAdmin) return <StateBox title="Administrators only" message="Workspace administration is available to organization administrators." />;
  return (
    <>
      <PageHeader title="Administration" description={`Project ${project.name} and workspace settings.`} />
      <div className="flex flex-col gap-4">
        <ProjectSettings />
        <WorkspacePolicy />
      </div>
      <Section title="Members and project grants">
        <Members />
      </Section>
      <Section title="Connections">
        <Connections />
      </Section>
      <Section title="Export">
        <ExportCard />
      </Section>
      <Section title="Archive and deletion">
        <ArchiveDelete />
      </Section>
    </>
  );
}

// ------------------------------------------------------------- project

function ProjectSettings() {
  const { pid, project } = useProject();
  const { reloadMe } = useApp();
  const [name, setName] = useState(project.name);
  const a = useAction();
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await a.run((requestId) => send('PATCH', `/api/projects/${enc(pid)}`, { name: name.trim(), requestId }), { success: 'Project renamed.' });
      await reloadMe();
    } catch {
      /* shown */
    }
  };
  return (
    <Card>
      <form onSubmit={save} className="contents">
        <CardHeader>
          <CardTitle>Project</CardTitle>
          <CardDescription>
            ID <span className="font-mono">{project.id}</span> - slug <span className="font-mono">{project.slug}</span> - created <TimeAgo iso={project.createdAt} />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Field className="max-w-md">
            <FieldLabel htmlFor="pj-name">Project name</FieldLabel>
            <Input id="pj-name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <ActionStatus action={a} onRetried={() => void reloadMe()} />
        </CardContent>
        <CardFooter>
          <Button type="submit" variant="outline" disabled={a.pending || !name.trim() || name.trim() === project.name}>
            Rename
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function WorkspacePolicy() {
  const { me, reloadMe } = useApp();
  const policy = me.workspace?.policy ?? {};
  const [p, setP] = useState({ requireStartApproval: !!policy.requireStartApproval, allowLifecycleOverride: !!policy.allowLifecycleOverride });
  const a = useAction();
  const set = async (patch: Partial<typeof p>) => {
    const prev = p;
    setP({ ...p, ...patch });
    try {
      await a.run(() => send('PUT', '/api/workspace/policy', patch), { success: 'Workspace policy updated.' });
      await reloadMe();
    } catch {
      setP(prev);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace policy</CardTitle>
        <CardDescription>Applies to every project in {me.workspace?.name}.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field orientation="horizontal">
          <Switch id="pol-start" checked={p.requireStartApproval} disabled={a.pending} onCheckedChange={(c) => void set({ requireStartApproval: !!c })} />
          <FieldContent>
            <FieldLabel htmlFor="pol-start">Require approval before agents start runs</FieldLabel>
            <FieldDescription>Agents request an execution-start approval that a person decides in Approvals.</FieldDescription>
          </FieldContent>
        </Field>
        <Field orientation="horizontal">
          <Switch id="pol-override" checked={p.allowLifecycleOverride} disabled={a.pending} onCheckedChange={(c) => void set({ allowLifecycleOverride: !!c })} />
          <FieldContent>
            <FieldLabel htmlFor="pol-override">Allow lifecycle overrides</FieldLabel>
            <FieldDescription>Lets administrators (and approved agent requests) move work past lifecycle blockers with a recorded reason.</FieldDescription>
          </FieldContent>
        </Field>
        <div aria-live="polite">
          <ActionStatus action={a} />
        </div>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------- members

function Members() {
  const { pid } = useProject();
  const state = useLoad(() => get(`/api/projects/${enc(pid)}/members`), [pid]);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('viewer');
  const a = useAction();
  const grant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await a.run((requestId) => send('PUT', `/api/projects/${enc(pid)}/grants/${enc(userId.trim())}`, { role, requestId }), { success: `Granted ${role} to ${userId.trim()}.` });
      setUserId('');
      state.reload();
    } catch {
      /* shown */
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <Loaded state={state}>
        {(m: any) =>
          m.items.length ? (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Organization role</TableHead>
                    <TableHead>Project access</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {m.items.map((u: any) => (
                    <MemberRow key={u.userId} u={u} onDone={state.reload} />
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <StateBox title="No members" message="Invite people through your organization first; they appear here once they join." />
          )
        }
      </Loaded>
      <form onSubmit={grant} className="flex flex-wrap items-end gap-3">
        <Field className="w-56">
          <FieldLabel htmlFor="gr-user">Grant access by user ID</FieldLabel>
          <Input id="gr-user" required value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="user_..." />
        </Field>
        <Field className="w-36">
          <FieldLabel htmlFor="gr-role">Role</FieldLabel>
          <SimpleSelect id="gr-role" value={role} onChange={setRole} options={['viewer', 'editor']} />
        </Field>
        <Button type="submit" variant="outline" disabled={a.pending || !userId.trim()}>
          Grant
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">The user must already be a member of this organization; an email address alone is never enough.</p>
      <ActionStatus action={a} onRetried={state.reload} />
    </div>
  );
}

function MemberRow({ u, onDone }: { u: any; onDone: () => void }) {
  const { pid } = useProject();
  const a = useAction();
  const orgAdmin = u.orgRole === 'admin';
  const change = async (v: string) => {
    try {
      await a.run((requestId) => send('PUT', `/api/projects/${enc(pid)}/grants/${enc(u.userId)}`, { role: v || null, requestId }), { success: v ? `Now ${v}.` : 'Access revoked.' });
      onDone();
    } catch {
      /* shown */
    }
  };
  return (
    <TableRow className="align-top">
      <TableCell>
        <div className="font-medium">{u.name ?? u.userId}</div>
        <div className="font-mono text-xs text-muted-foreground">
          {u.userId}
          {u.email ? ` - ${u.email}` : ''}
        </div>
      </TableCell>
      <TableCell>
        <Chip tone={orgAdmin ? 'strong' : 'plain'}>{u.orgRole}</Chip>
      </TableCell>
      <TableCell className="w-64">
        {orgAdmin ? (
          <span className="text-sm text-muted-foreground">admin (organization administrators see every project)</span>
        ) : (
          <div className="flex flex-col gap-2">
            <SimpleSelect ariaLabel={`Project access for ${u.userId}`} size="sm" disabled={a.pending} value={u.projectRole ?? ''} onChange={(v) => void change(v)} options={[['', 'No access'], 'viewer', 'editor']} />
            <ActionStatus action={a} onRetried={onDone} />
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------- connections

export function Connections({ ownOnly = false, focus }: { ownOnly?: boolean; focus?: { id: string; grant?: string } }) {
  const { me } = useApp();
  const state = useLoad(() => get('/api/connections'), []);
  return (
    <Loaded state={state}>
      {(all: any[]) => {
        const rows = ownOnly ? all.filter((c) => c.userId === me.user.id) : all;
        return rows.length ? (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  {['Client', 'User', 'Resource', 'Scopes', 'Capabilities', 'Last request', 'Project access', 'Enabled'].map((t) => (
                    <TableHead key={t}>{t}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <ConnectionRow key={c.id} c={c} projects={me.projects} me={me.user.id} focus={focus?.id === c.id ? focus : undefined} onDone={state.reload} />
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <StateBox title="No connections" message="Nobody has connected an agent or CLI yet. Connections appear after the first authorized request." />
        );
      }}
    </Loaded>
  );
}

function ConnectionRow({ c, projects, me, focus, onDone }: { c: any; projects: Project[]; me: string; focus?: { id: string; grant?: string }; onDone: () => void }) {
  const a = useAction();
  const [disabled, setDisabled] = useState<boolean>(c.disabled);
  const toggle = async (enabled: boolean) => {
    setDisabled(!enabled);
    try {
      await a.run(() => send('PATCH', `/api/connections/${enc(c.id)}`, { disabled: !enabled }), {
        success: enabled ? 'Enabled.' : 'Disabled. Subsequent requests under this connection are rejected; data already downloaded cannot be retracted.',
      });
      onDone();
    } catch {
      setDisabled(!!c.disabled);
    }
  };
  return (
    <TableRow className="align-top">
      <TableCell className="font-mono text-xs">{c.clientId}</TableCell>
      <TableCell>{c.userName ?? c.userId}</TableCell>
      <TableCell>{c.resource}</TableCell>
      <TableCell className="max-w-56 whitespace-normal font-mono text-xs">{(c.lastScopes ?? []).join(' ') || <span className="text-muted-foreground">none</span>}</TableCell>
      <TableCell>
        <GrantsDialog c={c} own={c.userId === me} focus={focus} onDone={onDone} />
      </TableCell>
      <TableCell>
        <TimeAgo iso={c.lastRequestAt} />
      </TableCell>
      <TableCell>
        <RestrictDialog c={c} projects={projects} onDone={onDone} />
      </TableCell>
      <TableCell className="w-56 whitespace-normal">
        <div className="flex flex-col gap-2">
          <Switch aria-label={`Connection ${c.clientId} enabled`} checked={!disabled} disabled={a.pending} onCheckedChange={(v) => void toggle(!!v)} />
          <ActionStatus action={a} />
        </div>
      </TableCell>
    </TableRow>
  );
}

const CAPABILITY_LABEL: Record<string, string> = {
  'notes:write': 'Add notes',
  'work:write': 'Create and edit work',
  'runs:write': 'Report runs and claim stories',
  'controls:request': 'Request approvals',
  'local:apply': 'Apply local settings',
};

/**
 * Capabilities this connection may use (when the identity provider cannot issue AgileFlow scopes).
 * The connection's own user grants them; an administrator can only remove them. New connections are
 * read-only, and a grant never exceeds the user's project role.
 */
function GrantsDialog({ c, own, focus, onDone }: { c: any; own: boolean; focus?: { id: string; grant?: string }; onDone: () => void }) {
  const granted: string[] = (c.grants ?? []).map((g: any) => g.capability);
  const [open, setOpen] = useState(!!focus);
  const [sel, setSel] = useState<Set<string>>(new Set([...granted, ...(focus?.grant && own ? [focus.grant] : [])]));
  const a = useAction();
  if (c.capabilitySource !== 'grants') return <span className="text-muted-foreground text-xs">from sign-in scopes</span>;
  const save = async () => {
    try {
      await a.run(() => send('PUT', `/api/connections/${enc(c.id)}/grants`, { capabilities: [...sel] }));
      toast('Capabilities updated. They apply to the next request from this connection.');
      setOpen(false);
      onDone();
    } catch {
      /* shown */
    }
  };
  const status = granted.length ? granted.map((g) => CAPABILITY_LABEL[g] ?? g).join(', ') : 'Read only';
  // The owner manages (grant and revoke); an administrator can only revoke someone else's grants.
  const action = own ? 'Manage capabilities' : granted.length ? 'Revoke capabilities' : null;
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { a.reset(); setSel(new Set(granted)); } }}>
      <div className="flex flex-col items-start gap-1.5">
        <span className="text-sm">{status}</span>
        {action ? (
          <DialogTrigger render={<Button type="button" size="sm" variant="outline" aria-label={`${action} for ${c.clientId}`} />}>
            <KeyRoundIcon data-icon="inline-start" />
            {action}
          </DialogTrigger>
        ) : (
          <span className="text-muted-foreground text-xs">Only {c.userName ?? 'its owner'} can grant</span>
        )}
      </div>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{own ? 'Manage capabilities' : 'Revoke capabilities'}</DialogTitle>
          <DialogDescription>
            What <span className="font-mono">{c.clientId}</span> may do beyond reading, for {c.userName ?? c.userId}. Never more than that person's project role allows.
            {own ? '' : ' Only the person who connected this client can grant capabilities; you can remove them.'}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-2">
          {(c.grantable ?? []).map((cap: string) => {
            const has = granted.includes(cap);
            const canToggle = own || has;
            return (
              <Field key={cap} orientation="horizontal" data-disabled={!canToggle || undefined}>
                <Checkbox
                  id={`gr-${c.id}-${cap}`}
                  disabled={!canToggle || a.pending}
                  checked={sel.has(cap)}
                  onCheckedChange={(v) => {
                    const n = new Set(sel);
                    if (v) n.add(cap);
                    else n.delete(cap);
                    setSel(n);
                  }}
                />
                <FieldLabel htmlFor={`gr-${c.id}-${cap}`}>
                  {CAPABILITY_LABEL[cap] ?? cap} <span className="font-mono text-muted-foreground text-xs">{cap}</span>
                </FieldLabel>
              </Field>
            );
          })}
        </FieldGroup>
        <ActionStatus action={a} />
        <DialogFooter>
          <Button onClick={save} disabled={a.pending}>
            Save capabilities
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RestrictDialog({ c, projects, onDone }: { c: any; projects: Project[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [restricted, setRestricted] = useState<boolean>(!!c.allowedProjects);
  const [sel, setSel] = useState<Set<string>>(new Set(c.allowedProjects ?? []));
  const a = useAction();
  const save = async () => {
    try {
      await a.run(() => send('PATCH', `/api/connections/${enc(c.id)}`, { allowedProjects: restricted ? [...sel] : null }));
      toast('Project access updated. It applies to reads, writes, resources, history and old receipts.');
      setOpen(false);
      onDone();
    } catch {
      /* shown */
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) a.reset(); }}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>{c.allowedProjects ? `${c.allowedProjects.length} project(s)` : 'All projects'}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restrict project access</DialogTitle>
          <DialogDescription>
            Limit which projects <span className="font-mono">{c.clientId}</span> for {c.userName ?? c.userId} can use. Applies to reads, writes, resources, history and old receipts.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field orientation="horizontal">
            <Switch id={`rs-${c.id}`} checked={restricted} onCheckedChange={(v) => setRestricted(!!v)} />
            <FieldLabel htmlFor={`rs-${c.id}`}>Restrict to selected projects</FieldLabel>
          </Field>
          {restricted ? (
            <FieldSet>
              <FieldLegend variant="label">Allowed projects</FieldLegend>
              <FieldGroup className="gap-2">
                {projects.map((p) => (
                  <Field key={p.id} orientation="horizontal">
                    <Checkbox
                      id={`rs-${c.id}-${p.id}`}
                      checked={sel.has(p.id)}
                      onCheckedChange={(v) => {
                        const n = new Set(sel);
                        if (v) n.add(p.id);
                        else n.delete(p.id);
                        setSel(n);
                      }}
                    />
                    <FieldLabel htmlFor={`rs-${c.id}-${p.id}`}>{p.name}</FieldLabel>
                  </Field>
                ))}
              </FieldGroup>
              {!sel.size ? <FieldDescription>No project selected: the connection can see no project.</FieldDescription> : null}
            </FieldSet>
          ) : null}
        </FieldGroup>
        <ActionStatus action={a} />
        <DialogFooter>
          <Button onClick={save} disabled={a.pending}>
            Save access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------------------------------------- export

function ExportCard() {
  const { pid, project } = useProject();
  const [busy, setBusy] = useState<null | 'native' | 'complete'>(null);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const go = async (complete: boolean) => {
    setBusy(complete ? 'complete' : 'native');
    setError(null);
    try {
      const r = await send('POST', `/api/projects/${enc(pid)}/export`, { complete });
      downloadJson(`${project.slug || pid}-${complete ? 'complete' : 'work'}-export.json`, r);
      setReport(r.report);
      toast(`Export downloaded (${Object.keys(r.files).length} files).`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Download an export</CardTitle>
        <CardDescription>
          The native export contains schema-1 Work files (unchanged imported originals are byte-for-byte). The complete export adds collaboration data: notes, revisions, activity, runs, claims, approvals, controls and evidence. Credentials and private logs are never included.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!!busy} onClick={() => void go(false)}>
            <DownloadIcon data-icon="inline-start" />
            {busy === 'native' ? 'Preparing...' : 'Native Work export'}
          </Button>
          <Button variant="outline" disabled={!!busy} onClick={() => void go(true)}>
            <DownloadIcon data-icon="inline-start" />
            {busy === 'complete' ? 'Preparing...' : 'Complete export'}
          </Button>
        </div>
        {error ? <p role="alert" className="text-sm">{error}</p> : null}
        {report ? (
          <p role="status" className="text-sm text-muted-foreground">
            Validation: {report.errors} error(s), {report.warnings} warning(s). {report.note}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------- archive/delete

function ArchiveDelete() {
  const { pid, project } = useProject();
  const { reloadMe } = useApp();
  const navigate = useNavigate();
  const arch = useAction();
  const del = useAction();
  const [confirm, setConfirm] = useState('');
  const [open, setOpen] = useState(false);

  const archive = async (archived: boolean) => {
    try {
      await arch.run((requestId) => send('POST', `/api/projects/${enc(pid)}/archive`, { archived, requestId }), { success: archived ? 'Archived. The project is read-only and agent claims were released.' : 'Restored.' });
      await reloadMe();
    } catch {
      /* shown */
    }
  };
  const remove = async () => {
    try {
      const r = await del.run((requestId) => send('POST', `/api/projects/${enc(pid)}/delete`, { confirmName: confirm, requestId }));
      toast(`Deletion requested. Recoverable until ${new Date(r.purgeAfter).toLocaleDateString()}.`);
      setOpen(false);
      await reloadMe();
      navigate('/');
    } catch {
      /* shown */
    }
  };
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{project.archived ? 'Archived' : 'Archive project'}</CardTitle>
          <CardDescription>Archiving makes the project read-only and releases active agent claims. It can be restored at any time.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionStatus action={arch} onRetried={() => void reloadMe()} />
        </CardContent>
        <CardFooter>
          <Button variant="outline" disabled={arch.pending} onClick={() => void archive(!project.archived)}>
            {project.archived ? 'Restore project' : 'Archive project'}
          </Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Delete project</CardTitle>
          <CardDescription>Removes access now, cancels queued control operations, releases claims and cancels pending approvals. Recoverable for 30 days from the projects page, then purged.</CardDescription>
        </CardHeader>
        <CardFooter>
          <AlertDialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setConfirm(''); del.reset(); } }}>
            <AlertDialogTrigger render={<Button variant="destructive" />}>Delete project</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {project.name}?</AlertDialogTitle>
                <AlertDialogDescription>Type the project name exactly to confirm. Everyone loses access immediately; an administrator can restore it within 30 days.</AlertDialogDescription>
              </AlertDialogHeader>
              <Field>
                <FieldLabel htmlFor="del-confirm">Project name</FieldLabel>
                <Input id="del-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
              </Field>
              <ActionStatus action={del} />
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button variant="destructive" disabled={confirm !== project.name || del.pending} onClick={() => void remove()}>
                  Delete project
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      </Card>
      <p className="text-sm text-muted-foreground md:col-span-2">
        Deleted projects are listed for restore on the <Link className="underline underline-offset-4" to="/">projects page</Link>.
      </p>
    </div>
  );
}

