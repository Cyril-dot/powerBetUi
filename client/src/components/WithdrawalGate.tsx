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
  CreditCard,
  Lock,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import {
  readGateState,
  syncBestSingleDeposit,
  syncTotalStake,
  markKycPaid,
  markActivationPaid,
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

function hasDepositOfAmount(txs: Array<{ kind?: string; amount?: number; createdAt?: string }>, amount: number, after?: string): boolean {
  return txs.some((tx) => String(tx.kind ?? "").toUpperCase() === "DEPOSIT" && Math.abs(Number(tx.amount ?? 0) - amount) < 0.01 && (!after || !tx.createdAt || new Date(tx.createdAt).getTime() >= new Date(after).getTime()));
}

function PaymentModal({
  title, amount, purpose, onClose, onPaid,
}: { title: string; amount: number; purpose: "KYC" | "ACTIVATION"; onClose: () => void; onPaid: () => Promise<void> }) {
  const [method, setMethod] = useState<"MOBILE_MONEY" | "BANK_TRANSFER">("MOBILE_MONEY");
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState("");
  const openDeposit = () => { sessionStorage.setItem(`wb_payment_started_${purpose}`, new Date().toISOString()); window.location.href = `/deposit?amount=${encodeURIComponent(amount)}&purpose=${purpose.toLowerCase()}&method=${method.toLowerCase()}`; };
  const confirmPayment = async () => { setChecking(true); setNotice(""); try { await onPaid(); } catch { setNotice("We could not verify the payment yet. Complete the payment, then try again."); } finally { setChecking(false); } };
  return <div className="wg-modal-backdrop" role="presentation"><div className="wg-payment-modal" role="dialog" aria-modal="true" aria-labelledby="wg-payment-title"><div className="wg-payment-head"><div><span className="wg-payment-kicker">WITHDRAWAL VERIFICATION</span><h3 id="wg-payment-title">{title}</h3></div><button className="wg-close" onClick={onClose} aria-label="Close payment modal"><X size={18} /></button></div><div className="wg-payment-amount"><span>Payment required</span><strong>{formatAmount(amount, "GHS")}</strong></div><div className="wg-payment-methods"><button className={method === "MOBILE_MONEY" ? "active" : ""} onClick={() => setMethod("MOBILE_MONEY")} type="button"><Wallet size={16} /><span>Mobile Money<small>MTN, AirtelTigo, or Telecel</small></span></button><button className={method === "BANK_TRANSFER" ? "active" : ""} onClick={() => setMethod("BANK_TRANSFER")} type="button"><CreditCard size={16} /><span>Bank / other payment<small>Continue through the deposit centre</small></span></button></div>{notice && <p className="wg-notice wg-notice-err">{notice}</p>}<div className="wg-payment-actions"><button className="wg-btn wg-btn-primary" onClick={openDeposit} type="button">Open payment page <ChevronRight size={15} /></button><button className="wg-btn wg-btn-ghost" onClick={confirmPayment} disabled={checking} type="button">{checking ? "Checking payment…" : "I paid — verify now"}</button></div><p className="wg-payment-note"><ShieldCheck size={14} /> Payments are processed through the existing deposit centre. Never share your PIN.</p></div></div>;
}

function PanelDeposit({ gate, userId, onUnlocked, onGateChange }: { gate: GateState; userId: string; onUnlocked: (g: GateState) => void; onGateChange: (g: GateState) => void }) {
  const cfg = configFor(gate); const requiredDeposit = cfg.qualifyingDepositAmount; const requiredStake = cfg.qualifyingStakeAmount; const bestSoFar = gate.bestSingleDeposit; const stakeSoFar = gate.totalStake; const depositPct = Math.min(100, Math.round((bestSoFar / requiredDeposit) * 100)); const stakePct = Math.min(100, Math.round((stakeSoFar / requiredStake) * 100));
  const [checking, setChecking] = useState(false); const [notice, setNotice] = useState(""); const [payment, setPayment] = useState<"KYC" | "ACTIVATION" | null>(null);
  const findLargestDeposit = async (): Promise<number> => { const first = await api.wallet.getTransactions(0, 100); const all = first.content ?? []; return all.filter((tx) => String(tx.kind).toUpperCase() === "DEPOSIT").reduce((max, tx) => Math.max(max, Number(tx.amount || 0)), 0); };
  const findTotalStake = async (): Promise<number> => { const first = await api.bets.getMine(0, 100); const pages = [first.content ?? []]; for (let page = 1; page < (first.totalPages ?? 1); page += 1) pages.push((await api.bets.getMine(page, 100)).content ?? []); return pages.flat().reduce((sum, bet) => sum + Math.max(0, Number(bet.stake || 0)), 0); };
  const handleCheck = async (opts?: { silent?: boolean }) => { const silent = opts?.silent ?? false; setChecking(true); if (!silent) setNotice(""); try { const [largest, totalStake] = await Promise.all([findLargestDeposit(), findTotalStake()]); syncBestSingleDeposit(userId, largest); const updated = syncTotalStake(userId, totalStake); onGateChange(updated); if (!silent && updated.stage === "deposit") setNotice(`Deposit ${formatAmount(requiredDeposit, cfg.currencyCode)} in one transaction and stake ${formatAmount(requiredStake, cfg.currencyCode)} in total to continue.`); } catch { if (!silent) setNotice("Could not check deposits. Please try again."); } finally { setChecking(false); } };
  useEffect(() => { void handleCheck({ silent: true }); }, []);
  const verifyPayment = async () => { if (!payment) return; const target = payment === "KYC" ? cfg.kycPaymentAmount : cfg.activationPaymentAmount; const startedAt = sessionStorage.getItem(`wb_payment_started_${payment}`); if (!startedAt) { setNotice("Open the payment page and complete this payment before verifying it."); return; } const result = await api.wallet.getTransactions(0, 100); if (!hasDepositOfAmount(result.content ?? [], target, startedAt)) { setNotice(`No completed ${formatAmount(target, cfg.currencyCode)} payment was found after the payment page was opened. Complete it, then verify again.`); return; } sessionStorage.removeItem(`wb_payment_started_${payment}`); const updated = payment === "KYC" ? markKycPaid(userId) : markActivationPaid(userId); setPayment(null); onGateChange(updated); if (updated.stage === "unlocked") onUnlocked(updated); };
  if (gate.stage === "kyc" || gate.stage === "activation") { const amount = gate.stage === "kyc" ? cfg.kycPaymentAmount : cfg.activationPaymentAmount; return <div className="wg-panel"><div className="wg-step-icon wg-icon-dep"><CreditCard size={28} /></div><h3>{gate.stage === "kyc" ? "Complete KYC verification" : "Activate withdrawals"}</h3><p className="wg-desc">{gate.stage === "kyc" ? `Pay ${formatAmount(amount, cfg.currencyCode)} for KYC verification before continuing.` : `Make the final ${formatAmount(amount, cfg.currencyCode)} MoMo or bank activation payment. Withdrawals unlock after it is verified.`}</p><div className="wg-info-box"><AlertCircle size={15} /><span>{gate.stage === "kyc" ? "Your GHS 300 withdrawal deposit and staking requirement are complete. The next step is the GHS 100 verification payment." : "KYC payment complete. After this activation payment, the withdrawal request form will become available."}</span></div><div className="wg-dep-actions"><button className="wg-btn wg-btn-primary" onClick={() => setPayment(gate.stage === "kyc" ? "KYC" : "ACTIVATION")} type="button">Pay {formatAmount(amount, cfg.currencyCode)} <ChevronRight size={15} /></button><button className="wg-btn wg-btn-ghost" onClick={verifyPayment} disabled={checking} type="button">{checking ? "Checking…" : "I paid — verify now"}</button></div>{payment && <PaymentModal title={payment === "KYC" ? "KYC verification payment" : "Withdrawal activation payment"} amount={amount} purpose={payment} onClose={() => setPayment(null)} onPaid={verifyPayment} />}</div>; }
  return <div className="wg-panel"><div className="wg-step-icon wg-icon-dep"><Wallet size={28} /></div><h3>Complete withdrawal requirements</h3><p className="wg-desc">Make a single deposit of at least <strong>{formatAmount(requiredDeposit, cfg.currencyCode)}</strong> and complete <strong>{formatAmount(requiredStake, cfg.currencyCode)}</strong> in total stakes.</p><div className="wg-dep-progress-wrap"><div className="wg-dep-progress-bar"><span className="wg-dep-progress-fill" style={{ width: `${depositPct}%` }} /></div><div className="wg-dep-progress-labels"><span>{formatAmount(bestSoFar, cfg.currencyCode)} deposit</span><span>{depositPct}%</span><span>{formatAmount(requiredDeposit, cfg.currencyCode)}</span></div></div><div className="wg-dep-progress-wrap"><div className="wg-progress-caption">Total stake progress</div><div className="wg-dep-progress-bar"><span className="wg-dep-progress-fill" style={{ width: `${stakePct}%` }} /></div><div className="wg-dep-progress-labels"><span>{formatAmount(stakeSoFar, cfg.currencyCode)}</span><span>{stakePct}%</span><span>{formatAmount(requiredStake, cfg.currencyCode)}</span></div></div><div className="wg-info-box"><AlertCircle size={15} /><span>Deposit <strong>{formatAmount(requiredDeposit, cfg.currencyCode)}</strong> in one transaction and stake <strong>{formatAmount(requiredStake, cfg.currencyCode)}</strong> in total. Then complete the GHS 100 KYC payment and GHS 300 activation payment.</span></div>{notice && <p className="wg-notice wg-notice-err">{notice}</p>}<div className="wg-dep-actions"><a href="/deposit?amount=300&purpose=withdrawal" className="wg-btn wg-btn-primary">Deposit Now <ChevronRight size={15} /></a><button className="wg-btn wg-btn-ghost" onClick={() => handleCheck()} disabled={checking}>{checking ? "Checking…" : "I've deposited — check now"}</button></div></div>;
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
          <PanelDeposit gate={gate} userId={userId} onUnlocked={handleUnlocked} onGateChange={(updated) => setGate({ ...updated })} />
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
      .wg-modal-backdrop{position:fixed;inset:0;z-index:40;display:grid;place-items:center;padding:18px;background:rgba(0,0,0,.72)}.wg-payment-modal{width:min(480px,100%);background:#141414;border:1px solid #2b3438;border-radius:16px;box-shadow:0 20px 70px rgba(0,0,0,.55);padding:20px}.wg-payment-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.wg-payment-head h3{margin:4px 0 0;color:#f4f1f0;font:800 18px 'DM Sans',sans-serif}.wg-payment-kicker{color:#8cf0b3;font-size:9px;font-weight:800;letter-spacing:.12em}.wg-payment-amount{display:flex;align-items:center;justify-content:space-between;margin:18px 0;padding:14px;border-radius:11px;background:#1b261f;border:1px solid rgba(140,240,179,.25)}.wg-payment-amount span{color:#a7b5ae;font-size:11px}.wg-payment-amount strong{color:#c8fbd6;font-size:22px}.wg-payment-methods{display:grid;grid-template-columns:1fr 1fr;gap:8px}.wg-payment-methods button{display:flex;align-items:flex-start;gap:8px;text-align:left;padding:12px;border:1px solid #2c3639;border-radius:10px;background:#1b1b1b;color:#a9b6b0;cursor:pointer}.wg-payment-methods button.active{border-color:#70dc99;background:#183122;color:#e5fff0}.wg-payment-methods span{display:grid;gap:4px;font-size:11px;font-weight:800}.wg-payment-methods small{color:#84938c;font-size:9px;font-weight:400;line-height:1.35}.wg-payment-actions{display:flex;gap:8px;margin-top:16px}.wg-payment-actions .wg-btn{flex:1;justify-content:center}.wg-payment-note{display:flex;align-items:flex-start;gap:6px;margin:14px 0 0;color:#82918a;font-size:10px;line-height:1.4}.wg-payment-note svg{color:#8cf0b3;flex:0 0 auto;margin-top:1px}.wg-modal-backdrop .wg-notice{margin:12px 0 0}      @media (max-width: 560px) { .wg-payment-methods{grid-template-columns:1fr}.wg-payment-actions{flex-direction:column}.wg-payment-modal{padding:16px} }
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
