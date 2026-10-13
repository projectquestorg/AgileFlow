import { createContext, use } from 'react';

export type AuthMode = 'dev' | 'clerk';

export interface DevIdentity {
  userId: string;
  name?: string;
  orgId?: string;
  orgName?: string;
  role?: string;
}

/** Authentication state shared by the dev and Clerk providers. */
export interface AuthValue {
  mode: AuthMode;
  signedIn: boolean;
  /** Changes whenever the signed-in user or active organization changes. */
  identityKey: string;
  signOut: () => void;
  devIdentity?: DevIdentity | null;
}

export const AuthContext = createContext<AuthValue | null>(null);
export function useAuthValue(): AuthValue {
  const v = use(AuthContext);
  if (!v) throw new Error('AuthContext missing');
  return v;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  role: 'admin' | 'editor' | 'viewer';
  clientWritesPaused: boolean;
  archived: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface Me {
  user: { id: string; role?: string };
  workspace: { id: string; name: string; orgId: string; policy: { requireStartApproval?: boolean; allowLifecycleOverride?: boolean } } | null;
  projects: Project[];
  deletedProjects?: Array<Project & { purgeAfter: string }>;
  needsOrganization?: boolean;
}

export interface AppValue {
  me: Me;
  reloadMe: () => Promise<void>;
  /** Bumped when views should refetch in place (polling, explicit refresh). */
  tick: number;
  refresh: () => void;
  setDirty: (key: string, dirty: boolean) => void;
  isDirty: () => boolean;
  announce: (msg: string) => void;
}

export const AppContext = createContext<AppValue | null>(null);
export function useApp(): AppValue {
  const v = use(AppContext);
  if (!v) throw new Error('AppContext missing');
  return v;
}

export interface ProjectValue {
  pid: string;
  project: Project;
  isAdmin: boolean;
  canWrite: boolean;
}

export const ProjectContext = createContext<ProjectValue | null>(null);
export function useProject(): ProjectValue {
  const v = use(ProjectContext);
  if (!v) throw new Error('ProjectContext missing');
  return v;
}
export function useMaybeProject(): ProjectValue | null {
  return use(ProjectContext);
}
