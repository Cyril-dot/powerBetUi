import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Hourglass,
  Landmark,
  Loader2,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";
import api, { ApiError, type FlutterwaveNgBank, type ShinobiPayVerifyResponse } from "@/lib/api";
import { readGhanaDepositsPaused, subscribeGhanaDepositsPaused } from "@/lib/depositControl";
import { useSession } from "@/lib/session";

/* Deposit centre — Ghana: ShinobiPay MoMo (owner direction 2026-10-16:
   ShinobiPay in, Flutterwave out. PowerBet deposits are Mobile Money
   in Ghana, full stop — the Nigeria option was removed 2026-10-15 and
   Flutterwave v4 held the Ghana rail for a day.)
   Ghana: direct MoMo prompt + in-page status polling.
   Verify-first (2026-10-31): the form verifies the number via
   /api/wallet/deposit/akwapay/verify BEFORE any prompt; the prompt
   only goes out after the player confirms the account name + total.
   Crediting is webhook-only on the backend; the wait state polls the
   intent status read-only — the wallet credit lands when the signed
   ShinobiPay webhook settles the payment.
   Nigeria (owner order 2026-11-07): Flutterwave v3 — bank transfer
   (one-time virtual account), Card/Bank + OPay via hosted checkout,
   USSD — all on futballBackend's FlutterwaveNgV3DepositController,
   the same endpoints LuckyStake's NigeriaDeposit uses. Credit is
   verify/webhook-only server-side; the page polls
   /api/wallet/deposit/flutterwave/ng/verify until it confirms. */

const MIN_GHS = 50;
const MAX_GHS = 5000;
const GH_QUICK = [50, 100, 250, 500, 1000];

/* Nigeria — Flutterwave v3. Backend minimum is NGN 2,000
   (app.platform.min-deposit-amount-ngn, default 2000); the form
   enforces the same floor so a below-minimum request never leaves. */
const MIN_NGN = 2000;
const NG_QUICK = [2000, 5000, 10000, 20000, 50000, 100000];
const NG_COUNTRY_KEY = "playbet_deposit_country";
type DepositCountry = "GH" | "NG";
type NgMethod = "transfer" | "bank" | "ussd" | "opay";

/* OWNER ORDER 2026-11-06: Ghana deposits are OPEN for everyone
   (unpaused — supersedes the 2026-11-05 pause). Live state comes from
   @/lib/depositControl: the super-admin switch can pause again from
   any browser, and fresh browsers default to open. */

type Row = Record<string, unknown>;

