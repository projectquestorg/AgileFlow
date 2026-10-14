// Approvals queue and single-approval review (deep link: #/p/:pid/approvals/:aid).
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, enc, get, send } from '@/lib/api';
import { useProject } from '@/lib/app-context';
import { useAction, useLoad } from '@/lib/hooks';
import { ActionStatus, Loaded, Notice, PageHeader, Section, StateBox, StatusBadge, TimeAgo } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

function describeProposal(a: any) {
  const p = a.proposal || {};
  switch (a.kind) {
    case 'lifecycle_override':
      return `Move ${p.workId} from ${p.fromStatus ?? '?'} to ${p.targetStatus} (version ${p.expectedVersion}) despite lifecycle blockers.`;
    case 'execution_start':
      return `Start a run on ${(p.workIds || []).join(', ') || 'unspecified work'}: ${p.intent ?? ''}`;
    case 'claim_override':
      return `Override claim ${p.claimId} on ${p.storyId} (generation ${p.generation}).`;
    case 'settings_change':
      return `Change local settings: ${JSON.stringify(p.desired)}${p.checkoutIds ? ` on ${p.checkoutIds.length} checkout(s)` : ' on all checkouts'}.`;
    default:
      return JSON.stringify(p);
  }
}

export function ApprovalCard({ approval, focus }: { approval: any; focus?: boolean }) {
  const { pid, canWrite } = useProject();
  const [state, setState] = useState<string>(approval.state);
  const a = useAction();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus) setTimeout(() => ref.current?.focus(), 0);
  }, [focus]);
  const decide = async (decision: 'approve' | 'reject') => {
    try {
      const r = await a.run((requestId) => send('POST', `/api/projects/${enc(pid)}/approvals/${enc(approval.id)}/decide`, { decision, requestId }), {
        success: decision === 'approve' ? 'Approved. The requester can now use it once.' : 'Rejected.',
      });
      setState(r.state);
    } catch {
      /* shown */
    }
  };
  const forbidden = a.status === 'error' && a.error instanceof ApiError && a.error.code === 'FORBIDDEN';
  return (
    <Card ref={ref} id={`approval-${approval.id}`} tabIndex={focus ? -1 : undefined} className="outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <CardHeader>
        <CardTitle className="capitalize">{approval.kind.replace(/_/g, ' ')}</CardTitle>
        <CardDescription>
          Requested by {approval.requestedByUser}
          {approval.requestedByConnection ? ` via connection ${approval.requestedByConnection}` : ''} <TimeAgo iso={approval.createdAt} /> - expires <TimeAgo iso={approval.expiresAt} />
          {approval.decidedBy ? ` - decided by ${approval.decidedBy}` : ''}
        </CardDescription>
        <CardAction>
          <StatusBadge status={state} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p>{describeProposal(approval)}</p>
        <p>
          <span className="font-medium">Reason: </span>
          {approval.reason}
        </p>
        {forbidden ? (
          <Notice role="alert" title="You cannot decide this request">
            {a.error?.message}
          </Notice>
        ) : (
          <div aria-live="polite">
            <ActionStatus action={a} onRetried={(r) => setState(r.state)} />
          </div>
        )}
      </CardContent>
      {state === 'pending' && canWrite ? (
        <CardFooter className="gap-2">
          <Button onClick={() => void decide('approve')} disabled={a.pending}>
            Approve
          </Button>
          <Button variant="outline" onClick={() => void decide('reject')} disabled={a.pending}>
            Reject
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

export function ApprovalQueue() {
  const { pid } = useProject();
  const state = useLoad(() => get(`/api/projects/${enc(pid)}/approvals?state=pending`), [pid]);
  return (
    <Loaded state={state}>
      {(r: any) =>
        r.items.length ? (
          <div className="flex flex-col gap-3">
            {r.items.map((a: any) => (
              <ApprovalCard key={a.id} approval={a} />
            ))}
          </div>
        ) : (
          <StateBox title="No pending approvals" message="Agents ask for approval here when they need a lifecycle override, a run start, a claim override, or a settings change." />
        )
      }
    </Loaded>
  );
}

export function ApprovalsView() {
  const { aid } = useParams();
  const { pid } = useProject();
  const all = useLoad(() => get(`/api/projects/${enc(pid)}/approvals`), [pid]);
  return (
    <>
      <PageHeader title="Approvals" description="You cannot approve your own request. Approvals are single-use and expire." />
      {aid ? (
        <Loaded state={all}>
          {(r: any) => {
            const a = r.items.find((x: any) => x.id === aid);
            return a ? (
              <div className="flex flex-col gap-4">
                <ApprovalCard key={a.id} approval={a} focus />
                <Link className="text-sm underline underline-offset-4" to={`/p/${enc(pid)}/approvals`}>
                  All pending approvals
                </Link>
              </div>
            ) : (
              <StateBox title="Approval not found" message="It may have expired, been decided, or belong to another project.">
                <Button variant="outline" render={<Link to={`/p/${enc(pid)}/approvals`} />} nativeButton={false}>
                  All pending approvals
                </Button>
              </StateBox>
            );
          }}
        </Loaded>
      ) : (
        <>
          <ApprovalQueue />
          <Loaded state={all}>
            {(r: any) => {
              const decided = r.items.filter((a: any) => a.state !== 'pending');
              return decided.length ? (
                <Section title="Decided and expired">
                  <div className="flex flex-col gap-3">
                    {decided.slice(0, 30).map((a: any) => (
                      <ApprovalCard key={a.id} approval={a} />
                    ))}
                  </div>
                </Section>
              ) : null;
            }}
          </Loaded>
        </>
      )}
    </>
  );
}
