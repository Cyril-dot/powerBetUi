// =============================================================================
// WithdrawalGate.tsx — PlayBet withdrawal gate (owner spec, 2026-11-01)
//
// Fully frontend-based: progress lives permanently in the player's browser
// (localStorage via withdrawalGate.ts). One stage is shown at a time —
// never the whole list, never upcoming amounts.
//
//   Stage 1: KYC verification   — pay GHS 500 (popup)
//   After it: loading bar appears, almost full and active
//   Stage 2: Activation payment — pay GHS 300 (popup) -> bar goes full
//   Then: a lock shows; tapping it opens the popup for the second GHS 300
//   Stage 4: Final payment      — pay GHS 100 (popup)
//   Then: withdrawals unlock, Withdraw Now opens the request form.
//
// ADMIN BYPASS: pass isAdmin={true} (WalletCenter does) and the gate
// renders nothing. Staff never see a stage.
// =============================================================================

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  ChevronRight,
  CreditCard,
  Lock,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import {
  GATE_STEPS,
  barFillPercent,
  currentStepIndex,
  formatAmount,
  markStepPaid,
  readGateState,
  type GateState,
  type GateStep,
} from "@/lib/withdrawalGate";
import { pickUserField, useSession } from "@/lib/session";
import api from "@/lib/api";

// Staff check kept local on purpose: importing it from WalletCenter would
// make WalletCenter <-> WithdrawalGate a circular import once WalletCenter
// renders this component.
function isStaffUser(user: unknown): boolean {
  if (!user || typeof user !== "object") return false;
  const raw = user as Record<string, unknown>;
  const u = (raw.user && typeof raw.user === "object")
    ? raw.user as Record<string, unknown>
    : raw;
  const adminRoles = new Set(["ADMIN", "SUPER_ADMIN"]);
  for (const field of ["role", "roles", "userRole", "accountRole", "authority", "authorities"]) {
    const v = u[field];
    if (typeof v === "string" && adminRoles.has(v.toUpperCase())) return true;
    if (Array.isArray(v) && v.some((r) => adminRoles.has(String(r).toUpperCase()))) return true;
  }
  return false;
}

function hasDepositOfAmount(txs: Array<{ kind?: string; amount?: number; createdAt?: string }>, amount: number, after?: string): boolean {
  return txs.some((tx) => String(tx.kind ?? "").toUpperCase() === "DEPOSIT" && Math.abs(Number(tx.amount ?? 0) - amount) < 0.01 && (!after || !tx.createdAt || new Date(tx.createdAt).getTime() >= new Date(after).getTime()));
}

type VerifyResult = { ok: boolean; message: string };

