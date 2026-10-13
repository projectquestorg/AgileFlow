import { StrictMode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import './index.css';
import App from './App';
import { discovery, setTokenProvider, type Discovery } from '@/lib/api';
import { AuthContext, type AuthValue, type DevIdentity } from '@/lib/app-context';
import { Logo } from '@/components/logo';
import { clerkAppearance, IDENT_KEY, TOKEN_KEY } from '@/lib/auth-keys';
import { StateBox } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

function Splash({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <Logo />
      {children ?? <Spinner />}
    </div>
  );
}

function readIdentity(): DevIdentity | null {
  try {
    return JSON.parse(sessionStorage.getItem(IDENT_KEY) || 'null');
  } catch {
    return null;
  }
}

/** Development sign-in: the session token lives in sessionStorage (per tab). */
function DevAuth() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY));
  useLayoutEffect(() => setTokenProvider(async () => sessionStorage.getItem(TOKEN_KEY)), []);
  useEffect(() => {
    const onSet = () => setToken(sessionStorage.getItem(TOKEN_KEY));
    window.addEventListener('af-token', onSet);
    return () => window.removeEventListener('af-token', onSet);
  }, []);
  const signOut = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new Event('af-token'));
    location.hash = '#/signin';
  }, []);
  const value = useMemo<AuthValue>(() => {
    const ident = token ? readIdentity() : null;
    return { mode: 'dev', signedIn: !!token, identityKey: `${token ?? ''}`, signOut, devIdentity: ident };
  }, [token, signOut]);
  return (
    <AuthContext value={value}>
      <App />
    </AuthContext>
  );
}

/** Clerk mode: a fresh, tab-specific token is fetched for every request; cookies are never relied on. */
function ClerkBridge() {
  const { isLoaded, isSignedIn, getToken, signOut, userId, orgId } = useAuth();
  const ref = useRef({ isSignedIn, getToken });
  ref.current = { isSignedIn, getToken };
  useLayoutEffect(() => setTokenProvider(async () => (ref.current.isSignedIn ? await ref.current.getToken() : null)), []);
  const value = useMemo<AuthValue>(
    () => ({ mode: 'clerk', signedIn: !!isSignedIn, identityKey: `${userId ?? ''}|${orgId ?? ''}`, signOut: () => void signOut({ redirectUrl: '/#/signin' }) }),
    [isSignedIn, userId, orgId, signOut],
  );
  if (!isLoaded) return <Splash />;
  return (
    <AuthContext value={value}>
      <App />
    </AuthContext>
  );
}

function Boot() {
  const [disc, setDisc] = useState<Discovery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    discovery().then(setDisc, (e) => setError(String(e?.message ?? e)));
  }, []);
  useEffect(load, [load]);

  if (error)
    return (
      <Splash>
        <StateBox title="Service unreachable" message={`Could not load the service configuration (${error}). Retry shortly.`}>
          <Button variant="outline" onClick={load}>Retry</Button>
        </StateBox>
      </Splash>
    );
  if (!disc) return <Splash />;
  const d = disc.dashboard;
  if (d.devAuth) return <DevAuth />;
  if (d.clerkPublishableKey)
    return (
      <ClerkProvider publishableKey={d.clerkPublishableKey} appearance={clerkAppearance} afterSignOutUrl="/#/signin">
        <ClerkBridge />
      </ClerkProvider>
    );
  return (
    <Splash>
      <StateBox title="Sign-in is not configured" message="This deployment has neither Clerk keys nor development sign-in enabled." />
    </Splash>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boot />
  </StrictMode>,
);
