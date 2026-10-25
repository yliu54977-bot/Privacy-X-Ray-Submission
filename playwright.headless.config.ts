import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir: './tests', testMatch: 'face-headless.spec.ts', timeout: 120000,
 use: { baseURL: 'http://127.0.0.1:4189', browserName: 'chromium', launchOptions: { args: ['--disable-webgl'] } },
 webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4189', url: 'http://127.0.0.1:4189', reuseExistingServer: false },
});
