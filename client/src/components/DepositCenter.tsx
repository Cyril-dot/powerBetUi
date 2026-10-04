import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Loader2,
  ShieldCheck,
  Smartphone,
  WalletCards,
} from "lucide-react";
import api, { ApiError, type FlutterwaveGhNetwork, type FlutterwaveVerifyResponse } from "@/lib/api";
import { depositLogger, type DepositLogEntry } from "@/lib/depositLogger";

const MIN_GHS = 50;
const QUICK_AMOUNTS = [50, 100, 250, 500, 1000];
const NETWORKS: Array<{ value: FlutterwaveGhNetwork; label: string }> = [
  { value: "MTN", label: "MTN Mobile Money" },
  { value: "AIRTELTIGO", label: "AirtelTigo Money" },
  { value: "VODAFONE", label: "Vodafone / Telecel" },
];
const TERMINAL_FAILURES = new Set([
  "failed", "cancelled", "canceled", "declined", "expired", "reversed", "voided", "abandoned", "rejected", "error",
]);
const SUCCESS_STATES = new Set(["succeeded", "successful", "success", "completed", "credited"]);
type Status = "idle" | "submitting" | "pending" | "success" | "failed" | "timeout";
type VerifyOutcome = "pending" | "success" | "failed";

function normalizeGhanaPhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function maskPhone(phone: string) {
  const digits = normalizeGhanaPhone(phone);
  return digits.length >= 3 ? `••••••${digits.slice(-3)}` : "••••";
}

function errorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : "Could not start the payment. Please try again.";
}

function useDepositLogEntries() {
  const [entries, setEntries] = useState<DepositLogEntry[]>(() => depositLogger.getEntries());
  useEffect(() => depositLogger.subscribe(setEntries), []);
  return entries;
}

