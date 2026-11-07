import { mkdir, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";

// Writes the deployment version BEFORE vite build runs, so that:
//  - vite copies it into dist as /app-version.json (served to the
//    deployment poller), and
//  - vite.config.ts can read the SAME file and inline the version into
//    the bundle (see __APP_VERSION__). One writer, one value — the
//    running bundle and the served file can never disagree.
// The build script and vercel.json both run this script first.
const outputDir = new URL("../client/public/", import.meta.url);
const version =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.RAILWAY_GIT_COMMIT_SHA ||
  process.env.SOURCE_VERSION ||
  (() => {
    try { return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(); }
    catch { return "local"; }
  })();

await mkdir(outputDir, { recursive: true });
await writeFile(
  new URL("app-version.json", outputDir),
  JSON.stringify({ version, builtAt: new Date().toISOString() }) + "\n",
  "utf8",
);
console.log(`[build] deployment version ${version}`);
