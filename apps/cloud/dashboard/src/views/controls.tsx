// Project controls: cloud policy, desired vs observed local settings, companions, approvals.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { enc, get, send, tool } from '@/lib/api';
import { relTime } from '@/lib/constants';
import { useApp, useProject } from '@/lib/app-context';
import { useAction, useLoad } from '@/lib/hooks';
import { ActionStatus, Chip, ErrorState, Loaded, Notice, PageHeader, Section, SimpleSelect, StateBox, StatusBadge, TimeAgo } from '@/components/common';
import { ApprovalQueue } from '@/views/approvals';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const OFFLINE_MS = 10 * 60_000;
const CHECKOUT_STATES = ['pending', 'applying', 'applied', 'blocked', 'unsupported', 'failed', 'revoked', 'unknown'];
const isOffline = (iso?: string | null) => !iso || Date.now() - new Date(iso).getTime() > OFFLINE_MS;

export function ControlsView() {
  const { pid } = useProject();
  const state = useLoad(() => tool(pid, 'agileflow_settings_get', {}).then((r) => r.data), [pid]);
  return (
    <>
      <PageHeader title="Project controls" description="Cloud policy is enforced by the service. Local settings are applied by enrolled companions and show as pending until observed." />
      <Loaded state={state}>
        {(s) => (
          <>
            <CloudPolicy cloud={s.cloud} />
            <Section title="Desired local settings">
              <DesiredForm key={s.desired?.revision ?? 0} desired={s.desired} />
            </Section>
            <Section title="Checkouts: desired versus observed">
              <Checkouts checkouts={s.checkouts} />
            </Section>
            <Section title="Companions and enrollments">
              <Companions />
            </Section>
            <Section title="Approvals">
              <ApprovalQueue />
            </Section>
          </>
        )}
      </Loaded>
    </>
  );
}

