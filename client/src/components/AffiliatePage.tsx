import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, BarChart3, Check, CheckCircle2, Coins, Copy, Link2, Plus, RefreshCw, Users, WalletCards } from "lucide-react";
import api, { ApiError } from "@/lib/api";

type Row = Record<string, unknown>;

const asNum = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
const asText = (value: unknown, fallback = "—") => value === null || value === undefined || value === "" ? fallback : String(value);
const SYMBOLS: Record<string, string> = { GHS: "₵", NGN: "₦" };
const money = (value: unknown, currency?: unknown) => { const code = typeof currency === "string" && currency ? currency.toUpperCase() : "GHS"; const symbol = SYMBOLS[code] ?? `${code} `; return `${symbol}${asNum(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; };
const formatDate = (value: unknown) => { const d = new Date(asText(value, "")); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); };
const referralUrlFor = (row: Row) => { const code = asText(row.code, ""); return code ? `${window.location.origin}/register?ref=${encodeURIComponent(code)}` : ""; };

export default function AffiliatePage() {
  const signedIn = typeof window !== "undefined" && !!window.localStorage.getItem("accessToken");
  const [stats, setStats] = useState<Row>({});
  const [links, setLinks] = useState<Row[]>([]);
  const [users, setUsers] = useState<Row[]>([]);
  const [withdrawals, setWithdrawals] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ amount: "", bankName: "", accountNumber: "", accountName: "", mobileMoneyNumber: "" });
  const [withdrawing, setWithdrawing] = useState(false);

  const load = async () => {
    setLoading(true); setError("");
    const [s, l, u, w] = await Promise.allSettled([
      api.affiliate.getStats(),
      api.affiliate.getLinks(),
      api.affiliate.getReferredUsers(),
      api.affiliate.getWithdrawals(0, 20),
    ]);
    if (s.status === "fulfilled") setStats(s.value);
    if (l.status === "fulfilled") setLinks(l.value);
    if (u.status === "fulfilled") setUsers(u.value);
    if (w.status === "fulfilled") setWithdrawals(Array.isArray(w.value.content) ? (w.value.content as Row[]) : []);
    const failed = [s.status === "rejected" && "stats", l.status === "rejected" && "links", u.status === "rejected" && "referred users", w.status === "rejected" && "withdrawals"].filter(Boolean);
    if (failed.length) setError(`Some affiliate data could not be loaded: ${failed.join(", ")}.`);
    setLoading(false);
  };
  useEffect(() => { if (signedIn) void load(); else setLoading(false); }, []);

  const currency = asText(stats.currency, "GHS");
  const available = asNum(stats.availableBalance);
  const primary = links.find((l) => l.active !== false) ?? links[0];
  const primaryUrl = primary ? referralUrlFor(primary) : "";

  const copyLink = async () => {
    if (!primaryUrl) return;
    try { await navigator.clipboard.writeText(primaryUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setError("Clipboard access was not available. Select and copy the link manually."); }
  };

  const createLink = async () => {
    setCreating(true); setError(""); setMessage("");
    try {
      await api.affiliate.createLink({ label: label.trim() || undefined });
      setLabel("");
      setMessage("Referral link created.");
      await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not create the referral link."); }
    finally { setCreating(false); }
  };

  const withdraw = async () => {
    setError(""); setMessage("");
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount < 1) { setError("Enter a withdrawal amount of at least 1.00."); return; }
    if (amount > available) { setError(`Amount exceeds your available balance of ${money(available, currency)}.`); return; }
    if (!form.bankName.trim() || !form.accountNumber.trim() || !form.accountName.trim()) { setError("Bank name, account number and account name are all required."); return; }
    setWithdrawing(true);
    try {
      await api.affiliate.requestWithdrawal({ amount, accountDetails: { bankName: form.bankName.trim(), accountNumber: form.accountNumber.trim(), accountName: form.accountName.trim(), mobileMoneyNumber: form.mobileMoneyNumber.trim() || undefined } });
      setMessage("Withdrawal requested — the amount has been held from your balance and our team will pay it out to your account.");
      setForm({ amount: "", bankName: "", accountNumber: "", accountName: "", mobileMoneyNumber: "" });
      await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Withdrawal request failed. Please try again."); }
    finally { setWithdrawing(false); }
  };

  if (!signedIn) {
    return <main className="wrap aff-page">
      <div className="aff-head"><span className="eyebrow">Grow with Super Bet</span><h1>Affiliate centre</h1></div>
      <section className="panel simple-card">
        <Users size={30} />
        <h3>Sign in to get your referral link</h3>
        <p>Every Super Bet player can earn commission by inviting friends. Sign in to see your personal link, track who joined, and withdraw your balance.</p>
        <Link href="/login" className="gold-button">Log in <Check size={15} /></Link>
      </section>
    </main>;
  }

  return <main className="wrap aff-page">
    <div className="aff-head">
      <div><span className="eyebrow">Grow with Super Bet</span><h1>Affiliate centre</h1></div>
      <button className="ghost-button" onClick={load} disabled={loading}><RefreshCw size={14} className={loading ? "adm-spin" : ""} /> Refresh</button>
    </div>
    {error && <small className="auth-notice" role="alert" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}><AlertTriangle size={14} /> {error}</small>}
    {message && <small className="auth-notice bp-success" role="status" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}><CheckCircle2 size={14} /> {message}</small>}

    <div className="aff-grid">
      <section className="panel aff-stat"><Users size={18} /><small>Total referrals</small><strong>{loading ? "…" : asText(stats.totalReferrals, "0")}</strong></section>
      <section className="panel aff-stat"><Coins size={18} /><small>Commission earned</small><strong>{loading ? "…" : money(stats.lifetimeCommission, currency)}</strong></section>
      <section className="panel aff-stat"><BarChart3 size={18} /><small>Referred stakes</small><strong>{loading ? "…" : money(stats.lifetimeStake, currency)}</strong></section>
      <section className="panel aff-stat"><WalletCards size={18} /><small>Available balance</small><strong>{loading ? "…" : money(stats.availableBalance, currency)}</strong></section>
    </div>

    <section className="panel aff-panel">
      <h2><Link2 size={18} /> Your referral link</h2>
      <p className="aff-sub">Share this link — anyone who signs up through it is credited to you, and you earn commission on their play.</p>
      {primaryUrl ? <div className="aff-link-row"><code>{primaryUrl}</code><button className="gold-button" onClick={copyLink}>{copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy link</>}</button></div>
        : <p className="aff-sub">{loading ? "Loading your links…" : "You don't have a referral link yet — create your first one below."}</p>}
      <div className="aff-link-row" style={{ marginTop: 14 }}>
        <input className="aff-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="New link label (optional) e.g. WhatsApp group" maxLength={100} />
        <button className="ghost-button" onClick={createLink} disabled={creating}><Plus size={15} /> {creating ? "Creating…" : "Create link"}</button>
      </div>
      {links.length > 1 && <p className="aff-sub" style={{ marginTop: 10 }}>{links.length} links created · primary link above earns at {asText(primary?.commissionPercent, "—")}% commission.</p>}
    </section>

    <section className="panel aff-panel">
      <h2><Users size={18} /> Referred users</h2>
      {users.length === 0 ? <p className="aff-sub">{loading ? "Loading…" : "No referred users yet. Share your link to start earning."}</p> :
        <div className="aff-table-wrap"><table className="aff-table"><thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Deposited</th><th>Commission</th></tr></thead><tbody>
          {users.map((u, i) => <tr key={i}><td>{[asText(u.firstName, ""), asText(u.lastName, "")].filter(Boolean).join(" ") || "—"}</td><td>{asText(u.email)}</td><td>{formatDate(u.joinedAt)}</td><td>{money(u.totalDeposited, currency)}</td><td>{money(u.lifetimeCommission, currency)}</td></tr>)}
        </tbody></table></div>}
    </section>

    <section className="panel aff-panel">
      <h2><WalletCards size={18} /> Withdraw your balance</h2>
      <p className="aff-sub">Withdrawals are taken from your available balance of <b>{money(available, currency)}</b> and held immediately; our team pays out to the account below.</p>
      <div className="aff-form">
        <label>Amount ({currency})<input type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="e.g. 500" /></label>
        <label>Bank / network name<input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="e.g. MTN MoMo or GTBank" /></label>
        <label>Account number<input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} placeholder="Account or wallet number" /></label>
        <label>Account name<input value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} placeholder="Name on the account" /></label>
        <label>Mobile Money number (optional)<input value={form.mobileMoneyNumber} onChange={(e) => setForm({ ...form, mobileMoneyNumber: e.target.value })} placeholder="If paying to MoMo instead" /></label>
      </div>
      <button className="gold-button" style={{ marginTop: 16 }} onClick={withdraw} disabled={withdrawing}>{withdrawing ? "Requesting…" : "Request withdrawal"}</button>
      {withdrawals.length > 0 && <div className="aff-table-wrap" style={{ marginTop: 18 }}><table className="aff-table"><thead><tr><th>Amount</th><th>Status</th><th>Destination</th><th>Requested</th></tr></thead><tbody>
        {withdrawals.map((w, i) => <tr key={i}><td>{money(w.amount, w.currency)}</td><td>{asText(w.status)}</td><td>{asText(w.accountName)} · {asText(w.mobileMoneyNumber) !== "—" ? asText(w.mobileMoneyNumber) : asText(w.bankName)}</td><td>{formatDate(w.requestedAt)}</td></tr>)}
      </tbody></table></div>}
    </section>
  </main>;
}
