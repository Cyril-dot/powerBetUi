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

const MIN_GHS = 50;
const QUICK_AMOUNTS = [50, 100, 250, 500, 1000];
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
  const [amount, setAmount] = useState("50");
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
              <div className="deposit-amount-wrap"><b>GHS</b><input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="50.00" disabled={status === "submitting" || status === "waiting"} /></div>
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
    </main>
  );
}
