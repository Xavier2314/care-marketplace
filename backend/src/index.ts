import { createApp } from './app';
import { config } from './lib/config';
import { sendDueReminders, warnExpiringCredentials } from './services/reminders';

createApp().listen(config.port, () => console.log(`Care Marketplace API on http://localhost:${config.port}`));

// Background jobs. A single instance is assumed for the pilot; move to a proper
// scheduler (or a locking job queue) before running multiple API instances.
const runJobs = () =>
  Promise.all([sendDueReminders(), warnExpiringCredentials()]).catch((err) => console.error('Background job failed', err));
setInterval(runJobs, 5 * 60_000);
runJobs();
