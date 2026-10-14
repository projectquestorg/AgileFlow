import { z } from 'zod';
import type { Principal } from '../auth/verify';
import { AppError, ScopeError } from '../domain/errors';
import type { Services } from '../domain/services';
import { newId } from '../domain/util';
import { TOOL_BY_NAME, type ToolEnv } from './tools';

export interface ToolResult {
  ok: boolean;
  status: number;
  structured: Record<string, unknown>;
}

/** Scopes a tool call needs (for the HTTP insufficient_scope challenge). Unknown tools need nothing here. */
export function requiredScopes(name: string, args: unknown): string[] {
  const tool = TOOL_BY_NAME.get(name);
  return tool ? tool.scopes((args ?? {}) as Record<string, unknown>) : [];
}

/**
 * Validate and run one tool. Business failures become structured application
 * errors; ScopeError is rethrown so the transport answers with HTTP 403.
 */
export async function callTool(services: Services, principal: Principal, name: string, args: unknown, env: ToolEnv): Promise<ToolResult> {
  const tool = TOOL_BY_NAME.get(name);
  const correlationId = newId('req');
  if (!tool) return fail(new AppError('NOT_FOUND', `Unknown tool ${name}.`), correlationId);
  const parsed = tool.input.safeParse(args ?? {});
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
    return fail(new AppError('VALIDATION_ERROR', msg.slice(0, 1000)), correlationId);
  }
  try {
    const result = (await tool.run(services, principal, parsed.data, env)) as Record<string, unknown>;
    return { ok: true, status: 200, structured: { ok: true, ...result } };
  } catch (err) {
    if (err instanceof ScopeError) throw err;
    if (err instanceof AppError) return fail(err, correlationId);
    console.error(JSON.stringify({ level: 'error', msg: 'tool failed', tool: name, correlationId, error: (err as Error)?.message?.slice(0, 300) }));
    return fail(new AppError('UPSTREAM_UNAVAILABLE', 'The operation failed unexpectedly. Retry later.'), correlationId);
  }
}

function fail(err: AppError, correlationId: string): ToolResult {
  return { ok: false, status: err.status, structured: { ok: false, schemaVersion: 1, error: { ...err.toJSON(), correlationId } } };
}

export const toolInputJsonSchema = (name: string) => z.toJSONSchema(TOOL_BY_NAME.get(name)!.input);
