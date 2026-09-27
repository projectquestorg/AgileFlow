/** In-memory workspaces: each has a name and members with a role. */
export class PermissionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PermissionError';
  }
}

export function createStore() {
  return { workspaces: new Map(), nextId: 1 };
}

export function createWorkspace(store, { name, ownerId }) {
  const id = `ws_${store.nextId++}`;
  const workspace = { id, name: name.trim(), members: new Map([[ownerId, 'owner']]) };
  store.workspaces.set(id, workspace);
  return workspace;
}

export function getWorkspace(store, id) {
  const workspace = store.workspaces.get(id);
  if (!workspace) throw new Error(`workspace ${id} not found`);
  return workspace;
}

export function addMember(store, workspaceId, { actorId, userId, role = 'member' }) {
  const workspace = getWorkspace(store, workspaceId);
  if (workspace.members.get(actorId) !== 'owner') throw new PermissionError('only owners can add members');
  workspace.members.set(userId, role);
  return workspace;
}

export function canAccess(store, workspaceId, userId) {
  return getWorkspace(store, workspaceId).members.has(userId);
}

/** A member leaves a workspace. */
export function leaveWorkspace(store, workspaceId, userId) {
  const workspace = getWorkspace(store, workspaceId);
  if (!workspace.members.has(userId)) throw new Error(`${userId} is not a member`);
  workspace.members.delete(userId);
  return workspace;
}
