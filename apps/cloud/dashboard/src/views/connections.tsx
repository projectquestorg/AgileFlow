import { useParams, useSearchParams } from 'react-router-dom';
import { ConnectionCapabilities, Connections } from '@/views/admin';

/**
 * `#/connections` lists connections; `#/connections/<id>` manages one connection's capabilities on its
 * own page (no dialog). `?grant=<capability>` comes from a CAPABILITY_REQUIRED error and is only shown
 * as a hint: nothing is preselected or granted automatically.
 */
export function ConnectionsPage() {
  const { cid } = useParams();
  const [params] = useSearchParams();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-semibold text-2xl">{cid ? 'Connection' : 'Connections'}</h1>
        <p className="text-muted-foreground text-sm">Agents and CLIs signed in to this workspace. New connections can only read until their owner grants more.</p>
      </div>
      {cid ? <ConnectionCapabilities connectionId={cid} requested={params.get('grant') ?? undefined} /> : <Connections />}
    </div>
  );
}
