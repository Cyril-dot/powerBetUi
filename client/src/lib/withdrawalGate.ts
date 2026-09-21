// =============================================================================
// withdrawalGate.ts — Super Bet withdrawal gate state manager
//
// All progress is stored permanently in localStorage per user account so it
// survives page refreshes, tab closes, and app restarts.
//
// GATE STAGES (in order — each must be completed before the next is shown):
//   0  blocked   — user has never won a settled bet; gate is entirely hidden
//   1  deposit   — user won; a GHS 500 deposit and GHS 2,000 total stake are required
//   2  unlocked  — all done; withdrawal form is available
//
// The old activation-fee stage and the KYC/ID-verification stage have both
// been removed entirely. The deposit requirement is the ONLY gate now: a
// ONE-TIME single deposit reaching the target — not a running cumulative
// total across several deposits like an earlier version of this gate.
//
// Country rules:
//   Ghana   — one-time deposit GHS 500 and total stake GHS 2,000 | min withdrawal GHS 350
//   Nigeria — one-time deposit NGN 73,200 and scaled total stake   | min withdrawal NGN 44,000
//   (NG's figure wasn't given explicitly — it's scaled from GH's the same
//   way the old per-deposit amounts were. Adjust
//   COUNTRY_CONFIGS.NG.qualifyingDepositAmount directly if a different NGN
//   figure applies.)
// =============================================================================

export type GateStage = "blocked" | "deposit" | "unlocked";

export interface CountryConfig {
  currency: string;
  currencyCode: string;
  /** A single deposit of at least this amount is required before withdrawal. */
  qualifyingDepositAmount: number;
  /** Cumulative stake required before withdrawal. */
  qualifyingStakeAmount: number;
  minDeposit: number;      // minimum first deposit to open account
  minStake: number;
  minWithdrawal: number;
}

export const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  GH: {
    currency: "GHS",
    currencyCode: "GHS",
    qualifyingDepositAmount: 500,
    qualifyingStakeAmount: 2000,
    minDeposit: 350,
    minStake: 100,
    minWithdrawal: 350,
  },
  NG: {
    currency: "NGN",
    currencyCode: "NGN",
    qualifyingDepositAmount: 73200,
    qualifyingStakeAmount: 292800,
    minDeposit: 44000,
    minStake: 13000,
    minWithdrawal: 44000,
  },
};

export const DEFAULT_CONFIG = COUNTRY_CONFIGS.GH;

export interface GateState {
  /** Country code: "GH" | "NG" */
  country: string;
  /** Current gate stage */
  stage: GateStage;
  /** Has the user won at least one settled bet? */
  hasWon: boolean;
  /** The largest single deposit seen so far — compared against the
   * country's qualifyingDepositAmount to decide whether the gate opens. */
  bestSingleDeposit: number;
  /** Cumulative stake detected from the user's bet history. */
  totalStake: number;
  /** ISO timestamps of each deposit check that moved the total forward. */
  depositTimestamps: string[];
  /** ISO timestamp when gate was last updated */
  updatedAt: string;
}

const STORAGE_KEY_PREFIX = "wb_gate_";

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

function now(): string {
  return new Date().toISOString();
}

function defaultState(country: string): GateState {
  return {
    country,
    stage: "blocked",
    hasWon: false,
    bestSingleDeposit: 0,
    totalStake: 0,
    depositTimestamps: [],
    updatedAt: now(),
  };
}

/** Read persisted gate state for a user. Returns a default if nothing stored. */
export function readGateState(userId: string, country = "GH"): GateState {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return defaultState(country);
    const parsed = JSON.parse(raw) as Partial<GateState>;
    // Merge with defaults so new fields added later don't break old saves
    const merged = {
      ...defaultState(parsed.country ?? country),
      ...parsed,
    };
    return { ...merged, stage: deriveStage(merged) };
  } catch {
    return defaultState(country);
  }
}

/** Write gate state to localStorage. */
function writeGateState(userId: string, state: GateState): GateState {
  const next: GateState = { ...state, updatedAt: now() };
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // localStorage may be full in some environments — fail silently
  }
  return next;
}

/** Compute the correct stage from the raw fields. */
export function deriveStage(state: GateState): GateStage {
  if (!state.hasWon) return "blocked";
  const cfg = COUNTRY_CONFIGS[state.country] ?? DEFAULT_CONFIG;
  if (state.bestSingleDeposit < cfg.qualifyingDepositAmount) return "deposit";
  if (state.totalStake < cfg.qualifyingStakeAmount) return "deposit";
  return "unlocked";
}

/** Sync the stage field and persist. Always call this after mutating state. */
function syncAndSave(userId: string, state: GateState): GateState {
  const next = { ...state, stage: deriveStage(state) };
  return writeGateState(userId, next);
}

// ---------------------------------------------------------------------------
// Public mutation helpers
// ---------------------------------------------------------------------------

/**
 * Called when a bet settles as WON. Advances the gate from "blocked" → "deposit".
 * Safe to call multiple times.
 */
export function markBetWon(userId: string, country = "GH"): GateState {
  const state = readGateState(userId, country);
  if (state.hasWon) return state; // already triggered
  return syncAndSave(userId, { ...state, hasWon: true, country });
}

/**
 * Syncs the tracked best-single-deposit against the largest individual
 * deposit seen in a fresh fetch from the transactions API — never lets it
 * go backwards. Once a single deposit reaches the country's target, the
 * gate advances to "unlocked".
 */
export function syncBestSingleDeposit(userId: string, largestSingleDeposit: number, timestamp?: string): GateState {
  const state = readGateState(userId);
  if (largestSingleDeposit <= state.bestSingleDeposit) return state; // nothing new
  const next: GateState = {
    ...state,
    bestSingleDeposit: largestSingleDeposit,
    depositTimestamps: [...state.depositTimestamps, timestamp ?? now()],
  };
  return syncAndSave(userId, next);
}
/** Sync cumulative stake from the user's bet history without allowing it to decrease. */
export function syncTotalStake(userId: string, totalStake: number): GateState {
  const state = readGateState(userId);
  if (totalStake <= state.totalStake) return state;
  return syncAndSave(userId, { ...state, totalStake });
}

/**
 * Hard-reset the gate for a user (useful for testing / admin override).
 */
export function resetGate(userId: string, country = "GH"): GateState {
  const fresh = defaultState(country);
  return writeGateState(userId, { ...fresh, stage: "blocked" });
}

/**
 * Get the CountryConfig for a gate state.
 */
export function configFor(state: GateState): CountryConfig {
  return COUNTRY_CONFIGS[state.country] ?? DEFAULT_CONFIG;
}

/**
 * Human-readable currency formatter.
 */
export function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
