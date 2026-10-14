/** Capability names and the OAuth scope each one needs (shared by the Postgres and Convex services). */
export type Capability = 'read' | 'notes:write' | 'work:write' | 'runs:write' | 'controls:request' | 'admin' | 'local:observe' | 'local:apply';

export const SCOPE_FOR: Record<Exclude<Capability, 'admin'>, string> = {
  read: 'agileflow:read',
  'notes:write': 'agileflow:notes:write',
  'work:write': 'agileflow:work:write',
  'runs:write': 'agileflow:runs:write',
  'controls:request': 'agileflow:controls:request',
  'local:observe': 'agileflow:local:observe',
  'local:apply': 'agileflow:local:apply',
};
