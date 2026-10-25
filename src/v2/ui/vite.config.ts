import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
/** Explicit opt-in build for B's isolated demo. The default v1 build config is unchanged. */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/v2-ui",
    rollupOptions: {
      input: { main: "index.html", universal: "universal.html" },
    },
  },
});
