import { useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Smartphone,
  WalletCards,
} from "lucide-react";
import api, { ApiError, type WebRabbitNetwork, type WebRabbitTransaction } from "@/lib/api";

const MIN_GHS = 1;
const QUICK_AMOUNTS = [1, 5, 10, 50, 100];
const NETWORKS: Array<{ value: WebRabbitNetwork; label: string }> = [
  { value: "MTN", label: "MTN Mobile Money" },
  { value: "TELECEL", label: "Telecel Cash" },
  { value: "AT", label: "AirtelTigo Money" },
  { value: "GMONEY", label: "G-Money" },
];
type Status = "idle" | "submitting" | "waiting" | "success" | "failed" | "timeout";

function errorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : "Could not start the payment. Please try again.";
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 6 ? `${digits.slice(0, 3)}****${digits.slice(-3)}` : "***";
}

function transactionIdOf(transaction: WebRabbitTransaction) {
  return transaction.transaction_id || transaction.transactionId || transaction.id || "";
}

function statusOf(transaction: WebRabbitTransaction) {
  return String(transaction.status || "").toLowerCase();
}

function reasonOf(transaction: WebRabbitTransaction) {
  return String(transaction.reason_code || transaction.reasonCode || "").toLowerCase();
}

export default function DepositCenter() {
  const [amount, setAmount] = useState("1");
  const [phone, setPhone] = useState("");
  const [network, setNetwork] = useState<WebRabbitNetwork>("MTN");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const value = Number(amount);
    if (!Number.isFinite(value) || value < MIN_GHS)
      return setError(`Enter at least GHS ${MIN_GHS.toFixed(2)}.`);
    const normalizedPhone = phone.trim();
    if (!/^(0\d{9}|\+233\d{9}|233\d{9})$/.test(normalizedPhone.replace(/[\s()-]/g, "")))
      return setError("Enter a valid Ghana mobile-money number.");

    setStatus("submitting");
    setMessage("");
    try {
      console.info("[DepositCenter] Starting Web Rabbit payment", {
        amount: value,
        network,
        phone: maskPhone(normalizedPhone),
      });
      const started = await api.deposits.webRabbitMomoInit({
        amount: value,
        phone: normalizedPhone,
        network,
      });
      const transactionId = transactionIdOf(started);
      const startedStatus = statusOf(started);
      console.info("[DepositCenter] Web Rabbit payment started", {
        transactionId,
        status: startedStatus,
        reasonCode: reasonOf(started),
      });
      if (!transactionId)
        throw new Error("The payment service did not return a transaction ID.");

      setStatus("waiting");
      setMessage("Approve the payment prompt on your phone. We will update your wallet after confirmation.");

      const maxAttempts = 20;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 3000));
        const checked = await api.deposits.webRabbitMomoVerify(transactionId);
        const currentStatus = statusOf(checked);
        const currentReason = reasonOf(checked);
        console.info("[DepositCenter] Web Rabbit payment status", {
          transactionId,
          attempt: attempt + 1,
          status: currentStatus,
          reasonCode: currentReason,
        });

        if (currentStatus === "approved" && currentReason === "approved") {
          console.info("[DepositCenter] Web Rabbit payment confirmed", { transactionId, amount: value });
          setStatus("success");
          setMessage("Payment confirmed. Your wallet has been credited.");
          return;
        }
        if (["failed", "rejected", "cancelled", "canceled", "expired"].includes(currentStatus)) {
          throw new Error(checked.message || "The payment was not approved. Please try again.");
        }
      }
      setStatus("timeout");
      setMessage("The payment is still pending. If you approved the prompt, your wallet will update when confirmation arrives.");
    } catch (e) {
      console.error("[DepositCenter] Web Rabbit payment failed", {
        error: e instanceof Error ? e.message : e,
        httpStatus: e instanceof ApiError ? e.status : 0,
      });
      setError(errorMessage(e));
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
          <span className="deposit-eyebrow">INSTANT WALLET FUNDING</span>
          <h1>Deposit with Mobile Money</h1>
          <p>Enter your number and approve the payment prompt on your phone.</p>
        </div>
        <div className="deposit-hero-trust"><ShieldCheck size={16} /> Secure payment</div>
      </section>
      <div className="deposit-shell">
        <div className="deposit-rail">
          <span className="deposit-rail-dot" />
          <span>Mobile Money</span>
          <span className="deposit-rail-live"><Smartphone size={11} /> LIVE</span>
        </div>
        {status === "success" ? (
          <section className="deposit-panel deposit-status-panel success">
            <div className="deposit-status-icon"><CheckCircle2 size={30} /></div>
            <span className="deposit-status-label">PAYMENT CONFIRMED</span>
            <h2>Deposit successful</h2>
            <p className="deposit-status-copy">{message}</p>
            <button className="deposit-secondary" type="button" onClick={reset}>Make another deposit</button>
          </section>
        ) : (
          <form className="deposit-panel" onSubmit={submit}>
            <div className="deposit-panel-heading">
              <div>
                <h2>Pay securely with Mobile Money</h2>
                <p>Select your network, enter your number, and approve the prompt sent to your phone.</p>
              </div>
              <Smartphone size={22} />
            </div>
            {error && <div className="deposit-error"><AlertCircle size={15} />{error}</div>}
            <div className="deposit-instruction-notice" role="note">
              <Smartphone size={17} />
              <div><strong>How it works</strong><p>Your mobile-money provider will send a payment approval prompt. Confirm it with your PIN. Your wallet is credited only after the payment is verified.</p></div>
            </div>
            <label className="deposit-field">
              <span>Mobile-money network</span>
              <select value={network} onChange={e => setNetwork(e.target.value as WebRabbitNetwork)} disabled={status === "submitting" || status === "waiting"}>
                {NETWORKS.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="deposit-field">
              <span>Mobile-money number</span>
              <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="024 123 4567" disabled={status === "submitting" || status === "waiting"} />
            </label>
            <div className="deposit-field">
              <span>Amount</span>
              <div className="deposit-amount-wrap"><b>GHS</b><input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="1.00" disabled={status === "submitting" || status === "waiting"} /></div>
            </div>
            <div className="deposit-quick-row">
              {QUICK_AMOUNTS.map(value => <button type="button" key={value} className={amount === String(value) ? "selected" : ""} onClick={() => setAmount(String(value))} disabled={status === "submitting" || status === "waiting"}>GHS {value}</button>)}
            </div>
            {status === "waiting" && <div className="deposit-instruction-notice" role="status"><Loader2 size={17} className="deposit-spin" /><div><strong>Waiting for approval…</strong><p>{message}</p></div></div>}
            {status === "timeout" && <div className="deposit-instruction-notice" role="status"><AlertCircle size={17} /><div><strong>Still awaiting confirmation</strong><p>{message}</p></div></div>}
            <button className="deposit-submit" type="submit" disabled={status === "submitting" || status === "waiting"}>
              {status === "submitting" ? <><Loader2 size={17} className="deposit-spin" /> Starting payment…</> : status === "waiting" ? <><Loader2 size={17} className="deposit-spin" /> Waiting for approval…</> : <><Check size={17} /> Pay securely</>}
            </button>
            {(status === "failed" || status === "timeout") && <button className="deposit-secondary" type="button" onClick={reset}>Try another payment</button>}
            <p className="deposit-footnote"><ShieldCheck size={14} /> Your wallet updates automatically after the payment is confirmed.</p>
          </form>
        )}
      </div>
      <style>{`.deposit-page{min-height:70vh;background:#0a0a0a;color:#f4f1f0;padding-bottom:56px}.deposit-hero{display:flex;align-items:center;gap:16px;padding:28px max(22px,calc((100% - 900px)/2));background:linear-gradient(118deg,#ffd84d,#1e6bff 78%,#0b2e70);color:#10172e}.deposit-hero-icon{display:grid;place-items:center;width:50px;height:50px;border-radius:15px;background:#ffffff33}.deposit-eyebrow{font-size:10px;font-weight:900;letter-spacing:.14em}.deposit-hero h1{margin:5px 0 4px;font-size:clamp(25px,4vw,36px)}.deposit-hero p{margin:0;font-size:13px}.deposit-hero-trust{margin-left:auto;display:flex;align-items:center;gap:6px;padding:9px 12px;border-radius:999px;background:#ffffff2e;font-size:10px;font-weight:800}.deposit-shell{width:min(720px,calc(100% - 32px));margin:24px auto 0}.deposit-rail{display:flex;align-items:center;gap:8px;margin:0 2px 10px;color:#9a9a9a;font-size:11px;font-weight:800}.deposit-rail-dot{width:7px;height:7px;border-radius:50%;background:#22c55e}.deposit-rail-live{display:flex;align-items:center;gap:4px;margin-left:auto;color:#4ade80;font-size:9px}.deposit-panel{background:#151515;border:1px solid #ffffff1a;border-radius:18px;padding:24px;box-shadow:0 14px 40px #0004}.deposit-panel-heading{display:flex;justify-content:space-between;gap:12px;margin-bottom:18px}.deposit-panel-heading h2{margin:0;font-size:18px}.deposit-panel-heading p{margin:5px 0 0;color:#969696;font-size:12px}.deposit-payment-card{margin:0 0 14px;padding:15px;border:1px solid #ffd84d66;border-radius:14px;background:linear-gradient(135deg,#2b2410,#1c1c17);box-shadow:0 8px 24px #0003}.deposit-payment-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.deposit-payment-card-head strong{display:block;margin-top:5px;color:#fff;font-size:15px}.deposit-payment-label{display:block;color:#ffd84d;font-size:9px;font-weight:900;letter-spacing:.14em}.deposit-network-pill{padding:5px 8px;border-radius:999px;background:#ffd84d;color:#171717;font-size:9px;font-weight:900}.deposit-payment-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:15px;padding:12px;border-radius:10px;background:#0f0f0d;border:1px solid #ffffff18}.deposit-payment-row div,.deposit-payment-name{display:grid;gap:5px}.deposit-payment-row span,.deposit-payment-name span{color:#a9a28b;font-size:9px;text-transform:uppercase;letter-spacing:.08em;font-weight:800}.deposit-payment-row strong{color:#ffd84d;font-size:22px;letter-spacing:.04em}.deposit-payment-name{margin-top:12px;padding:13px 14px;border:2px solid #ffd84d;border-radius:10px;background:#3a2d0b;box-shadow:0 0 0 3px #ffd84d1c}.deposit-payment-name span{color:#ffe889;font-size:10px}.deposit-payment-name strong{color:#fff6c7;font-size:19px;line-height:1.25;letter-spacing:.04em;font-weight:900}.deposit-copy-button{display:inline-flex;align-items:center;gap:6px;border:1px solid #ffd84d66;border-radius:8px;background:#ffd84d;color:#171717;padding:8px 10px;font-size:10px;font-weight:900;cursor:pointer;white-space:nowrap}.deposit-copy-button:hover{background:#ffe477}.deposit-instruction-notice{display:flex;align-items:flex-start;gap:9px;margin:0 0 4px;padding:12px 13px;border:1px solid #2d754c;border-radius:11px;background:#10281a;color:#bcebc9}.deposit-instruction-notice>svg{flex:none;color:#62e18f;margin-top:1px}.deposit-instruction-notice strong{display:block;color:#e2f8e8;font-size:11px}.deposit-instruction-notice p{margin:5px 0 0;color:#a5c3ae;font-size:11px;line-height:1.55}.deposit-instruction-notice b{color:#f4d866}.deposit-panel-heading>svg{color:#ffd84d}.deposit-error{display:flex;gap:7px;padding:10px 11px;margin-bottom:14px;border-radius:10px;background:#ef44441a;color:#ff9a9a;font-size:11px}.deposit-field{display:block;margin-top:16px;color:#9f9f9f;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.deposit-field input,.deposit-field textarea,.deposit-field select{display:block;width:100%;box-sizing:border-box;margin-top:7px;padding:13px 14px;border:1px solid #ffffff1f;border-radius:10px;background:#1d1d1d;color:#fff;font:600 14px 'DM Sans',sans-serif;outline:none;resize:vertical}.deposit-amount-wrap{display:flex;align-items:center;margin-top:7px;border:1px solid #ffffff1f;border-radius:10px;background:#1d1d1d}.deposit-amount-wrap b{padding-left:14px;color:#ffd84d;font-size:12px}.deposit-amount-wrap input{margin:0;border:0;background:transparent}.deposit-quick-row{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.deposit-quick-row button{padding:7px 10px;border:1px solid #ffffff1a;border-radius:999px;background:#202020;color:#aaa;font-size:10px;font-weight:800;cursor:pointer}.deposit-quick-row button.selected{background:#ffd84d;border-color:#ffd84d;color:#121212}.deposit-upload{position:relative;display:flex;align-items:center;gap:9px;margin-top:7px;padding:14px;border:1px dashed #ffd84d8c;border-radius:10px;background:#ffd84d0f;color:#ddd;font-size:12px;cursor:pointer}.deposit-upload svg{color:#ffd84d}.deposit-upload input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;margin:0}.deposit-preview{display:flex;align-items:center;gap:10px;margin-top:10px;color:#4ade80;font-size:10px}.deposit-preview img{width:70px;height:52px;object-fit:cover;border-radius:7px}.deposit-preview span{display:flex;align-items:center;gap:5px}.deposit-submit,.deposit-secondary{display:flex;justify-content:center;align-items:center;gap:7px;width:100%;margin-top:20px;padding:13px 16px;border:0;border-radius:10px;background:#ffd84d;color:#171717;font:900 12px 'DM Sans',sans-serif;cursor:pointer}.deposit-submit:disabled{opacity:.65;cursor:wait}.deposit-footnote{display:flex;gap:7px;margin:13px 0 0;color:#888;font-size:10px;line-height:1.6}.deposit-footnote svg{flex:none;color:#22c55e}.deposit-status-panel{text-align:center;padding:36px 24px}.deposit-status-icon{display:grid;place-items:center;width:62px;height:62px;margin:0 auto 13px;border-radius:20px;background:#22c55e1f;color:#4ade80}.deposit-status-label{font-size:9px;font-weight:900;letter-spacing:.14em;color:#4ade80}.deposit-status-panel h2{margin:8px 0 7px;font-size:20px}.deposit-status-copy{max-width:460px;margin:0 auto;color:#aaa;font-size:12px;line-height:1.7}.deposit-secondary{max-width:260px;margin:22px auto 0;background:#242424;color:#ddd;border:1px solid #ffffff1f}.deposit-safety-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.deposit-safety-grid>div{display:flex;gap:10px;padding:14px;border:1px solid #ffffff14;border-radius:13px;background:#141414}.deposit-safety-grid svg{flex:none;color:#ffd84d}.deposit-safety-grid strong{font-size:11px}.deposit-safety-grid p{margin:5px 0 0;color:#828282;font-size:10px}.deposit-help{text-align:center;margin:18px 0 0;color:#777;font-size:11px}.deposit-help a{color:#ffd84d;font-weight:800}.deposit-spin{animation:deposit-spin .8s linear infinite}@keyframes deposit-spin{to{transform:rotate(360deg)}}@media(max-width:600px){.deposit-hero{align-items:flex-start;padding:22px 16px}.deposit-hero-trust{display:none}.deposit-shell{width:calc(100% - 22px);margin-top:17px}.deposit-panel{padding:18px}.deposit-payment-row{align-items:flex-start;flex-direction:column}.deposit-copy-button{width:100%;justify-content:center}.deposit-payment-row strong{font-size:20px}.deposit-safety-grid{grid-template-columns:1fr}}`}</style>

    </main>
  );
}
