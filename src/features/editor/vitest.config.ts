import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
/** B-only test configuration; leaves A's project configuration unchanged. */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/features/editor/**/*.test.{ts,tsx}"],
    clearMocks: true,
  },
});
