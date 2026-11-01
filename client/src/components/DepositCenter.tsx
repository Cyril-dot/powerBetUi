import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  CheckCircle2,
  Hourglass,
  Loader2,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import api, { ApiError, type ShinobiPayVerifyResponse } from "@/lib/api";
import { useSession } from "@/lib/session";

/* Deposit centre — ShinobiPay, GHANA ONLY (owner direction
   2026-10-16: ShinobiPay in, Flutterwave out. PowerBet deposits are
   Mobile Money in Ghana, full stop — the Nigeria option was removed
   2026-10-15 and Flutterwave v4 held the Ghana rail for a day.)
   Ghana: direct MoMo prompt + in-page status polling.
   Verify-first (2026-10-31): the form verifies the number via
   /api/wallet/deposit/akwapay/verify BEFORE any prompt; the prompt
   only goes out after the player confirms the account name + total.
   Crediting is webhook-only on the backend; the wait state polls the
   intent status read-only — the wallet credit lands when the signed
   ShinobiPay webhook settles the payment. */

const MIN_GHS = 50;
const MAX_GHS = 5000;
const GH_QUICK = [50, 100, 250, 500, 1000];

type Row = Record<string, unknown>;

const asNum = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
const asText = (value: unknown, fallback = "—") => value === null || value === undefined || value === "" ? fallback : String(value);
const ghs = (value: unknown) => `GH₵${asNum(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (value: unknown) => { const d = new Date(asText(value, "")); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); };

/* A gateway 5xx must never surface raw server text to the player;
   genuine 4xx messages (bad amount, bad number) pass through. */
function friendlyError(err: unknown, fallback = "Payments are temporarily unavailable — please try again in a few minutes."): string {
  if (err instanceof ApiError) {
    if (err.status >= 500 || !err.message || /internal server error/i.test(err.message)) return fallback;
    return err.message;
  }
  return fallback;
}

const GH_PREFIXES: Record<string, string> = {
  "024": "MTN", "025": "MTN", "053": "MTN", "054": "MTN", "055": "MTN", "059": "MTN",
  "020": "TELECEL", "050": "TELECEL",
  "026": "AIRTELTIGO", "027": "AIRTELTIGO", "056": "AIRTELTIGO", "057": "AIRTELTIGO",
};
function detectNetwork(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  const local = digits.startsWith("233") && digits.length === 12 ? "0" + digits.slice(3) : digits;
  return GH_PREFIXES[local.slice(0, 3)] ?? "";
}

function StatusPanel({ tone, icon, label, title, copy, children }: { tone?: string; icon: React.ReactNode; label: string; title: string; copy: React.ReactNode; children?: React.ReactNode }) {
  return <section className={`deposit-panel deposit-status-panel ${tone ?? ""}`} role="status">
    <div className="deposit-status-icon">{icon}</div>
    <span className="deposit-status-label">{label}</span>
    <h2>{title}</h2>
    <p className="deposit-status-copy">{copy}</p>
    {children}
  </section>;
}

/* ─── Ghana — ShinobiPay Mobile Money (direct prompt) ─────────────── */
function GhanaDeposit() {
  const [phase, setPhase] = useState<"form" | "confirm" | "waiting" | "done" | "stalled">("form");
  const [amount, setAmount] = useState("50");
  const [phone, setPhone] = useState("");
  const [network, setNetwork] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [intentId, setIntentId] = useState("");
  const [verify, setVerify] = useState<ShinobiPayVerifyResponse | null>(null);
  const value = parseFloat(amount);

  // Gate payments land here via /deposit?amount=X: pre-fill that exact
  // amount so the player pays it through the same ShinobiPay deposit
  // endpoint instead of retyping it (a mistyped amount would fail the
  // exact-amount gate verification).
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const a = Number(q.get("amount"));
      if (Number.isFinite(a) && a >= MIN_GHS && a <= MAX_GHS) setAmount(String(a));
    } catch { /* ignore bad query strings */ }
  }, []);

  // The backend's prefix table expects the local 0-prefixed format.
  const localPhoneOf = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "");
    return digits.startsWith("233") && digits.length === 12 ? "0" + digits.slice(3) : digits;
  };
  const networkLabel = (n: string) => n === "AIRTELTIGO" ? "AirtelTigo" : n === "TELECEL" ? "Telecel" : "MTN";

  const start = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!Number.isFinite(value) || value < MIN_GHS) { setError(`Minimum deposit is GH₵${MIN_GHS}.`); return; }
    if (value > MAX_GHS) { setError(`Maximum deposit is GH₵${MAX_GHS.toLocaleString()}.`); return; }
    if (!phone.trim()) { setError("Enter your MoMo number to receive the payment prompt."); return; }
    const chosen = network || detectNetwork(phone);
    if (!chosen) { setError("Choose your network — MTN, Telecel or AirtelTigo."); return; }
    const localPhone = localPhoneOf(phone);
    setBusy(true);
    try {
      // Verify FIRST, once per attempt — no prompt goes out unless the
      // envelope comes back verified:true.
      const res = await api.deposits.shinobiPayVerify({ amount: value, phone: localPhone, network: chosen as "MTN" | "TELECEL" | "AIRTELTIGO" });
      if (res?.verified === true) { setVerify(res); setPhase("confirm"); return; }
      const reason = String(res?.reason ?? "");
      const serverMessage = typeof res?.message === "string" && res.message.trim() ? res.message : "";
      if (serverMessage) setError(serverMessage);
      else if (reason === "no_account") setError(`This number has no MoMo account on ${networkLabel(String(res?.network ?? chosen))}. Check the number and try again.`);
      else if (reason === "unavailable") setError("The check could not run — wait a few minutes and try again. No prompt has been sent.");
      else setError("Number verification is not available right now. Please try again shortly.");
    } catch (err) { setError(friendlyError(err)); }
    finally { setBusy(false); }
  };

  // Confirm reuses the verify result — it NEVER re-verifies, and it is
  // the only path that calls init, so no prompt is sent unverified.
  const confirmDeposit = async () => {
    const chosen = network || detectNetwork(phone);
    if (!chosen) { setError("Choose your network — MTN, Telecel or AirtelTigo."); setPhase("form"); return; }
    setBusy(true);
    try {
      const res = await api.deposits.shinobiPayInit({ amount: value, phone: localPhoneOf(phone), network: chosen as "MTN" | "TELECEL" | "AIRTELTIGO" });
      const id = String(res?.id ?? "");
      if (!id) { setError("The payment could not be started. Try again."); setPhase("form"); return; }
      setIntentId(id);
      setPhase("waiting");
    } catch (err) { setError(friendlyError(err)); setPhase("form"); }
    finally { setBusy(false); }
  };

  // Back/Edit returns to the form with the typed values kept.
  const backToForm = () => { setVerify(null); setError(""); setPhase("form"); };

  useEffect(() => {
    if (phase !== "waiting" || !intentId) return;
    let cancelled = false;
    let tries = 0;
    const poll = async () => {
      tries++;
      try {
        const res = await api.deposits.shinobiPayStatus(intentId);
        if (cancelled) return;
        const s = String(res?.status ?? "").toLowerCase();
        if (s === "succeeded" || s === "successful") { setPhase("done"); return; }
        if (["failed", "declined", "cancelled", "canceled", "expired", "rejected", "error"].includes(s)) { setError("The payment was not completed. You have not been charged — try again."); setPhase("form"); return; }
      } catch { /* a failed check is not a failed payment — keep polling */ }
      if (cancelled) return;
      if (tries >= 30) { setPhase("stalled"); return; }
      setTimeout(poll, 4000);
    };
    poll();
    return () => { cancelled = true; };
  }, [phase, intentId]);

  const reset = () => { setPhase("form"); setAmount("50"); setPhone(""); setNetwork(""); setError(""); setIntentId(""); setVerify(null); };

  if (phase === "done") return <StatusPanel icon={<CheckCircle2 size={28} />} label="DEPOSIT CONFIRMED" title="Deposit successful" copy={<>{ghs(value)} has been added to your wallet.</>}>
    <div className="deposit-status-actions"><button className="deposit-secondary" type="button" onClick={reset}>Make another deposit</button><Link href="/wallet" className="deposit-secondary" style={{ textDecoration: "none" }}>Go to wallet</Link></div>
  </StatusPanel>;
  if (phase === "stalled") return <StatusPanel tone="timeout" icon={<Hourglass size={28} />} label="STILL CONFIRMING" title="Still confirming" copy={<>Your approval is still being confirmed. If you entered your PIN, the money lands in your wallet automatically — <b>don&apos;t pay again</b>.</>}>
    <div className="deposit-status-actions"><button className="deposit-secondary" type="button" onClick={reset}>Done</button></div>
  </StatusPanel>;
  if (phase === "waiting") return <StatusPanel tone="pending" icon={<Loader2 size={28} className="deposit-spin" />} label="AWAITING APPROVAL" title="Check your phone" copy={<>A MoMo prompt is on its way to <b>{phone}</b> — enter your PIN to approve <b>{ghs(value)}</b>. This page updates on its own when the payment lands.</>}>
    <div className="deposit-status-actions"><button className="deposit-secondary" type="button" onClick={reset}>Cancel deposit</button></div>
  </StatusPanel>;
  if (phase === "confirm" && verify) {
    const totalDisplay = typeof verify.amount?.total_display === "string" && verify.amount.total_display ? verify.amount.total_display : ghs(asNum(verify.amount?.total_minor) / 100);
    const confirmNetwork = network || verify.network || "";
    return <StatusPanel icon={<ShieldCheck size={28} />} label="CONFIRM DEPOSIT" title="Confirm your deposit" copy={<>You&apos;re paying <b>{totalDisplay}</b> to <b>{asText(verify.account_name)}</b>. Confirm?</>}>
      <p className="deposit-status-copy">To <b>{localPhoneOf(phone)}</b>{confirmNetwork ? <> · {networkLabel(confirmNetwork)}</> : null}</p>
      <div className="deposit-status-actions">
        <button className="deposit-submit" type="button" onClick={confirmDeposit} disabled={busy}>{busy ? <><Loader2 size={18} className="deposit-spin" /> Starting…</> : "Confirm"}</button>
        <button className="deposit-secondary" type="button" onClick={backToForm} disabled={busy}>Back / Edit</button>
      </div>
    </StatusPanel>;
  }

  return <form className="deposit-panel" onSubmit={start}>
    {error && <div className="deposit-error" role="alert"><AlertCircle size={15} />{error}</div>}
    <div className="deposit-field deposit-field-first">
      <label htmlFor="gh-amount">Amount to deposit</label>
      <div className="deposit-amount-wrap"><b>GH₵</b><input id="gh-amount" value={amount} onChange={(ev) => setAmount(ev.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="50.00" /></div>
    </div>
    <div className="deposit-quick-row">{GH_QUICK.map((v) => <button type="button" key={v} className={amount === String(v) ? "selected" : ""} onClick={() => setAmount(String(v))}>GH₵{v.toLocaleString()}</button>)}</div>
    <label className="deposit-field"><span>MoMo number</span><input value={phone} onChange={(ev) => { setPhone(ev.target.value.replace(/[^0-9+]/g, "")); const d = detectNetwork(ev.target.value); if (d) setNetwork(d); }} inputMode="tel" placeholder="024 123 4567" /></label>
    <div className="deposit-quick-row">{(["MTN", "TELECEL", "AIRTELTIGO"] as const).map((n) => <button type="button" key={n} className={network === n ? "selected" : ""} onClick={() => setNetwork(n)}>{n === "AIRTELTIGO" ? "AirtelTigo" : n === "MTN" ? "MTN" : "Telecel"}</button>)}</div>
    <button className="deposit-submit" type="submit" disabled={busy || !Number.isFinite(value) || value < MIN_GHS}>{busy ? <><Loader2 size={18} className="deposit-spin" /> Verifying…</> : <><Smartphone size={18} /> Deposit</>}</button>
    <p className="deposit-facts"><ShieldCheck size={13} /> Instant deposits · ShinobiPay · Min GH₵{MIN_GHS} · Max GH₵{MAX_GHS.toLocaleString()}</p>
  </form>;
}

/* ─── Page shell ──────────────────────────────────────────────────── */
export default function DepositCenter() {
  const signedIn = typeof window !== "undefined" && !!window.localStorage.getItem("accessToken");
  const { balance } = useSession();
  const [history, setHistory] = useState<Row[]>([]);

  useEffect(() => {
    if (!signedIn) return;
    // Optional-chained on purpose: this legacy list is informational only,
    // and a missing method must NEVER white-screen the deposit page — that
    // exact crash (stale deployed api chunk without myBankDeposits) took
    // the page down on 2026-10-15.
    api.deposits.myBankDeposits?.(0, 10).then((page) => setHistory(Array.isArray(page.content) ? (page.content as Row[]) : [])).catch(() => { /* legacy list is informational */ });
  }, [signedIn]);

  const chipClass = (status: string) => status === "APPROVED" ? "ok" : status === "REJECTED" ? "bad" : "wait";

  return (
    <main className="deposit-page">
      <div className="deposit-shell">
        <div className="deposit-title-row">
          <h1>Deposit</h1>
          {signedIn && balance !== null && (
            <span className="deposit-title-balance">Balance <b>{ghs(balance)}</b></span>
          )}
        </div>

        {!signedIn ? (
          <section className="deposit-panel deposit-status-panel">
            <div className="deposit-status-icon"><Smartphone size={28} /></div>
            <span className="deposit-status-label">SIGN IN REQUIRED</span>
            <h2>Log in to make a deposit</h2>
            <p className="deposit-status-copy">You need an account so we can credit the right wallet when your payment is confirmed.</p>
            <Link href="/login" className="deposit-submit" style={{ textDecoration: "none" }}>Log in</Link>
          </section>
        ) : (
          <GhanaDeposit />
        )}

        {signedIn && history.length > 0 && (
          <section className="deposit-panel deposit-requests">
            <h2>Your manual transfer requests</h2>
            {history.map((row, i) => {
              const status = asText(row.status, "PENDING");
              return <div className="deposit-request-row" key={asText(row.id, String(i))}>
                <div><b>{ghs(row.ngnAmountSent)}</b><small>{formatDate(row.createdAt)} · Ref {asText(row.transferReference)}{typeof row.screenshotUrl === "string" && row.screenshotUrl.startsWith("http") && <> · <a className="proof-link" href={row.screenshotUrl} target="_blank" rel="noreferrer">View proof</a></>}</small>{status === "REJECTED" && asText(row.adminNote, "") !== "—" && <small className="rej">Reason: {asText(row.adminNote)}</small>}</div>
                <span className={`deposit-chip ${chipClass(status)}`}>{status}</span>
              </div>;
            })}
          </section>
        )}
      </div>
    </main>
  );
}
