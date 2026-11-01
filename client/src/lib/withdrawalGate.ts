// =============================================================================
// withdrawalGate.ts — PlayBet withdrawal gate state manager (owner spec,
// 2026-11-01). Fully frontend-based: progress lives permanently in the
// player's own browser (localStorage, per user id) and is never sent to the
// backend. Staff (admin / super-admin) bypass the gate entirely.
//
// Steps, in order — one stage is shown at a time, never the whole list:
//   1 KYC verification   — pay GHS 500
//   2 Activation payment — pay GHS 300
//   3 Activation payment — pay GHS 300 again
//   4 Final payment      — pay GHS 100
// After step 4, withdrawals unlock. Each step is a deposit made through the
// existing deposit centre and verified by exact amount (see WithdrawalGate).
// =============================================================================

export interface GateStep {
  key: string;
  title: string;
  amount: number;
  /** Distinct per step — the two GHS 300 steps must not share a key, so each
   *  payment is verified against its own payment-page timestamp. */
  purpose: string;
}

export const GATE_STEPS: GateStep[] = [
  { key: "kyc", title: "KYC verification", amount: 500, purpose: "gate_kyc" },
  { key: "act1", title: "Activation payment", amount: 300, purpose: "gate_act1" },
  { key: "act2", title: "Activation payment", amount: 300, purpose: "gate_act2" },
  { key: "final", title: "Final payment", amount: 100, purpose: "gate_final" },
];

export type GateStage = "kyc" | "act1" | "act2" | "final" | "unlocked";

export interface GateState {
  country: string;
  /** paid[i] = GATE_STEPS[i] verified. Steps must be completed in order. */
  paid: boolean[];
  /** Kept for TrophyCelebration compat; does not affect the gate stage. */
  hasWon: boolean;
  updatedAt: string;
}

const STORAGE_KEY_PREFIX = "wb_gate_";
const storageKey = (userId: string) => `${STORAGE_KEY_PREFIX}${userId}`;
const now = () => new Date().toISOString();

function defaultState(country = "GH"): GateState {
  return {
    country, paid: GATE_STEPS.map(() => false), hasWon: false, updatedAt: now(),
  };
}

/** Index of the current step, or GATE_STEPS.length when fully unlocked. */
export function currentStepIndex(state: GateState): number {
  const idx = state.paid.findIndex((p) => !p);
  return idx === -1 ? GATE_STEPS.length : idx;
}

export function stageOf(state: GateState): GateStage {
  const idx = currentStepIndex(state);
  return idx >= GATE_STEPS.length ? "unlocked" : (GATE_STEPS[idx].key as GateStage);
}

export function readGateState(userId: string, country = "GH"): GateState {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return defaultState(country);
    const parsed = JSON.parse(raw) as Partial<GateState>;
    const paid = GATE_STEPS.map((_, i) =>
      Array.isArray(parsed.paid) && parsed.paid[i] === true);
    return { ...defaultState(parsed.country ?? country), ...parsed, paid, updatedAt: now() };
  } catch {
    return defaultState(country);
  }
}

function writeGateState(userId: string, state: GateState): GateState {
  const next = { ...state, updatedAt: now() };
  try { localStorage.setItem(storageKey(userId), JSON.stringify(next)); } catch { /* storage is optional */ }
  return next;
}

export function markStepPaid(userId: string, index: number): GateState {
  const state = readGateState(userId);
  if (state.paid[index]) return state;
  const paid = state.paid.slice();
  paid[index] = true;
  return writeGateState(userId, { ...state, paid });
}

export function markBetWon(userId: string, country = "GH"): GateState {
  const state = readGateState(userId, country);
  if (state.hasWon) return state;
  return writeGateState(userId, { ...state, hasWon: true, country });
}

export function resetGate(userId: string, country = "GH"): GateState {
  return writeGateState(userId, defaultState(country));
}

/**
 * Loading-bar fill for the gate panel. The bar only appears once step 1
 * (GHS 500) is paid: almost full and active at 85%, then full at 100%
 * once step 2 (first GHS 300) is paid. It stays full through the lock,
 * the second GHS 300 and the GHS 100.
 */
export function barFillPercent(state: GateState): number {
  const done = state.paid.filter(Boolean).length;
  if (done <= 0) return 0;
  if (done === 1) return 85;
  return 100;
}

export function formatAmount(amount: number, currency = "GHS"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}
