import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Hash,
  Hourglass,
  Loader2,
  ShieldCheck,
  Smartphone,
  Wallet,
  WalletCards,
} from "lucide-react";
import api, { ApiError } from "@/lib/api";

/* Deposit centre — Flutterwave v4 for both countries (owner direction
   2026-10-14, replacing the manual MTN proof flow of 2026-10-13).
   Ghana: direct MoMo prompt + in-page verify polling.
   Nigeria: bank transfer (dynamic virtual account), card/bank and OPay
   redirects, and USSD — all confirmed against the shared NG verify
   endpoint, with /deposit doubling as the redirect return page.
   Crediting is webhook-first; every wait state here polls verify,
   which credits idempotently, so a missed webhook still lands. */

const MIN_GHS = 50;
const MIN_NGN = 2000;
const GH_QUICK = [50, 100, 250, 500, 1000];
const NG_QUICK = [2000, 5000, 10000, 20000, 50000];

type Row = Record<string, unknown>;

const asNum = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
const asText = (value: unknown, fallback = "—") => value === null || value === undefined || value === "" ? fallback : String(value);
const ghs = (value: unknown) => `GH₵${asNum(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ngn = (value: unknown) => `₦${asNum(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function CopyRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setFailed(false); setTimeout(() => setCopied(false), 1800); }
    catch { setFailed(true); setTimeout(() => setFailed(false), 2200); }
  };
  return <div className="deposit-copy-row">
    <div><span>{label}</span><b className={mono ? "mono" : ""}>{value}</b></div>
    <button type="button" onClick={copy} className={copied ? "copied" : ""}>{copied ? <><Check size={13} /> Copied</> : failed ? "Copy failed — long-press" : <><Copy size={13} /> Copy</>}</button>
  </div>;
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

