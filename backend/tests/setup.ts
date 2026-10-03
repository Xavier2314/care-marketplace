import { execSync } from 'child_process';
import { beforeAll } from 'vitest';

let migrated = false;
beforeAll(() => {
  if (migrated) return;
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', { env: process.env, stdio: 'ignore' });
  migrated = true;
});
