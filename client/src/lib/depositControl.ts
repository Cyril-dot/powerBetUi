/* Ghana deposit on/off switch — FRONTEND ONLY (owner order 2026-11-05).
   The switch lives in this browser's localStorage: the super-admin
   Deposit control page writes it, the deposit page reads it. There is
   no shared store behind it — flipping it here changes deposits on
   THIS device/browser only. Players on their own phones keep whatever
   the app default says until that default is changed and pushed.
   Default is OPEN (owner order 2026-11-06: deposits unpaused for
   everyone). A stored per-browser choice still wins where one was
   flipped — the super-admin switch can pause again from any device.
   AUTOMATIC CLEAR (owner order 2026-11-06): any stored pause written
   before the unpause (2026-11-06 00:00 UTC) is stale — it is deleted
   on read and the default (open) applies, so every browser that held
   the old pause opens deposits on its next load, with nobody having
   to tap anything. A pause flipped after the unpause keeps working. */

const KEY = "playbet_ghana_deposits_paused";
const EVENT = "playbet:deposits-pause-changed";
/* Every pause stored before this moment belongs to the 2026-11-05
   pause era and is auto-cleared on read. */
const UNPAUSE_CUTOFF_ISO = "2026-11-06T00:00:00.000Z";

export const GHANA_DEPOSITS_DEFAULT_PAUSED = false;

function isStalePause(updatedAt: unknown): boolean {
  if (typeof updatedAt !== "string") return true; // no timestamp = pause-era value
  const t = new Date(updatedAt).getTime();
  return !Number.isFinite(t) || t < new Date(UNPAUSE_CUTOFF_ISO).getTime();
}

export function readGhanaDepositsPaused(): boolean {
  if (typeof window === "undefined") return GHANA_DEPOSITS_DEFAULT_PAUSED;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return GHANA_DEPOSITS_DEFAULT_PAUSED;
    try {
      const parsed = JSON.parse(raw) as { paused?: unknown; updatedAt?: unknown };
      if (typeof parsed?.paused === "boolean") {
        if (isStalePause(parsed.updatedAt)) {
          // Automatic clear: the old pause is gone, deposits open.
          window.localStorage.removeItem(KEY);
          return GHANA_DEPOSITS_DEFAULT_PAUSED;
        }
        return parsed.paused;
      }
    } catch {
      /* legacy plain "1" / "0" value — pause-era, auto-clear it */
    }
    window.localStorage.removeItem(KEY);
    return GHANA_DEPOSITS_DEFAULT_PAUSED;
  } catch {
    return GHANA_DEPOSITS_DEFAULT_PAUSED;
  }
}

export function readGhanaDepositsPausedUpdatedAt(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "") as { updatedAt?: unknown };
    if (typeof parsed?.updatedAt !== "string" || isStalePause(parsed.updatedAt)) return null;
    return parsed.updatedAt;
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
