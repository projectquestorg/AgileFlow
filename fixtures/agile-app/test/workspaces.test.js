import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMember, canAccess, createStore, createWorkspace, leaveWorkspace, PermissionError } from '../src/workspaces.js';

test('the creator owns a new workspace', () => {
  const store = createStore();
  const ws = createWorkspace(store, { name: '  Acme  ', ownerId: 'ada' });
  assert.equal(ws.name, 'Acme');
  assert.equal(ws.members.get('ada'), 'owner');
});

test('only owners add members', () => {
  const store = createStore();
  const ws = createWorkspace(store, { name: 'Acme', ownerId: 'ada' });
  addMember(store, ws.id, { actorId: 'ada', userId: 'bob' });
  assert.throws(() => addMember(store, ws.id, { actorId: 'bob', userId: 'eve' }), PermissionError);
});

test('a member can leave and loses access immediately', () => {
  const store = createStore();
  const ws = createWorkspace(store, { name: 'Acme', ownerId: 'ada' });
  addMember(store, ws.id, { actorId: 'ada', userId: 'bob' });
  leaveWorkspace(store, ws.id, 'bob');
  assert.equal(canAccess(store, ws.id, 'bob'), false);
});
