// Connection setup and diagnostics. Four states are reported separately and never
// collapsed into one "connected" badge: registered, reachable, authorized, operation verified.
import { useState } from 'react';
import { RotateCwIcon } from 'lucide-react';
import { discovery, get, tool, type Discovery } from '@/lib/api';
import { useApp, useMaybeProject } from '@/lib/app-context';
import { useLoad } from '@/lib/hooks';
import { Chip, Loaded, PageHeader, Section, SimpleSelect, Snippet, TimeAgo } from '@/components/common';
import { Connections } from '@/views/admin';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Check = { state: 'ok' | 'failed' | 'not-yet' | 'unknown'; detail: string };
const LABEL: Record<Check['state'], string> = { ok: 'ok', failed: 'failed', 'not-yet': 'not yet', unknown: 'unknown' };

function StateRow({ name, check, help }: { name: string; check: Check; help: string }) {
  return (
    <Item variant="outline" size="sm" role="listitem">
      <ItemMedia>
        <Chip tone={check.state === 'ok' ? 'strong' : check.state === 'failed' ? 'warn' : 'dashed'}>{LABEL[check.state]}</Chip>
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{name}</ItemTitle>
        <ItemDescription className="line-clamp-none">
          {check.detail} <span className="text-muted-foreground">{help}</span>
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}

export function ConnectView() {
  const { me } = useApp();
  const ctxProject = useMaybeProject();
  const [pid, setPid] = useState<string>(ctxProject?.pid ?? me.projects[0]?.id ?? '');
  const project = me.projects.find((p) => p.id === pid) ?? null;

  const disc = useLoad(() => discovery(), []);
  const diag = useLoad(async () => {
    const t0 = performance.now();
    const reach: Check = await fetch('/healthz', { credentials: 'omit' })
      .then((r) => (r.ok ? { state: 'ok' as const, detail: `Service answered in ${Math.round(performance.now() - t0)} ms.` } : { state: 'failed' as const, detail: `Health check returned HTTP ${r.status}.` }))
      .catch((e) => ({ state: 'failed' as const, detail: `Not reachable: ${(e as Error).message}` }));
    let auth: Check;
    try {
      const m = await get('/api/me');
      auth = m.needsOrganization ? { state: 'failed', detail: 'Signed in, but no organization is active (wrong organization or personal workspace).' } : { state: 'ok', detail: `Signed in as ${m.user.id} (${m.user.role}) in ${m.workspace.name}.` };
    } catch (e) {
      auth = { state: 'failed', detail: (e as Error).message };
    }
    let verified: Check = { state: 'unknown', detail: 'Choose a project to verify an operation.' };
    if (pid && auth.state === 'ok') {
      try {
        await tool(pid, 'agileflow_work_list', { limit: 1 });
        verified = { state: 'ok', detail: `Read work in ${pid} through the same tool registry agents use.` };
      } catch (e) {
        verified = { state: 'failed', detail: (e as Error).message };
      }
    }
    const conns: any[] = await get('/api/connections').catch(() => []);
    return { reach, auth, verified, conns: conns.filter((c) => c.userId === me.user.id) };
  }, [pid]);

  return (
    <>
      <PageHeader
        title="Connect"
        description="Set up Claude Code, Codex, Cursor, or the AgileFlow CLI, then check each connection state separately."
        actions={
          <Button variant="outline" onClick={() => { disc.reload(); diag.reload(); }}>
            <RotateCwIcon data-icon="inline-start" />
            Re-run checks
          </Button>
        }
      />
      {me.projects.length > 1 || !ctxProject ? (
        <Field className="mb-4 max-w-sm">
          <FieldLabel htmlFor="cx-project">Project to check</FieldLabel>
          <SimpleSelect id="cx-project" value={pid} onChange={setPid} options={[['', 'No project'], ...me.projects.map((p) => [p.id, p.name] as const)]} />
        </Field>
      ) : null}
      <Loaded state={disc}>{(d) => <Setup d={d} pid={pid} />}</Loaded>
      <Section title="Diagnostics">
        <Loaded state={diag}>
          {(r) => (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>This browser session</CardTitle>
                  <CardDescription>Checks the dashboard's own path to the service{project ? ` for ${project.name}` : ''}.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ItemGroup className="gap-2">
                    <StateRow name="Registered" check={{ state: 'ok', detail: 'Dashboard sessions need no client registration.' }} help="" />
                    <StateRow name="Reachable" check={r.reach} help="The service endpoint responds." />
                    <StateRow name="Authorized" check={r.auth} help="The session token is valid for this organization." />
                    <StateRow name="Operation verified" check={r.verified} help="A real read succeeded in the selected project." />
                  </ItemGroup>
                </CardContent>
              </Card>
              {r.conns.length ? (
                r.conns.map((c) => <ConnectionStates key={c.id} c={c} pid={pid} />)
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Your agent connections</CardTitle>
                    <CardDescription>No agent or CLI has connected as you yet.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ItemGroup className="gap-2">
                      <StateRow name="Registered" check={{ state: 'not-yet', detail: 'No connection record. Add AgileFlow to a client below; it registers on first sign-in.' }} help="" />
                      <StateRow name="Reachable" check={{ state: 'unknown', detail: 'The service has not seen a request from a client.' }} help="" />
                      <StateRow name="Authorized" check={{ state: 'unknown', detail: 'No access token has been issued.' }} help="" />
                      <StateRow name="Operation verified" check={{ state: 'unknown', detail: 'No tool call recorded.' }} help="" />
                    </ItemGroup>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </Loaded>
      </Section>
      <Section title="Your connections">
        <p className="text-sm text-muted-foreground">Disable a connection to reject its subsequent requests. Data already downloaded or work already accepted cannot be retracted.</p>
        <Connections ownOnly />
      </Section>
    </>
  );
}

function ConnectionStates({ c, pid }: { c: any; pid: string }) {
  const allowed = !c.allowedProjects || !pid || c.allowedProjects.includes(pid);
  const scopes: string[] = c.lastScopes ?? [];
  const registered: Check = { state: 'ok', detail: `Client ${c.clientId} for ${c.resource}, created ${new Date(c.createdAt).toLocaleDateString()}.` };
  const reachable: Check = c.lastRequestAt ? { state: 'ok', detail: `Last request reached the service ${new Date(c.lastRequestAt).toLocaleString()}.` } : { state: 'not-yet', detail: 'The service has not received a request from this client.' };
  const authorized: Check = c.disabled
    ? { state: 'failed', detail: `Disabled ${c.disabledAt ? new Date(c.disabledAt).toLocaleString() : ''}. Requests are rejected.` }
    : !allowed
      ? { state: 'failed', detail: 'Restricted away from the selected project.' }
      : scopes.length
        ? { state: 'ok', detail: `Granted scopes: ${scopes.join(' ')}.` }
        : { state: 'unknown', detail: 'No granted scopes recorded yet.' };
  const verified: Check =
    authorized.state !== 'ok'
      ? { state: 'unknown', detail: 'Not checked: the connection is not authorized for this project.' }
      : c.lastRequestAt
        ? { state: 'unknown', detail: 'The service records requests, not their outcome. Ask the agent to call agileflow_context, or run `agileflow cloud status` for a verified read.' }
        : { state: 'not-yet', detail: 'No operation yet.' };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-sm">{c.clientId}</CardTitle>
        <CardDescription>
          {c.resource} - last request <TimeAgo iso={c.lastRequestAt} />
        </CardDescription>
        <CardAction>{c.disabled ? <Chip tone="dashed">disabled</Chip> : <Chip tone="solid">enabled</Chip>}</CardAction>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-2">
          <StateRow name="Registered" check={registered} help="" />
          <StateRow name="Reachable" check={reachable} help="" />
          <StateRow name="Authorized" check={authorized} help="" />
          <StateRow name="Operation verified" check={verified} help="" />
        </ItemGroup>
      </CardContent>
    </Card>
  );
}

function Setup({ d, pid }: { d: Discovery; pid: string }) {
  const mcp = d.resources.mcp;
  const service = d.service;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Add AgileFlow to an agent</CardTitle>
          <CardDescription>
            MCP endpoint <span className="font-mono">{mcp}</span>. The client signs you in with OAuth and requests read access by default; write scopes are only requested if you agree.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="claude">
            <TabsList>
              <TabsTrigger value="claude">Claude Code</TabsTrigger>
              <TabsTrigger value="codex">Codex</TabsTrigger>
              <TabsTrigger value="cursor">Cursor</TabsTrigger>
              <TabsTrigger value="cli">AgileFlow CLI</TabsTrigger>
            </TabsList>
            <TabsContent value="claude" className="flex flex-col gap-3 pt-2">
              <Snippet title="Add the server" text={`claude mcp add --transport http agileflow ${mcp}`} description="Then run /mcp in Claude Code and choose Authenticate." />
            </TabsContent>
            <TabsContent value="codex" className="flex flex-col gap-3 pt-2">
              <Snippet title="~/.codex/config.toml" text={`[mcp_servers.agileflow]\nurl = "${mcp}"`} description={'Then run `codex mcp login agileflow` to sign in.'} />
            </TabsContent>
            <TabsContent value="cursor" className="flex flex-col gap-3 pt-2">
              <Snippet title=".cursor/mcp.json" text={JSON.stringify({ mcpServers: { agileflow: { url: mcp } } }, null, 2)} description="Cursor prompts you to sign in the first time the server is used." />
            </TabsContent>
            <TabsContent value="cli" className="flex flex-col gap-3 pt-2">
              <Snippet
                title="Sign in and bind this checkout"
                text={`npx agileflow cloud login --service ${service}\nnpx agileflow cloud connect --project ${pid || '<project-id>'}\nnpx agileflow cloud status`}
                description="cloud status reports the same four states from your machine."
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Service</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Service</dt>
            <dd className="font-mono text-xs">{service}</dd>
            {Object.entries(d.resources).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">Resource {k}</dt>
                <dd className="font-mono text-xs">{v}</dd>
              </div>
            ))}
            <dt className="text-muted-foreground">Default scopes (MCP)</dt>
            <dd className="font-mono text-xs">{(d.defaultScopes.mcp ?? []).join(' ')}</dd>
            <dt className="text-muted-foreground">Tools</dt>
            <dd>
              {d.tools.length} ({d.tools.filter((t) => t.readOnly).length} read-only)
            </dd>
            <dt className="text-muted-foreground">Minimum versions</dt>
            <dd>
              {Object.entries(d.minimumVersions)
                .map(([k, v]) => `${k} ${v}`)
                .join(', ')}
            </dd>
            {pid ? (
              <>
                <dt className="text-muted-foreground">Project ID</dt>
                <dd className="font-mono text-xs">{pid}</dd>
              </>
            ) : null}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

