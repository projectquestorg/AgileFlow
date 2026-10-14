import { RouterLink } from "@/components/router-link";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createHashRouter, Navigate, Outlet, RouterProvider, useBlocker, useLocation, useParams } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AppShell } from '@/components/app-shell';
import { DashboardSkeleton } from '@/components/dashboard-skeleton';
import { ErrorState, Notice, StateBox } from '@/components/common';
import { api, ApiError, enc, get, onUnauthorized } from '@/lib/api';
import { AppContext, ProjectContext, useApp, useAuthValue, type AppValue, type Me, type ProjectValue } from '@/lib/app-context';
import { EXPIRED_KEY, RETURN_KEY, TOKEN_KEY } from '@/lib/auth-keys';
import { SignInView, NeedsOrganization } from '@/views/signin';
import { Home } from '@/views/home';
import { Overview } from '@/views/overview';
import { BoardView } from '@/views/board';
import { WorkList, Decisions } from '@/views/work-list';
import { WorkDetail } from '@/views/work-detail';
import { DocView } from '@/views/docs';
import { AgentsView } from '@/views/agents';
import { NotesView } from '@/views/notes';
import { ControlsView } from '@/views/controls';
import { ApprovalsView } from '@/views/approvals';
import { AdminView } from '@/views/admin';
import { ImportView } from '@/views/import';
import { ConnectView } from '@/views/connect';
import { ConnectionsPage } from '@/views/connections';

const POLL_MS = 4000;

const currentPath = () => (location.hash.replace(/^#/, '') || '/').split('?')[0] || '/';

// ------------------------------------------------------------------ layouts

function RootLayout() {
  const auth = useAuthValue();
  const { pathname } = useLocation();
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const dirty = useRef(new Map<string, boolean>());
  const [live, setLive] = useState('');

  const reloadMe = useCallback(async () => {
    const m = await get<Me>('/api/me');
    setMe(m);
    setMeError(null);
  }, []);

  useEffect(() => {
    if (!auth.signedIn) return;
    setMe(null);
    setMeError(null);
    reloadMe().catch(setMeError);
  }, [auth.identityKey, auth.signedIn, reloadMe]);

  const setDirty = useCallback((key: string, d: boolean) => {
    if (d) dirty.current.set(key, true);
    else dirty.current.delete(key);
  }, []);
  const isDirty = useCallback(() => dirty.current.size > 0, []);
  const announce = useCallback((msg: string) => {
    setLive('');
    setTimeout(() => setLive(msg), 30);
  }, []);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Unsaved edits: confirm before in-app navigation and before unload.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => isDirty() && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (isDirty()) e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [isDirty]);

  // Move focus to the main region on navigation (screen readers, keyboard users).
  useEffect(() => {
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [pathname]);

  const value = useMemo<AppValue | null>(() => (me ? { me, reloadMe, tick, refresh, setDirty, isDirty, announce } : null), [me, reloadMe, tick, refresh, setDirty, isDirty, announce]);

  if (!auth.signedIn) {
    if (pathname !== '/signin') sessionStorage.setItem(RETURN_KEY, pathname);
    return <Navigate to="/signin" replace />;
  }
  if (!value) {
    return (
      <div className="flex min-h-svh flex-col gap-6 p-6">
        {meError ? <ErrorState error={meError} retry={() => reloadMe().catch(setMeError)} /> : <DashboardSkeleton />}
      </div>
    );
  }
  return (
    <AppContext value={value}>
      <AppShell>
        {value.me.needsOrganization && pathname !== '/' ? <NeedsOrganization /> : <Outlet />}
      </AppShell>
      <div aria-live="polite" role="status" className="sr-only">
        {live}
      </div>
      <AlertDialog open={blocker.state === 'blocked'} onOpenChange={(o) => !o && blocker.state === 'blocked' && blocker.reset()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave with unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>You have unsaved edits on this page. Leaving discards them.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.state === 'blocked' && blocker.reset()}>Stay</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                dirty.current.clear();
                if (blocker.state === 'blocked') blocker.proceed();
              }}
            >
              Leave page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppContext>
  );
}

