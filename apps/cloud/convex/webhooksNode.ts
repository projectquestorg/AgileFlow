'use node';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import { verifySvix } from './lib/svix';

/** Clerk webhooks: Svix signature over the raw body, then durable dedupe and mirror updates. */
export const handleClerk = internalAction({
  args: { raw: v.string(), id: v.string(), timestamp: v.string(), signature: v.string() },
  handler: async (ctx, a): Promise<{ status: number; body: unknown }> => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) return { status: 404, body: { error: 'webhooks not configured' } };
    if (!verifySvix(secret, { id: a.id, timestamp: a.timestamp, signature: a.signature }, a.raw)) return { status: 400, body: { error: 'invalid signature' } };
    try {
      return { status: 200, body: await ctx.runMutation(internal.webhooks.applyClerkEvent, { eventId: a.id, raw: a.raw }) };
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', msg: 'webhook failed', event: a.id, error: (err as Error).message.slice(0, 300) }));
      return { status: 500, body: { error: 'processing failed' } };
    }
  },
});
