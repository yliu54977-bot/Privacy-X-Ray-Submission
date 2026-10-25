import { defineConfig } from '@playwright/test';
import development from './playwright.config';
export default defineConfig({
  ...development,
  grep: /manual workflow|zero-mask|review guards|University tuition|Customer Support order|live Universal review|browser-local QR|locally decoded QR|unknown QR/,
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
});
