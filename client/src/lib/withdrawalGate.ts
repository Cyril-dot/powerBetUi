// =============================================================================
// withdrawalGate.ts — Super Bet withdrawal gate state manager
//
// Ghana flow:
//   0 blocked    — user has not won a settled bet
//   1 deposit    — one GHS 300 deposit plus the existing total-stake requirement
//   2 kyc        — pay GHS 100 for KYC verification
//   3 activation — pay GHS 300 for MoMo/bank withdrawal activation
//   4 unlocked   — withdrawal form is available
//
// Gate progress is stored per user in localStorage. Payment completion is only
// recorded by the UI after the payment/transaction check succeeds.
// =============================================================================

export type GateStage = "blocked" | "deposit" | "kyc" | "activation" | "unlocked";

export interface CountryConfig {
  currency: string;
  currencyCode: string;
  qualifyingDepositAmount: number;
  qualifyingStakeAmount: number;
  kycPaymentAmount: number;
  activationPaymentAmount: number;
  minDeposit: number;
  minStake: number;
  minWithdrawal: number;
}

export const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  GH: {
    currency: "GHS", currencyCode: "GHS",
    qualifyingDepositAmount: 300,
    qualifyingStakeAmount: 2000,
    kycPaymentAmount: 100,
    activationPaymentAmount: 300,
    minDeposit: 300,
    minStake: 100,
    minWithdrawal: 350,
  },
  NG: {
    currency: "NGN", currencyCode: "NGN",
    qualifyingDepositAmount: 73200,
    qualifyingStakeAmount: 292800,
    kycPaymentAmount: 24400,
    activationPaymentAmount: 73200,
    minDeposit: 44000,
    minStake: 13000,
    minWithdrawal: 44000,
  },
};

export const DEFAULT_CONFIG = COUNTRY_CONFIGS.GH;

export interface GateState {
  country: string;
  stage: GateStage;
  hasWon: boolean;
  bestSingleDeposit: number;
  totalStake: number;
  kycPaid: boolean;
  activationPaid: boolean;
  depositTimestamps: string[];
  paymentTimestamps: string[];
  updatedAt: string;
}

const STORAGE_KEY_PREFIX = "wb_gate_";
const storageKey = (userId: string) => `${STORAGE_KEY_PREFIX}${userId}`;
const now = () => new Date().toISOString();

function defaultState(country: string): GateState {
  return {
    country, stage: "blocked", hasWon: false, bestSingleDeposit: 0, totalStake: 0,
    kycPaid: false, activationPaid: false, depositTimestamps: [], paymentTimestamps: [], updatedAt: now(),
  };
}

export function readGateState(userId: string, country = "GH"): GateState {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return defaultState(country);
    const parsed = JSON.parse(raw) as Partial<GateState>;
    const merged = { ...defaultState(parsed.country ?? country), ...parsed } as GateState;
    return { ...merged, stage: deriveStage(merged) };
  } catch {
    return defaultState(country);
  }
}

function writeGateState(userId: string, state: GateState): GateState {
  const next = { ...state, updatedAt: now() };
  try { localStorage.setItem(storageKey(userId), JSON.stringify(next)); } catch { /* storage is optional */ }
  return next;
}

export function deriveStage(state: GateState): GateStage {
  const cfg = COUNTRY_CONFIGS[state.country] ?? DEFAULT_CONFIG;
  if (state.bestSingleDeposit < cfg.qualifyingDepositAmount) return "deposit";
  if (!state.kycPaid) return "kyc";
  if (!state.activationPaid) return "activation";
  return "unlocked";
}

function syncAndSave(userId: string, state: GateState): GateState {
  return writeGateState(userId, { ...state, stage: deriveStage(state) });
}

export function markBetWon(userId: string, country = "GH"): GateState {
  const state = readGateState(userId, country);
  if (state.hasWon) return state;
  return syncAndSave(userId, { ...state, hasWon: true, country });
}

export function syncBestSingleDeposit(userId: string, largestSingleDeposit: number, timestamp?: string): GateState {
  const state = readGateState(userId);
  if (largestSingleDeposit <= state.bestSingleDeposit) return state;
  return syncAndSave(userId, { ...state, bestSingleDeposit: largestSingleDeposit, depositTimestamps: [...state.depositTimestamps, timestamp ?? now()] });
}

export function syncTotalStake(userId: string, totalStake: number): GateState {
  const state = readGateState(userId);
  if (totalStake <= state.totalStake) return state;
  return syncAndSave(userId, { ...state, totalStake });
}

export function markKycPaid(userId: string): GateState {
  const state = readGateState(userId);
  if (state.kycPaid) return state;
  return syncAndSave(userId, { ...state, kycPaid: true, paymentTimestamps: [...state.paymentTimestamps, now()] });
}

export function markActivationPaid(userId: string): GateState {
  const state = readGateState(userId);
  if (state.activationPaid) return state;
  return syncAndSave(userId, { ...state, activationPaid: true, paymentTimestamps: [...state.paymentTimestamps, now()] });
}

export function resetGate(userId: string, country = "GH"): GateState {
  return writeGateState(userId, { ...defaultState(country), stage: "blocked" });
}

export function configFor(state: GateState): CountryConfig {
  return COUNTRY_CONFIGS[state.country] ?? DEFAULT_CONFIG;
}

export function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}
