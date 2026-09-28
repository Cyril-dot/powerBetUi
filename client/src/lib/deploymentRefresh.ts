const CHECK_INTERVAL_MS = 60_000;

export function startDeploymentRefresh(): () => void {
  if (typeof window === "undefined") return () => undefined;

  let currentVersion = "";
  let reloading = false;

  const check = async () => {
    try {
      const response = await fetch(`/app-version.json?check=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { version?: string };
      if (!payload.version) return;
      if (!currentVersion) {
        currentVersion = payload.version;
        return;
      }
      if (payload.version !== currentVersion && !reloading) {
        reloading = true;
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