export default function DepositCenter() {
  const [amount, setAmount] = useState("50");
  const [phone, setPhone] = useState("");
  const [network, setNetwork] = useState<FlutterwaveGhNetwork>("MTN");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [txRef, setTxRef] = useState("");
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const checkInFlight = useRef(false);
  const entries = useDepositLogEntries();

  useEffect(() => {
    depositLogger.info("lifecycle", "Flutterwave v4 deposit page opened");
    return () => {
      depositLogger.info("lifecycle", "Deposit page closed");
    };
  }, []);

  const checkPayment = useCallback(async (): Promise<VerifyOutcome> => {
    if (!txRef || checkInFlight.current) return "pending";
    checkInFlight.current = true;
    const startedAt = Date.now();
    depositLogger.debug("verify", "Checking Flutterwave v4 payment status", { reference: txRef });
    try {
      const result: FlutterwaveVerifyResponse = await api.deposits.flutterwaveGhVerify({ txRef });
      const currentStatus = String(result.status || "pending").toLowerCase();
      const durationMs = Date.now() - startedAt;
      depositLogger.info("verify", "Payment status received", {
        reference: txRef,
        durationMs,
        details: { status: currentStatus, credited: Boolean(result.credited) },
      });
      setMessage(result.message || "We are still confirming your payment.");
      if (result.credited || SUCCESS_STATES.has(currentStatus)) {
        depositLogger.success("verify", "Flutterwave v4 payment confirmed", { reference: txRef, durationMs });
        setStatus("success");
        return "success";
      }
      if (TERMINAL_FAILURES.has(currentStatus)) {
        depositLogger.warn("verify", "Payment reached a terminal failure status", {
          reference: txRef,
          durationMs,
          details: { status: currentStatus },
        });
        setStatus("failed");
        return "failed";
      }
      return "pending";
    } catch (verifyError) {
      depositLogger.warn("verify", "Payment status check failed; the next check will retry", {
        reference: txRef,
        durationMs: Date.now() - startedAt,
        details: { httpStatus: verifyError instanceof ApiError ? verifyError.status : undefined },
      });
      return "pending";
    } finally {
      checkInFlight.current = false;
    }
  }, [txRef]);

  useEffect(() => {
    if (status !== "pending" || !txRef) return;
    let cancelled = false;
    const startedAt = Date.now();
    let timer: number | undefined;
    let attempt = 0;

    const poll = async () => {
      if (cancelled) return;
      attempt += 1;
      depositLogger.debug("poll", "Scheduled payment check", { reference: txRef, details: { attempt } });
      const outcome = await checkPayment();
      if (cancelled || outcome !== "pending") return;
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs >= 5 * 60 * 1000) {
        depositLogger.warn("poll", "Automatic polling window ended; manual recheck remains available", {
          reference: txRef,
          details: { attempts: attempt, elapsedMs },
        });
        setStatus("timeout");
        setMessage("This payment is still being confirmed. If you approved the prompt, do not pay again; check your wallet or retry the status check.");
        return;
      }
      const nextDelay = elapsedMs < 30_000 ? 3_000 : elapsedMs < 90_000 ? 7_000 : 15_000;
      timer = window.setTimeout(() => void poll(), nextDelay);
    };

    timer = window.setTimeout(() => void poll(), 3_000);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [checkPayment, status, txRef]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const value = Number(amount);
    const normalizedPhone = normalizeGhanaPhone(phone);

    if (!Number.isFinite(value) || value < MIN_GHS) {
      setError(`Enter at least GHS ${MIN_GHS.toFixed(2)}.`);
      depositLogger.warn("init", "Deposit amount did not pass validation", { details: { minimumGhs: MIN_GHS } });
      return;
    }
    const nationalNumber = normalizedPhone.startsWith("233") ? normalizedPhone.slice(3) : normalizedPhone.startsWith("0") ? normalizedPhone.slice(1) : normalizedPhone;
    if (nationalNumber.length !== 9) {
      setError("Enter a valid Ghana mobile-money number (9 digits, with or without the 0 or +233 prefix).");
      depositLogger.warn("init", "Mobile-money number did not pass validation", { details: { digitCount: normalizedPhone.length } });
      return;
    }

    setStatus("submitting");
    setMessage("");
    setTxRef("");
    checkInFlight.current = false;
    const startedAt = Date.now();
    depositLogger.info("init", "Starting Flutterwave v4 Ghana Mobile Money deposit", {
      details: { amountGhs: value, network, phoneMasked: maskPhone(normalizedPhone) },
    });

    try {
      const result = await api.deposits.flutterwaveGhInit({ amount: value, phoneNumber: normalizedPhone, network });
      if (!result.txRef) throw new Error("The payment service did not return a transaction reference.");
      setTxRef(result.txRef);
      setMessage(result.message || "Check your phone for the payment prompt and approve it to continue.");
      setStatus("pending");
      depositLogger.success("init", "Flutterwave v4 charge created", {
        reference: result.txRef,
        durationMs: Date.now() - startedAt,
        details: { network },
      });
    } catch (startError) {
      setError(errorMessage(startError));
      setStatus("failed");
      depositLogger.error("init", "Flutterwave v4 charge could not be started", {
        durationMs: Date.now() - startedAt,
        details: { httpStatus: startError instanceof ApiError ? startError.status : undefined },
      });
    }
  };

  const reset = () => {
    depositLogger.info("reset", "Customer requested a new deposit", { reference: txRef || undefined });
    setStatus("idle");
    setError("");
    setMessage("");
    setTxRef("");
    checkInFlight.current = false;
  };

  const manualCheck = async () => {
    depositLogger.info("verify", "Customer requested a manual payment status check", { reference: txRef });
    const outcome = await checkPayment();
    if (outcome === "pending" && status === "timeout") {
      setStatus("pending");
      setMessage("Still confirming your payment. We will keep checking for a little longer.");
    }
  };

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(depositLogger.toSupportText());
      depositLogger.info("diagnostics", "Support diagnostics copied to clipboard");
    } catch {
      depositLogger.warn("diagnostics", "Clipboard access was unavailable");
    }
  };

  const disabled = status === "submitting" || status === "pending";

  return (
    <main className="deposit-page">
      <section className="deposit-hero">
        <div className="deposit-hero-icon"><WalletCards size={24} /></div>
        <div>
          <span className="deposit-eyebrow">INSTANT WALLET FUNDING</span>
          <h1>Deposit with Mobile Money</h1>
          <p>Approve a secure payment prompt on your phone to fund your wallet.</p>
        </div>
        <div className="deposit-hero-trust"><ShieldCheck size={16} /> Secure payment</div>
      </section>

      <div className="deposit-shell">
        <div className="deposit-rail">
          <span className="deposit-rail-dot" />
          <span>Flutterwave v4 · Ghana Mobile Money</span>
          <span className="deposit-rail-live"><Smartphone size={11} /> LIVE</span>
        </div>

        {status === "success" ? (
          <section className="deposit-panel deposit-status-panel success" role="status">
            <div className="deposit-status-icon"><CheckCircle2 size={30} /></div>
            <span className="deposit-status-label">PAYMENT CONFIRMED</span>
            <h2>Deposit successful</h2>
            <p className="deposit-status-copy">{message || "Your wallet has been updated."}</p>
            {txRef && <p className="deposit-reference">Reference: <code>{txRef}</code></p>}
            <button className="deposit-secondary" type="button" onClick={reset}>Make another deposit</button>
          </section>
        ) : status === "pending" || status === "timeout" || status === "failed" ? (
          <section className={`deposit-panel deposit-status-panel ${status}`} role="status">
            <div className="deposit-status-icon">
              {status === "pending" ? <Loader2 size={28} className="deposit-spin" /> : status === "failed" ? <AlertCircle size={28} /> : <ShieldCheck size={28} />}
            </div>
            <span className="deposit-status-label">
              {status === "pending" ? "AWAITING MOBILE MONEY APPROVAL" : status === "failed" ? "PAYMENT NOT COMPLETED" : "PAYMENT STILL CONFIRMING"}
            </span>
            <h2>{status === "pending" ? "Approve the prompt on your phone" : status === "failed" ? "Deposit not completed" : "Confirmation is taking longer"}</h2>
            <p className="deposit-status-copy">{message || (status === "pending" ? "Enter your Mobile Money PIN only in your provider's prompt." : "Check your wallet before starting another deposit.")}</p>
            {phone && <p className="deposit-phone-hint">Prompt sent to {maskPhone(phone)} · {network}</p>}
            {txRef && <p className="deposit-reference">Reference: <code>{txRef}</code></p>}
            {error && <div className="deposit-error"><AlertCircle size={15} />{error}</div>}
            <div className="deposit-status-actions">
              {status !== "failed" && <button className="deposit-secondary" type="button" onClick={() => void manualCheck()}><Check size={16} /> Check payment status</button>}
              <button className="deposit-secondary" type="button" onClick={reset}>{status === "failed" ? "Try another payment" : "Start a new deposit"}</button>
            </div>
            {status !== "failed" && <p className="deposit-warning">If you already approved the prompt, please do not submit the same payment again while it is pending.</p>}
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
            {error && <div className="deposit-error" role="alert"><AlertCircle size={15} />{error}</div>}
            <div className="deposit-instruction-notice" role="note">
              <ShieldCheck size={17} />
              <div><strong>How it works</strong><p>Flutterwave sends a payment approval prompt to your phone. Confirm it with your Mobile Money PIN in your provider's secure prompt. Your wallet is credited only after the charge is verified.</p></div>
            </div>
            <label className="deposit-field">
              <span>Mobile-money network</span>
              <select value={network} onChange={event => setNetwork(event.target.value as FlutterwaveGhNetwork)} disabled={disabled}>
                {NETWORKS.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="deposit-field">
              <span>Mobile-money number</span>
              <input value={phone} onChange={event => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" placeholder="024 123 4567 or +233 24 123 4567" disabled={disabled} />
            </label>
            <div className="deposit-field">
              <label htmlFor="deposit-amount">Amount</label>
              <div className="deposit-amount-wrap"><b>GHS</b><input id="deposit-amount" value={amount} onChange={event => setAmount(event.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="50.00" disabled={disabled} /></div>
            </div>
            <div className="deposit-quick-row">
              {QUICK_AMOUNTS.map(value => <button type="button" key={value} className={amount === String(value) ? "selected" : ""} onClick={() => setAmount(String(value))} disabled={disabled}>GHS {value}</button>)}
            </div>
            <button className="deposit-submit" type="submit" disabled={disabled}>
              {status === "submitting" ? <><Loader2 size={17} className="deposit-spin" /> Starting payment…</> : <><Check size={17} /> Pay securely</>}
            </button>
            <p className="deposit-footnote"><ShieldCheck size={14} /> Your wallet updates automatically after Flutterwave confirms the payment.</p>
          </form>
        )}

        <details className="deposit-diagnostics" open={diagnosticsOpen} onToggle={event => setDiagnosticsOpen(event.currentTarget.open)}>
          <summary>Payment diagnostics <span>{entries.length} events</span></summary>
          <div className="deposit-diagnostics-body">
            <p>Recent deposit events for troubleshooting. Phone numbers, credentials, and provider response payloads are not recorded here.</p>
            <div className="deposit-diagnostics-actions">
              <button type="button" onClick={() => void copyDiagnostics()}><ClipboardCopy size={14} /> Copy logs</button>
              <button type="button" onClick={() => depositLogger.clear()}>Clear logs</button>
            </div>
            <ol aria-live="polite">
              {entries.slice(-12).reverse().map(entry => (
                <li key={entry.id} className={`deposit-log-${entry.level}`}>
                  <time>{new Date(entry.timestamp).toLocaleTimeString()}</time>
                  <b>{entry.context}</b>
                  <span>{entry.message}</span>
                  {entry.reference && <code>{entry.reference}</code>}
                  {entry.details?.status !== undefined && <small>status: {String(entry.details.status)}</small>}
                </li>
              ))}
            </ol>
          </div>
        </details>
      </div>
    </main>
  );
}