function PaymentModal({
  title, amount, purpose, onClose, onPaid,
}: { title: string; amount: number; purpose: string; onClose: () => void; onPaid: () => Promise<VerifyResult> }) {
  const [method, setMethod] = useState<"MOBILE_MONEY" | "BANK_TRANSFER">("MOBILE_MONEY");
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState("");
  const openDeposit = () => { sessionStorage.setItem(`wb_payment_started_${purpose}`, new Date().toISOString()); window.location.href = `/deposit?amount=${encodeURIComponent(amount)}&purpose=${purpose.toLowerCase()}&method=${method.toLowerCase()}`; };
  const confirmPayment = async () => { setChecking(true); setNotice(""); try { const r = await onPaid(); if (!r.ok) setNotice(r.message); } catch { setNotice("We could not verify the payment yet. Complete the payment, then try again."); } finally { setChecking(false); } };
  return <div className="wg-modal-backdrop" role="presentation"><div className="wg-payment-modal" role="dialog" aria-modal="true" aria-labelledby="wg-payment-title"><div className="wg-payment-head"><div><span className="wg-payment-kicker">WITHDRAWAL VERIFICATION</span><h3 id="wg-payment-title">{title}</h3></div><button className="wg-close" onClick={onClose} aria-label="Close payment modal"><X size={18} /></button></div><div className="wg-payment-amount"><span>Payment required</span><strong>{formatAmount(amount)}</strong></div><div className="wg-payment-methods"><button className={method === "MOBILE_MONEY" ? "active" : ""} onClick={() => setMethod("MOBILE_MONEY")} type="button"><Wallet size={16} /><span>Mobile Money<small>MTN, AirtelTigo, or Telecel</small></span></button><button className={method === "BANK_TRANSFER" ? "active" : ""} onClick={() => setMethod("BANK_TRANSFER")} type="button"><CreditCard size={16} /><span>Bank / other payment<small>Continue through the deposit centre</small></span></button></div>{notice && <p className="wg-notice wg-notice-err">{notice}</p>}<div className="wg-payment-actions"><button className="wg-btn wg-btn-primary" onClick={openDeposit} type="button">Open payment page <ChevronRight size={15} /></button><button className="wg-btn wg-btn-ghost" onClick={confirmPayment} disabled={checking} type="button">{checking ? "Checking payment…" : "I paid — verify now"}</button></div><p className="wg-payment-note"><ShieldCheck size={14} /> Payments are processed through the existing deposit centre. Never share your PIN.</p></div></div>;
}

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

  const effectiveAdmin = isAdmin || isStaffUser(user);
  const userId = pickUserField(user, "id", "userId", "accountId") || "guest";

  const [gate, setGate] = useState<GateState>(() => readGateState(userId));
  const [payment, setPayment] = useState<GateStep | null>(null);
  const [notice, setNotice] = useState("");
  const [checking, setChecking] = useState(false);

  // Refresh from localStorage on mount (another tab may have updated it)
  useEffect(() => {
    if (!effectiveAdmin) {
      setGate(readGateState(userId));
    }
  }, [userId, effectiveAdmin]);

  // Admin bypass
  if (effectiveAdmin) return null;

  const stepIndex = currentStepIndex(gate);
  const unlocked = stepIndex >= GATE_STEPS.length;
  const step = unlocked ? null : GATE_STEPS[stepIndex];
  const paidCount = gate.paid.filter(Boolean).length;
  const fill = barFillPercent(gate);
  // The lock is the only way into the second GHS 300: it appears once the
  // bar is full (first GHS 300 paid) and tapping it opens that payment.
  const showLock = !unlocked && step !== null && step.key === "act2";

  const verifyStep = async (s: GateStep): Promise<VerifyResult> => {
    const startedAt = sessionStorage.getItem(`wb_payment_started_${s.purpose}`);
    if (!startedAt) {
      return { ok: false, message: "Open the payment page and complete this payment before verifying it." };
    }
    try {
      const result = await api.wallet.getTransactions(0, 100);
      if (!hasDepositOfAmount(result.content ?? [], s.amount, startedAt)) {
        return { ok: false, message: `No completed ${formatAmount(s.amount)} payment was found after the payment page was opened. Complete it, then verify again.` };
      }
    } catch {
      return { ok: false, message: "Could not check the payment. Please try again." };
    }
    sessionStorage.removeItem(`wb_payment_started_${s.purpose}`);
    const updated = markStepPaid(userId, GATE_STEPS.indexOf(s));
    setPayment(null);
    setNotice("");
    setGate(updated);
    return { ok: true, message: "" };
  };

  const verifyFromPanel = async (s: GateStep) => {
    setChecking(true);
    setNotice("");
    const r = await verifyStep(s);
    if (!r.ok) setNotice(r.message);
    setChecking(false);
  };

  return (
    <div className="wg-wrap">
      <GateStyles />

      <div className="wg-header">
        <h2>Withdrawal Verification</h2>
        <button className="wg-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="wg-content">
        {unlocked ? (
          <div className="wg-panel wg-panel-success">
            <div className="wg-step-icon wg-icon-ok">
              <BadgeCheck size={32} />
            </div>
            <h3>Withdrawals Unlocked 🎉</h3>
            <p className="wg-desc">
              All verification payments are complete. You can now request withdrawals.
            </p>
            <button className="wg-btn wg-btn-primary" onClick={onUnlocked}>
              Withdraw Now <ChevronRight size={15} />
            </button>
          </div>
        ) : step !== null && (
          <div className="wg-panel">
            {/* Loading bar: appears only after the GHS 500 payment, almost
                full and active at 85%, then full once the first GHS 300
                is paid. It never names any step or amount. */}
            {paidCount >= 1 && (
              <div className="wg-bar-wrap">
                <div className="wg-bar-track">
                  <span className={`wg-bar-fill${fill < 100 ? " active" : ""}`} style={{ width: `${fill}%` }} />
                </div>
                <span className="wg-bar-label">{fill < 100 ? "Activating…" : "Activation complete"}</span>
              </div>
            )}

            {showLock ? (
              <div className="wg-lock-card">
                <div className="wg-lock-icon">
                  <Lock size={30} />
                </div>
                <h3>Locked</h3>
                <p className="wg-desc">Tap the lock to unlock the next payment.</p>
                <button className="wg-btn wg-btn-primary" onClick={() => setPayment(step)}>
                  <Lock size={16} /> Tap to unlock <ChevronRight size={15} />
                </button>
              </div>
            ) : (
              <>
                <div className="wg-step-icon wg-icon-dep">
                  <CreditCard size={28} />
                </div>
                <h3>{step.title}</h3>
                <p className="wg-desc">
                  Pay <strong>{formatAmount(step.amount)}</strong> to continue.
                </p>
                {notice && <p className="wg-notice wg-notice-err">{notice}</p>}
                <div className="wg-dep-actions">
                  <button className="wg-btn wg-btn-primary" onClick={() => setPayment(step)} type="button">
                    Pay {formatAmount(step.amount)} <ChevronRight size={15} />
                  </button>
                  <button className="wg-btn wg-btn-ghost" onClick={() => void verifyFromPanel(step)} disabled={checking} type="button">
                    {checking ? "Checking…" : "I paid — verify now"}
                  </button>
                </div>
              </>
            )}

            {payment && (
              <PaymentModal
                title={payment.key === "kyc" ? "KYC verification payment" : payment.title}
                amount={payment.amount}
                purpose={payment.purpose}
                onClose={() => setPayment(null)}
                onPaid={() => verifyStep(payment)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles — light PlayBet theme to sit on the wallet page
// ---------------------------------------------------------------------------

function GateStyles() {
  return (
    <style>{`
      .wg-modal-backdrop{position:fixed;inset:0;z-index:40;display:grid;place-items:center;padding:18px;background:rgba(10,27,61,.6)}.wg-payment-modal{width:min(480px,100%);background:#fff;border:1px solid #E3E3EF;border-radius:16px;box-shadow:0 20px 70px rgba(0,0,0,.35);padding:20px}.wg-payment-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.wg-payment-head h3{margin:4px 0 0;color:#0A1B3D;font:800 18px 'DM Sans',sans-serif}.wg-payment-kicker{color:#00A651;font-size:9px;font-weight:800;letter-spacing:.12em}.wg-payment-amount{display:flex;align-items:center;justify-content:space-between;margin:18px 0;padding:14px;border-radius:11px;background:#E1F3E7;border:1px solid #BFE6CB}.wg-payment-amount span{color:#5a6b62;font-size:11px}.wg-payment-amount strong{color:#0A1B3D;font-size:22px}.wg-payment-methods{display:grid;grid-template-columns:1fr 1fr;gap:8px}.wg-payment-methods button{display:flex;align-items:flex-start;gap:8px;text-align:left;padding:12px;border:1px solid #E3E3EF;border-radius:10px;background:#fff;color:#5a6b62;cursor:pointer}.wg-payment-methods button.active{border-color:#00A651;background:#E1F3E7;color:#0A1B3D}.wg-payment-methods span{display:grid;gap:4px;font-size:11px;font-weight:800}.wg-payment-methods small{color:#84938c;font-size:9px;font-weight:400;line-height:1.35}.wg-payment-actions{display:flex;gap:8px;margin-top:16px}.wg-payment-actions .wg-btn{flex:1;justify-content:center}.wg-payment-note{display:flex;align-items:flex-start;gap:6px;margin:14px 0 0;color:#82918a;font-size:10px;line-height:1.4}.wg-payment-note svg{color:#00A651;flex:0 0 auto;margin-top:1px}.wg-modal-backdrop .wg-notice{margin:12px 0 0}
      @media (max-width: 560px) { .wg-payment-methods{grid-template-columns:1fr}.wg-payment-actions{flex-direction:column}.wg-payment-modal{padding:16px} }
      .wg-wrap { background: #fff; border: 1px solid #E3E3EF; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 32px rgba(10,27,61,.08); margin-top: 8px; }
      .wg-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px 14px; border-bottom: 1px solid #E3E3EF; }
      .wg-header h2 { margin: 0; font: 800 17px 'DM Sans', sans-serif; letter-spacing: -.01em; color: #0A1B3D; }
      .wg-close { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: #F2F4F7; color: #5a6b62; cursor: pointer; transition: background .15s; border: none; }
      .wg-close:hover { background: #E9ECF1; color: #0A1B3D; }
      .wg-content { padding: 6px 0 0; }
      .wg-panel { padding: 20px 20px 24px; display: flex; flex-direction: column; gap: 14px; }
      .wg-panel-success { background: #E1F3E7; }
      .wg-step-icon { width: 56px; height: 56px; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin-bottom: 2px; }
      .wg-icon-dep { background: #E1F3E7; color: #00A651; }
      .wg-icon-ok { background: rgba(0,166,81,.12); color: #00A651; }
      .wg-panel h3 { margin: 0; font: 800 18px 'DM Sans', sans-serif; letter-spacing: -.01em; color: #0A1B3D; }
      .wg-desc { margin: 0; font-size: .84rem; color: #5a6b62; line-height: 1.6; }
      .wg-btn { display: flex; align-items: center; justify-content: center; gap: 7px; min-height: 48px; border-radius: 10px; font: 800 .86rem 'DM Sans', sans-serif; cursor: pointer; transition: transform .15s, box-shadow .15s, background .15s; text-decoration: none; border: none; }
      .wg-btn:disabled { opacity: .55; cursor: default; }
      .wg-btn-primary { background: #00A651; color: #fff; box-shadow: 0 6px 18px rgba(0,166,81,.35); }
      .wg-btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(0,166,81,.4); }
      .wg-btn-ghost { background: #F2F4F7; color: #0A1B3D; border: 1px solid #E3E3EF; }
      .wg-btn-ghost:hover:not(:disabled) { background: #E9ECF1; }
      .wg-notice { font-size: .76rem; margin: 0; }
      .wg-notice-err { color: #D93648; }
      .wg-notice-ok { color: #00A651; }
      .wg-dep-actions { display: flex; flex-direction: column; gap: 9px; }
      /* ── Loading bar ── */
      .wg-bar-wrap { display: flex; flex-direction: column; gap: 7px; }
      .wg-bar-track { width: 100%; height: 12px; border-radius: 999px; background: #E9ECF1; border: 1px solid #E3E3EF; overflow: hidden; }
      .wg-bar-fill { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #00A651, #00E85F); transition: width .5s ease; }
      .wg-bar-fill.active { animation: wg-bar-pulse 1.2s ease-in-out infinite; }
      @keyframes wg-bar-pulse { 0% { opacity: 1; } 50% { opacity: .55; } 100% { opacity: 1; } }
      .wg-bar-label { font-size: .72rem; font-weight: 800; color: #00A651; }
      /* ── Lock card ── */
      .wg-lock-card { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; padding: 10px 0 2px; }
      .wg-lock-icon { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #0A1B3D; color: #FFD21F; box-shadow: 0 8px 24px rgba(10,27,61,.3); }
      .wg-lock-card .wg-desc { text-align: center; }
      .wg-lock-card .wg-btn { width: 100%; }
      @media (max-width: 480px) { .wg-panel { padding: 16px 14px 20px; } }
    `}</style>
  );
}