function ProjectLayout() {
  const { pid = '' } = useParams();
  const app = useApp();
  const { me, reloadMe, refresh, isDirty } = app;
  const project = me.projects.find((p) => p.id === pid);
  const [banner, setBanner] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setBanner(false), [pathname, app.tick]);

  // Freshness: long-poll the change feed (the server wakes it on outbox delivery);
  // refresh in place unless the user is mid-edit. Falls back to a pause between tries on errors or a hidden tab.
  useEffect(() => {
    if (!project) return;
    let seq: number | null = null;
    let stopped = false;
    const pause = () => new Promise((r) => setTimeout(r, POLL_MS));
    const loop = async () => {
      while (!stopped) {
        if (document.visibilityState !== 'visible') {
          await pause();
          continue;
        }
        try {
          const q = seq === null ? '' : `?since=${seq}&wait=20`;
          const { latestSeq } = (await api('GET', `/api/projects/${enc(pid)}/changes${q}`)).data;
          if (stopped) return;
          if (seq === null) seq = latestSeq;
          else if (latestSeq > seq) {
            seq = latestSeq;
            const el = document.activeElement;
            const busy = isDirty() || document.querySelector('[data-pending="true"], [data-dragging="true"]') || (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT'));
            if (busy) setBanner(true);
            else refresh();
          }
        } catch (err) {
          if (err instanceof ApiError && (err.code === 'FORBIDDEN' || err.code === 'NOT_FOUND')) {
            stopped = true;
            reloadMe().catch(() => {});
            return;
          }
          await pause();
        }
      }
    };
    void loop();
    return () => {
      stopped = true;
    };
  }, [pid, !!project, isDirty, refresh, reloadMe]);

  const value = useMemo<ProjectValue | null>(
    () => (project ? { pid, project, isAdmin: project.role === 'admin', canWrite: project.role === 'admin' || project.role === 'editor' } : null),
    [pid, project],
  );

  if (!value) {
    return (
      <StateBox title="No access to this project" message="The project does not exist, was deleted, or you no longer have access (your membership or project grant may have been removed).">
        <Button variant="outline" render={<RouterLink href="#/" />} nativeButton={false}>
          Your projects
        </Button>
      </StateBox>
    );
  }
  return (
    <ProjectContext value={value}>
      {banner ? (
        <div className="mb-4">
          <Notice
            role="status"
            title="This project changed elsewhere."
            action={
              <Button size="sm" variant="outline" onClick={refresh}>
                Refresh view
              </Button>
            }
          >
            Your unsaved edits are kept until you refresh.
          </Notice>
        </div>
      ) : null}
      <Outlet />
    </ProjectContext>
  );
}

function NotFound() {
  const { pathname } = useLocation();
  return (
    <StateBox title="Page not found" message={`There is no page at ${pathname}.`}>
      <Button variant="outline" render={<RouterLink href="#/" />} nativeButton={false}>
        Projects
      </Button>
    </StateBox>
  );
}

// ------------------------------------------------------------------ router

const router = createHashRouter([
  { path: '/signin', element: <SignInView /> },
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'connect', element: <ConnectView /> },
      { path: 'organizations', element: <NeedsOrganization /> },
      { path: 'connections', element: <ConnectionsPage /> },
      { path: 'connections/:cid', element: <ConnectionsPage /> },
      {
        path: 'p/:pid',
        element: <ProjectLayout />,
        children: [
          { index: true, element: <Overview /> },
          { path: 'overview', element: <Overview /> },
          { path: 'board', element: <BoardView /> },
          { path: 'work', element: <WorkList /> },
          { path: 'work/:wid', element: <WorkDetail /> },
          { path: 'decisions', element: <Decisions /> },
          { path: 'docs/:which', element: <DocView /> },
          { path: 'agents', element: <AgentsView /> },
          { path: 'notes', element: <NotesView /> },
          { path: 'controls', element: <ControlsView /> },
          { path: 'approvals', element: <ApprovalsView /> },
          { path: 'approvals/:aid', element: <ApprovalsView /> },
          { path: 'admin', element: <AdminView /> },
          { path: 'import', element: <ImportView /> },
          { path: 'import/:jobId', element: <ImportView /> },
          { path: 'connect', element: <ConnectView /> },
          { path: '*', element: <NotFound /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

// A 401 from any request sends the user to sign in and back to where they were.
onUnauthorized(() => {
  const cur = currentPath();
  if (cur === '/signin') return;
  sessionStorage.setItem(RETURN_KEY, cur);
  sessionStorage.setItem(EXPIRED_KEY, '1');
  if (sessionStorage.getItem(TOKEN_KEY)) {
    sessionStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new Event('af-token'));
  }
  void router.navigate('/signin');
});

export default function App() {
  return (
    <TooltipProvider>
      <RouterProvider router={router} />
      <Toaster theme="dark" position="bottom-right" />
    </TooltipProvider>
  );
}
