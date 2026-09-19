const PRESERVED_LOCAL_KEYS = new Set([
  "accessToken",
  "refreshToken",
  "theme",
  "powerbet_prefs_v1",
  "powerbet_favorites_v1",
  "powerbet_rg_limits_v1",
  "sidebar_state",
]);

const TRANSIENT_LOCAL_KEYS = new Set([
  "powerbet_read_notices_v1",
  "powerbet_hidden_tickets",
  "powerbet_recent_searches_v1",
  "admin_logo_usage_v1",
  "admin_logo_assignments_v1",
]);

/**
 * Clears browser-held stale application data on every document load.
 * Authentication, preferences, favorites, and responsible-gaming limits are
 * deliberately preserved. Match data is never persisted locally by this app;
 * API requests are separately marked no-store in api.ts.
 */
export function clearStaleClientData(): void {
  if (typeof window === "undefined") return;

  try {
    for (const key of TRANSIENT_LOCAL_KEYS) window.localStorage.removeItem(key);
    for (let i = window.sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = window.sessionStorage.key(i);
      if (key && !PRESERVED_LOCAL_KEYS.has(key)) window.sessionStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
  }

  // These operations are asynchronous browser APIs. Start them before React
  // mounts so stale service-worker/cache entries are removed during startup.
  void (async () => {
    try {
      if ("caches" in window) {
        const cacheNames = await window.caches.keys();
        await Promise.all(cacheNames.map((name) => window.caches.delete(name)));
      }
    } catch {
      // Ignore unsupported or restricted Cache Storage implementations.
    }

    try {
      const registrations = await navigator.serviceWorker?.getRegistrations?.() ?? [];
      await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch {
      // Ignore browsers without service-worker access.
    }

    try {
      const databases = await indexedDB.databases?.() ?? [];
      await Promise.all(databases.map((database) => {
        if (!database.name) return Promise.resolve();
        return new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase(database.name!);
          request.onsuccess = request.onerror = request.onblocked = () => resolve();
        });
      }));
    } catch {
      // indexedDB.databases is not available in every browser.
    }
  })();
}