function CloudPolicy({ cloud }: { cloud: any }) {
  const { pid, isAdmin } = useProject();
  const { reloadMe } = useApp();
  const [paused, setPaused] = useState<boolean>(cloud.clientWritesPaused);
  const a = useAction();
  const toggle = async (want: boolean) => {
    setPaused(want);
    try {
      await a.run((requestId) => send('PATCH', `/api/projects/${enc(pid)}`, { clientWritesPaused: want, requestId }), {
        success: want ? 'Paused. Connected clients can still read, add progress notes, and report runs.' : 'Resumed. Connected clients can change work again.',
      });
      await reloadMe();
    } catch {
      setPaused(!want);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cloud policy</CardTitle>
        <CardDescription>Enforced by the service for every connected client in this project.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field orientation="horizontal" data-disabled={!isAdmin || undefined}>
          <Switch id="pause-toggle" checked={paused} disabled={!isAdmin || a.pending} onCheckedChange={(c) => void toggle(!!c)} />
          <FieldContent>
            <FieldLabel htmlFor="pause-toggle">Pause connected-client changes to work</FieldLabel>
            <FieldDescription>
              Blocks new work and document changes from every MCP agent and connected CLI (including human CLI commands) in this project. Reads, progress notes, and run reports stay allowed. Browser editing by authorized people is unaffected.
            </FieldDescription>
          </FieldContent>
        </Field>
        <div aria-live="polite">
          <ActionStatus action={a} onRetried={() => void reloadMe()} />
        </div>
        <p className="text-sm">
          Require approval before agents start runs: <span className="font-medium">{cloud.requireStartApproval ? 'yes' : 'no'}</span>
          {' - '}lifecycle overrides allowed: <span className="font-medium">{cloud.allowLifecycleOverride ? 'yes' : 'no'}</span>
          {isAdmin ? (
            <>
              {' ('}
              <Link className="underline underline-offset-4" to={`/p/${enc(pid)}/admin`}>
                workspace policy
              </Link>
              {')'}
            </>
          ) : null}
        </p>
        {cloud.archived ? <Notice title="This project is archived." /> : null}
        {!isAdmin ? <p className="text-sm text-muted-foreground">Only administrators change project controls.</p> : null}
      </CardContent>
    </Card>
  );
}

interface SkillRow {
  key: number;
  id: string;
  enabled: string;
  activation: string;
}
interface ProviderRow {
  key: number;
  id: string;
  mode: string;
}
let rowKey = 0;

function DesiredForm({ desired }: { desired: any }) {
  const { pid, isAdmin } = useProject();
  const { refresh } = useApp();
  const settings = desired?.settings ?? {};
  const disabled = !isAdmin;
  const [skills, setSkills] = useState<SkillRow[]>(() =>
    Object.entries(settings.skills ?? {}).map(([id, v]: [string, any]) => ({ key: ++rowKey, id, enabled: v.enabled === undefined ? '' : String(v.enabled), activation: v.activation ?? '' })),
  );
  const [providers, setProviders] = useState<ProviderRow[]>(() => Object.entries(settings.providers ?? {}).map(([id, v]) => ({ key: ++rowKey, id, mode: String(v) })));
  const [questions, setQuestions] = useState<string>(settings.questions ?? '');
  const a = useAction();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sk = Object.fromEntries(
      skills.filter((r) => r.id.trim()).map((r) => [r.id.trim(), { ...(r.enabled ? { enabled: r.enabled === 'true' } : {}), ...(r.activation ? { activation: r.activation } : {}) }]),
    );
    const pr = Object.fromEntries(providers.filter((r) => r.id.trim()).map((r) => [r.id.trim(), r.mode]));
    const d = { ...(Object.keys(sk).length ? { skills: sk } : {}), ...(Object.keys(pr).length ? { providers: pr } : {}), ...(questions ? { questions } : {}) };
    const done = (r: any) => {
      toast(`Desired revision ${r.revision} recorded; ${r.pendingCheckouts ?? 0} checkout(s) pending.`);
      refresh();
    };
    try {
      done(await a.run((requestId) => send('PUT', `/api/projects/${enc(pid)}/settings`, { desired: d, requestId })));
    } catch {
      /* shown */
    }
  };

  return (
    <Card>
      <form onSubmit={submit} className="contents">
        <CardHeader>
          <CardTitle>Settings applied by companions</CardTitle>
          <CardDescription>
            {desired ? (
              <>
                Current desired revision <span className="font-medium">{desired.revision}</span> set <TimeAgo iso={desired.createdAt} />.
              </>
            ) : (
              'No desired settings yet.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <FieldSet>
            <FieldLegend>Skills in this checkout</FieldLegend>
            <FieldDescription>
              Disabling removes only clean, AgileFlow-owned copies; modified or host-owned copies stay and are reported as blocked or still discoverable. Hosts may need a reload.
            </FieldDescription>
            {skills.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Skill</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead>Activation</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skills.map((r, i) => {
                    const set = (patch: Partial<SkillRow>) => setSkills(skills.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                    return (
                      <TableRow key={r.key}>
                        <TableCell>
                          <Input aria-label="Skill ID" placeholder="skill-id" pattern="[a-z0-9][a-z0-9\-]{0,63}" disabled={disabled} value={r.id} onChange={(e) => set({ id: e.target.value })} />
                        </TableCell>
                        <TableCell>
                          <SimpleSelect ariaLabel="Enabled" disabled={disabled} value={r.enabled} onChange={(v) => set({ enabled: v })} options={[['', 'unchanged'], ['true', 'enabled'], ['false', 'disabled']]} />
                        </TableCell>
                        <TableCell>
                          <SimpleSelect ariaLabel="Activation" disabled={disabled} value={r.activation} onChange={(v) => set({ activation: v })} options={[['', 'unchanged'], 'auto', 'manual']} />
                        </TableCell>
                        <TableCell>
                          {disabled ? null : (
                            <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${r.id || 'skill'}`} onClick={() => setSkills(skills.filter((_, j) => j !== i))}>
                              <Trash2Icon />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No skill settings.</p>
            )}
            {disabled ? null : (
              <div>
                <Button type="button" size="sm" variant="outline" onClick={() => setSkills([...skills, { key: ++rowKey, id: '', enabled: '', activation: '' }])}>
                  <PlusIcon data-icon="inline-start" />
                  Add skill
                </Button>
              </div>
            )}
          </FieldSet>
          <FieldSet>
            <FieldLegend>Providers</FieldLegend>
            <FieldDescription>A per-provider change the host cannot enforce is reported as unsupported, never turned into a checkout-wide removal.</FieldDescription>
            {providers.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providers.map((r, i) => {
                    const set = (patch: Partial<ProviderRow>) => setProviders(providers.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                    return (
                      <TableRow key={r.key}>
                        <TableCell>
                          <Input aria-label="Provider ID" placeholder="claude-code" pattern="[a-z][a-z0-9\-]{0,31}" disabled={disabled} value={r.id} onChange={(e) => set({ id: e.target.value })} />
                        </TableCell>
                        <TableCell>
                          <SimpleSelect ariaLabel="Mode" disabled={disabled} value={r.mode} onChange={(v) => set({ mode: v })} options={['on', 'off', 'auto']} />
                        </TableCell>
                        <TableCell>
                          {disabled ? null : (
                            <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${r.id || 'provider'}`} onClick={() => setProviders(providers.filter((_, j) => j !== i))}>
                              <Trash2Icon />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No provider settings.</p>
            )}
            {disabled ? null : (
              <div>
                <Button type="button" size="sm" variant="outline" onClick={() => setProviders([...providers, { key: ++rowKey, id: '', mode: 'auto' }])}>
                  <PlusIcon data-icon="inline-start" />
                  Add provider
                </Button>
              </div>
            )}
          </FieldSet>
          <FieldGroup>
            <Field className="max-w-sm">
              <FieldLabel htmlFor="q-pref">Question preference</FieldLabel>
              <SimpleSelect id="q-pref" disabled={disabled} value={questions} onChange={setQuestions} options={[['', 'unchanged'], ['provider-default', 'provider default'], 'prefer', 'minimize']} />
              <FieldDescription>Shared project preference, separate from personal host settings.</FieldDescription>
            </Field>
          </FieldGroup>
          <div aria-live="polite">
            <ActionStatus action={a} onRetried={refresh} />
          </div>
        </CardContent>
        <CardFooter>
          {disabled ? (
            <p className="text-sm text-muted-foreground">Read only: administrators change desired settings. Others can request a change through an agent approval.</p>
          ) : (
            <Button type="submit" disabled={a.pending}>
              Save desired settings
            </Button>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}

function Checkouts({ checkouts }: { checkouts: any[] }) {
  if (!checkouts.length) return <StateBox title="No enrolled checkouts" message="Enroll a local companion in a repository checkout to apply settings. Until then, desired settings are recorded but not applied anywhere." />;
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            {['Checkout', 'Companion', 'Status', 'Desired / observed', 'Observed settings', 'Last seen'].map((t) => (
              <TableHead key={t}>{t}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {checkouts.map((k) => {
            const status = CHECKOUT_STATES.includes(k.status) ? k.status : 'unknown';
            const obs = k.observation || {};
            const op = k.lastOperation;
            return (
              <TableRow key={k.checkoutId} className="align-top">
                <TableCell className="whitespace-normal">
                  <div>{k.repoIdentity ?? ''}</div>
                  <div className="font-mono text-xs text-muted-foreground">{k.checkoutId}</div>
                </TableCell>
                <TableCell>
                  {k.companionName}
                  <div className="text-xs text-muted-foreground">
                    {k.platform} v{k.companionVersion}
                  </div>
                </TableCell>
                <TableCell className="whitespace-normal">
                  <div className="flex flex-wrap gap-1">
                    <StatusBadge status={status} />
                    {isOffline(k.lastSeenAt) && !k.companionRevoked ? <Chip tone="dashed">offline</Chip> : null}
                    {op?.receipt?.reloadRequired ? <Chip>host reload needed</Chip> : null}
                  </div>
                  {op?.error ? <div className="mt-1 text-xs text-muted-foreground">{typeof op.error === 'string' ? op.error : JSON.stringify(op.error)}</div> : null}
                  {Array.isArray(op?.receipt?.results) ? (
                    <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                      {op.receipt.results.slice(0, 10).map((r: any, i: number) => (
                        <li key={i}>
                          {r.target}: {r.outcome}
                          {r.detail ? ` (${r.detail})` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </TableCell>
                <TableCell>
                  rev {k.desiredRevision ?? '-'} / rev {k.observedRevision ?? '-'}
                </TableCell>
                <TableCell className="whitespace-normal font-mono text-xs">
                  {obs.providers ? <div>providers: {Object.entries(obs.providers).map(([p, m]) => `${p}=${m}`).join(', ')}</div> : null}
                  {obs.questions ? <div>questions: {obs.questions}</div> : null}
                  {obs.skills ? (
                    <div>
                      skills:{' '}
                      {Object.entries(obs.skills)
                        .map(([id, v]: [string, any]) => `${id}${v.enabled === false ? ' off' : ''}${v.activation ? ` ${v.activation}` : ''}${v.modified ? ' (modified)' : ''}`)
                        .join(', ')}
                    </div>
                  ) : null}
                  {!obs.providers && !obs.skills && !obs.questions ? <span className="text-muted-foreground">nothing observed yet</span> : null}
                </TableCell>
                <TableCell>
                  <TimeAgo iso={k.lastSeenAt} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function Companions() {
  const { pid, isAdmin } = useProject();
  const state = useLoad(() => (isAdmin ? get(`/api/projects/${enc(pid)}/companions`) : Promise.resolve(null)), [pid, isAdmin]);
  if (!isAdmin) return <StateBox title="Administrators only" message="Companion enrollment and disconnection are managed by workspace administrators." />;
  if (state.error && !state.data) return <ErrorState error={state.error} retry={state.reload} />;
  return (
    <Loaded state={state}>
      {(c: any) =>
        !c.pending.length && !c.companions.length ? (
          <StateBox title="No companions" message="Run the AgileFlow companion in a checkout to request enrollment; it appears here for approval." />
        ) : (
          <div className="flex flex-col gap-4">
            {c.pending.length ? (
              <div className="flex flex-col gap-3">
                <h3 className="font-medium">Pending enrollment requests</h3>
                {c.pending.map((p: any) => (
                  <Enrollment key={p.id} p={p} />
                ))}
              </div>
            ) : null}
            {c.companions.length ? (
              <div className="flex flex-col gap-3">
                <h3 className="font-medium">Companions</h3>
                <div className="rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {['Name', 'Platform', 'Version', 'Capabilities', 'Last seen', ''].map((t, i) => (
                          <TableHead key={i}>{t || <span className="sr-only">Actions</span>}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {c.companions.map((k: any) => (
                        <CompanionRow key={k.id} k={k} minimumVersion={c.minimumVersion} onDone={state.reload} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}
          </div>
        )
      }
    </Loaded>
  );
}

function Enrollment({ p }: { p: any }) {
  const { pid } = useProject();
  const req = p.request || {};
  const [caps, setCaps] = useState<Record<string, boolean>>(() => Object.fromEntries((req.capabilities || []).map((c: string) => [c, true])));
  const [approved, setApproved] = useState(p.state !== 'pending');
  const a = useAction();
  const approve = async () => {
    const capabilities = Object.entries(caps)
      .filter(([, v]) => v)
      .map(([k]) => k);
    try {
      await a.run((requestId) => send('POST', `/api/projects/${enc(pid)}/enrollments/${enc(p.id)}/approve`, { capabilities, requestId }), { success: 'Approved. The companion finishes enrollment on its side.' });
      setApproved(true);
    } catch {
      /* shown */
    }
  };
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          {req.name || p.id}
          <StatusBadge status={approved ? 'approved' : p.state} />
        </CardTitle>
        <CardDescription>
          {req.platform ?? ''} v{req.version ?? '?'} - {req.repoIdentity ?? ''} - requested by {p.userId} - expires <TimeAgo iso={p.expiresAt} />
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!approved ? (
          <FieldSet>
            <FieldLegend variant="label">Capabilities to grant</FieldLegend>
            <FieldGroup className="gap-2">
              {Object.keys(caps).map((cap) => (
                <Field key={cap} orientation="horizontal">
                  <Checkbox id={`cap-${p.id}-${cap}`} checked={caps[cap]} onCheckedChange={(v) => setCaps({ ...caps, [cap]: !!v })} />
                  <FieldLabel htmlFor={`cap-${p.id}-${cap}`} className="font-mono text-xs">
                    {cap}
                  </FieldLabel>
                </Field>
              ))}
            </FieldGroup>
          </FieldSet>
        ) : (
          <p className="text-sm text-muted-foreground">Approved; waiting for the companion to redeem.</p>
        )}
        <ActionStatus action={a} onRetried={() => setApproved(true)} />
      </CardContent>
      {!approved ? (
        <CardFooter>
          <Button size="sm" onClick={approve} disabled={a.pending}>
            Approve enrollment
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

function CompanionRow({ k, minimumVersion, onDone }: { k: any; minimumVersion: string; onDone: () => void }) {
  const { pid } = useProject();
  const a = useAction();
  const revoke = async () => {
    try {
      await a.run((requestId) => send('POST', `/api/projects/${enc(pid)}/companions/${enc(k.id)}/revoke`, { requestId }), { success: 'Disconnected.' });
      onDone();
    } catch {
      /* shown */
    }
  };
  return (
    <TableRow className="align-top">
      <TableCell>
        {k.name} {k.revoked ? <Chip tone="dashed">revoked</Chip> : null}
      </TableCell>
      <TableCell>{k.platform}</TableCell>
      <TableCell>
        {k.version} {!k.supported ? <Chip tone="warn">upgrade required (min {minimumVersion})</Chip> : null}
      </TableCell>
      <TableCell className="whitespace-normal font-mono text-xs">{(k.capabilities || []).join(', ')}</TableCell>
      <TableCell>
        <TimeAgo iso={k.lastSeenAt} />
        {k.lastSeenAt && isOffline(k.lastSeenAt) ? <div className="text-xs text-muted-foreground">offline ({relTime(k.lastSeenAt)})</div> : null}
      </TableCell>
      <TableCell>
        {k.revoked ? null : (
          <AlertDialog>
            <AlertDialogTrigger render={<Button size="sm" variant="destructive" disabled={a.pending} />}>Disconnect</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect {k.name}?</AlertDialogTitle>
                <AlertDialogDescription>Its enrollment credential and queued operations are revoked. It stops retrieving and applying control operations for this project.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={revoke}>Disconnect</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <ActionStatus action={a} onRetried={onDone} />
      </TableCell>
    </TableRow>
  );
}
