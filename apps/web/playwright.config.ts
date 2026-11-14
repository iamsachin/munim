import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const SERVER = 'http://127.0.0.1:8001';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: { baseURL: `http://localhost:${String(PORT)}` },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: [
    // Always a fresh production build, so the gate also proves the app builds.
    {
      command: `pnpm build && pnpm preview --port ${String(PORT)} --strictPort`,
      url: `http://localhost:${String(PORT)}`,
      env: { MUNIM_SERVER: SERVER },
      reuseExistingServer: false,
    },
    // The real server, on an empty database of its own, for real-server.spec.ts. Every other
    // spec answers the API itself and never reaches it. Needs the database: `pnpm db`.
    {
      command: '../server/e2e_server.sh',
      url: `${SERVER}/api/health`,
      reuseExistingServer: false,
    },
  ],
});
