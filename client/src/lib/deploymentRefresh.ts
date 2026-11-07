// Automatic update: when the server is serving a newer build than the
// bundle this tab is running, reload so the player gets the new code.
//
// How it works: the build inlines the running version into the bundle
// (__APP_VERSION__, written by scripts/write-deployment-version.mjs and
// read by vite.config.ts), and the same script writes the same value to
// /app-version.json. This check compares the two — so a tab that landed
// on a stale bundle reloads on entry, not only when a deploy happens
// while the tab is already open.
//
// The old version only learned the server's version on its first check
// and never knew what the running bundle was, so a stale bundle could
// sit there forever. That is the bug this replaces.
const CHECK_INTERVAL_MS = 60_000;

export function startDeploymentRefresh(): () => void {
  if (typeof window === "undefined") return () => undefined;

  // "dev" means a local run with no version baked in — never reload there.
  const runningVersion = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "";
  if (!runningVersion || runningVersion === "dev" || runningVersion === "local") {
    return () => undefined;
  }

  let reloading = false;

  // Safety valve: never reload for a version change more than once a
  // minute in one tab. In production the first reload always lands the
  // new bundle (same version in the bundle and the version file), so a
  // second reload inside the window means something is misconfigured
  // upstream — looping would be worse than waiting.
  const RELOAD_COOLDOWN_KEY = "powerbet_version_reload_v1";
  const RELOAD_COOLDOWN_MS = 60_000;
  const recentlyReloaded = () => {
    try {
      const last = Number(window.sessionStorage.getItem(RELOAD_COOLDOWN_KEY) || 0);
      return Date.now() - last < RELOAD_COOLDOWN_MS;
    } catch {
      return false;
    }
  };
  const markReloaded = () => {
    try { window.sessionStorage.setItem(RELOAD_COOLDOWN_KEY, String(Date.now())); } catch {
      // Ignore restricted storage.
    }
  };

  const check = async () => {
    if (reloading) return;
    try {
      const response = await fetch(`/app-version.json?check=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { version?: string };
      if (!payload.version) return;
      if (payload.version !== runningVersion && !recentlyReloaded()) {
        reloading = true;
        markReloaded();
        window.location.reload();
      }
    } catch {
      // A temporary check failure should never interrupt the application.
    }
  };

  void check();
  const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
  return () => window.clearInterval(timer);
}
