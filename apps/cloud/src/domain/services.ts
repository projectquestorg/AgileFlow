import type { MembershipSource } from '../auth/membership';
import type { Db } from '../db/sql';
import { AdminService } from './admin';
import { CollabService } from './collab';
import { ControlsService } from './controls';
import { Core } from './core';
import { OutboxWorker } from './outbox';
import { PortabilityService } from './portability';
import { WorkService } from './work';

/** One shared domain behind the dashboard API, the CLI API, MCP, and the companion API. */
export class Services {
  readonly core: Core;
  readonly work: WorkService;
  readonly collab: CollabService;
  readonly controls: ControlsService;
  readonly admin: AdminService;
  readonly portability: PortabilityService;
  readonly outbox: OutboxWorker;

  constructor(opts: { db: Db; membership: MembershipSource; cursorSecret: string; now?: () => Date; membershipReadCacheMs?: number }) {
    this.core = new Core(opts);
    this.work = new WorkService(this.core);
    this.collab = new CollabService(this.core);
    this.controls = new ControlsService(this.core);
    this.admin = new AdminService(this.core);
    this.portability = new PortabilityService(this.core);
    this.outbox = new OutboxWorker(this.core);
  }
}
