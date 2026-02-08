import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { randomBytes, createHash } from "crypto";

// GET /api/keys — list user's API keys (never returns raw key)
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, project_id, last_used_at, expires_at, revoked_at, created_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ keys: data });
}

// POST /api/keys — generate a new API key
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, project_id, expires_in_days } = body as {
    name: string;
    project_id?: string;
    expires_in_days?: number;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Generate the key: af_ + 32 random hex bytes
  const rawKey = `af_${randomBytes(32).toString("hex")}`;
  const keyPrefix = rawKey.slice(0, 11);
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const expires_at = expires_in_days
    ? new Date(Date.now() + expires_in_days * 86400000).toISOString()
    : null;

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      user_id: user.id,
      name: name.trim(),
      key_prefix: keyPrefix,
      key_hash: keyHash,
      project_id: project_id || null,
      expires_at,
    })
    .select("id, name, key_prefix, project_id, expires_at, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return full key ONCE — it's never stored or retrievable again
  return NextResponse.json({ key: { ...data, raw_key: rawKey } }, { status: 201 });
}
