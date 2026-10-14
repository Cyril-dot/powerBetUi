import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Hourglass,
  ImagePlus,
  Loader2,
  ShieldCheck,
  Smartphone,
  WalletCards,
  X,
} from "lucide-react";
import api, { ApiError } from "@/lib/api";

/* Manual MTN Mobile Money deposit (owner details, 2026-10-13). The flow
   follows the Nigerian bank manual deposit: same endpoint
   (POST /api/wallet/bank-deposits), same fields — only the destination
   and labels differ. Proof screenshots are hosted on imgbb and the
   hosted link is sent as screenshotUrl. */
const MOMO_NETWORK = "MTN";
const MOMO_NUMBER = "0536676400";
const MOMO_NAME = "ISAAC SENIOR APPIAH";
const MIN_GHS = 50;
const QUICK_AMOUNTS = [50, 100, 250, 500, 1000];
const IMGBB_KEY = "52c2be32af44539f7563f97a067eb1a1";

type Row = Record<string, unknown>;
type Step = "info" | "proof" | "done";

const asNum = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
const asText = (value: unknown, fallback = "—") => value === null || value === undefined || value === "" ? fallback : String(value);
const ghs = (value: unknown) => `GHS ${asNum(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (value: unknown) => { const d = new Date(asText(value, "")); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); };

/* Compress a proof image (max 800px wide, JPEG) to a data URL for
   preview + upload, the same way the bank form does. */
function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 800; const scale = img.width > MAX ? MAX / img.width : 1;
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d")!.drawImage(img, 0, 0, w, h);
        const d = c.toDataURL("image/jpeg", 0.72);
        resolve(d.length > 524288 ? c.toDataURL("image/jpeg", 0.45) : d);
      };
      img.onerror = reject;
      img.src = ev.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* Host the compressed proof on imgbb and return its URL — the hosted
   link is what gets sent to the backend as screenshotUrl. */
async function uploadToImgbb(dataUrl: string): Promise<string> {
  const body = new FormData();
  body.append("key", IMGBB_KEY);
  body.append("image", dataUrl.replace(/^data:image\/[a-z]+;base64,/, ""));
  const res = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body });
  const json = (await res.json().catch(() => null)) as { data?: { url?: string } } | null;
  const url = json?.data?.url;
  if (!res.ok || !url) throw new Error("Image upload failed");
  return url;
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

export default function DepositCenter() {
  const signedIn = typeof window !== "undefined" && !!window.localStorage.getItem("accessToken");
  const [step, setStep] = useState<Step>("info");
  const [amount, setAmount] = useState("50");
  const [senderName, setSenderName] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [screenshot, setScreenshot] = useState("");
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<Row[]>([]);

  const loadHistory = async () => {
    try { const page = await api.deposits.myBankDeposits(0, 10); setHistory(Array.isArray(page.content) ? (page.content as Row[]) : []); }
    catch { /* history is informational — a failed load just hides it */ }
  };
  useEffect(() => { if (signedIn) void loadHistory(); }, []);

  const amountValue = parseFloat(amount);
  const amountValid = Number.isFinite(amountValue) && amountValue >= MIN_GHS;

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setCompressing(true); setErrs((p) => ({ ...p, screenshot: "" }));
    try { setScreenshot(await compressImageFile(file)); }
    catch { setErrs((p) => ({ ...p, screenshot: "Could not process that image. Try another file." })); }
    finally { setCompressing(false); }
  };

  const goProof = () => {
    if (!amountValid) { setErrs({ amount: `Minimum deposit is GHS ${MIN_GHS}.` }); return; }
    setErrs({}); setError(""); setStep("proof");
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (!senderName.trim()) e.senderName = "Enter the name on the Mobile Money account you sent from";
    if (!reference.trim() || reference.trim().length < 5) e.reference = "Enter the transaction ID from your MoMo receipt";
    if (!screenshot) e.screenshot = "A payment screenshot is required";
    setErrs(e);
    if (Object.keys(e).length) return;
    setSubmitting(true); setError("");
    try {
      const screenshotUrl = await uploadToImgbb(screenshot);
      await api.deposits.submitBankDeposit({
        transferReference: reference.trim(),
        ngnAmountSent: amountValue,
        expectedNgnCredit: amountValue,
        senderAccountName: senderName.trim(),
        screenshotUrl,
        userNote: note.trim() || undefined,
      });
      setStep("done");
      void loadHistory();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error && err.message === "Image upload failed"
        ? "We could not upload your screenshot. Check your connection and try again — the deposit was not submitted."
        : "We could not submit this deposit. Please try again.");
    } finally { setSubmitting(false); }
  };

  const reset = () => {
    setStep("info"); setAmount("50"); setSenderName(""); setReference(""); setNote("");
    setScreenshot(""); setErrs({}); setError("");
  };

  const chipClass = (status: string) => status === "APPROVED" ? "ok" : status === "REJECTED" ? "bad" : "wait";

  return (
    <main className="deposit-page">
      <section className="deposit-hero">
        <div className="deposit-hero-icon"><WalletCards size={24} /></div>
        <div>
          <span className="deposit-eyebrow">MANUAL WALLET FUNDING</span>
          <h1>Deposit with Mobile Money</h1>
          <p>Send money to our MTN line, then submit your payment proof. We credit your wallet once the transfer is confirmed.</p>
        </div>
        <div className="deposit-hero-trust"><ShieldCheck size={16} /> Reviewed by our team</div>
      </section>

      <div className="deposit-shell">
        <div className="deposit-rail">
          <span className="deposit-rail-dot" />
          <span>Manual deposit · MTN Mobile Money</span>
          <span className="deposit-rail-live"><Smartphone size={11} /> {MOMO_NETWORK}</span>
        </div>

        {!signedIn ? (
          <section className="deposit-panel deposit-status-panel">
            <div className="deposit-status-icon"><Smartphone size={28} /></div>
            <span className="deposit-status-label">SIGN IN REQUIRED</span>
            <h2>Log in to make a deposit</h2>
            <p className="deposit-status-copy">You need an account so we can credit the right wallet when your transfer is confirmed.</p>
            <Link href="/login" className="deposit-submit" style={{ textDecoration: "none" }}>Log in</Link>
          </section>
        ) : step === "done" ? (
          <section className="deposit-panel deposit-status-panel success" role="status">
            <div className="deposit-status-icon"><Hourglass size={28} /></div>
            <span className="deposit-status-label">PROOF SUBMITTED</span>
            <h2>Deposit under review</h2>
            <p className="deposit-status-copy">Your transfer of {ghs(amountValue)} is being checked. Your wallet is credited as soon as it is confirmed — usually within a few minutes.</p>
            <div className="deposit-status-actions">
              <button className="deposit-secondary" type="button" onClick={reset}>Make another deposit</button>
              <Link href="/wallet" className="deposit-secondary" style={{ textDecoration: "none" }}>Go to wallet</Link>
            </div>
          </section>
        ) : step === "info" ? (
          <section className="deposit-panel">
            <div className="deposit-panel-heading">
              <div>
                <h2>Send to this MTN number</h2>
                <p>Transfer the amount you want to deposit to this Mobile Money line, then continue to submit your proof.</p>
              </div>
              <Smartphone size={22} />
            </div>
            <div className="deposit-steps" aria-hidden>
              <span className="now">1 · Send money</span><span>2 · Submit proof</span><span>3 · We credit you</span>
            </div>
            <div className="deposit-copy-card">
              <CopyRow label="Network" value={`${MOMO_NETWORK} Mobile Money`} />
              <CopyRow label="MoMo number" value={MOMO_NUMBER} mono />
              <CopyRow label="Account name" value={MOMO_NAME} />
            </div>
            <div className="deposit-instruction-notice" role="note">
              <ShieldCheck size={17} />
              <div><strong>Before you send</strong><p>Send only from your own Mobile Money account and keep the receipt — you will enter the transaction ID and upload a screenshot of the payment on the next step. Minimum deposit is GHS {MIN_GHS}.</p></div>
            </div>
            <div className="deposit-field">
              <label htmlFor="deposit-amount">Amount to deposit</label>
              <div className="deposit-amount-wrap"><b>GHS</b><input id="deposit-amount" value={amount} onChange={(ev) => { setAmount(ev.target.value.replace(/[^\d.]/g, "")); setErrs((p) => ({ ...p, amount: "" })); }} inputMode="decimal" placeholder="50.00" /></div>
              {errs.amount && <small className="deposit-field-error">{errs.amount}</small>}
            </div>
            <div className="deposit-quick-row">
              {QUICK_AMOUNTS.map((value) => <button type="button" key={value} className={amount === String(value) ? "selected" : ""} onClick={() => setAmount(String(value))}>GHS {value}</button>)}
            </div>
            <button className="deposit-submit" type="button" onClick={goProof}><Check size={17} /> I've sent the money</button>
            <p className="deposit-footnote"><ShieldCheck size={14} /> Your wallet is credited after our team confirms the transfer.</p>
          </section>
        ) : (
          <form className="deposit-panel" onSubmit={submit}>
            <div className="deposit-panel-heading">
              <div>
                <h2>Submit your payment proof</h2>
                <p>Tell us where the money came from so we can match and credit it fast.</p>
              </div>
              <Smartphone size={22} />
            </div>
            <div className="deposit-steps" aria-hidden>
              <span className="done"><Check size={11} /> Send money</span><span className="now">2 · Submit proof</span><span>3 · We credit you</span>
            </div>
            {error && <div className="deposit-error" role="alert"><AlertCircle size={15} />{error}</div>}
            <div className="deposit-summary-card">
              <div className="deposit-summary-line"><span>Amount sent</span><b className="gold">{ghs(amountValue)}</b></div>
              <div className="deposit-summary-line"><span>Sent to</span><b>{MOMO_NETWORK} · {MOMO_NUMBER} · {MOMO_NAME}</b></div>
            </div>
            <label className="deposit-field">
              <span>Your Mobile Money account name</span>
              <input value={senderName} onChange={(ev) => { setSenderName(ev.target.value); setErrs((p) => ({ ...p, senderName: "" })); }} placeholder="The name on the account you sent from" autoComplete="name" />
              {errs.senderName && <small className="deposit-field-error">{errs.senderName}</small>}
            </label>
            <label className="deposit-field">
              <span>Transaction ID / reference</span>
              <input className="mono-input" value={reference} onChange={(ev) => { setReference(ev.target.value); setErrs((p) => ({ ...p, reference: "" })); }} placeholder="e.g. 12345678901 — from your MoMo receipt" />
              {errs.reference && <small className="deposit-field-error">{errs.reference}</small>}
            </label>
            <div className="deposit-field">
              <span>Payment screenshot</span>
              {screenshot ? (
                <div className="deposit-upload-preview">
                  <img src={screenshot} alt="Your payment proof" />
                  <button type="button" onClick={() => setScreenshot("")}><X size={13} /> Remove</button>
                </div>
              ) : (
                <label className="deposit-upload">
                  <input type="file" accept="image/*" onChange={handleFile} hidden />
                  {compressing ? <><Loader2 size={20} className="deposit-spin" /> Processing image…</> : <><ImagePlus size={20} /> Tap to upload the payment screenshot</>}
                </label>
              )}
              {errs.screenshot && <small className="deposit-field-error">{errs.screenshot}</small>}
            </div>
            <label className="deposit-field">
              <span>Note (optional)</span>
              <input value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Anything we should know about this transfer" maxLength={1000} />
            </label>
            <button className="deposit-submit" type="submit" disabled={submitting || compressing}>
              {submitting ? <><Loader2 size={17} className="deposit-spin" /> Submitting proof…</> : <><CheckCircle2 size={17} /> Submit proof</>}
            </button>
            <button className="deposit-secondary" type="button" onClick={() => { setStep("info"); setError(""); }} disabled={submitting}>Back to payment details</button>
          </form>
        )}

        {signedIn && history.length > 0 && (
          <section className="deposit-panel deposit-requests">
            <h2>Your deposit requests</h2>
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
