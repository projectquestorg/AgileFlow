import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthValue, type DevIdentity } from '@/lib/app-context';
import { continueExternal, externalContinueUrl, EXPIRED_KEY, IDENT_KEY, RETURN_KEY, TOKEN_KEY } from '@/lib/auth-keys';
import { Logo } from '@/components/logo';
import { SignInForm } from '@/components/auth/sign-in-form';
import { OrganizationChooser } from '@/components/auth/organization-chooser';
import { Notice, SimpleSelect, StateBox } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

function returnTo() {
  const back = sessionStorage.getItem(RETURN_KEY) || '/';
  return back === '/signin' ? '/' : back;
}

export function SignInView() {
  const auth = useAuthValue();
  const navigate = useNavigate();
  const expired = !!sessionStorage.getItem(EXPIRED_KEY);

  const external = externalContinueUrl();
  const finish = () => {
    if (continueExternal()) return;
    const back = returnTo();
    sessionStorage.removeItem(RETURN_KEY);
    sessionStorage.removeItem(EXPIRED_KEY);
    navigate(back, { replace: true });
  };

  // Already signed in (e.g. Clerk restored the session): go back to the intended route.
  useEffect(() => {
    if (auth.signedIn && !expired) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.signedIn, auth.identityKey]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <Logo className="text-lg" />
      {auth.mode === 'clerk' ? (
        <div className="flex w-full max-w-sm flex-col items-center gap-4">
          {expired ? <Notice role="alert" title="Session ended">Your session expired or was signed out. Sign in again to return to where you were.</Notice> : null}
          {auth.signedIn ? (
            <div className="flex gap-2">
              <Button onClick={finish}>Continue</Button>
              <Button variant="outline" onClick={auth.signOut}>Sign out</Button>
            </div>
          ) : (
            <SignInForm completeUrl={`${location.origin}/#${external ? "/signin" : returnTo()}`} />
          )}
        </div>
      ) : (
        <DevSignIn expired={expired} onDone={finish} />
      )}
    </div>
  );
}

function DevSignIn({ expired, onDone }: { expired: boolean; onDone: () => void }) {
  const prev: DevIdentity = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(IDENT_KEY) || '{}');
    } catch {
      return {} as DevIdentity;
    }
  })();
  const [userId, setUserId] = useState(prev.userId || 'user_dev');
  const [name, setName] = useState(prev.name || 'Dev User');
  const [orgId, setOrgId] = useState(prev.orgId ?? 'org_dev');
  const [orgName, setOrgName] = useState(prev.orgName || 'Dev Workspace');
  const [role, setRole] = useState(prev.role || 'admin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { userId: userId.trim(), name: name.trim(), role, ...(orgId.trim() ? { orgId: orgId.trim(), orgName: orgName.trim() } : {}) };
      const res = await fetch('/dev/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.token) throw new Error(typeof j.error === 'string' ? j.error : j.error?.message || `Sign-in failed (HTTP ${res.status}).`);
      sessionStorage.setItem(TOKEN_KEY, j.token);
      sessionStorage.setItem(IDENT_KEY, JSON.stringify({ userId: body.userId, name: body.name, orgId: body.orgId ?? '', orgName: body.orgName, role: body.role }));
      window.dispatchEvent(new Event('af-token'));
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Sign in to AgileFlow</CardTitle>
        <CardDescription>Development sign-in. The session token is kept only in this browser tab, so each tab can use a different organization.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {expired ? <Notice role="alert" title="Session ended">Your session expired or was signed out. Sign in again to return to where you were.</Notice> : null}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="si-user">User ID</FieldLabel>
              <Input id="si-user" required pattern="[A-Za-z0-9_\-]{1,64}" autoComplete="username" value={userId} onChange={(e) => setUserId(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="si-name">Display name</FieldLabel>
              <Input id="si-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="si-org">Organization ID</FieldLabel>
              <Input id="si-org" pattern="[A-Za-z0-9_\-]{0,64}" value={orgId} onChange={(e) => setOrgId(e.target.value)} />
              <FieldDescription>Leave empty to sign in without an organization.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="si-orgname">Organization name</FieldLabel>
              <Input id="si-orgname" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="si-role">Organization role</FieldLabel>
              <SimpleSelect id="si-role" value={role} onChange={setRole} options={['admin', 'member']} />
            </Field>
          </FieldGroup>
          <Button type="submit" disabled={busy}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            Sign in
          </Button>
          {error ? <Notice role="alert" title="Sign-in failed">{error}</Notice> : null}
        </form>
      </CardContent>
    </Card>
  );
}

export function NeedsOrganization() {
  const auth = useAuthValue();
  if (auth.mode === 'clerk')
    return (
      <div className="flex flex-1 items-start justify-center py-10">
        <OrganizationChooser />
      </div>
    );
  return (
    <StateBox title="Choose or create an organization" message="AgileFlow projects live in an organization workspace.">
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-muted-foreground">Development mode: sign out and sign in again with an organization ID.</p>
        <Button variant="outline" onClick={auth.signOut}>Sign out</Button>
      </div>
    </StateBox>
  );
}
