import { useState } from "react";
import { AlertCircle, Check, CheckCircle2, Loader2, ShieldCheck, Smartphone, WalletCards } from "lucide-react";
import api, { ApiError } from "@/lib/api";

const MIN_GHS = 1;
const QUICK_AMOUNTS = [50, 100, 250, 500, 1000];
type Status = "idle" | "submitting" | "waiting" | "success" | "failed" | "timeout";

function errorMessage(error: unknown) {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : "Could not start the payment. Please try again.";
}

function sleep(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function paymentError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status >= 500) return "AlphaPay is temporarily unavailable. Please try again shortly.";
    if (error.status === 0) return "We could not reach AlphaPay. Check your connection and try again.";
    return error.message;
  }
  return errorMessage(error);
}

export default function DepositCenter() {
  const [amount, setAmount] = useState("100");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const value = Number(amount);
    if (!Number.isFinite(value) || value < MIN_GHS) {
      setError(`Enter at least GHS ${MIN_GHS.toFixed(2)}.`);
      return;
    }
    const normalizedPhone = phone.replace(/[\s()-]/g, "");
    if (!/^(0\d{9}|\+233\d{9})$/.test(normalizedPhone)) {
      setError("Enter a valid Ghana number, for example 0241234567 or +233241234567.");
      return;
    }

    console.info("[DepositCenter] AlphaPay payment initiated", { amount: value });
    setStatus("submitting");
    try {
      const started = await api.deposits.alphaPayCharge({ amount: value, phone: normalizedPhone });
      if (!started.reference) throw new Error("AlphaPay did not return a payment reference.");
      console.info("[DepositCenter] AlphaPay charge created", { reference: started.reference, status: started.status });
      setStatus("waiting");
      setMessage(started.message || "Approve the payment request on your phone.");

      for (let attempt = 0; attempt < 12; attempt += 1) {
        await sleep(attempt === 0 ? 1800 : 2500);
        const checked = await api.deposits.alphaPayVerify(started.reference);
        const normalized = String(checked.status || "").toLowerCase();
        console.info("[DepositCenter] AlphaPay status", { reference: started.reference, attempt: attempt + 1, status: normalized, credited: checked.credited === true });
        if (checked.credited === true || ["success", "successful", "succeeded", "completed", "paid"].includes(normalized)) {
          console.info("[DepositCenter] AlphaPay payment confirmed", { reference: started.reference, amount: value });
          setMessage("Your payment was confirmed and your wallet has been credited.");
          setStatus("success");
          return;
        }
        if (["failed", "failure", "cancelled", "canceled", "rejected", "expired"].includes(normalized)) {
          throw new Error("AlphaPay could not complete this payment. Please try again.");
        }
        setMessage("Waiting for AlphaPay to confirm your payment…");
      }
      setError("We haven't heard back yet. Check your wallet history in a few minutes.");
      setStatus("timeout");
    } catch (e) {
      console.error("[DepositCenter] AlphaPay payment failed", e);
      setError(paymentError(e));
      setStatus("failed");
    }
  };

  const reset = () => {
    setStatus("idle");
    setError("");
    setMessage("");
  };

  return (
    <main className="deposit-page">
      <section className="deposit-hero">
        <div className="deposit-hero-icon"><WalletCards size={24} /></div>
        <div>
          <span className="deposit-eyebrow">SECURE WALLET FUNDING</span>
          <h1>Deposit with AlphaPay</h1>
          <p>Start a secure mobile-money charge and approve it on your phone.</p>
        </div>
        <div className="deposit-hero-trust"><ShieldCheck size={16} /> AlphaPay gateway</div>
      </section>
      <div className="deposit-shell">
        <div className="deposit-rail"><span className="deposit-rail-dot" /><span>AlphaPay Mobile Money</span><span className="deposit-rail-live"><Smartphone size={11} /> LIVE</span></div>
        {status === "success" ? (
          <section className="deposit-panel deposit-status-panel">
            <div className="deposit-status-icon"><CheckCircle2 size={30} /></div>
            <span className="deposit-status-label">PAYMENT CONFIRMED</span>
            <h2>Deposit complete</h2>
            <p className="deposit-status-copy">{message}</p>
            <button className="deposit-secondary" type="button" onClick={reset}>Make another deposit</button>
          </section>
        ) : (
          <form className="deposit-panel" onSubmit={submit}>
            <div className="deposit-panel-heading"><div><h2>Fund your wallet</h2><p>Enter the amount and Ghana mobile-money number that should receive the payment prompt.</p></div><Smartphone size={22} /></div>
            <div className="deposit-instruction-notice" role="note"><Smartphone size={17} /><div><strong>How it works</strong><p>AlphaPay sends an approval prompt to your phone. Confirm it with your mobile-money PIN. Your wallet is credited only after the payment is verified.</p></div></div>
            {error && <div className="deposit-error"><AlertCircle size={15} />{error}</div>}
            <label className="deposit-field"><span>Mobile-money number</span><input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="024 123 4567" autoComplete="tel" /></label>
            <div className="deposit-field"><span>Amount</span><div className="deposit-amount-wrap"><b>GHS</b><input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="100.00" /></div></div>
            <div className="deposit-quick-row">{QUICK_AMOUNTS.map(value => <button type="button" key={value} className={amount === String(value) ? "selected" : ""} onClick={() => setAmount(String(value))}>GHS {value}</button>)}</div>
            <button className="deposit-submit" type="submit" disabled={status === "submitting" || status === "waiting"}>
              {status === "submitting" ? <><Loader2 size={17} className="deposit-spin" /> Starting AlphaPay…</> : status === "waiting" ? <><Loader2 size={17} className="deposit-spin" /> Waiting for approval…</> : <><Check size={17} /> {status === "failed" || status === "timeout" ? "Try with a new payment" : "Pay securely with AlphaPay"}</>}
            </button>
            {status === "waiting" && <p className="deposit-waiting"><Loader2 size={14} className="deposit-spin" />{message}</p>}
            <p className="deposit-footnote"><ShieldCheck size={14} /> Never share your mobile-money PIN. Payment status is confirmed by the backend before crediting your wallet.</p>
          </form>
        )}
        <section className="deposit-safety-grid"><div><ShieldCheck size={18} /><div><strong>Provider verified</strong><p>AlphaPay processes the mobile-money charge securely.</p></div></div><div><Check size={18} /><div><strong>Automatic credit</strong><p>Your wallet updates after a successful provider verification.</p></div></div></section>
        <p className="deposit-help">Need help with a deposit? <a href="/support">Contact the Support Centre</a>.</p>
      </div>
      <style>{`.deposit-page{min-height:70vh;background:#0a0a0a;color:#f4f1f0;padding-bottom:56px}.deposit-hero{display:flex;align-items:center;gap:16px;padding:28px max(22px,calc((100% - 900px)/2));background:linear-gradient(118deg,#ffd84d,#1e6bff 78%,#0b2e70);color:#10172e}.deposit-hero-icon{display:grid;place-items:center;width:50px;height:50px;border-radius:15px;background:#ffffff33}.deposit-eyebrow{font-size:10px;font-weight:900;letter-spacing:.14em}.deposit-hero h1{margin:5px 0 4px;font-size:clamp(25px,4vw,36px)}.deposit-hero p{margin:0;font-size:13px}.deposit-hero-trust{margin-left:auto;display:flex;align-items:center;gap:6px;padding:9px 12px;border-radius:999px;background:#ffffff2e;font-size:10px;font-weight:800}.deposit-shell{width:min(720px,calc(100% - 32px));margin:24px auto 0}.deposit-rail{display:flex;align-items:center;gap:8px;margin:0 2px 10px;color:#9a9a9a;font-size:11px;font-weight:800}.deposit-rail-dot{width:7px;height:7px;border-radius:50%;background:#22c55e}.deposit-rail-live{display:flex;align-items:center;gap:4px;margin-left:auto;color:#4ade80;font-size:9px}.deposit-panel{background:#151515;border:1px solid #ffffff1a;border-radius:18px;padding:24px;box-shadow:0 14px 40px #0004}.deposit-panel-heading{display:flex;justify-content:space-between;gap:12px;margin-bottom:18px}.deposit-panel-heading h2{margin:0;font-size:18px}.deposit-panel-heading p{margin:5px 0 0;color:#969696;font-size:12px;line-height:1.55}.deposit-panel-heading>svg{color:#ffd84d}.deposit-instruction-notice{display:flex;align-items:flex-start;gap:9px;margin:0 0 4px;padding:12px 13px;border:1px solid #2d754c;border-radius:11px;background:#10281a;color:#bcebc9}.deposit-instruction-notice>svg{flex:none;color:#62e18f;margin-top:1px}.deposit-instruction-notice strong{display:block;color:#e2f8e8;font-size:11px}.deposit-instruction-notice p{margin:5px 0 0;color:#a5c3ae;font-size:11px;line-height:1.55}.deposit-error{display:flex;gap:7px;padding:10px 11px;margin-bottom:14px;border-radius:10px;background:#ef44441a;color:#ff9a9a;font-size:11px}.deposit-field{display:block;margin-top:16px;color:#9f9f9f;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.deposit-field input{display:block;width:100%;box-sizing:border-box;margin-top:7px;padding:13px 14px;border:1px solid #ffffff1f;border-radius:10px;background:#1d1d1d;color:#fff;font:600 14px 'DM Sans',sans-serif;outline:none}.deposit-amount-wrap{display:flex;align-items:center;margin-top:7px;border:1px solid #ffffff1f;border-radius:10px;background:#1d1d1d}.deposit-amount-wrap b{padding-left:14px;color:#ffd84d;font-size:12px}.deposit-amount-wrap input{margin:0;border:0;background:transparent}.deposit-quick-row{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.deposit-quick-row button{padding:7px 10px;border:1px solid #ffffff1a;border-radius:999px;background:#202020;color:#aaa;font-size:10px;font-weight:800;cursor:pointer}.deposit-quick-row button.selected{background:#ffd84d;border-color:#ffd84d;color:#121212}.deposit-submit,.deposit-secondary{display:flex;justify-content:center;align-items:center;gap:7px;width:100%;margin-top:20px;padding:13px 16px;border:0;border-radius:10px;background:#ffd84d;color:#171717;font:900 12px 'DM Sans',sans-serif;cursor:pointer}.deposit-submit:disabled{opacity:.65;cursor:wait}.deposit-secondary{max-width:260px;margin:22px auto 0;background:#242424;color:#ddd;border:1px solid #ffffff1f}.deposit-footnote,.deposit-waiting{display:flex;gap:7px;margin:13px 0 0;color:#888;font-size:10px;line-height:1.6}.deposit-footnote svg{flex:none;color:#22c55e}.deposit-waiting{align-items:center;color:#ffd84d}.deposit-waiting svg{flex:none}.deposit-status-panel{text-align:center;padding:36px 24px}.deposit-status-icon{display:grid;place-items:center;width:62px;height:62px;margin:0 auto 13px;border-radius:20px;background:#22c55e1f;color:#4ade80}.deposit-status-label{font-size:9px;font-weight:900;letter-spacing:.14em;color:#4ade80}.deposit-status-panel h2{margin:8px 0 7px;font-size:20px}.deposit-status-copy{max-width:460px;margin:0 auto;color:#aaa;font-size:12px;line-height:1.7}.deposit-safety-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.deposit-safety-grid>div{display:flex;gap:10px;padding:14px;border:1px solid #ffffff14;border-radius:13px;background:#141414}.deposit-safety-grid svg{flex:none;color:#ffd84d}.deposit-safety-grid strong{font-size:11px}.deposit-safety-grid p{margin:5px 0 0;color:#828282;font-size:10px}.deposit-help{text-align:center;margin:18px 0 0;color:#777;font-size:11px}.deposit-help a{color:#ffd84d;font-weight:800}.deposit-spin{animation:deposit-spin .8s linear infinite}@keyframes deposit-spin{to{transform:rotate(360deg)}}@media(max-width:600px){.deposit-hero{align-items:flex-start;padding:22px 16px}.deposit-hero-trust{display:none}.deposit-shell{width:calc(100% - 22px);margin-top:17px}.deposit-panel{padding:18px}.deposit-safety-grid{grid-template-columns:1fr}}`}</style>
    </main>
  );
}
