import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

// Projects past the 30-day deletion recovery window (batched; reschedules itself while more remains).
crons.daily('purge deleted projects', { hourUTC: 3, minuteUTC: 17 }, internal.domain.admin.purgeExpired, {});
// Expired idempotency receipts, preview uploads, enrollments, and approvals.
crons.hourly('cleanup expired records', { minuteUTC: 41 }, internal.domain.admin.cleanupExpired, {});

export default crons;
