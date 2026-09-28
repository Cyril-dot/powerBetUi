import { mkdir, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";

const outputDir = new URL("../dist/public/", import.meta.url);
const version =
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
