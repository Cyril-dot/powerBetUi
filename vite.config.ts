import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

// The deployment version, written by scripts/write-deployment-version.mjs
// before this build runs (same file the poller reads at /app-version.json).
// Inlined into the bundle so the running app knows its own version and
// can tell when the server has a newer one. Falls back to "dev" for
// local `vite` runs where the script never ran.
let appVersion = "dev";
try {
  const versionFile = JSON.parse(
    fs.readFileSync(path.resolve(import.meta.dirname, "client", "public", "app-version.json"), "utf8"),
  ) as { version?: string };
  if (versionFile.version) appVersion = versionFile.version;
} catch {
  // No version file yet (first local run) — the app simply never reloads.
}

// Note: this config intentionally has no Manus-platform-specific plugins
// (debug log collector, storage proxy, Manus runtime). Those only work
// inside Manus's own hosted sandbox and would 404/500 on any other machine.

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react(), tailwindcss()],
  envPrefix: ["VITE_", "IMGBB_"],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: false,
    host: true,
    // Allow access from localhost and any LAN address (e.g. 192.168.x.x)
    // when using `--host`. Restrict this list if you deploy behind a
    // fixed domain.
    allowedHosts: true,
  },
});
