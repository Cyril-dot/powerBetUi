/* Ghana deposit on/off switch — FRONTEND ONLY (owner order 2026-11-05).
   The switch lives in this browser's localStorage: the super-admin
   Deposit control page writes it, the deposit page reads it. There is
   no shared store behind it — flipping it here changes deposits on
   THIS device/browser only. Players on their own phones keep whatever
   the app default says until that default is changed and pushed.
   Default is OPEN (owner order 2026-11-06: deposits unpaused for
   everyone). A stored per-browser choice still wins where one was
   flipped — the super-admin switch can pause again from any device. */

const KEY = "playbet_ghana_deposits_paused";
const EVENT = "playbet:deposits-pause-changed";

export const GHANA_DEPOSITS_DEFAULT_PAUSED = false;

export function readGhanaDepositsPaused(): boolean {
  if (typeof window === "undefined") return GHANA_DEPOSITS_DEFAULT_PAUSED;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return GHANA_DEPOSITS_DEFAULT_PAUSED;
    try {
      const parsed = JSON.parse(raw) as { paused?: unknown };
      if (typeof parsed?.paused === "boolean") return parsed.paused;
    } catch {
      /* legacy plain "1" / "0" value */
    }
    return raw === "1" || raw === "true";
  } catch {
    return GHANA_DEPOSITS_DEFAULT_PAUSED;
  }
}

export function readGhanaDepositsPausedUpdatedAt(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "") as { updatedAt?: unknown };
    return typeof parsed?.updatedAt === "string" ? parsed.updatedAt : null;
  } catch {
    return null;
  }
}

export function setGhanaDepositsPaused(paused: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ paused, updatedAt: new Date().toISOString() }));
  } catch {
    /* storage unavailable — the in-memory default still applies */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: paused }));
}

/* Fires the callback whenever the switch changes in this tab or another
   tab of the same browser. Returns an unsubscribe function. */
export function subscribeGhanaDepositsPaused(cb: (paused: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onCustom = (e: Event) => cb(Boolean((e as CustomEvent).detail));
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb(readGhanaDepositsPaused());
  };
  window.addEventListener(EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}
