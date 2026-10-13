import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PlusIcon } from 'lucide-react';
import { enc, send } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useAction } from '@/lib/hooks';
import { ActionStatus, Chip, PageHeader, Section, StateBox, TimeAgo } from '@/components/common';
import { NeedsOrganization } from '@/views/signin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function Home() {
  const { me, reloadMe, refresh } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const create = useAction();

  if (me.needsOrganization || !me.workspace)
    return (
      <>
        <PageHeader title="Welcome" />
        <NeedsOrganization />
      </>
    );
  const isAdmin = me.user.role === 'admin';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const p = await create.run((requestId) => send('POST', '/api/projects', { name: name.trim(), requestId }));
      await reloadMe();
      navigate(`/p/${enc(p.id)}/overview`);
    } catch {
      /* shown */
    }
  };

  return (
    <>
      <PageHeader title={me.workspace.name} description={`Organization ${me.workspace.orgId} - you are ${isAdmin ? 'an administrator' : 'a member'}`} />
      {!me.projects.length ? (
        isAdmin ? (
          <StateBox title="No projects yet" message="Create a project, then import existing Work files or start planning in the dashboard." />
        ) : (
          <StateBox title="No project access" message="You are a member of this organization but have not been granted any project. Ask an administrator for access." />
        )
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
            <CardDescription>Projects you can open in this workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Your role</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {me.projects.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link className="font-medium underline-offset-4 hover:underline" to={`/p/${enc(p.id)}/overview`}>
                        {p.name}
                      </Link>
                      <div className="font-mono text-xs text-muted-foreground">{p.id}</div>
                    </TableCell>
                    <TableCell>
                      <Chip>{p.role}</Chip>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {p.archived ? <Chip tone="dashed">archived</Chip> : null}
                        {p.clientWritesPaused ? <Chip tone="warn">client writes paused</Chip> : null}
                        {!p.archived && !p.clientWritesPaused ? <Chip tone="solid">active</Chip> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <TimeAgo iso={p.updatedAt} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {isAdmin ? (
        <Section title="Create a project">
          <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
            <Field className="max-w-sm">
              <FieldLabel htmlFor="new-project">Project name</FieldLabel>
              <Input id="new-project" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" />
            </Field>
            <Button type="submit" disabled={create.pending || !name.trim()}>
              <PlusIcon data-icon="inline-start" />
              Create project
            </Button>
          </form>
          <ActionStatus action={create} onRetried={async (p) => { await reloadMe(); navigate(`/p/${enc(p.id)}/overview`); }} />
        </Section>
      ) : null}
      {isAdmin && me.deletedProjects?.length ? (
        <Section title="Deleted projects">
          <p className="text-sm text-muted-foreground">Deleted projects can be restored until they are purged.</p>
          <div className="flex flex-col gap-2">
            {me.deletedProjects.map((p) => (
              <DeletedRow key={p.id} id={p.id} name={p.name} purgeAfter={p.purgeAfter} onDone={async () => { await reloadMe(); refresh(); }} />
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}

function DeletedRow({ id, name, purgeAfter, onDone }: { id: string; name: string; purgeAfter: string; onDone: () => void }) {
  const a = useAction();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <span className="font-medium">{name}</span>
      <span className="text-sm text-muted-foreground">
        purge after <TimeAgo iso={purgeAfter} />
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={a.pending}
        onClick={async () => {
          try {
            await a.run((requestId) => send('POST', `/api/projects/${enc(id)}/restore`, { requestId }), { success: 'Restored.' });
            onDone();
          } catch {
            /* shown */
          }
        }}
      >
        Restore
      </Button>
      <ActionStatus action={a} onRetried={onDone} />
    </div>
  );
}
