import { defineConfig } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const stateDirectory = `.wrangler/e2e-${randomUUID()}`;

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure' },
  webServer: [
    {
      command: `npm run build && npx wrangler d1 migrations apply DB --local --persist-to ${stateDirectory} && npx wrangler dev --local --ip 127.0.0.1 --port 8788 --persist-to ${stateDirectory}`,
      url: 'http://127.0.0.1:8788/api/leaderboard',
      timeout: 120000,
      env: { WRANGLER_SEND_METRICS: 'false' },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      env: { COMMUNITY_API_ORIGIN: 'http://127.0.0.1:8788' },
    },
  ],
});
