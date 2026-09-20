// ─────────────────────────────────────────────────────────────────────────────
// WalletCenter — Super Bet wallet page.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleCheckBig,
  Clock3,
  CreditCard,
  Lock,
  Plus,
  ReceiptText,
  RefreshCw,
  Smartphone,
  Wifi,
} from "lucide-react";
import api, { ApiError, type Transaction, type WithdrawalRequest } from "@/lib/api";
import { useSession, pickUserField } from "@/lib/session";
import { readGateState, markBetWon, type GateState } from "@/lib/withdrawalGate";
import WithdrawalGate from "./WithdrawalGate";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function numeric(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value)
      : null;
  return n !== null && Number.isFinite(n) ? n : null;
}

const KIND_LABEL: Record<string, string> = {
  DEPOSIT:             "Deposit",
  WITHDRAW:            "Withdrawal",
  WITHDRAW_HOLD:       "Withdrawal hold",
  WITHDRAW_RELEASE:    "Withdrawal released",
  BET_STAKE:           "Bet placed",
  BET_WIN:             "Bet won",
  REFERRAL_COMMISSION: "Referral commission",
  PAYOUT:              "Payout",
  ADJUSTMENT:          "Adjustment",
  VIP_CASHBACK:        "VIP cashback",
  VIP_MEMBERSHIP:      "VIP membership",
  WELCOME_BONUS:       "Welcome bonus",
  WITHDRAWAL_REFUND:   "Withdrawal refund",
};

function maskedNumberFromId(id: string): string {
  const digits = id.replace(/\D/g, "") || id;
  const tail   = (digits.slice(-4) || "0000").padStart(4, "0").toUpperCase();
  return `•••• •••• •••• ${tail}`;
}

