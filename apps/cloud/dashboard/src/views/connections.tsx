import { useParams, useSearchParams } from 'react-router-dom';
import { Connections } from '@/views/admin';

/**
 * Connections and their capabilities. `#/connections/<id>?grant=<capability>` is the link the service
 * returns with CAPABILITY_REQUIRED: it opens that connection's capabilities with the request preselected
 * (only the connection's own user can actually grant it).
 */
export function ConnectionsPage() {
  const { cid } = useParams();
  const [params] = useSearchParams();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-semibold text-2xl">Connections</h1>
        <p className="text-muted-foreground text-sm">Agents and CLIs signed in to this workspace. New connections can only read until you grant more.</p>
      </div>
      <Connections focus={cid ? { id: cid, grant: params.get('grant') ?? undefined } : undefined} />
    </div>
  );
}
