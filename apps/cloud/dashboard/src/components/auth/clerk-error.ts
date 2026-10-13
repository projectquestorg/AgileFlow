/** Readable message from a Clerk API error, without exposing internals. */
export function clerkMessage(err: unknown): string {
	const e = err as { errors?: Array<{ longMessage?: string; message?: string }>; message?: string };
	return e?.errors?.[0]?.longMessage || e?.errors?.[0]?.message || e?.message || "Something went wrong. Try again.";
}

export function clerkCode(err: unknown): string | undefined {
	return (err as { errors?: Array<{ code?: string }> })?.errors?.[0]?.code;
}
