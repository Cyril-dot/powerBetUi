// =============================================================================
// WithdrawalGate.tsx — Super Bet withdrawal gate
//
// Shows a single requirement: make one deposit of GHS 500 (or NGN 73,200).
// Once that deposit is confirmed, the gate unlocks and calls onUnlocked.
//
// ADMIN BYPASS:
//   Pass isAdmin={true} and the gate renders nothing — WalletCenter already
//   guards this, but this prop is a belt-and-suspenders safety net.
//
// All progress is persisted permanently to localStorage via withdrawalGate.ts.
// =============================================================================

import { useEffect, useState } from "react";
import {
  AlertCircle,
  BadgeCheck,
  ChevronRight,
  Lock,
  Wallet,
  X,
} from "lucide-react";
import {
  readGateState,
  syncBestSingleDeposit,
  syncTotalStake,
  configFor,
  formatAmount,
  type GateState,
} from "@/lib/withdrawalGate";
import { pickUserField, useSession } from "@/lib/session";
import { resolveIsAdmin } from "./WalletCenter";
import api from "@/lib/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clsx(...args: (string | false | null | undefined)[]): string {
  return args.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Main panel — single deposit requirement
// ---------------------------------------------------------------------------

function PanelDeposit({
  gate,
  userId,
  onUnlocked,
}: {
  gate: GateState;
  userId: string;
  onUnlocked: (g: GateState) => void;
}) {
  const cfg = configFor(gate);

  const requiredDeposit = cfg.qualifyingDepositAmount;
  const requiredStake = cfg.qualifyingStakeAmount;
  const bestSoFar = gate.bestSingleDeposit;
  const stakeSoFar = gate.totalStake;
  const depositPct = Math.min(100, Math.round((bestSoFar / requiredDeposit) * 100));
  const stakePct = Math.min(100, Math.round((stakeSoFar / requiredStake) * 100));

  const [checking, setChecking] = useState(false);
  const [notice,   setNotice]   = useState("");

  /**
   * Fetches transaction history and returns the largest single DEPOSIT amount.
   * Checks both the first and last page so a freshly-made deposit isn't missed.
   */
  const findLargestDeposit = async (): Promise<number> => {
    const isDeposit = (kind: unknown) => String(kind).toUpperCase() === "DEPOSIT";
    const maxOf = (txs: { kind: string; amount: number }[]) =>
      txs
        .filter((tx) => isDeposit(tx.kind))
        .reduce((max, tx) => Math.max(max, Number(tx.amount || 0)), 0);

    const first   = await api.wallet.getTransactions(0, 100);
    let   largest = maxOf(first.content ?? []);

    if (first.totalPages > 1) {
      const last = await api.wallet.getTransactions(first.totalPages - 1, 100);
      largest = Math.max(largest, maxOf(last.content ?? []));
    }

    return largest;
  };

  const findTotalStake = async (): Promise<number> => {
    const first = await api.bets.getMine(0, 100);
    const pages = [first.content ?? []];
    for (let page = 1; page < (first.totalPages ?? 1); page += 1) {
      const next = await api.bets.getMine(page, 100);
      pages.push(next.content ?? []);
    }
    return pages.flat().reduce((sum, bet) => sum + Math.max(0, Number(bet.stake || 0)), 0);
  };

  const handleCheck = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    setChecking(true);
    if (!silent) setNotice("");

    try {
      const [largest, totalStake] = await Promise.all([findLargestDeposit(), findTotalStake()]);
      syncBestSingleDeposit(userId, largest);
      const updated = syncTotalStake(userId, totalStake);

      if (updated.bestSingleDeposit >= requiredDeposit && updated.totalStake >= requiredStake) {
        // Gate passed — bubble up so parent can switch to unlocked view
        onUnlocked(updated);
      } else {
        if (!silent) {
          if (updated.bestSingleDeposit < requiredDeposit) {
            setNotice(
              `Your largest deposit is ${formatAmount(updated.bestSingleDeposit, cfg.currencyCode)}. ` +
              `Make a single deposit of ${formatAmount(requiredDeposit, cfg.currencyCode)}. ` +
              `You have also staked ${formatAmount(updated.totalStake, cfg.currencyCode)} of ${formatAmount(requiredStake, cfg.currencyCode)} required.`
            );
          } else if (updated.totalStake < requiredStake) {
            setNotice(
              `Deposit requirement complete. Stake ${formatAmount(requiredStake - updated.totalStake, cfg.currencyCode)} more ` +
              `to reach the ${formatAmount(requiredStake, cfg.currencyCode)} total stake requirement.`
            );
          } else {
            setNotice("Complete both requirements, then check again to unlock withdrawals.");
          }
        }
      }
    } catch {
      if (!silent) setNotice("Could not check deposits. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  // Silent auto-check on mount — handles the case where the user just
  // deposited and was navigated back here.
  useEffect(() => {
    void handleCheck({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="wg-panel">
      <div className="wg-step-icon wg-icon-dep">
        <Wallet size={28} />
      </div>

      <h3>Complete withdrawal requirements</h3>

      <p className="wg-desc">
        Make a single deposit of at least <strong>{formatAmount(requiredDeposit, cfg.currencyCode)}</strong>{" "}
        and complete <strong>{formatAmount(requiredStake, cfg.currencyCode)}</strong> in total stakes.
      </p>

      {/* Progress bar */}
      <div className="wg-dep-progress-wrap">
        <div className="wg-dep-progress-bar">
          <span className="wg-dep-progress-fill" style={{ width: `${depositPct}%` }} />
        </div>
        <div className="wg-dep-progress-labels">
          <span>{formatAmount(bestSoFar, cfg.currencyCode)} deposit</span>
          <span>{depositPct}%</span>
          <span>{formatAmount(requiredDeposit, cfg.currencyCode)}</span>
        </div>
      </div>
      <div className="wg-dep-progress-wrap">
        <div className="wg-progress-caption">Total stake progress</div>
        <div className="wg-dep-progress-bar">
          <span className="wg-dep-progress-fill" style={{ width: `${stakePct}%` }} />
        </div>
        <div className="wg-dep-progress-labels">
          <span>{formatAmount(stakeSoFar, cfg.currencyCode)}</span>
          <span>{stakePct}%</span>
          <span>{formatAmount(requiredStake, cfg.currencyCode)}</span>
        </div>
      </div>

      {/* Info callout */}
      <div className="wg-info-box">
        <AlertCircle size={15} />
        <span>
          Deposit <strong>{formatAmount(requiredDeposit, cfg.currencyCode)}</strong> in one transaction
          and stake <strong>{formatAmount(requiredStake, cfg.currencyCode)}</strong> in total to unlock withdrawals.
        </span>
      </div>

      {/* Feedback */}
      {notice && (
        <p className="wg-notice wg-notice-err">{notice}</p>
      )}

      <div className="wg-dep-actions">
        <a href="/deposit" className="wg-btn wg-btn-primary">
          Deposit Now <ChevronRight size={15} />
        </a>
        <button
          className="wg-btn wg-btn-ghost"
          onClick={() => handleCheck()}
          disabled={checking}
        >
          {checking ? "Checking…" : "I've deposited — check now"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unlocked panel
// ---------------------------------------------------------------------------

function PanelUnlocked({
  gate,
  onWithdraw,
}: {
  gate: GateState;
  onWithdraw: () => void;
}) {
  const cfg = configFor(gate);
  return (
    <div className="wg-panel wg-panel-success">
      <div className="wg-step-icon wg-icon-ok">
        <BadgeCheck size={32} />
      </div>
      <h3>Withdrawals Unlocked 🎉</h3>
      <p className="wg-desc">
        Your deposit has been verified. You can now withdraw your winnings at any time.
        The minimum withdrawal is{" "}
        <strong>{formatAmount(cfg.minWithdrawal, cfg.currencyCode)}</strong>.
      </p>
      <button className="wg-btn wg-btn-primary" onClick={onWithdraw}>
        Withdraw Now <ChevronRight size={15} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

interface WithdrawalGateProps {
  /** Called when the gate is fully unlocked and the user clicks "Withdraw Now" */
  onUnlocked: () => void;
  /** Called when the user dismisses the gate */
  onClose: () => void;
  /** Belt-and-suspenders admin bypass; WalletCenter also guards this */
  isAdmin?: boolean;
}

export default function WithdrawalGate({
  onUnlocked,
  onClose,
  isAdmin = false,
}: WithdrawalGateProps) {
  const { user } = useSession();

  const adminFromSession = resolveIsAdmin(user);
  const effectiveAdmin   = isAdmin || adminFromSession;

  const userId  = pickUserField(user, "id", "userId", "accountId") || "guest";
  const country = pickUserField(user, "country", "countryCode", "country_code") || "GH";
  const normalizedCountry = country.toUpperCase().slice(0, 2) === "NG" ? "NG" : "GH";

  const [gate, setGate] = useState<GateState>(() =>
    readGateState(userId, normalizedCountry)
  );

  // Refresh from localStorage on mount (another tab may have updated it)
  useEffect(() => {
    if (!effectiveAdmin) {
      setGate(readGateState(userId, normalizedCountry));
    }
  }, [userId, normalizedCountry, effectiveAdmin]);

  // Admin bypass
  if (effectiveAdmin) return null;

  const handleUnlocked = (updated: GateState) => {
    setGate({ ...updated });
    // If the stage is now "unlocked" the PanelUnlocked view renders automatically.
    // If the caller wants immediate passthrough (e.g. they just became unlocked
    // mid-session) they can pass onUnlocked and handle it upstream.
  };

  return (
    <div className="wg-wrap">
      <GateStyles />

      {/* Header */}
      <div className="wg-header">
        <h2>Withdrawal Verification</h2>
        <button className="wg-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div className="wg-content">
        {gate.stage !== "unlocked" ? (
          <PanelDeposit gate={gate} userId={userId} onUnlocked={handleUnlocked} />
        ) : (
          <PanelUnlocked gate={gate} onWithdraw={onUnlocked} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function GateStyles() {
  return (
    <style>{`
      /* ── Wrapper ── */
      .wg-wrap {
        background: #141414;
        border: 1px solid var(--line, #232323);
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(0,0,0,.1);
        margin-top: 8px;
      }

      /* ── Header ── */
      .wg-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18px 20px 14px;
        border-bottom: 1px solid var(--line, #232323);
      }
      .wg-header h2 {
        margin: 0;
        font: 800 17px 'DM Sans', sans-serif;
        letter-spacing: -.01em;
        color: #F4F1F0;
      }
      .wg-close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: #1B1B1B;
        color: #9a9a9a;
        cursor: pointer;
        transition: background .15s;
        border: none;
      }
      .wg-close:hover { background: #222; color: #F4F1F0; }

      /* ── Content ── */
      .wg-content { padding: 6px 0 0; }

      /* ── Panel ── */
      .wg-panel {
        padding: 20px 20px 24px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .wg-panel-success { background: rgba(31,184,112,.08); }

      .wg-step-icon {
        width: 56px;
        height: 56px;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 2px;
      }
      .wg-icon-dep { background: rgba(245,158,11,.1); color: #FFB020; }
      .wg-icon-ok  { background: rgba(13,166,83,.12); color: var(--nature, #0da653); }

      .wg-panel h3 {
        margin: 0;
        font: 800 18px 'DM Sans', sans-serif;
        letter-spacing: -.01em;
        color: #F4F1F0;
      }
      .wg-desc {
        margin: 0;
        font-size: .84rem;
        color: #9a9a9a;
        line-height: 1.6;
      }

      /* ── Info box ── */
      .wg-info-box {
        display: flex;
        align-items: flex-start;
        gap: 9px;
        padding: 12px 14px;
        border-radius: 10px;
        background: rgba(255,176,32,.1);
        color: #FFB020;
        font-size: .78rem;
        line-height: 1.5;
        border: 1px solid rgba(255,176,32,.35);
      }
      .wg-info-box svg { flex-shrink: 0; margin-top: 1px; }

      /* ── Buttons ── */
      .wg-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        min-height: 48px;
        border-radius: 10px;
        font: 800 .86rem 'DM Sans', sans-serif;
        cursor: pointer;
        transition: transform .15s, box-shadow .15s, background .15s;
        text-decoration: none;
        border: none;
      }
      .wg-btn:disabled { opacity: .55; cursor: default; }
      .wg-btn-primary {
        background: var(--blue, #1e6bff);
        color: #fff;
        box-shadow: 0 6px 18px rgba(30,107,255);
      }
      .wg-btn-primary:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 10px 24px rgba(30,107,255);
      }
      .wg-btn-ghost {
        background: #1B1B1B;
        color: #F4F1F0;
        border: 1px solid #2a2a2a;
      }
      .wg-btn-ghost:hover:not(:disabled) { background: #222; }

      /* ── Notice ── */
      .wg-notice { font-size: .76rem; margin: 0; }
      .wg-notice-err { color: var(--blue, #1e6bff); }
      .wg-notice-ok  { color: var(--nature, #0da653); }

      /* ── Progress bar ── */
      .wg-dep-progress-wrap {
        display: flex;
        flex-direction: column;
        gap: 7px;
        padding: 6px 0 2px;
      }
      .wg-dep-progress-bar {
        width: 100%;
        height: 10px;
        border-radius: 999px;
        background: #1B1B1B;
        border: 1px solid var(--line, #232323);
        overflow: hidden;
      }
      .wg-dep-progress-fill {
        display: block;
        height: 100%;
        border-radius: 999px;
        background: linear-gradient(90deg, var(--blue, #1e6bff), #4d8dff);
        transition: width .4s ease;
      }
      .wg-dep-progress-labels {
        display: flex;
        justify-content: space-between;
        font-size: .7rem;
        font-weight: 700;
        color: #9a9a9a;
      }
      .wg-dep-progress-labels span:nth-child(2) {
        color: var(--blue, #1e6bff);
        font-weight: 800;
      }

      /* ── Action stack ── */
      .wg-dep-actions { display: flex; flex-direction: column; gap: 9px; }

      /* ── Mobile ── */
      @media (max-width: 480px) {
        .wg-panel { padding: 16px 14px 20px; }
      }
    `}</style>
  );
}