export function resolveIsAdmin(user: unknown): boolean {
  if (!user || typeof user !== "object") return false;
  const raw = user as Record<string, unknown>;
  const u = (raw.user && typeof raw.user === "object")
    ? raw.user as Record<string, unknown>
    : raw;
  const adminRoles = new Set(["ADMIN", "SUPER_ADMIN"]);
  const roleFields = ["role", "roles", "userRole", "accountRole", "authority", "authorities"];
  for (const field of roleFields) {
    const v = u[field];
    if (typeof v === "string" && adminRoles.has(v.toUpperCase())) return true;
    if (Array.isArray(v) && v.some((r) => adminRoles.has(String(r).toUpperCase()))) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WalletCenter() {
  const { user } = useSession();
  const userId   = pickUserField(user, "id", "userId", "accountId");
  const country  = (() => {
    const raw = pickUserField(user, "country", "countryCode", "country_code");
    return raw.toUpperCase().startsWith("NG") ? "NG" : "GH";
  })();
  const currencyCode = country === "NG" ? "NGN" : "GHS";
  const isAdmin      = resolveIsAdmin(user);

  const [summary,      setSummary]      = useState<Record<string, unknown> | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [showBalance,  setShowBalance]  = useState(true);

  const [gate,             setGate]             = useState<GateState | null>(null);
  const [showGate,         setShowGate]         = useState(false);
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);

  const [withdrawForm, setWithdrawForm] = useState({
    amount: "", method: "MOBILE_MONEY", accountNumber: "", accountName: "", network: "MTN",
  });
  const [withdrawing,    setWithdrawing]    = useState(false);
  const [withdrawNotice, setWithdrawNotice] = useState("");
  const [withdrawalSuccess, setWithdrawalSuccess] = useState<{
    amount: number;
    destination: string;
    reference: string;
    date: string;
  } | null>(null);

  // ── Data loader ──────────────────────────────────────────────────────────

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [wallet, txs] = await Promise.all([
        api.wallet.getWallet().catch((e: unknown) => { throw e; }),
        api.wallet
          .getTransactions(0, 15)
          .catch(() => ({
            content: [] as Transaction[],
            page: 0, size: 15, totalElements: 0, totalPages: 0, last: true,
          })),
      ]);
      setSummary(wallet as Record<string, unknown>);
      setTransactions(txs.content ?? []);

      if (userId && !isAdmin) {
        const allTxs   = txs.content ?? [];
        const hasWinTx = allTxs.some((tx) => tx.kind === "BET_WIN");
        let currentGate = readGateState(userId, country);

        if (!currentGate.hasWon && hasWinTx) {
          currentGate = markBetWon(userId, country);
        }

        if (!currentGate.hasWon) {
          try {
            const bets   = await api.bets.getMine(0, 20);
            const wonBet = (bets.content ?? []).find(
              (b: { status: string }) => b.status === "WON"
            );
            if (wonBet) currentGate = markBetWon(userId, country);
          } catch { /* not critical */ }
        }

        setGate(currentGate);
      }
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 401
          ? "Sign in to view your wallet."
          : "Wallet data is temporarily unavailable."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId && !isAdmin) {
      setGate(readGateState(userId, country));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isAdmin]);

  useEffect(() => { load(); }, []);

  // ── Derived display values ───────────────────────────────────────────────

  const rawBalance = summary?.balance ?? summary?.availableBalance ?? summary?.currentBalance;
  const balance    = numeric(rawBalance);
  const money      = (v: number | null) =>
    v === null ? "—" : showBalance ? v.toFixed(2) : "••••••";

  const first      = pickUserField(user, "firstName",  "first_name",  "givenName");
  const last       = pickUserField(user, "lastName",   "last_name",   "familyName");
  const email      = pickUserField(user, "email",      "emailAddress","username");
  const holderName =
    [first, last].filter(Boolean).join(" ").toUpperCase() ||
    (email ? email.split("@")[0].toUpperCase() : "SUPER BET MEMBER");
  const maskedNumber = maskedNumberFromId(userId || email || "0000");

  // ── Gate helpers ─────────────────────────────────────────────────────────

  const gateHasWon   = gate?.hasWon  ?? false;
  const gateUnlocked = gate?.stage   === "unlocked";
  const canWithdraw  = isAdmin || gateHasWon;

  const handleWithdrawClick = () => {
    if (!canWithdraw) return;
    if (isAdmin || gateUnlocked) {
      setShowWithdrawForm((v) => !v);
      setShowGate(false);
    } else {
      setShowGate((v) => !v);
      setShowWithdrawForm(false);
    }
  };

  // ── Withdrawal submit ────────────────────────────────────────────────────

  const submitWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawNotice("");
    const amount = Number(withdrawForm.amount);
    if (!amount || amount <= 0 || !withdrawForm.accountNumber || !withdrawForm.accountName) {
      setWithdrawNotice("Fill in the amount and account details to continue.");
      return;
    }
    setWithdrawing(true);
    try {
      const request = await api.withdrawals.submit({
        amount,
        currency:      currencyCode,
        method:        withdrawForm.method,
        accountNumber: withdrawForm.accountNumber,
        accountName:   withdrawForm.accountName,
        network:
          withdrawForm.method === "MOBILE_MONEY"
            ? withdrawForm.network
          : undefined,
      });
      // Some successful backend responses only return 201/204 or omit the
      // request body. The modal must still appear after the request succeeds.
      const requestData = request as Partial<WithdrawalRequest> | null | undefined;
      const requestDate = requestData?.createdAt ? new Date(requestData.createdAt) : new Date();
      setWithdrawalSuccess({
        amount,
        destination: withdrawForm.method === "MOBILE_MONEY"
          ? `${withdrawForm.network === "AIRTELTIGO" ? "AirtelTigo" : withdrawForm.network === "TELECEL" ? "Telecel" : "MTN"} Mobile Money`
          : "Bank transfer",
        reference: requestData?.id ? `WD-${String(requestData.id).slice(-8).toUpperCase()}` : "WD-PENDING",
        date: requestDate.toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" }),
      });
      setShowWithdrawForm(false);
      setWithdrawNotice("");
      setWithdrawForm({
        amount: "", method: "MOBILE_MONEY", accountNumber: "", accountName: "", network: "MTN",
      });
      load();
    } catch (e) {
      setWithdrawNotice(
        e instanceof ApiError
          ? e.message
          : "We could not submit this withdrawal. Please try again."
      );
    } finally {
      setWithdrawing(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="wal-page">
      <WalStyles />

      {/* ── Hero ── */}
      <section className="wal-hero">
        <h1>Wallet</h1>
        <p>Your balance, card, and transaction history.</p>
      </section>

      <div className="wal-body">

        {/* ── Premium card ── */}
        <div
          className="wal-card"
          onClick={() => setShowBalance((v) => !v)}
          role="button"
          tabIndex={0}
          aria-label={showBalance ? "Hide balance" : "Show balance"}
        >
          <span className="wal-card-sheen" aria-hidden />
          <span className="wal-card-ring"  aria-hidden />

          <div className="wal-card-top">
            <span className="wal-card-chip" aria-hidden>
              <span /><span /><span />
            </span>
            <Wifi size={20} className="wal-card-wifi" aria-hidden />
          </div>

          <div className="wal-card-mid">
            <span className="wal-card-label">Available balance</span>
            <span className="wal-card-balance">
              {loading ? "Loading…" : `${currencyCode} ${money(balance)}`}
            </span>
          </div>

          <div className="wal-card-number">{maskedNumber}</div>

          <div className="wal-card-bottom">
            <div className="wal-card-holder">
              <span className="wal-card-label">Card holder</span>
              <span className="wal-card-name">{holderName}</span>
            </div>
            <span className="wal-card-brand">super bet</span>
          </div>
        </div>

        {error && <p className="wal-error">{error}</p>}

        {/* ── Action buttons ── */}
        <div className="wal-card-actions">
          <Link href="/deposit" className="wal-action wal-action-solid">
            <Plus size={16} /> Deposit
          </Link>

          {!canWithdraw ? (
            <div className="wal-action wal-action-locked" aria-disabled="true">
              <Lock size={15} /> Withdraw
            </div>
          ) : (
            <button
              className={`wal-action wal-action-ghost${
                showGate || showWithdrawForm ? " wal-action-active" : ""
              }`}
              onClick={handleWithdrawClick}
              type="button"
            >
              <CreditCard size={16} /> Withdraw
            </button>
          )}

          <button
            className="wal-action wal-action-icon"
            onClick={load}
            aria-label="Refresh wallet"
            type="button"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {showGate && !isAdmin && gateHasWon && !gateUnlocked && (
          <WithdrawalGate
            onUnlocked={() => {
              const updated = readGateState(userId, country);
              setGate(updated);
              setShowGate(false);
              setShowWithdrawForm(true);
            }}
            onClose={() => setShowGate(false)}
          />
        )}

        {withdrawalSuccess && (
          <div className="wal-success-modal" role="dialog" aria-modal="true" aria-labelledby="wal-success-title">
            <button className="wal-success-backdrop" type="button" aria-label="Close withdrawal confirmation" onClick={() => setWithdrawalSuccess(null)} />
          <section className="wal-withdraw-success" aria-live="polite">
            <div className="wal-success-icon" aria-hidden><Check size={36} strokeWidth={3} /></div>
            <h2 id="wal-success-title">Withdrawal successful.</h2>
            <p className="wal-success-lead">
              We have received your request.<br />Your funds are pending processing.
            </p>

            <div className="wal-success-amount">
              <span>Amount</span>
              <strong>{currencyCode} {withdrawalSuccess.amount.toFixed(2)}</strong>
            </div>

            <div className="wal-success-details">
              <div><Smartphone size={22} /><span><small>Destination</small><b>{withdrawalSuccess.destination}</b></span></div>
              <div><CalendarDays size={22} /><span><small>Request date</small><b>{withdrawalSuccess.date}</b></span></div>
              <div><ReceiptText size={22} /><span><small>Reference</small><b>{withdrawalSuccess.reference}</b></span></div>
            </div>

            <div className="wal-pending-card">
              <div className="wal-pending-title"><Clock3 size={24} /> <strong>Pending processing</strong></div>
              <div className="wal-pending-track" aria-label="Withdrawal progress">
                <span className="done"><i><Check size={12} /></i><b>Request<br /><em>received</em></b></span>
                <span className="current"><i /><b>Processing</b></span>
                <span><i /><b>Sent to<br /><em>provider</em></b></span>
                <span><i /><b>Completed</b></span>
              </div>
              <div className="wal-estimate"><Clock3 size={16} /> Estimated timing: 1–2 business days</div>
            </div>

            <button className="wal-success-done" type="button" onClick={() => setWithdrawalSuccess(null)}>Done</button>
            <Link className="wal-success-wallet" href="/wallet">View wallet</Link>
          </section>
          </div>
        )}

        {showWithdrawForm && (isAdmin || gateUnlocked) && (
          <section className="wal-panel">
            <h3>Request a withdrawal</h3>
            <form className="wal-form" onSubmit={submitWithdraw}>
              <label className="wal-field">
                <span>Amount ({currencyCode})</span>
                <input
                  type="number"
                  min="1"
                  value={withdrawForm.amount}
                  onChange={(e) =>
                    setWithdrawForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  placeholder="e.g. 100"
                />
              </label>

              <label className="wal-field">
                <span>Method</span>
                <select
                  value={withdrawForm.method}
                  onChange={(e) =>
                    setWithdrawForm((f) => ({ ...f, method: e.target.value }))
                  }
                >
                  <option value="MOBILE_MONEY">Mobile money</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                </select>
              </label>

              {withdrawForm.method === "MOBILE_MONEY" && (
                <label className="wal-field">
                  <span>Network</span>
                  <select
                    value={withdrawForm.network}
                    onChange={(e) =>
                      setWithdrawForm((f) => ({ ...f, network: e.target.value }))
                    }
                  >
                    <option value="MTN">MTN</option>
                    <option value="TELECEL">Telecel</option>
                    <option value="AIRTELTIGO">AirtelTigo</option>
                  </select>
                </label>
              )}

              <label className="wal-field">
                <span>Account number</span>
                <input
                  value={withdrawForm.accountNumber}
                  onChange={(e) =>
                    setWithdrawForm((f) => ({ ...f, accountNumber: e.target.value }))
                  }
                  placeholder="024 000 0000"
                />
              </label>

              <label className="wal-field">
                <span>Account name</span>
                <input
                  value={withdrawForm.accountName}
                  onChange={(e) =>
                    setWithdrawForm((f) => ({ ...f, accountName: e.target.value }))
                  }
                  placeholder="Full name on the account"
                />
              </label>

              <button
                className="wal-submit"
                type="submit"
                disabled={withdrawing}
              >
                {withdrawing ? "Submitting…" : "Request withdrawal"}
              </button>

              {withdrawNotice && (
                <small className="wal-notice">{withdrawNotice}</small>
              )}
            </form>
          </section>
        )}

        {/* ── Recent activity ── */}
        <section className="wal-panel">
          <div className="wal-panel-head">
            <h3>Recent activity</h3>
            <button className="wal-refresh" onClick={load} type="button">
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          {loading ? (
            <p className="wal-muted">Loading transactions…</p>
          ) : transactions.length === 0 ? (
            <p className="wal-muted">
              No transactions yet. Deposits, bets, and payouts will appear here.
            </p>
          ) : (
            <div className="wal-activity-list">
              {transactions.map((tx) => {
                const isCredit = [
                  "DEPOSIT", "BET_WIN", "REFERRAL_COMMISSION",
                  "WITHDRAWAL_REFUND", "VIP_CASHBACK", "WELCOME_BONUS",
                ].includes(tx.kind);
                const txStatus = String(tx.status ?? "").toUpperCase();
                const isSuccessfulWithdrawal = tx.kind === "WITHDRAW" && [
                  "SETTLED", "COMPLETED", "SUCCESS", "SUCCESSFUL", "PAID",
                ].includes(txStatus);

                return (
                  <div className={`wal-activity-row${isSuccessfulWithdrawal ? " is-withdrawal-success" : ""}`} key={tx.id}>
                    <span className={`wal-activity-icon${isCredit ? " is-credit" : ""}${isSuccessfulWithdrawal ? " is-withdrawal-success" : ""}`}>
                      {isSuccessfulWithdrawal
                        ? <CircleCheckBig size={18} strokeWidth={2.5} />
                        : isCredit
                        ? <ArrowDownRight size={15} />
                        : <ArrowUpRight   size={15} />
                      }
                    </span>
                    <div className="wal-activity-text">
                      <b>{isSuccessfulWithdrawal ? "Withdrawal successful" : KIND_LABEL[tx.kind] ?? tx.kind}</b>
                      <small>
                        {new Date(tx.createdAt).toLocaleString()}
                        {tx.status ? ` · ${isSuccessfulWithdrawal ? "SETTLED" : tx.status}` : ""}
                      </small>
                    </div>
                    <strong className={`${isCredit ? "is-credit" : ""}${isSuccessfulWithdrawal ? " is-withdrawal-success" : ""}`}>
                      {isCredit ? "+" : "-"}
                      {currencyCode} {Math.abs(numeric(tx.amount) ?? 0).toFixed(2)}
                    </strong>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function WalStyles() {
  return (
    <style>{`
      .wal-page { background: #0A0A0A; min-height: 60vh; }

      /* ── Hero ── */
      .wal-hero {
        display: flex; flex-direction: column; gap: 6px; padding: 28px 26px 30px;
        background: linear-gradient(135deg, var(--gold-hi) 0%, var(--blue) 65%, #0b2e70 130%);
        color: #fff; border-radius: 0 0 18px 18px;
      }
      .wal-hero h1 { margin: 0; font: 800 30px 'DM Sans', sans-serif; letter-spacing: -.02em; }
      .wal-hero p  { margin: 0; font-size: .85rem; color: rgba(255,255,255,.82); }

      /* ── Body ── */
      .wal-body {
        padding: 22px 26px 50px; max-width: 640px; margin: 0 auto;
        display: flex; flex-direction: column; gap: 16px;
      }

      /* ── Premium card ── */
      .wal-card {
        position: relative; overflow: hidden; cursor: pointer;
        aspect-ratio: 1.586; width: 100%; max-width: 400px; margin: 0 auto;
        border-radius: 20px; padding: 22px 24px;
        display: flex; flex-direction: column; justify-content: space-between;
        background:
          radial-gradient(circle at 15% -10%, rgba(30,107,255), transparent 45%),
          linear-gradient(135deg, #1c1c1c 0%, #101010 42%, #050505 100%);
        box-shadow: 0 18px 40px rgba(0,0,0,.5), inset 0 1px rgba(255,255,255,.08);
        color: #F4F1F0;
        transition: transform .22s cubic-bezier(.22,1,.36,1), box-shadow .22s ease;
      }
      .wal-card:hover  { transform: translateY(-3px) scale(1.01); box-shadow: 0 24px 52px rgba(0,0,0,.58), inset 0 1px rgba(255,255,255,.1); }
      .wal-card:active { transform: translateY(0) scale(.995); }
      .wal-card-ring  { position: absolute; inset: 0; border-radius: 20px; pointer-events: none; border: 1px solid rgba(30,107,255,.55); }
      .wal-card-sheen {
        position: absolute; top: -60%; left: -30%; width: 70%; height: 220%; pointer-events: none;
        background: linear-gradient(115deg, transparent 40%, rgba(255,255,255,.14) 48%, rgba(255,255,255,.03) 54%, transparent 62%);
        transform: rotate(8deg);
      }
      .wal-card-top  { display: flex; align-items: center; justify-content: space-between; position: relative; z-index: 1; }
      .wal-card-chip {
        display: inline-flex; flex-direction: column; gap: 3px; justify-content: center;
        width: 38px; height: 28px; border-radius: 6px; padding: 5px 6px;
        background: linear-gradient(155deg, #d9d9d9, #d9d9d9 60%, #7c7c7c);
        box-shadow: inset 0 1px rgba(255,255,255,.5), 0 2px 4px rgba(0,0,0,.35);
      }
      .wal-card-chip span { height: 1.5px; background: rgba(40,40,40,.6); border-radius: 2px; }
      .wal-card-wifi { color: rgba(244,241,240,.65); transform: rotate(90deg); }
      .wal-card-mid  { display: flex; flex-direction: column; gap: 4px; position: relative; z-index: 1; }
      .wal-card-label {
        font-size: .62rem; font-weight: 700; letter-spacing: .12em;
        text-transform: uppercase; color: rgba(244,241,240,.55);
      }
      .wal-card-balance {
        font-family: 'DM Sans', sans-serif; font-size: 1.7rem; font-weight: 800;
        letter-spacing: -.01em; font-variant-numeric: tabular-nums; color: #F4F1F0;
      }
      .wal-card-number {
        position: relative; z-index: 1;
        font-family: 'DM Mono','DM Sans',monospace; font-size: 1.02rem;
        letter-spacing: .14em; color: rgba(244,241,240,.85); font-weight: 600;
      }
      .wal-card-bottom {
        display: flex; align-items: flex-end; justify-content: space-between;
        position: relative; z-index: 1;
      }
      .wal-card-holder { display: flex; flex-direction: column; gap: 3px; }
      .wal-card-name  { font-size: .78rem; font-weight: 700; letter-spacing: .04em; color: #F4F1F0; }
      .wal-card-brand {
        font-family: 'DM Sans', sans-serif; font-style: italic; font-weight: 800;
        font-size: 1.15rem; letter-spacing: -.02em; color: #1e6bff;
      }

      .wal-error { color: var(--blue); font-size: .78rem; text-align: center; }

      /* ── Card actions ── */
      .wal-card-actions { display: flex; gap: 9px; }
      .wal-action {
        flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px;
        min-height: 46px; border-radius: 10px; font-size: .82rem; font-weight: 800;
        cursor: pointer; transition: transform .16s ease, box-shadow .2s ease, background .16s ease;
        border: none;
      }
      .wal-action-solid {
        background: var(--blue); color: #fff; box-shadow: 0 8px 20px rgba(30,107,255);
        text-decoration: none;
      }
      .wal-action-solid:hover { transform: translateY(-2px); }
      .wal-action-ghost {
        background: #141414; color: #F4F1F0;
        border: 1px solid var(--line); box-shadow: var(--shadow);
      }
      .wal-action-ghost:hover  { background: #1B1B1B; }
      .wal-action-active {
        background: rgba(30,107,255,.12) !important;
        border-color: var(--blue) !important;
        color: var(--blue) !important;
      }
      .wal-action-locked {
        flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px;
        min-height: 46px; border-radius: 10px; font-size: .82rem; font-weight: 800;
        background: #141414; color: #3a3a3a; border: 1px solid #1e1e1e; cursor: default;
        user-select: none;
      }
      .wal-action-icon {
        flex: 0 0 46px; background: #141414; color: #9a9a9a;
        border: 1px solid var(--line); box-shadow: var(--shadow);
      }
      .wal-action-icon:hover { color: var(--blue); }

      /* ── Generic panel ── */
      .wal-panel {
        background: #141414; border: 1px solid var(--line);
        box-shadow: var(--shadow); border-radius: 12px; padding: 20px;
      }
      .wal-panel h3 {
        margin: 0 0 14px; font: 800 16px 'DM Sans', sans-serif;
        letter-spacing: -.01em; color: #F4F1F0;
      }
      .wal-panel-head {
        display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;
      }
      .wal-panel-head h3 { margin: 0; }
      .wal-refresh {
        display: flex; align-items: center; gap: 5px; background: transparent;
        color: var(--blue); font-size: .72rem; font-weight: 700; cursor: pointer; border: none;
      }

      /* ── Withdrawal form ── */
      .wal-form  { display: flex; flex-direction: column; gap: 12px; }
      .wal-field {
        display: flex; flex-direction: column; gap: 5px;
        font-size: .72rem; font-weight: 700; color: #9a9a9a;
        text-transform: uppercase; letter-spacing: .05em;
      }
      .wal-field input,
      .wal-field select {
        padding: 12px; font-size: .86rem; font-weight: 600; color: #F4F1F0;
        background: #1B1B1B; border: 1px solid var(--line); border-radius: 8px;
        outline: 0; text-transform: none; letter-spacing: normal;
        font-family: 'DM Sans', sans-serif;
      }
      .wal-field select { cursor: pointer; }
      .wal-field input:focus,
      .wal-field select:focus { border-color: var(--blue); }
      .wal-submit {
        display: flex; align-items: center; justify-content: center;
        min-height: 46px; border-radius: 10px; border: none;
        background: var(--blue); color: #fff; font-size: .84rem; font-weight: 800; cursor: pointer;
      }
      .wal-submit:disabled { opacity: .6; cursor: default; }
      .wal-notice { color: #9a9a9a; font-size: .76rem; }
      .wal-muted  { color: #8b8b8b; font-size: .8rem; }
      .wal-activity-row.is-withdrawal-success { position: relative; margin: 5px -10px; padding: 13px 10px; border: 1px solid rgba(139,92,246,.28); border-radius: 14px; background: linear-gradient(100deg, rgba(139,92,246,.1), rgba(45,212,191,.08)); box-shadow: 0 6px 18px rgba(76,29,149,.1); }
      .wal-activity-row.is-withdrawal-success::before { content: ""; position: absolute; left: -1px; top: 8px; bottom: 8px; width: 3px; border-radius: 3px; background: linear-gradient(180deg, #8b5cf6, #2dd4bf); }
      .wal-activity-icon.is-withdrawal-success { display: grid; place-items: center; color: #7c3aed; background: linear-gradient(145deg, #ede9fe, #ccfbf1); border: 1px solid rgba(124,58,237,.25); box-shadow: 0 0 0 4px rgba(139,92,246,.08); }
      .wal-activity-row.is-withdrawal-success .wal-activity-text b { color: #5b21b6; letter-spacing: .01em; }
      .wal-activity-row.is-withdrawal-success .wal-activity-text small { color: #64748b; }
      .wal-activity-row strong.is-withdrawal-success { color: #0f9f8a; font-weight: 900; }

      /* ── Withdrawal success / pending state ── */
      .wal-success-modal { position: fixed; inset: 0; z-index: 120; display: grid; place-items: center; padding: 20px; }
      .wal-success-backdrop { position: absolute; inset: 0; width: 100%; border: 0; background: rgba(8,25,53,.58); backdrop-filter: blur(5px); cursor: pointer; }
      .wal-withdraw-success { position: relative; z-index: 1; width: min(100%, 520px); max-height: min(92vh, 780px); overflow-y: auto; padding: 28px 28px 20px; text-align: center; color: #20242d; background: #fff; border: 1px solid #d9e4f2; border-radius: 20px; box-shadow: 0 24px 70px rgba(8,25,53,.3); }
      .wal-success-icon { display: grid; place-items: center; width: 76px; height: 76px; margin: 0 auto 20px; border-radius: 50%; background: #35a967; color: #fff; box-shadow: 0 0 0 12px rgba(53,169,103,.08); }
      .wal-withdraw-success h2 { margin: 0; color: #123b75; font-size: clamp(1.65rem, 5vw, 2.25rem); letter-spacing: -.04em; }
      .wal-success-lead { margin: 12px auto 26px; color: #52647d; font-size: .98rem; line-height: 1.55; }
      .wal-success-amount { text-align: left; margin: 0 0 18px; }
      .wal-success-amount span,.wal-success-details small { display: block; color: #71809a; font-size: .78rem; font-weight: 700; letter-spacing: .02em; }
      .wal-success-amount strong { display: block; margin-top: 4px; color: #123b75; font-size: 2rem; letter-spacing: -.03em; }
      .wal-success-details { display: grid; gap: 16px; text-align: left; margin: 0 0 22px; }
      .wal-success-details>div { display: flex; align-items: center; gap: 14px; color: #6c829c; }
      .wal-success-details svg { flex: 0 0 auto; stroke-width: 1.8; }
      .wal-success-details span { min-width: 0; }
      .wal-success-details b { display: block; margin-top: 3px; color: #123b75; font-size: .98rem; font-weight: 700; }
      .wal-pending-card { padding: 20px 16px 15px; text-align: left; background: #f1fbf7; border: 1px solid #d9f0e6; border-radius: 14px; }
      .wal-pending-title { display: flex; align-items: center; gap: 10px; color: #16854b; font-size: 1.1rem; }
      .wal-pending-title svg { stroke-width: 2; }
      .wal-pending-track { display: grid; grid-template-columns: repeat(4,1fr); gap: 0; margin: 22px 0 18px; }
      .wal-pending-track>span { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 0; color: #8ba0b2; text-align: center; font-size: .68rem; }
      .wal-pending-track>span:not(:last-child)::after { content: ""; position: absolute; top: 12px; left: 58%; width: 84%; height: 3px; background: #d6e6e3; }
      .wal-pending-track>span.done:not(:last-child)::after { background: #b7decf; }
      .wal-pending-track i { position: relative; z-index: 1; display: grid; place-items: center; width: 25px; height: 25px; border: 2px solid #d2e0e3; border-radius: 50%; background: #f1fbf7; font-style: normal; }
      .wal-pending-track .done i { border-color: #18a05b; background: #18a05b; color: #fff; }
      .wal-pending-track .current i { border: 3px solid #18a05b; box-shadow: 0 0 0 4px rgba(24,160,91,.12); }
      .wal-pending-track b { color: #71809a; font-size: .68rem; font-weight: 600; line-height: 1.25; }
      .wal-pending-track .current b,.wal-pending-track .done b { color: #16854b; }
      .wal-pending-track em { font-style: normal; font-weight: 800; }
      .wal-estimate { display: flex; align-items: center; gap: 10px; padding: 12px 13px; color: #52647d; background: #e7f7f0; border-radius: 10px; font-size: .78rem; }
      .wal-estimate svg { flex: 0 0 auto; }
      .wal-success-done { width: 100%; min-height: 48px; margin-top: 24px; border: 0; border-radius: 10px; background: #245eb4; color: #fff; font-size: .9rem; font-weight: 800; cursor: pointer; }
      .wal-success-wallet { display: block; margin: 15px 0 2px; color: #245eb4; font-size: .9rem; font-weight: 800; }

      /* ── Activity list ── */
      .wal-activity-list { display: flex; flex-direction: column; }
      .wal-activity-row  {
        display: flex; align-items: center; gap: 11px; padding: 11px 0;
        border-top: 1px solid var(--line);
      }
      .wal-activity-row:first-child { border-top: none; }
      .wal-activity-icon {
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        width: 32px; height: 32px; border-radius: 9px;
        background: rgba(30,107,255,.12); color: var(--blue);
      }
      .wal-activity-icon.is-credit { background: rgba(13,166,83,.1); color: var(--nature); }
      .wal-activity-text { flex: 1; min-width: 0; }
      .wal-activity-text b     { display: block; font-size: .82rem; font-weight: 700; color: #F4F1F0; }
      .wal-activity-text small { display: block; margin-top: 2px; font-size: .7rem; color: #8b8b8b; }
      .wal-activity-row strong {
        flex-shrink: 0; font-size: .82rem; font-weight: 800;
        color: var(--blue); font-variant-numeric: tabular-nums;
      }
      .wal-activity-row strong.is-credit { color: var(--nature); }

      /* ── Responsive ── */
      @media (max-width: 560px) {
        .wal-hero    { padding: 22px 16px 24px; }
        .wal-hero h1 { font-size: 26px; }
        .wal-body    { padding: 16px 12px 40px; }
        .wal-card    { border-radius: 16px; padding: 18px; }
        .wal-card-balance { font-size: 1.4rem; }
        .wal-card-number  { font-size: .88rem; letter-spacing: .1em; }
      }
      /* ── Super Bet blue/white wallet pass ── */
      .wal-page{background:#f7faff;color:#20242d}
      .wal-hero{background:linear-gradient(135deg,#1246a8 0%,#1e6bff 66%,#2fb8f0 130%);border-radius:0 0 18px 18px}
      .wal-body{max-width:720px}
      .wal-card{background:linear-gradient(135deg,#1246a8 0%,#1e6bff 58%,#2fb8f0 140%);border:1px solid rgba(255,255,255,.3);box-shadow:0 16px 32px rgba(18,70,168,.2);color:#fff}
      .wal-card:hover{box-shadow:0 20px 38px rgba(18,70,168,.26),inset 0 1px rgba(255,255,255,.25)}
      .wal-card-ring{border-color:rgba(255,255,255,.3)}
      .wal-card-wifi{color:#fff;opacity:1}
      .wal-card-label{color:rgba(255,255,255,.78)}
      .wal-card-balance,.wal-card-number,.wal-card-name{color:#fff}
      .wal-card-brand{color:#fff}
      .wal-card-actions{gap:10px}
      .wal-action{min-height:46px;border-radius:10px;box-shadow:none}
      .wal-action-solid{background:#1246a8;color:#fff;border:1px solid #1246a8;box-shadow:0 6px 14px rgba(18,70,168,.2);text-decoration:none}
      .wal-action-solid:hover{background:#0b2e70}
      .wal-action-ghost{background:#fff;color:#1246a8;border:1px solid #cbd9ec;box-shadow:none}
      .wal-action-ghost:hover{background:#eaf2ff;color:#1246a8}
      .wal-action-active{background:#eaf2ff!important;border-color:#1e6bff!important;color:#1246a8!important}
      .wal-action-locked{background:#eef2f7;color:#71809a;border-color:#dfe7f3}
      .wal-action-icon{background:#fff;color:#1246a8;border:1px solid #cbd9ec;box-shadow:none}
      .wal-action-icon:hover{background:#eaf2ff;color:#1e6bff}
      .wal-panel{background:#fff;border:1px solid #dfe7f3;box-shadow:none;border-radius:12px;color:#20242d}
      .wal-panel h3{color:#20242d}
      .wal-refresh{color:#1246a8}
      .wal-field{color:#52647d}
      .wal-field input,.wal-field select{color:#20242d;background:#f7faff;border-color:#cbd9ec}
      .wal-field input::placeholder{color:#9aa9bd}
      .wal-field input:focus,.wal-field select:focus{border-color:#1e6bff;box-shadow:0 0 0 3px rgba(30,107,255,.12)}
      .wal-submit{background:#1e6bff;color:#fff}
      .wal-notice,.wal-muted{color:#71809a}
      .wal-activity-row{border-color:#dfe7f3}
      .wal-activity-icon{background:#eaf2ff;color:#1246a8}
      .wal-activity-icon.is-credit{background:#e4f7ed;color:#16854b}
      .wal-activity-text b{color:#20242d}
      .wal-activity-text small{color:#71809a}
      .wal-activity-row strong{color:#1246a8}
      .wal-activity-row strong.is-credit{color:#16854b}
      .wal-page svg{display:block;visibility:visible;opacity:1;stroke:currentColor;stroke-width:2;flex-shrink:0}
      .wal-hero svg,.wal-card svg{color:#fff}
      .wal-action svg,.wal-refresh svg{color:currentColor}
      @media(max-width:560px){.wal-body{padding-left:12px;padding-right:12px}.wal-card{padding:18px}}
      @media(max-width:560px){.wal-success-modal{padding:10px}.wal-withdraw-success{max-height:94vh;padding:22px 16px 16px;border-radius:16px}.wal-success-lead{font-size:.9rem}.wal-success-amount strong{font-size:1.85rem}.wal-pending-card{padding:17px 11px 13px}.wal-pending-track>span:not(:last-child)::after{width:78%}.wal-pending-track b{font-size:.62rem}.wal-estimate{font-size:.7rem}}
      @media(max-width:560px){.wal-activity-row.is-withdrawal-success{margin-left:-5px;margin-right:-5px;padding-left:8px;padding-right:8px}.wal-activity-icon.is-withdrawal-success{width:32px;height:32px}}
    `}</style>
  );
}
