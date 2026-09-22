// ─────────────────────────────────────────────────────────────────────────────
// WalletCenter — Super Bet wallet page.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
  Plus,
  RefreshCw,
  Wifi,
  X,
} from "lucide-react";
import api, { ApiError, type Transaction } from "@/lib/api";
import { useSession, pickUserField } from "@/lib/session";
import DepositCenter from "./DepositCenter";

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

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);
  const [withdrawGateMessage, setWithdrawGateMessage] = useState("");

  const [withdrawForm, setWithdrawForm] = useState({
    amount: "", method: "MOBILE_MONEY", accountNumber: "", accountName: "", network: "MTN",
  });
  const [withdrawing,    setWithdrawing]    = useState(false);
  const [withdrawNotice, setWithdrawNotice] = useState("");
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);

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

  const handleWithdrawClick = () => {
    setWithdrawNotice("");
    setShowWithdrawForm((v) => !v);
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
      if (!isAdmin) {
        const bets = await api.bets.getMine(0, 100);
        const hasWonBet = (bets.content ?? []).some((bet: { status?: string }) => String(bet.status ?? "").toUpperCase() === "WON");
        if (!hasWonBet) {
          setWithdrawGateMessage("Stake and win one bet first. Then you can withdraw your winnings.");
          setWithdrawing(false);
          return;
        }
      }
      await api.withdrawals.submit({
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
      setWithdrawNotice(
        "Withdrawal request submitted. It will appear in your history once reviewed."
      );
      setWithdrawSuccess(true);
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
          <button className="wal-action wal-action-solid" type="button" onClick={() => setShowPaymentModal(true)}>
            <Plus size={16} /> Deposit
          </button>

          <button
            className={`wal-action wal-action-ghost${showWithdrawForm ? " wal-action-active" : ""}`}
            onClick={handleWithdrawClick}
            type="button"
          >
            <CreditCard size={16} /> Withdraw
          </button>

          <button
            className="wal-action wal-action-icon"
            onClick={load}
            aria-label="Refresh wallet"
            type="button"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {showWithdrawForm && (
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

        {showPaymentModal && (
          <div className="wal-payment-backdrop" role="presentation">
            <section className="wal-payment-modal" role="dialog" aria-modal="true" aria-label="Make a deposit">
              <button className="wal-modal-close" type="button" onClick={() => setShowPaymentModal(false)} aria-label="Close payment modal"><X size={18} /></button>
              <DepositCenter />
            </section>
          </div>
        )}

        {withdrawGateMessage && (
          <div className="wal-gate-backdrop" role="presentation">
            <section className="wal-gate-modal" role="dialog" aria-modal="true" aria-labelledby="wal-gate-title">
              <button className="wal-modal-close" type="button" onClick={() => setWithdrawGateMessage("")} aria-label="Close withdrawal requirement"><X size={18} /></button>
              <div className="wal-gate-icon"><CreditCard size={28} /></div>
              <h3 id="wal-gate-title">One quick step first</h3>
              <p>{withdrawGateMessage}</p>
              <Link className="wal-submit" href="/" onClick={() => setWithdrawGateMessage("")}>Go to sportsbook</Link>
            </section>
          </div>
        )}

        {withdrawSuccess && (
          <div className="wal-success-backdrop" role="presentation">
            <section className="wal-success-modal" role="dialog" aria-modal="true" aria-labelledby="wal-success-title">
              <button className="wal-success-close" type="button" onClick={() => setWithdrawSuccess(false)} aria-label="Close withdrawal success message"><X size={18} /></button>
              <div className="wal-success-icon"><CheckCircle2 size={34} /></div>
              <h3 id="wal-success-title">Withdrawal successful</h3>
              <p>Your withdrawal request was submitted successfully and is now waiting for review.</p>
              <button className="wal-submit" type="button" onClick={() => setWithdrawSuccess(false)}>Done</button>
            </section>
          </div>
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

                return (
                  <div className="wal-activity-row" key={tx.id}>
                    <span className={`wal-activity-icon${isCredit ? " is-credit" : ""}`}>
                      {isCredit
                        ? <ArrowDownRight size={15} />
                        : <ArrowUpRight   size={15} />
                      }
                    </span>
                    <div className="wal-activity-text">
                      <b>{KIND_LABEL[tx.kind] ?? tx.kind}</b>
                      <small>
                        {new Date(tx.createdAt).toLocaleString()}
                        {tx.status ? ` · ${tx.status}` : ""}
                      </small>
                    </div>
                    <strong className={isCredit ? "is-credit" : ""}>
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
        box-shadow: none;
        color: #F4F1F0;
        transition: transform .22s cubic-bezier(.22,1,.36,1), box-shadow .22s ease;
      }
      .wal-card:hover  { transform: translateY(-3px) scale(1.01); box-shadow: none; }
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
        box-shadow: none;
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
        background: var(--blue); color: #fff; box-shadow: none;
        text-decoration: none;
      }
      .wal-action-solid:hover { transform: translateY(-2px); }
      .wal-action-ghost {
        background: #141414; color: #F4F1F0;
        border: 1px solid var(--line); box-shadow: none;
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
        border: 1px solid var(--line); box-shadow: none;
      }
      .wal-action-icon:hover { color: var(--blue); }

      /* ── Generic panel ── */
      .wal-panel {
        background: #141414; border: 1px solid var(--line);
        box-shadow: none; border-radius: 12px; padding: 20px;
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

      .wal-success-backdrop,.wal-payment-backdrop,.wal-gate-backdrop{position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:18px;background:rgba(0,0,0,.72)}
      .wal-success-modal{position:relative;width:min(420px,100%);padding:28px 22px 22px;text-align:center;border:1px solid rgba(91,224,143,.4);border-radius:16px;background:#151515;box-shadow:none}.wal-gate-modal{position:relative;width:min(360px,100%);padding:28px 24px 22px;text-align:center;border:1px solid #d9e4f0;border-radius:18px;background:#fff;box-shadow:none}
      .wal-payment-modal{position:relative;width:min(760px,100%);max-height:90vh;overflow:auto;border:1px solid #d7e3f2;border-radius:16px;background:#fff;box-shadow:none}
      .wal-payment-modal .dep-page{min-height:0;background:#fff}.wal-payment-modal .dep-hero{border-radius:16px 16px 0 0;padding:22px 24px}.wal-payment-modal .dep-body{padding:18px 20px 24px}.wal-payment-modal .dep-info-card,.wal-payment-modal .dep-log-panel{display:none}
      .wal-modal-close{position:absolute;top:10px;right:10px;z-index:3;width:32px;height:32px;display:grid;place-items:center;border:1px solid #d3dce8;border-radius:50%;background:#fff;color:#4e6076;cursor:pointer}
      .wal-success-close{position:absolute;top:10px;right:10px;width:32px;height:32px;display:grid;place-items:center;border:1px solid #303030;border-radius:50%;background:#202020;color:#d7d7d7;cursor:pointer}.wal-success-icon,.wal-gate-icon{display:grid;place-items:center;width:64px;height:64px;margin:0 auto 12px;border-radius:50%;color:#8cf0b3;background:rgba(91,224,143,.13);border:1px solid rgba(91,224,143,.35)}.wal-gate-icon{width:54px;height:54px;color:#1e6bff;background:#eaf2ff;border-color:#b7d0f2}.wal-success-modal h3{margin:0 0 8px;color:#f5f5f5;font-size:20px}.wal-gate-modal h3{margin:0 0 8px;color:#173a68;font-size:20px}.wal-success-modal p{margin:0 auto 18px;max-width:310px;color:#a4aaa7;font-size:13px;line-height:1.5}.wal-gate-modal p{margin:0 auto 18px;max-width:280px;color:#5f7489;font-size:13px;line-height:1.45}.wal-success-modal .wal-submit,.wal-gate-modal .wal-submit{width:100%;text-decoration:none}.wal-gate-modal .wal-submit{display:flex;align-items:center;justify-content:center;padding:13px;border-radius:10px;background:#1e6bff;color:#fff}
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
    `}</style>
  );
}
