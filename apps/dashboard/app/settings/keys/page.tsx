import { ApiKeysManager } from "@/components/settings/ApiKeysManager";

export default function ApiKeysPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage API keys for WebSocket authentication. Keys are hashed and cannot be viewed after creation.
        </p>
      </div>
      <ApiKeysManager />
    </div>
  );
}