const asNum = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
const asText = (value: unknown, fallback = "—") => value === null || value === undefined || value === "" ? fallback : String(value);
const ghs = (value: unknown) => `GH₵${asNum(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ngn = (value: unknown) => `₦${asNum(value).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

/* ─── Nigeria — Flutterwave v3 ────────────────────────────────────────
   Same four methods LuckyStake's NigeriaDeposit offers, on the same
   backend endpoints: bank transfer (one-time virtual account), Card /
   Bank and OPay (hosted checkout — the browser leaves for
   Flutterwave's page and returns to /deposit?method=ngv3), USSD
   (dial string for the player's bank). Transfer + USSD poll
   ng/verify until the backend confirms the credit; the redirect
   params are never trusted — the return page polls the same verify
   endpoint (see NigeriaReturn below). */
function NigeriaDeposit({ onInFlight }: { onInFlight: (inFlight: boolean) => void }) {
  const { refresh } = useSession();
  const [phase, setPhase] = useState<"form" | "waiting" | "done" | "stalled">("form");
  const [amount, setAmount] = useState(String(MIN_NGN));
  const [method, setMethod] = useState<NgMethod>("transfer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [va, setVa] = useState<{ accountNumber: string; bankName: string; expiresAt?: string; note?: string; amount?: number } | null>(null);
  const [ussdNote, setUssdNote] = useState("");
  const [banks, setBanks] = useState<FlutterwaveNgBank[]>([]);
  const [bankCode, setBankCode] = useState("");
  const [banksFailed, setBanksFailed] = useState(false);
  const [reference, setReference] = useState("");
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  const value = parseFloat(amount);
  const valid = Number.isFinite(value) && value >= MIN_NGN;

  const stopPoll = () => { if (timer.current) { window.clearInterval(timer.current); timer.current = null; } };
  useEffect(() => stopPoll, []);
  // If this unmounts mid-payment (navigation), release the country lock.
  useEffect(() => () => onInFlight(false), [onInFlight]);

  function pollVerify(ref: string) {
    stopPoll();
    let tries = 0;
    timer.current = window.setInterval(async () => {
      tries += 1;
      try {
        const res = await api.deposits.flutterwaveNgVerify(ref);
        const s = String(res?.status ?? "").toLowerCase();
        if (res?.credited || s === "succeeded") { stopPoll(); onInFlight(false); setPhase("done"); refresh(); return; }
        if (s === "failed") { stopPoll(); onInFlight(false); setError("That payment failed. Please try again."); setPhase("form"); return; }
      } catch { /* a failed check is not a failed payment — keep polling */ }
      if (tries >= 30) { stopPoll(); onInFlight(false); setPhase("stalled"); }
    }, 5000);
  }

  // USSD needs the bank list from Flutterwave (via the backend).
  useEffect(() => {
    if (method !== "ussd" || banks.length || banksFailed) return;
    api.deposits.flutterwaveNgUssdBanks().then((res) => {
      const rows = Array.isArray(res) ? res : (res?.data ?? []);
      const list = (Array.isArray(rows) ? rows : [])
        .map((b) => ({ name: String(b?.name ?? "Bank"), code: String(b?.code ?? b?.id ?? "") }))
        .filter((b) => b.code);
      setBanks(list);
      if (list.length) setBankCode((current) => current || list[0].code);
      else setBanksFailed(true);
    }).catch(() => setBanksFailed(true));
  }, [method, banks.length, banksFailed]);

  const reset = () => { stopPoll(); onInFlight(false); setPhase("form"); setVa(null); setUssdNote(""); setError(""); setAmount(String(MIN_NGN)); setReference(""); setCopied(false); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!valid) { setError(`Minimum deposit is ₦${MIN_NGN.toLocaleString()}.`); return; }
    setBusy(true);
    try {
      if (method === "transfer") {
        const res = await api.deposits.flutterwaveNgBankTransferInit({ amount: value });
        const ref = String(res?.reference ?? "");
        if (!ref || !res?.accountNumber) throw new Error("Flutterwave did not return transfer account details. Please try again.");
        setVa({
          accountNumber: String(res.accountNumber),
          bankName: String(res.bankName ?? ""),
          expiresAt: res.expiresAt ? String(res.expiresAt) : undefined,
          note: res.note ? String(res.note) : undefined,
          amount: res.amount != null && Number.isFinite(Number(res.amount)) ? Number(res.amount) : undefined,
        });
        setReference(ref);
        setPhase("waiting");
        onInFlight(true);
        pollVerify(ref);
      } else if (method === "ussd") {
        if (!bankCode) { setError("Choose your bank first."); return; }
        const res = await api.deposits.flutterwaveNgUssdInit({ amount: value, bankCode });
        const ref = String(res?.reference ?? "");
        if (!ref) throw new Error("Could not start that payment. Please try again.");
        setUssdNote(String(res?.note ?? "Dial your bank's USSD code to complete payment"));
        setReference(ref);
        setPhase("waiting");
        onInFlight(true);
        pollVerify(ref);
      } else {
        const res = await api.deposits.flutterwaveNgHostedInit({ amount: value, method: method === "opay" ? "opay" : "card" });
        const url = String(res?.redirectUrl ?? "");
        if (!url) throw new Error("Could not start that payment. Please try again.");
        window.location.assign(url);
        return;
      }
    } catch (err) { setError(friendlyError(err)); }
    finally { setBusy(false); }
  };

  const ctaLabel = method === "transfer" ? "Get transfer account" : method === "ussd" ? "Get USSD code" : method === "opay" ? "Continue with OPay" : "Continue to my bank";
  const methodNote = method === "transfer"
    ? "We will generate a one-time account number for this exact amount — transfer to it and your wallet credits automatically."
    : method === "ussd"
      ? "We will give you a code to dial on your phone — approve it with your bank and your wallet credits automatically."
      : method === "opay"
        ? "You will be taken to OPay to approve the payment, then returned here."
        : "You will be taken to your bank to approve the payment, then returned here.";

  if (phase === "done") return <StatusPanel icon={<CheckCircle2 size={28} />} label="DEPOSIT CONFIRMED" title="Deposit successful" copy={<>{ngn(value)} has been added to your wallet.</>}>
    <div className="deposit-status-actions"><button className="deposit-secondary" type="button" onClick={reset}>Make another deposit</button><Link href="/wallet" className="deposit-secondary" style={{ textDecoration: "none" }}>Go to wallet</Link></div>
  </StatusPanel>;
  if (phase === "stalled") return <StatusPanel tone="timeout" icon={<Hourglass size={28} />} label="STILL CONFIRMING" title="Still confirming" copy={<>Your payment is taking longer than usual. If it completed, your wallet credits automatically — <b>don&apos;t pay again</b>.</>}>
    <div className="deposit-status-actions"><button className="deposit-secondary" type="button" onClick={reset}>Done</button></div>
  </StatusPanel>;
  if (phase === "waiting") {
    const copyAccount = () => {
      if (!va) return;
      try { navigator.clipboard?.writeText(va.accountNumber); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ }
    };
    return <StatusPanel tone="pending" icon={<Loader2 size={28} className="deposit-spin" />} label="AWAITING PAYMENT" title={va ? `Transfer ${ngn(va.amount ?? value)}` : "Complete on your phone"} copy={<>{va ? "Send the exact amount to this account:" : ussdNote}</>}>
      {va && <div className="deposit-va-card">
        <div><span>Bank</span><b>{va.bankName || "—"}</b></div>
        <div><span>Account number</span><b className="deposit-va-number">{va.accountNumber}</b><button type="button" className="deposit-copy-btn" onClick={copyAccount}>{copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}</button></div>
        <div><span>Amount</span><b>{ngn(va.amount ?? value)}</b></div>
        {va.expiresAt && <div><span>Use before</span><b>{va.expiresAt}</b></div>}
      </div>}
      {va?.note && <p className="deposit-note">{va.note}</p>}
      {reference && <p className="deposit-reference">Reference <code>{reference}</code></p>}
      <div className="deposit-status-actions"><button className="deposit-secondary" type="button" onClick={reset}>Cancel deposit</button></div>
    </StatusPanel>;
  }

  return <form className="deposit-panel" onSubmit={submit}>
    {error && <div className="deposit-error" role="alert"><AlertCircle size={15} />{error}</div>}
    <div className="deposit-quick-row deposit-method-row" role="group" aria-label="Nigeria payment method">
      {(["transfer", "bank", "ussd", "opay"] as const).map((m) => (
        <button type="button" key={m} className={method === m ? "selected" : ""} onClick={() => setMethod(m)}>
          {m === "transfer" ? <><Landmark size={14} /> Bank Transfer</> : m === "bank" ? <><CreditCard size={14} /> Card / Bank</> : m === "ussd" ? <><Smartphone size={14} /> USSD</> : <><Wallet size={14} /> OPay</>}
        </button>
      ))}
    </div>
    <div className="deposit-field deposit-field-first">
      <label htmlFor="ng-amount">Amount to deposit</label>
      <div className="deposit-amount-wrap"><b>₦</b><input id="ng-amount" value={amount} onChange={(ev) => setAmount(ev.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="2,000" /></div>
    </div>
    <div className="deposit-quick-row">{NG_QUICK.map((v) => <button type="button" key={v} className={amount === String(v) ? "selected" : ""} onClick={() => setAmount(String(v))}>₦{v.toLocaleString()}</button>)}</div>
    {method === "ussd" && <label className="deposit-field"><span>Your bank</span>
      {banksFailed
        ? <p className="deposit-note">Could not load the bank list — check your connection and try again.</p>
        : <select value={bankCode} onChange={(ev) => setBankCode(ev.target.value)}>{banks.length ? banks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>) : <option value="">Loading banks…</option>}</select>}
    </label>}
    <p className="deposit-note">{methodNote}</p>
    <button className="deposit-submit" type="submit" disabled={busy || !valid}>{busy ? <><Loader2 size={18} className="deposit-spin" /> Starting…</> : <><Smartphone size={18} /> {ctaLabel}</>}</button>
    <p className="deposit-facts"><ShieldCheck size={13} /> Instant deposits · Flutterwave · Min ₦{MIN_NGN.toLocaleString()}</p>
  </form>;
}

/* Flutterwave sends hosted-checkout payers back to
   {FRONTEND_URL}/deposit?method=ngv3 with ?status&tx_ref&
   transaction_id appended. This confirms the charge against the
   verify endpoint — never the redirect params themselves — and
   lands the player in the wallet. */
function NigeriaReturn({ reference, onBack }: { reference: string; onBack: () => void }) {
  const { refresh } = useSession();
  const [state, setState] = useState<"checking" | "done" | "failed" | "timeout">("checking");
  useEffect(() => {
    let tries = 0;
    let timer = 0;
    let cancelled = false;
    const tick = async () => {
      tries += 1;
      try {
        const res = await api.deposits.flutterwaveNgVerify(reference);
        if (cancelled) return;
        const s = String(res?.status ?? "").toLowerCase();
        if (res?.credited || s === "succeeded") { setState("done"); refresh(); return; }
        if (s === "failed") { setState("failed"); return; }
      } catch { /* a failed check is not a failed payment — keep checking */ }
      if (cancelled) return;
      if (tries < 22) timer = window.setTimeout(tick, 4000);
      else setState("timeout");
    };
    timer = window.setTimeout(tick, 1000);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [reference, refresh]);
  if (state === "done") return <StatusPanel icon={<CheckCircle2 size={28} />} label="DEPOSIT CONFIRMED" title="Deposit confirmed" copy={<>Your money is in your wallet. Good luck!</>}>
    <div className="deposit-status-actions"><Link href="/wallet" className="deposit-secondary" style={{ textDecoration: "none" }}>Go to wallet</Link><button className="deposit-secondary" type="button" onClick={onBack}>Make another deposit</button></div>
  </StatusPanel>;
  if (state === "failed") return <StatusPanel tone="failed" icon={<AlertCircle size={28} />} label="PAYMENT NOT COMPLETED" title="Payment not completed" copy={<>That payment did not go through, so nothing was added to your wallet. You can try again from the deposit page.</>}>
    <div className="deposit-status-actions"><button className="deposit-secondary" type="button" onClick={onBack}>Try again</button></div>
  </StatusPanel>;
  if (state === "timeout") return <StatusPanel tone="timeout" icon={<Hourglass size={28} />} label="STILL CONFIRMING" title="Still confirming" copy={<>Your payment is taking a little longer to confirm. If it completed, your wallet will credit automatically — check your balance in a few minutes.</>}>
    <div className="deposit-status-actions"><button className="deposit-secondary" type="button" onClick={onBack}>Done</button></div>
  </StatusPanel>;
  return <StatusPanel tone="pending" icon={<Loader2 size={28} className="deposit-spin" />} label="CONFIRMING PAYMENT" title="Confirming your payment…" copy={<>We are checking your Flutterwave payment. This page updates on its own — your wallet follows the moment it lands.</>}>
    <p className="deposit-reference">Reference <code>{reference}</code></p>
  </StatusPanel>;
}

/* ─── Page shell ──────────────────────────────────────────────────── */
export default function DepositCenter() {
  const signedIn = typeof window !== "undefined" && !!window.localStorage.getItem("accessToken");
  const { balance } = useSession();
  const [history, setHistory] = useState<Row[]>([]);
  // Live pause state from the super-admin switch (this browser only);
  // defaults to open — a stored pause still wins where one was flipped.
  // It gates GHANA deposits only; Nigeria (Flutterwave) is unaffected.
  const [ghanaPaused, setGhanaPaused] = useState<boolean>(() => readGhanaDepositsPaused());
  useEffect(() => subscribeGhanaDepositsPaused(setGhanaPaused), []);

  // Deposit country — Ghana (ShinobiPay MoMo) or Nigeria (Flutterwave
  // v3). The choice sticks on this browser; Ghana is the default so
  // existing players see exactly what they saw before.
  const [country, setCountry] = useState<DepositCountry>(() => {
    try { return window.localStorage.getItem(NG_COUNTRY_KEY) === "NG" ? "NG" : "GH"; } catch { return "GH"; }
  });
  const pickCountry = (c: DepositCountry) => {
    setCountry(c);
    try { window.localStorage.setItem(NG_COUNTRY_KEY, c); } catch { /* private mode */ }
  };

  // While a Nigeria payment is in flight (transfer/USSD waiting on
  // verify), the country switcher locks — switching away would
  // unmount the waiting view and lose the confirmation. The money is
  // safe either way (the webhook credits server-side), but the player
  // should see the result. Cancel / Done releases the lock.
  const [ngInFlight, setNgInFlight] = useState(false);

  // Hosted-checkout return: Flutterwave sends the player back to
  // /deposit?method=ngv3&tx_ref=... — confirm it, then clear the
  // query so a refresh does not re-run the return flow.
  const [returnRef, setReturnRef] = useState<string>(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      return q.get("method") === "ngv3" ? (q.get("tx_ref") || q.get("reference") || "") : "";
    } catch { return ""; }
  });
  const clearReturn = () => {
    setReturnRef("");
    try { window.history.replaceState(null, "", "/deposit"); } catch { /* ignore */ }
  };

  // Automatic refresh while Ghana is paused: an open deposit page
  // reloads itself once a minute, so it picks up the moment deposits
  // reopen (or a new deploy) without the player reloading by hand.
  // It never reloads while the form is live, so nobody mid-deposit
  // is interrupted — and it never runs for Nigeria, which the Ghana
  // pause does not cover.
  useEffect(() => {
    if (!ghanaPaused || country !== "GH") return;
    const id = window.setInterval(() => window.location.reload(), 60_000);
    return () => window.clearInterval(id);
  }, [ghanaPaused, country]);

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
        ) : returnRef ? (
          <NigeriaReturn reference={returnRef} onBack={clearReturn} />
        ) : (
          <>
            <div className="deposit-country-row" role="group" aria-label="Deposit country">
              <button type="button" className={country === "GH" ? "selected" : ""} disabled={ngInFlight} onClick={() => pickCountry("GH")}>🇬🇭 Ghana · MoMo</button>
              <button type="button" className={country === "NG" ? "selected" : ""} disabled={ngInFlight} onClick={() => pickCountry("NG")}>🇳🇬 Nigeria · Flutterwave</button>
            </div>
            {country === "NG" ? (
              <NigeriaDeposit onInFlight={setNgInFlight} />
            ) : ghanaPaused ? (
              <StatusPanel tone="timeout" icon={<Hourglass size={28} />} label="SYSTEM UPGRADE" title="System under upgrade" copy={<>Our system is undergoing an upgrade. Ghana deposits are temporarily paused. Your balance is safe — this page refreshes on its own.</>} />
            ) : (
              <GhanaDeposit />
            )}
          </>
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