/* ─── Ghana — Flutterwave v4 Mobile Money (direct prompt) ─────────── */
function GhanaDeposit() {
  const [phase, setPhase] = useState<"form" | "waiting" | "done" | "stalled">("form");
  const [amount, setAmount] = useState("50");
  const [phone, setPhone] = useState("");
  const [network, setNetwork] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [txRef, setTxRef] = useState("");
  const [instruction, setInstruction] = useState("");
  const value = parseFloat(amount);

  const start = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!Number.isFinite(value) || value < MIN_GHS) { setError(`Minimum deposit is GH₵${MIN_GHS}.`); return; }
    if (!phone.trim()) { setError("Enter your MoMo number to receive the payment prompt."); return; }
    const chosen = network || detectNetwork(phone);
    if (!chosen) { setError("Choose your network — MTN, Telecel or AirtelTigo."); return; }
    setBusy(true);
    try {
      const res = await api.deposits.ghInit({ amount: value, phoneNumber: phone.trim(), network: chosen });
      const ref = String(res?.txRef ?? "");
      if (!ref) { setError("The payment could not be started. Try again."); return; }
      setTxRef(ref);
      setInstruction(String(res?.message ?? ""));
      setPhase("waiting");
    } catch (err) { setError(friendlyError(err)); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (phase !== "waiting" || !txRef) return;
    let cancelled = false;
    let tries = 0;
    const poll = async () => {
      tries++;
      try {
        const res = await api.deposits.ghVerify(txRef);
        if (cancelled) return;
        const s = String(res?.status ?? "").toLowerCase();
        if (res?.credited === true || s === "succeeded" || s === "successful") { setPhase("done"); return; }
        if (["failed", "declined", "cancelled", "canceled", "expired"].includes(s)) { setError(String(res?.message || "The payment was not completed. You have not been charged — try again.")); setPhase("form"); return; }
      } catch { /* a failed check is not a failed payment — keep polling */ }
      if (cancelled) return;
      if (tries >= 30) { setPhase("stalled"); return; }
      setTimeout(poll, 4000);
    };
    poll();
    return () => { cancelled = true; };
  }, [phase, txRef]);

  const reset = () => { setPhase("form"); setAmount("50"); setPhone(""); setNetwork(""); setError(""); setTxRef(""); setInstruction(""); };

  if (phase === "done") return <StatusPanel icon={<CheckCircle2 size={28} />} label="DEPOSIT CONFIRMED" title="Deposit successful" copy={<>{ghs(value)} has been added to your wallet.</>}>
    <div className="deposit-status-actions"><button className="deposit-secondary" type="button" onClick={reset}>Make another deposit</button><Link href="/wallet" className="deposit-secondary" style={{ textDecoration: "none" }}>Go to wallet</Link></div>
  </StatusPanel>;
  if (phase === "stalled") return <StatusPanel tone="timeout" icon={<Hourglass size={28} />} label="STILL CONFIRMING" title="Still confirming" copy={<>Your approval is still being confirmed. If you entered your PIN, the money lands in your wallet automatically — <b>don&apos;t pay again</b>.</>}>
    <div className="deposit-status-actions"><button className="deposit-secondary" type="button" onClick={reset}>Done</button></div>
  </StatusPanel>;
  if (phase === "waiting") return <StatusPanel tone="pending" icon={<Loader2 size={28} className="deposit-spin" />} label="AWAITING APPROVAL" title="Check your phone" copy={instruction || <>A MoMo prompt is on its way to <b>{phone}</b> — enter your PIN to approve <b>{ghs(value)}</b>. This page updates on its own when the payment lands.</>}>
    <div className="deposit-status-actions"><button className="deposit-secondary" type="button" onClick={reset}>Cancel deposit</button></div>
  </StatusPanel>;

  return <form className="deposit-panel" onSubmit={start}>
    <div className="deposit-panel-heading">
      <div><h2>Deposit with Mobile Money</h2><p>A prompt is sent straight to your phone — approve it with your PIN and your wallet is credited at once.</p></div>
      <Smartphone size={22} />
    </div>
    <div className="deposit-steps" aria-hidden><span className="now">1 · Enter amount</span><span>2 · Approve on phone</span><span>3 · Credited</span></div>
    {error && <div className="deposit-error" role="alert"><AlertCircle size={15} />{error}</div>}
    <div className="deposit-field">
      <label htmlFor="gh-amount">Amount to deposit</label>
      <div className="deposit-amount-wrap"><b>GH₵</b><input id="gh-amount" value={amount} onChange={(ev) => setAmount(ev.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="50.00" /></div>
      <small className="deposit-phone-hint">Minimum deposit GH₵{MIN_GHS}</small>
    </div>
    <div className="deposit-quick-row">{GH_QUICK.map((v) => <button type="button" key={v} className={amount === String(v) ? "selected" : ""} onClick={() => setAmount(String(v))}>GH₵{v.toLocaleString()}</button>)}</div>
    <label className="deposit-field"><span>MoMo number</span><input value={phone} onChange={(ev) => { setPhone(ev.target.value.replace(/[^0-9+]/g, "")); const d = detectNetwork(ev.target.value); if (d) setNetwork(d); }} inputMode="tel" placeholder="024 123 4567" /></label>
    <div className="deposit-quick-row">{(["MTN", "TELECEL", "AIRTELTIGO"] as const).map((n) => <button type="button" key={n} className={network === n ? "selected" : ""} onClick={() => setNetwork(n)}>{n === "AIRTELTIGO" ? "AirtelTigo" : n === "MTN" ? "MTN" : "Telecel"}</button>)}</div>
    <button className="deposit-submit" type="submit" disabled={busy || !Number.isFinite(value) || value < MIN_GHS}>{busy ? <><Loader2 size={17} className="deposit-spin" /> Starting…</> : <><Smartphone size={17} /> Continue</>}</button>
    <p className="deposit-footnote"><ShieldCheck size={14} /> Payments by Flutterwave · credited automatically</p>
  </form>;
}

/* ─── Nigeria — Flutterwave v4 (transfer / card / USSD / OPay) ────── */
type NgMethod = "transfer" | "bank" | "ussd" | "opay";

function NigeriaDeposit() {
  const [phase, setPhase] = useState<"form" | "waiting" | "done" | "stalled">("form");
  const [method, setMethod] = useState<NgMethod>("transfer");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [va, setVa] = useState<{ accountNumber: string; bankName: string; expiresAt?: string; note?: string } | null>(null);
  const [ussdNote, setUssdNote] = useState("");
  const [banks, setBanks] = useState<Array<{ name: string; code: string }>>([]);
  const [bankCode, setBankCode] = useState("");
  const timer = useRef<number | null>(null);
  const value = parseFloat(amount);
  const valid = Number.isFinite(value) && value >= MIN_NGN;

  const stopPoll = () => { if (timer.current) { window.clearInterval(timer.current); timer.current = null; } };
  useEffect(() => stopPoll, []);

  const pollVerify = (reference: string) => {
    stopPoll();
    let tries = 0;
    timer.current = window.setInterval(async () => {
      tries++;
      try {
        const res = await api.deposits.ngVerify(reference);
        if (res?.credited === true || String(res?.status ?? "").toLowerCase() === "succeeded") { stopPoll(); setPhase("done"); return; }
        if (String(res?.status ?? "").toLowerCase() === "failed") { stopPoll(); setError("That payment failed. Please try again."); setPhase("form"); return; }
      } catch { /* keep waiting — the webhook/reconciler can still land it */ }
      if (tries >= 30) { stopPoll(); setPhase("stalled"); }
    }, 5000);
  };

  useEffect(() => {
    if (method !== "ussd" || banks.length) return;
    api.deposits.ngUssdBanks().then((res) => {
      const rows = Array.isArray(res) ? res : ((res as Row)?.data ?? []);
      const list = (Array.isArray(rows) ? rows : []).map((b) => ({ name: String((b as Row)?.name ?? "Bank"), code: String((b as Row)?.code ?? (b as Row)?.id ?? "") })).filter((b) => b.code);
      setBanks(list);
      if (list.length) setBankCode((cur) => cur || list[0].code);
    }).catch(() => { /* the select simply stays empty until it loads */ });
  }, [method, banks.length]);

  const reset = () => { stopPoll(); setPhase("form"); setVa(null); setUssdNote(""); setError(""); setAmount(""); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!valid) { setError(`Minimum deposit is ₦${MIN_NGN.toLocaleString()}.`); return; }
    setBusy(true);
    try {
      if (method === "transfer") {
        const res = await api.deposits.ngTransferInit(value);
        setVa({ accountNumber: String(res?.accountNumber ?? ""), bankName: String(res?.bankName ?? ""), expiresAt: res?.expiresAt ? String(res.expiresAt) : undefined, note: res?.note ? String(res.note) : undefined });
        setPhase("waiting");
        if (res?.reference) pollVerify(String(res.reference));
      } else if (method === "ussd") {
        if (!bankCode) { setError("Choose your bank first."); return; }
        const res = await api.deposits.ngUssdInit({ amount: value, bankCode });
        setUssdNote(String(res?.note ?? "Dial your bank's USSD code to complete payment"));
        setPhase("waiting");
        if (res?.reference) pollVerify(String(res.reference));
      } else {
        const res = method === "bank" ? await api.deposits.ngBankInit(value) : await api.deposits.ngOpayInit(value);
        const url = String(res?.redirectUrl ?? "");
        if (!url) throw new Error("no-redirect");
        window.location.assign(url);
        return;
      }
    } catch (err) { setError(friendlyError(err, "Payments are temporarily unavailable — please try again in a few minutes.")); }
    finally { setBusy(false); }
  };

  if (phase === "done") return <StatusPanel icon={<CheckCircle2 size={28} />} label="DEPOSIT CONFIRMED" title="Deposit successful" copy={<>{ngn(value)} has been added to your wallet.</>}>
    <div className="deposit-status-actions"><button className="deposit-secondary" type="button" onClick={reset}>Make another deposit</button><Link href="/wallet" className="deposit-secondary" style={{ textDecoration: "none" }}>Go to wallet</Link></div>
  </StatusPanel>;
  if (phase === "stalled") return <StatusPanel tone="timeout" icon={<Hourglass size={28} />} label="STILL CONFIRMING" title="Still confirming" copy={<>This is taking longer than usual. If your payment completed, your wallet credits automatically — you can safely leave this page and check your balance shortly.</>}>
    <div className="deposit-status-actions"><button className="deposit-secondary" type="button" onClick={reset}>Done</button></div>
  </StatusPanel>;
  if (phase === "waiting") return <section className="deposit-panel deposit-status-panel pending" role="status">
    <div className="deposit-status-icon">{va ? <Building2 size={28} /> : <Hash size={28} />}</div>
    <span className="deposit-status-label">AWAITING PAYMENT</span>
    <h2>{va ? <>Transfer {ngn(value)}</> : "Complete on your phone"}</h2>
    {va ? <>
      <p className="deposit-status-copy">Send the exact amount to this one-time account:</p>
      <div className="deposit-copy-card" style={{ textAlign: "left" }}>
        <CopyRow label="Bank" value={va.bankName || "—"} />
        <CopyRow label="Account number" value={va.accountNumber} mono />
        <CopyRow label="Amount" value={ngn(value)} />
        {va.expiresAt && <CopyRow label="Use before" value={va.expiresAt} />}
      </div>
      {va.note && <p className="deposit-status-copy">{va.note}</p>}
    </> : <p className="deposit-status-copy">{ussdNote}</p>}
    <p className="deposit-status-copy"><Loader2 size={14} className="deposit-spin" /> Waiting for your payment… this updates automatically when it lands.</p>
    <div className="deposit-status-actions"><button className="deposit-secondary" type="button" onClick={reset}>Cancel deposit</button></div>
  </section>;

  const methods: Array<[NgMethod, React.ReactNode, string]> = [
    ["transfer", <Building2 size={16} key="i" />, "Bank Transfer"],
    ["bank", <CreditCard size={16} key="i" />, "Card / Bank"],
    ["ussd", <Hash size={16} key="i" />, "USSD"],
    ["opay", <Wallet size={16} key="i" />, "OPay"],
  ];
  const cta = method === "transfer" ? "Get transfer account" : method === "ussd" ? "Get USSD code" : method === "opay" ? "Continue with OPay" : "Continue to my bank";

  return <form className="deposit-panel" onSubmit={submit}>
    <div className="deposit-panel-heading">
      <div><h2>Deposit in Naira</h2><p>Bank transfer, card, USSD or OPay — your wallet is credited automatically when the payment lands.</p></div>
      <Building2 size={22} />
    </div>
    <div className="deposit-steps" aria-hidden><span className="now">1 · Enter amount</span><span>2 · Pay</span><span>3 · Credited</span></div>
    <div className="fw-methods">{methods.map(([key, icon, label]) => <button type="button" key={key} className={method === key ? "selected" : ""} onClick={() => setMethod(key)}>{icon}{label}</button>)}</div>
    {error && <div className="deposit-error" role="alert"><AlertCircle size={15} />{error}</div>}
    <div className="deposit-field">
      <label htmlFor="ng-amount">Amount to deposit</label>
      <div className="deposit-amount-wrap"><b>₦</b><input id="ng-amount" value={amount} onChange={(ev) => setAmount(ev.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="2,000" /></div>
      <small className="deposit-phone-hint">Minimum deposit ₦{MIN_NGN.toLocaleString()}</small>
    </div>
    <div className="deposit-quick-row">{NG_QUICK.map((v) => <button type="button" key={v} className={amount === String(v) ? "selected" : ""} onClick={() => setAmount(String(v))}>₦{v.toLocaleString()}</button>)}</div>
    {method === "ussd" && <label className="deposit-field"><span>Your bank</span><select value={bankCode} onChange={(ev) => setBankCode(ev.target.value)}>{banks.length ? banks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>) : <option value="">Loading banks…</option>}</select></label>}
    {method === "transfer" && <p className="deposit-footnote">We generate a one-time account number for this exact amount — transfer to it and your wallet credits automatically.</p>}
    {method === "bank" && <p className="deposit-footnote">You will be taken to your bank to approve the payment, then returned here.</p>}
    {method === "opay" && <p className="deposit-footnote">You will be taken to OPay to approve the payment, then returned here.</p>}
    <button className="deposit-submit" type="submit" disabled={busy || !valid}>{busy ? <><Loader2 size={17} className="deposit-spin" /> Starting…</> : <><Check size={17} /> {cta}</>}</button>
    <p className="deposit-footnote"><ShieldCheck size={14} /> Payments by Flutterwave · credited automatically</p>
  </form>;
}

/* ─── Return from a Nigeria redirect (card/bank or OPay) ──────────── */
function DepositReturn({ reference, method }: { reference: string; method: string }) {
  const [state, setState] = useState<"checking" | "done" | "failed" | "timeout">("checking");
  useEffect(() => {
    let tries = 0;
    let timer = 0;
    const tick = async () => {
      tries++;
      try {
        const res = await api.deposits.ngVerify(reference);
        if (res?.credited === true || String(res?.status ?? "").toLowerCase() === "succeeded") { setState("done"); return; }
        if (String(res?.status ?? "").toLowerCase() === "failed") { setState("failed"); return; }
      } catch { /* keep checking */ }
      if (tries < 22) timer = window.setTimeout(tick, 4000); else setState("timeout");
    };
    timer = window.setTimeout(tick, 1000);
    return () => window.clearTimeout(timer);
  }, [reference]);
  const back = () => window.location.assign("/deposit");
  const label = method === "ngopay-v4" ? "OPay" : "bank";
  if (state === "done") return <StatusPanel icon={<CheckCircle2 size={28} />} label="DEPOSIT CONFIRMED" title="Deposit successful" copy={<>Your money is in your wallet. Good luck!</>}>
    <div className="deposit-status-actions"><button className="deposit-secondary" type="button" onClick={back}>Back to deposit</button><Link href="/wallet" className="deposit-secondary" style={{ textDecoration: "none" }}>Go to wallet</Link></div>
  </StatusPanel>;
  if (state === "failed") return <StatusPanel tone="failed" icon={<AlertCircle size={28} />} label="PAYMENT NOT COMPLETED" title="Payment not completed" copy={<>That payment did not go through, so nothing was added to your wallet. You can try again.</>}>
    <div className="deposit-status-actions"><button className="deposit-secondary" type="button" onClick={back}>Try again</button></div>
  </StatusPanel>;
  if (state === "timeout") return <StatusPanel tone="timeout" icon={<Hourglass size={28} />} label="STILL CONFIRMING" title="Still confirming" copy={<>Your payment is taking a little longer to confirm. If it completed, your wallet will credit automatically — check your balance in a few minutes.</>}>
    <div className="deposit-status-actions"><button className="deposit-secondary" type="button" onClick={back}>Back to deposit</button></div>
  </StatusPanel>;
  return <StatusPanel tone="pending" icon={<Loader2 size={28} className="deposit-spin" />} label="CONFIRMING PAYMENT" title="Confirming your payment…" copy={<>We are checking your {label} payment. This page updates on its own — your wallet follows the moment it lands.</>} />;
}

/* ─── Page shell ──────────────────────────────────────────────────── */
export default function DepositCenter() {
  const signedIn = typeof window !== "undefined" && !!window.localStorage.getItem("accessToken");
  const [country, setCountry] = useState<"GH" | "NG">("GH");
  const [history, setHistory] = useState<Row[]>([]);
  const [returnParams] = useState(() => {
    if (typeof window === "undefined") return null;
    const q = new URLSearchParams(window.location.search);
    const reference = q.get("reference") || "";
    return reference ? { reference, method: q.get("method") || "" } : null;
  });

  useEffect(() => {
    if (!signedIn) return;
    api.user.me().then((me) => {
      const c = String((me as Row)?.country ?? (me as Row)?.countryCode ?? "");
      if (/ng|nigeria/i.test(c)) setCountry("NG");
    }).catch(() => { /* Ghana stays the default */ });
    api.deposits.myBankDeposits(0, 10).then((page) => setHistory(Array.isArray(page.content) ? (page.content as Row[]) : [])).catch(() => { /* legacy list is informational */ });
  }, [signedIn]);

  const chipClass = (status: string) => status === "APPROVED" ? "ok" : status === "REJECTED" ? "bad" : "wait";

  return (
    <main className="deposit-page">
      <section className="deposit-hero">
        <div className="deposit-hero-icon"><WalletCards size={24} /></div>
        <div>
          <span className="deposit-eyebrow">INSTANT WALLET FUNDING</span>
          <h1>Deposit funds</h1>
          <p>Mobile Money in Ghana; bank transfer, card, USSD and OPay in Nigeria. Your wallet is credited automatically — no proof uploads, no waiting for reviews.</p>
        </div>
        <div className="deposit-hero-trust"><ShieldCheck size={16} /> Credited automatically</div>
      </section>

      <div className="deposit-shell">
        <div className="deposit-rail">
          <span className="deposit-rail-dot" />
          <span>Instant deposits · Flutterwave</span>
          <span className="deposit-rail-live"><Smartphone size={11} /> GH₵ · ₦</span>
        </div>

        {!signedIn ? (
          <section className="deposit-panel deposit-status-panel">
            <div className="deposit-status-icon"><Smartphone size={28} /></div>
            <span className="deposit-status-label">SIGN IN REQUIRED</span>
            <h2>Log in to make a deposit</h2>
            <p className="deposit-status-copy">You need an account so we can credit the right wallet when your payment is confirmed.</p>
            <Link href="/login" className="deposit-submit" style={{ textDecoration: "none" }}>Log in</Link>
          </section>
        ) : returnParams ? (
          <DepositReturn reference={returnParams.reference} method={returnParams.method} />
        ) : (
          <>
            <div className="fw-country" role="tablist" aria-label="Deposit country">
              <button type="button" className={country === "GH" ? "selected" : ""} onClick={() => setCountry("GH")}>🇬🇭 Ghana · GH₵</button>
              <button type="button" className={country === "NG" ? "selected" : ""} onClick={() => setCountry("NG")}>🇳🇬 Nigeria · ₦</button>
            </div>
            {country === "GH" ? <GhanaDeposit /> : <NigeriaDeposit />}
          </>
        )}

        {signedIn && !returnParams && history.length > 0 && (
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
