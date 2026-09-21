// =============================================================================
// DepositCenter — Super Bet deposit page (Flutterwave v4, GHS + NGN)
//
// Five payment rails:
//   GHS:  Mobile Money (MTN / AirtelTigo / Vodafone) — push notification
//   NGN:  1. Bank Account  — Mono redirect flow
//         2. Bank Transfer — dynamic virtual account (PWBT)
//         3. USSD          — dial-to-pay, no internet required
//         4. OPay          — OPay wallet redirect
//
// Logging:
//   - Every API call, poll attempt, status change, and error is logged with
//     timestamp, level, context, and structured details.
//   - The log panel is always rendered at the bottom of the page (not just
//     in DEV), so support agents and users can copy it when things go wrong.
//   - Console output mirrors the panel with full structured detail objects.
//   - Logs survive method switches and are reference-tagged so you can grep
//     a specific txRef/reference across many entries.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle, ArrowRight, Check, CheckCircle2, ChevronRight, ClipboardList,
  Copy, ExternalLink, Hash, Hourglass, Landmark, RefreshCw, Smartphone,
  ShieldCheck, Wallet, XCircle, Zap,
} from "lucide-react";
import api, {
  ApiError,
  type FlutterwaveGhNetwork,
  type FlutterwaveUssdBank,
} from "@/lib/api";

// =============================================================================
// CONFIGURATION
// =============================================================================

const GHS_QUICK_AMOUNTS = [1, 10, 50, 100, 500];
const NGN_QUICK_AMOUNTS = [20_000, 50_000, 100_000, 200_000, 500_000];

const MIN_GHS = 1;
const MIN_NGN = 20_000;

const GH_NETWORKS: { value: FlutterwaveGhNetwork; label: string }[] = [
  { value: "MTN",        label: "MTN" },
  { value: "AIRTELTIGO", label: "AirtelTigo" },
  { value: "VODAFONE",   label: "Vodafone / Telecel" },
];

const FLW_SUCCESS = new Set(["succeeded", "successful", "success", "completed"]);
const FLW_FAILURE = new Set([
  "failed", "cancelled", "canceled", "declined", "expired",
  "reversed", "voided", "abandoned", "rejected", "error",
]);

/** Tiered poll cadence: fast at first, then slow. Real credit authority is the webhook. */
const POLL_PHASES: { untilSec: number; intervalMs: number }[] = [
  { untilSec: 30,  intervalMs: 3_000  },
  { untilSec: 90,  intervalMs: 6_000  },
  { untilSec: 300, intervalMs: 15_000 },
];
const POLL_TIMEOUT_SEC = 300;

// =============================================================================
// LOGGING SYSTEM
// =============================================================================

export type LogLevel = "info" | "warn" | "error" | "debug" | "success";

export interface LogEntry {
  id:        string;
  timestamp: string;
  level:     LogLevel;
  context:   string;
  message:   string;
  ref?:      string;                      // txRef or reference — for grep/search
  details?:  Record<string, unknown>;
  durationMs?: number;                    // set on API call completions
}

/**
 * Module-level singleton logger. Lives outside React so it persists across
 * renders and method switches. React components subscribe via useState +
 * a listener pattern.
 */
class DepositLogger {
  private entries: LogEntry[] = [];
  private listeners: Array<(entries: LogEntry[]) => void> = [];
  private readonly maxEntries = 500;

  log(
    level: LogLevel,
    context: string,
    message: string,
    opts?: { ref?: string; details?: Record<string, unknown>; durationMs?: number },
  ): LogEntry {
    const entry: LogEntry = {
      id:          crypto.randomUUID(),
      timestamp:   new Date().toISOString(),
      level,
      context,
      message,
      ref:         opts?.ref,
      details:     opts?.details,
      durationMs:  opts?.durationMs,
    };

    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) this.entries.shift();

    // Mirror to browser console with full structured detail
    const prefix = `[${entry.timestamp}] [${level.toUpperCase().padEnd(7)}] [Deposit/${context}]`;
    const consoleFn =
      level === "error"   ? console.error :
      level === "warn"    ? console.warn  :
      level === "debug"   ? console.debug :
      console.log;

    if (opts?.details) {
      consoleFn(prefix, message, opts.details);
    } else {
      consoleFn(prefix, message);
    }

    this.notify();
    return entry;
  }

  /** Convenience wrappers */
  info   = (ctx: string, msg: string, opts?: Parameters<DepositLogger["log"]>[3]) => this.log("info",    ctx, msg, opts);
  warn   = (ctx: string, msg: string, opts?: Parameters<DepositLogger["log"]>[3]) => this.log("warn",    ctx, msg, opts);
  error  = (ctx: string, msg: string, opts?: Parameters<DepositLogger["log"]>[3]) => this.log("error",   ctx, msg, opts);
  debug  = (ctx: string, msg: string, opts?: Parameters<DepositLogger["log"]>[3]) => this.log("debug",   ctx, msg, opts);
  success= (ctx: string, msg: string, opts?: Parameters<DepositLogger["log"]>[3]) => this.log("success", ctx, msg, opts);

  getEntries() { return [...this.entries]; }
  clear()      { this.entries = []; this.notify(); }

  subscribe(fn: (entries: LogEntry[]) => void)   { this.listeners.push(fn); }
  unsubscribe(fn: (entries: LogEntry[]) => void) { this.listeners = this.listeners.filter(l => l !== fn); }

  /** Serialise all log entries as a plain-text block for support copy-paste. */
  toSupportText(): string {
    return this.entries.map(e => {
      const dur = e.durationMs != null ? ` [${e.durationMs}ms]` : "";
      const ref = e.ref ? ` ref=${e.ref}` : "";
      const det = e.details ? "\n  " + JSON.stringify(e.details) : "";
      return `[${e.timestamp}] [${e.level.toUpperCase()}] [${e.context}]${ref}${dur} ${e.message}${det}`;
    }).join("\n");
  }

  private notify() {
    const snapshot = this.getEntries();
    this.listeners.forEach(fn => fn(snapshot));
  }
}

const logger = new DepositLogger();

/** React hook — subscribes to logger updates. */
function useLogEntries(): LogEntry[] {
  const [entries, setEntries] = useState<LogEntry[]>(() => logger.getEntries());
  useEffect(() => {
    const handler = (e: LogEntry[]) => setEntries(e);
    logger.subscribe(handler);
    return () => logger.unsubscribe(handler);
  }, []);
  return entries;
}

// =============================================================================
// POLL HOOK
// =============================================================================

function useFlwPoll(active: boolean, probe: () => Promise<void>) {
  const [startedAt]         = useState(() => Date.now());
  const [stopped, setStopped] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const probeRef = useRef(probe);
  useEffect(() => { probeRef.current = probe; }, [probe]);

  useEffect(() => {
    if (!active) return;
    setStopped(false);
    setPollCount(0);
    let cancelled = false;
    let elapsed   = 0;
    let count     = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled) return;
      const phase = POLL_PHASES.find(p => elapsed < p.untilSec);
      if (!phase) { setStopped(true); return; }
      count++;
      setPollCount(count);
      try { await probeRef.current(); } catch { /* probe handles its own errors */ }
      if (cancelled) return;
      elapsed += phase.intervalMs / 1_000;
      timer = setTimeout(tick, phase.intervalMs);
    };

    void tick();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active]);

  return { startedAt, stopped, pollCount };
}

// =============================================================================
// HELPERS
// =============================================================================

function classify(s: string): "success" | "failed" | "pending" {
  const l = s.toLowerCase();
  if (FLW_SUCCESS.has(l)) return "success";
  if (FLW_FAILURE.has(l)) return "failed";
  return "pending";
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return digits.slice(0, 3) + "•".repeat(digits.length - 5) + digits.slice(-2);
}

function elapsed(startMs: number) {
  const s = Math.round((Date.now() - startMs) / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ${s%60}s ago`;
  return `${Math.floor(s/3600)}h ago`;
}

// =============================================================================
// TYPES
// =============================================================================

type NgMethod  = "ngbank" | "ngpwbt" | "ngussd" | "ngopay";
type Method    = "momo" | NgMethod;
type DepStatus = "idle" | "pending" | "success" | "failed";

interface MethodCard {
  key:    Method;
  icon:   typeof Smartphone;
  title:  string;
  sub:    string;
  eta:    string;
  accent: "blue" | "gold";
}

const METHODS: MethodCard[] = [
  { key: "momo",   icon: Smartphone, title: "Mobile Money",  sub: "Ghana · MTN, AirtelTigo, Vodafone",  eta: "Usually under a minute",    accent: "blue"  },
  { key: "ngbank", icon: Landmark,   title: "Bank Account",  sub: "Nigeria · Pay with Bank",             eta: "Redirect to your bank",     accent: "gold" },
  { key: "ngpwbt", icon: ArrowRight, title: "Bank Transfer", sub: "Nigeria · Transfer to account",       eta: "After your transfer lands", accent: "gold" },
  { key: "ngussd", icon: Hash,       title: "USSD",          sub: "Nigeria · Dial to pay, no internet",  eta: "Instant after dialling",    accent: "gold" },
  { key: "ngopay", icon: Wallet,     title: "OPay",          sub: "Nigeria · OPay wallet",               eta: "Redirect to OPay",          accent: "gold" },
];

// =============================================================================
// SHARED STATUS SCREEN
// =============================================================================

interface StatusProps {
  status:       Exclude<DepStatus, "idle">;
  waitingTitle: string;
  waitingBody:  string;
  failedBody:   string;
  phoneHint?:   string;
  reference?:   string;
  startedAt:    number;
  stopped:      boolean;
  pollCount:    number;
  onCheckNow?:  () => void;
  onReset:      () => void;
}

function StatusScreen({
  status, waitingTitle, waitingBody, failedBody,
  phoneHint, reference, startedAt, stopped, pollCount, onCheckNow, onReset,
}: StatusProps) {
  const cfg = {
    pending: { icon: <Hourglass size={26} />, tone: "wait" as const, title: waitingTitle, body: waitingBody },
    success: { icon: <CheckCircle2 size={26} />, tone: "ok" as const, title: "Deposit confirmed!", body: "Your wallet has been credited. Thank you." },
    failed:  { icon: <XCircle size={26} />, tone: "bad" as const, title: "Payment not completed", body: failedBody },
  }[status];

  const waiting = status === "pending";

  return (
    <div className="dep-status">
      <div className={`dep-status-badge dep-status-${cfg.tone}`}>{cfg.icon}</div>
      <h4>{cfg.title}</h4>
      <p className="dep-status-sub">{cfg.body}</p>

      {waiting && phoneHint && (
        <div className="dep-phone-chip"><Smartphone size={14} />{phoneHint}</div>
      )}

      {waiting && !stopped && (
        <div className="dep-progress">
          <span style={{ animationDuration: `${POLL_TIMEOUT_SEC}s` }} />
        </div>
      )}

      {waiting && (
        <p className="dep-poll-count">
          {stopped
            ? `Auto-checks paused after ${POLL_TIMEOUT_SEC / 60} min. Your wallet updates automatically once confirmed.`
            : `Checked ${pollCount} time${pollCount !== 1 ? "s" : ""} · started ${elapsed(startedAt)}`}
        </p>
      )}

      {waiting && onCheckNow && (
        <button className="dep-ghost-btn" type="button" onClick={onCheckNow}>
          <RefreshCw size={13} />Check now
        </button>
      )}

      {!waiting && (
        <button className="dep-submit" type="button" onClick={onReset}>
          {status === "failed" ? "Try again" : "Make another deposit"}
        </button>
      )}

      {reference && <p className="dep-ref-hint">Ref: {reference}</p>}
    </div>
  );
}

// =============================================================================
// SHARED NGN VERIFY PROBE
// =============================================================================

async function probeNgVerify(
  reference:  string,
  pollCount:  number,
  setMsg:     (m: string) => void,
  setStatus:  (s: DepStatus) => void,
  ctx:        string,
) {
  const t0 = Date.now();
  logger.debug(ctx, `Poll #${pollCount} — calling /verify`, { ref: reference, details: { pollCount } });
  try {
    const result = await api.deposits.flutterwaveNgVerify(reference);
    const dur    = Date.now() - t0;
    const bucket = classify(result.status);

    logger.log(
      bucket === "success" ? "success" : bucket === "failed" ? "error" : "info",
      ctx,
      `Poll #${pollCount} → status='${result.status}' credited=${result.credited}`,
      { ref: reference, details: { status: result.status, credited: result.credited, message: result.message }, durationMs: dur },
    );

    setMsg(result.message || "");
    if (bucket === "success") setStatus("success");
    else if (bucket === "failed") setStatus("failed");
    else setStatus("pending");
  } catch (err) {
    logger.warn(ctx, `Poll #${pollCount} failed — will retry`, {
      ref:     reference,
      details: { error: err instanceof Error ? err.message : String(err), httpStatus: err instanceof ApiError ? err.status : undefined },
    });
  }
}

// =============================================================================
// FORM: GHS MOBILE MONEY
// =============================================================================

function MoMoForm() {
  const [amount,   setAmount]   = useState("100");
  const [phone,    setPhone]    = useState("");
  const [network,  setNetwork]  = useState<FlutterwaveGhNetwork>("MTN");
  const [status,   setStatus]   = useState<DepStatus>("idle");
  const [txRef,    setTxRef]    = useState("");
  const [statusMsg, setMsg]     = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const probe = useCallback(async () => {
    if (!txRef) return;
    const t0 = Date.now();
    logger.debug("momo.verify", `Polling /verify`, { ref: txRef });
    try {
      const result = await api.deposits.flutterwaveGhVerify({ txRef });
      const dur    = Date.now() - t0;
      const bucket = classify(result.status);

      logger.log(
        bucket === "success" ? "success" : bucket === "failed" ? "error" : "info",
        "momo.verify",
        `status='${result.status}' credited=${result.credited}`,
        { ref: txRef, details: { status: result.status, credited: result.credited, message: result.message }, durationMs: dur },
      );

      setMsg(result.message || "");
      if (bucket === "success") setStatus("success");
      else if (bucket === "failed") setStatus("failed");
    } catch (err) {
      logger.warn("momo.verify", "Verify call failed — will retry next tick", {
        ref: txRef,
        details: { error: err instanceof Error ? err.message : String(err), httpStatus: err instanceof ApiError ? err.status : undefined },
      });
    }
  }, [txRef]);

  const { startedAt, stopped, pollCount } = useFlwPoll(status === "pending", probe);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const value  = Number(amount);
    const digits = phone.replace(/\D/g, "");

    if (!value || value < MIN_GHS) {
      setError(`Minimum deposit is GHS ${MIN_GHS}.`);
      logger.warn("momo.init", "Validation failed: amount too low", { details: { amount: value, min: MIN_GHS } });
      return;
    }
    if (digits.length < 9) {
      setError("Enter a valid Mobile Money number (at least 9 digits).");
      logger.warn("momo.init", "Validation failed: phone too short", { details: { digitCount: digits.length } });
      return;
    }

    setLoading(true);
    logger.info("momo.init", `Initiating GHS MoMo deposit — network=${network} amount=${value}`, {
      details: { network, amount: value, phoneMasked: maskPhone(digits) },
    });

    const t0 = Date.now();
    try {
      const result = await api.deposits.flutterwaveGhInit({ amount: value, phoneNumber: digits, network });
      logger.success("momo.init", `Charge initiated — txRef=${result.txRef}`, {
        ref:     result.txRef,
        details: { txRef: result.txRef, message: result.message },
        durationMs: Date.now() - t0,
      });
      setTxRef(result.txRef);
      setMsg(result.message || "Check your phone and approve the MoMo prompt.");
      setStatus("pending");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message || "Could not start deposit.";
      setError(msg);
      logger.error("momo.init", `Charge initiation failed: ${msg}`, {
        details: { error: msg, httpStatus: err instanceof ApiError ? err.status : undefined },
        durationMs: Date.now() - t0,
      });
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    logger.info("momo.reset", "Resetting form", { details: { previousTxRef: txRef || null } });
    setStatus("idle"); setError(""); setTxRef(""); setMsg(""); setLoading(false);
  };

  if (status !== "idle") {
    return (
      <StatusScreen
        status={status}
        waitingTitle="Waiting for your approval"
        waitingBody={statusMsg || "Check your phone for the MoMo prompt and enter your PIN. This updates automatically."}
        failedBody={statusMsg || "The payment was declined, cancelled, or timed out. No money left your account."}
        phoneHint={phone ? `Prompt sent to ${maskPhone(phone)}` : undefined}
        reference={txRef} startedAt={startedAt} stopped={stopped} pollCount={pollCount}
        onCheckNow={() => { logger.info("momo.verify", "Manual check triggered by user", { ref: txRef }); void probe(); }}
        onReset={reset}
      />
    );
  }

  return (
    <form className="dep-form" onSubmit={submit}>
      {error && <p className="dep-inline-error"><AlertCircle size={13} style={{flexShrink:0,marginTop:1}}/>{error}</p>}
      <label className="dep-field">
        <span>Mobile Money number</span>
        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 024 123 4567" />
      </label>
      <label className="dep-field">
        <span>Network</span>
        <select value={network} onChange={e => setNetwork(e.target.value as FlutterwaveGhNetwork)}>
          {GH_NETWORKS.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
        </select>
      </label>
      <label className="dep-field">
        <span>Amount (GHS)</span>
        <input type="number" min={MIN_GHS} value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 100" />
      </label>
      <div className="dep-quick-amounts">
        {GHS_QUICK_AMOUNTS.map(v => (
          <button type="button" key={v} className={String(v) === amount ? "active" : ""} onClick={() => setAmount(String(v))}>
            GHS {v}
          </button>
        ))}
      </div>
      <button className="dep-submit" type="submit" disabled={loading}>
        {loading ? "Sending prompt…" : "Send payment prompt"}<ChevronRight size={16} />
      </button>
      <p className="dep-note"><ShieldCheck size={14} />You approve on your own phone — we never see your PIN. Powered by Flutterwave.</p>
    </form>
  );
}

// =============================================================================
// FORM: NGN BANK ACCOUNT (Mono redirect)
// =============================================================================

function NgBankForm({ resumeReference }: { resumeReference?: string }) {
  const [amount,  setAmount]  = useState("50000");
  const [status,  setStatus]  = useState<DepStatus>("idle");
  const [ref,     setRef]     = useState("");
  const [statusMsg, setMsg]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  useEffect(() => {
    if (!resumeReference) return;
    logger.info("ngbank.resume", `Resumed after bank redirect — ref=${resumeReference}`, {
      ref: resumeReference, details: { resumeReference },
    });
    setRef(resumeReference);
    setMsg("Confirming your bank transfer…");
    setStatus("pending");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const probe = useCallback(async (count: number) =>
    probeNgVerify(ref, count, setMsg, setStatus, "ngbank.verify"),
  [ref]);

  const wrappedProbe = useCallback(async () => probe(0), [probe]);
  const { startedAt, stopped, pollCount } = useFlwPoll(status === "pending", wrappedProbe);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    const value = Number(amount);
    if (!value || value < MIN_NGN) {
      setError(`Minimum deposit is NGN ${MIN_NGN.toLocaleString()}.`);
      logger.warn("ngbank.init", "Validation failed: amount too low", { details: { amount: value, min: MIN_NGN } });
      return;
    }
    setLoading(true);
    logger.info("ngbank.init", `Initiating NGN bank account deposit — amount=${value}`, { details: { amount: value } });
    const t0 = Date.now();
    try {
      const result = await api.deposits.flutterwaveNgBankInit({ amount: value });
      logger.info("ngbank.init", `Charge created — ref=${result.reference} hasRedirectUrl=${!!result.redirectUrl}`, {
        ref:     result.reference,
        details: { reference: result.reference, chargeId: result.chargeId, nextActionType: result.nextActionType, hasRedirectUrl: !!result.redirectUrl },
        durationMs: Date.now() - t0,
      });
      if (!result.redirectUrl) {
        const msg = "Deposit started but we couldn't get a payment link. Please try Bank Transfer or USSD instead.";
        setError(msg);
        setRef(result.reference);
        logger.error("ngbank.init", "redirectUrl is null — cannot send customer to bank", { ref: result.reference });
        setLoading(false);
        return;
      }
      logger.info("ngbank.init", `Navigating browser to bank auth page`, { ref: result.reference });
      window.location.href = result.redirectUrl;
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message || "Could not start deposit.";
      setError(msg);
      logger.error("ngbank.init", `Failed: ${msg}`, {
        details: { error: msg, httpStatus: err instanceof ApiError ? err.status : undefined },
        durationMs: Date.now() - t0,
      });
      setLoading(false);
    }
  };

  const reset = () => {
    logger.info("ngbank.reset", "Resetting form", { details: { previousRef: ref || null } });
    setStatus("idle"); setError(""); setRef(""); setMsg(""); setLoading(false);
  };

  const manualCheck = () => {
    logger.info("ngbank.verify", "Manual check triggered by user", { ref });
    void probeNgVerify(ref, pollCount + 1, setMsg, setStatus, "ngbank.verify");
  };

  if (status !== "idle") {
    return (
      <StatusScreen
        status={status}
        waitingTitle="Confirming your bank transfer"
        waitingBody={statusMsg || "This updates automatically — no need to refresh."}
        failedBody={statusMsg || "The payment was not completed. No money left your account."}
        reference={ref} startedAt={startedAt} stopped={stopped} pollCount={pollCount}
        onCheckNow={manualCheck} onReset={reset}
      />
    );
  }

  return (
    <form className="dep-form" onSubmit={submit}>
      {error && <p className="dep-inline-error"><AlertCircle size={13} style={{flexShrink:0,marginTop:1}}/>{error}</p>}
      <label className="dep-field">
        <span>Amount (NGN)</span>
        <input type="number" min={MIN_NGN} value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 50000" />
      </label>
      <div className="dep-quick-amounts">
        {NGN_QUICK_AMOUNTS.map(v => (
          <button type="button" key={v} className={String(v) === amount ? "active" : ""} onClick={() => setAmount(String(v))}>
            ₦{v.toLocaleString()}
          </button>
        ))}
      </div>
      <button className="dep-submit dep-submit-gold" type="submit" disabled={loading}>
        {loading ? "Redirecting…" : "Continue to your bank"}<ExternalLink size={15} />
      </button>
      <p className="dep-note"><ShieldCheck size={14} />You authorize at your bank's page and return here automatically. Powered by Flutterwave.</p>
    </form>
  );
}

// =============================================================================
// FORM: NGN BANK TRANSFER (PWBT virtual account)
// =============================================================================

interface PwbtDetails {
  reference: string; accountNumber: string; bankName: string;
  expiresAt: string; note: string; amount: number;
}

function NgPwbtForm() {
  const [amount,  setAmount]  = useState("50000");
  const [details, setDetails] = useState<PwbtDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [copied,  setCopied]  = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    const value = Number(amount);
    if (!value || value < MIN_NGN) {
      setError(`Minimum deposit is NGN ${MIN_NGN.toLocaleString()}.`);
      logger.warn("ngpwbt.init", "Validation failed: amount too low", { details: { amount: value, min: MIN_NGN } });
      return;
    }
    setLoading(true);
    logger.info("ngpwbt.init", `Creating virtual account — amount=${value}`, { details: { amount: value } });
    const t0 = Date.now();
    try {
      const result = await api.deposits.flutterwaveNgPwbtInit({ amount: value });
      logger.success("ngpwbt.init", `Virtual account created — ref=${result.reference} bank=${result.bankName}`, {
        ref:     result.reference,
        details: { reference: result.reference, bank: result.bankName, accountNumber: result.accountNumber, expiresAt: result.expiresAt },
        durationMs: Date.now() - t0,
      });
      setDetails(result);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message || "Could not create virtual account.";
      setError(msg);
      logger.error("ngpwbt.init", `Failed: ${msg}`, {
        details: { error: msg, httpStatus: err instanceof ApiError ? err.status : undefined },
        durationMs: Date.now() - t0,
      });
    } finally {
      setLoading(false); }
  };

  const copyAcct = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        logger.info("ngpwbt.ux", "Account number copied to clipboard");
      })
      .catch(() => {});
  };

  if (details) {
    return (
      <div className="dep-pwbt">
        <div className="dep-status-badge dep-status-wait" style={{ margin: "0 auto 12px" }}><Landmark size={24} /></div>
        <h4>Transfer to this account</h4>
        <p className="dep-status-sub">Send exactly <strong>₦{Number(details.amount).toLocaleString()}</strong> — your wallet credits automatically once received.</p>
        <div className="dep-account-box">
          <div className="dep-account-row">
            <span>Account</span>
            <strong>{details.accountNumber}</strong>
            <button type="button" className="dep-copy-btn" onClick={() => copyAcct(details.accountNumber)} title="Copy">
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
          <div className="dep-account-row"><span>Bank</span><strong>{details.bankName}</strong></div>
          <div className="dep-account-row"><span>Amount</span><strong>₦{Number(details.amount).toLocaleString()}</strong></div>
        </div>
        <p className="dep-inline-note">{details.note}</p>
        {details.expiresAt && (
          <p className="dep-timer-hint">Expires at {new Date(details.expiresAt).toLocaleTimeString()} — transfer before then.</p>
        )}
        <p className="dep-ref-hint">Ref: {details.reference}</p>
        <button className="dep-ghost-btn" type="button" style={{ marginTop: 12 }} onClick={() => { setDetails(null); logger.info("ngpwbt.reset","New deposit requested"); }}>
          Make a new deposit
        </button>
      </div>
    );
  }

  return (
    <form className="dep-form" onSubmit={submit}>
      {error && <p className="dep-inline-error"><AlertCircle size={13} style={{flexShrink:0,marginTop:1}}/>{error}</p>}
      <p className="dep-note" style={{ marginBottom: 2 }}>
        <AlertCircle size={14} />We generate a unique virtual account number. Transfer the exact amount from your bank app — no redirects needed.
      </p>
      <label className="dep-field">
        <span>Amount (NGN)</span>
        <input type="number" min={MIN_NGN} value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 50000" />
      </label>
      <div className="dep-quick-amounts">
        {NGN_QUICK_AMOUNTS.map(v => (
          <button type="button" key={v} className={String(v) === amount ? "active" : ""} onClick={() => setAmount(String(v))}>
            ₦{v.toLocaleString()}
          </button>
        ))}
      </div>
      <button className="dep-submit dep-submit-gold" type="submit" disabled={loading}>
        {loading ? "Generating account…" : "Get account details"}<ArrowRight size={15} />
      </button>
      <p className="dep-note"><ShieldCheck size={14} />Account expires after 1 hour. Send the exact amount. Powered by Flutterwave.</p>
    </form>
  );
}

// =============================================================================
// FORM: NGN USSD
// =============================================================================

function NgUssdForm() {
  const [amount,       setAmount]      = useState("50000");
  const [bankCode,     setBankCode]    = useState("");
  const [banks,        setBanks]       = useState<FlutterwaveUssdBank[]>([]);
  const [status,       setStatus]      = useState<DepStatus>("idle");
  const [ref,          setRef]         = useState("");
  const [note,         setNote]        = useState("");
  const [statusMsg,    setMsg]         = useState("");
  const [loading,      setLoading]     = useState(false);
  const [banksLoading, setBanksLoading]= useState(false);
  const [error,        setError]       = useState("");

  useEffect(() => {
    setBanksLoading(true);
    logger.info("ngussd.banks", "Fetching USSD bank list");
    const t0 = Date.now();
    api.deposits.flutterwaveNgUssdBanks()
      .then(result => {
        const list: FlutterwaveUssdBank[] = Array.isArray(result)
          ? result
          : ((result as { data?: FlutterwaveUssdBank[] }).data ?? []);
        setBanks(list);
        if (list.length > 0) setBankCode(list[0].code);
        logger.info("ngussd.banks", `Loaded ${list.length} banks`, { details: { count: list.length }, durationMs: Date.now() - t0 });
      })
      .catch(err => {
        const msg = err instanceof Error ? err.message : String(err);
        setError("Could not load bank list. Please refresh.");
        logger.error("ngussd.banks", `Failed to load banks: ${msg}`, { details: { error: msg }, durationMs: Date.now() - t0 });
      })
      .finally(() => setBanksLoading(false));
  }, []);

  const probe = useCallback(async (count: number) =>
    probeNgVerify(ref, count, setMsg, setStatus, "ngussd.verify"),
  [ref]);
  const wrappedProbe = useCallback(async () => probe(0), [probe]);
  const { startedAt, stopped, pollCount } = useFlwPoll(status === "pending", wrappedProbe);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    const value = Number(amount);
    if (!value || value < MIN_NGN) {
      setError(`Minimum deposit is NGN ${MIN_NGN.toLocaleString()}.`);
      logger.warn("ngussd.init", "Validation failed: amount too low", { details: { amount: value, min: MIN_NGN } });
      return;
    }
    if (!bankCode) {
      setError("Please select your bank.");
      logger.warn("ngussd.init", "Validation failed: no bank selected");
      return;
    }
    setLoading(true);
    logger.info("ngussd.init", `Initiating USSD charge — amount=${value} bankCode=${bankCode}`, { details: { amount: value, bankCode } });
    const t0 = Date.now();
    try {
      const result = await api.deposits.flutterwaveNgUssdInit({ amount: value, bankCode });
      logger.success("ngussd.init", `USSD charge created — ref=${result.reference}`, {
        ref:     result.reference,
        details: { reference: result.reference, chargeId: result.chargeId, note: result.note },
        durationMs: Date.now() - t0,
      });
      setRef(result.reference);
      setNote(result.note);
      setMsg(result.note);
      setStatus("pending");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message || "Could not start USSD deposit.";
      setError(msg);
      logger.error("ngussd.init", `Failed: ${msg}`, {
        details: { error: msg, httpStatus: err instanceof ApiError ? err.status : undefined },
        durationMs: Date.now() - t0,
      });
    } finally { setLoading(false); }
  };

  const reset = () => {
    logger.info("ngussd.reset", "Resetting form", { details: { previousRef: ref || null } });
    setStatus("idle"); setError(""); setRef(""); setNote(""); setMsg(""); setLoading(false);
  };

  if (status !== "idle") {
    return (
      <StatusScreen
        status={status}
        waitingTitle="Dial to complete payment"
        waitingBody={statusMsg || note || "Dial the code on your phone and enter your PIN when prompted."}
        failedBody={statusMsg || "The USSD payment was not completed. No money left your account."}
        reference={ref} startedAt={startedAt} stopped={stopped} pollCount={pollCount}
        onCheckNow={() => {
          logger.info("ngussd.verify", "Manual check triggered by user", { ref });
          void probeNgVerify(ref, pollCount + 1, setMsg, setStatus, "ngussd.verify");
        }}
        onReset={reset}
      />
    );
  }

  return (
    <form className="dep-form" onSubmit={submit}>
      {error && <p className="dep-inline-error"><AlertCircle size={13} style={{flexShrink:0,marginTop:1}}/>{error}</p>}
      <label className="dep-field">
        <span>Your bank</span>
        <select value={bankCode} onChange={e => setBankCode(e.target.value)} disabled={banksLoading}>
          {banksLoading
            ? <option>Loading banks…</option>
            : banks.map(b => <option key={b.code} value={b.code}>{b.name}</option>)
          }
        </select>
      </label>
      <label className="dep-field">
        <span>Amount (NGN)</span>
        <input type="number" min={MIN_NGN} value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 50000" />
      </label>
      <div className="dep-quick-amounts">
        {NGN_QUICK_AMOUNTS.map(v => (
          <button type="button" key={v} className={String(v) === amount ? "active" : ""} onClick={() => setAmount(String(v))}>
            ₦{v.toLocaleString()}
          </button>
        ))}
      </div>
      <button className="dep-submit dep-submit-gold" type="submit" disabled={loading || banksLoading}>
        {loading ? "Generating USSD code…" : "Get USSD code"}<Hash size={15} />
      </button>
      <p className="dep-note"><ShieldCheck size={14} />Works without internet — just your phone's dialler. Powered by Flutterwave.</p>
    </form>
  );
}

// =============================================================================
// FORM: NGN OPAY
// =============================================================================

function NgOpayForm({ resumeReference }: { resumeReference?: string }) {
  const [amount,  setAmount]  = useState("50000");
  const [status,  setStatus]  = useState<DepStatus>("idle");
  const [ref,     setRef]     = useState("");
  const [statusMsg, setMsg]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  useEffect(() => {
    if (!resumeReference) return;
    logger.info("ngopay.resume", `Resumed after OPay redirect — ref=${resumeReference}`, {
      ref: resumeReference, details: { resumeReference },
    });
    setRef(resumeReference);
    setMsg("Confirming your OPay payment…");
    setStatus("pending");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const probe = useCallback(async (count: number) =>
    probeNgVerify(ref, count, setMsg, setStatus, "ngopay.verify"),
  [ref]);
  const wrappedProbe = useCallback(async () => probe(0), [probe]);
  const { startedAt, stopped, pollCount } = useFlwPoll(status === "pending", wrappedProbe);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    const value = Number(amount);
    if (!value || value < MIN_NGN) {
      setError(`Minimum deposit is NGN ${MIN_NGN.toLocaleString()}.`);
      logger.warn("ngopay.init", "Validation failed: amount too low", { details: { amount: value, min: MIN_NGN } });
      return;
    }
    setLoading(true);
    logger.info("ngopay.init", `Initiating OPay deposit — amount=${value}`, { details: { amount: value } });
    const t0 = Date.now();
    try {
      const result = await api.deposits.flutterwaveNgOpayInit({ amount: value });
      logger.info("ngopay.init", `Charge created — ref=${result.reference} hasRedirectUrl=${!!result.redirectUrl}`, {
        ref:     result.reference,
        details: { reference: result.reference, chargeId: result.chargeId, hasRedirectUrl: !!result.redirectUrl },
        durationMs: Date.now() - t0,
      });
      if (!result.redirectUrl) {
        const msg = "Deposit started but couldn't get an OPay link. Please try again.";
        setError(msg);
        setRef(result.reference);
        logger.error("ngopay.init", "redirectUrl is null — cannot navigate to OPay", { ref: result.reference });
        setLoading(false);
        return;
      }
      logger.info("ngopay.init", "Navigating browser to OPay", { ref: result.reference });
      window.location.href = result.redirectUrl;
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message || "Could not start deposit.";
      setError(msg);
      logger.error("ngopay.init", `Failed: ${msg}`, {
        details: { error: msg, httpStatus: err instanceof ApiError ? err.status : undefined },
        durationMs: Date.now() - t0,
      });
      setLoading(false);
    }
  };

  const reset = () => {
    logger.info("ngopay.reset", "Resetting form", { details: { previousRef: ref || null } });
    setStatus("idle"); setError(""); setRef(""); setMsg(""); setLoading(false);
  };

  if (status !== "idle") {
    return (
      <StatusScreen
        status={status}
        waitingTitle="Confirming your OPay payment"
        waitingBody={statusMsg || "This updates automatically — no need to refresh."}
        failedBody={statusMsg || "The payment was not completed. No money left your account."}
        reference={ref} startedAt={startedAt} stopped={stopped} pollCount={pollCount}
        onCheckNow={() => {
          logger.info("ngopay.verify", "Manual check triggered by user", { ref });
          void probeNgVerify(ref, pollCount + 1, setMsg, setStatus, "ngopay.verify");
        }}
        onReset={reset}
      />
    );
  }

  return (
    <form className="dep-form" onSubmit={submit}>
      {error && <p className="dep-inline-error"><AlertCircle size={13} style={{flexShrink:0,marginTop:1}}/>{error}</p>}
      <label className="dep-field">
        <span>Amount (NGN)</span>
        <input type="number" min={MIN_NGN} value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 50000" />
      </label>
      <div className="dep-quick-amounts">
        {NGN_QUICK_AMOUNTS.map(v => (
          <button type="button" key={v} className={String(v) === amount ? "active" : ""} onClick={() => setAmount(String(v))}>
            ₦{v.toLocaleString()}
          </button>
        ))}
      </div>
      <button className="dep-submit dep-submit-gold" type="submit" disabled={loading}>
        {loading ? "Redirecting to OPay…" : "Pay with OPay"}<ExternalLink size={15} />
      </button>
      <p className="dep-note"><ShieldCheck size={14} />You authorize in the OPay interface and return here automatically. Powered by Flutterwave.</p>
    </form>
  );
}

// =============================================================================
// LOG PANEL (always visible — for support)
// =============================================================================

const LEVEL_STYLE: Record<LogLevel, { bg: string; color: string; label: string }> = {
  success: { bg: "rgba(13,166,83,.12)",  color: "#0DA653", label: "OK"    },
  info:    { bg: "rgba(88,130,255,.10)", color: "#6B8BFF", label: "INFO"  },
  debug:   { bg: "rgba(95,102,115,.10)", color: "#6b7280", label: "DBG"   },
  warn:    { bg: "rgba(255,176,32,.12)", color: "#FFB020", label: "WARN"  },
  error:   { bg: "rgba(30,107,255)",   color: "#4d8dff", label: "ERROR" },
};

function LogPanel() {
  const entries   = useLogEntries();
  const [open,    setOpen]    = useState(false);
  const [filter,  setFilter]  = useState<LogLevel | "all">("all");
  const [copied,  setCopied]  = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when new entries arrive and panel is open
  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries.length, open]);

  const visible = filter === "all" ? entries : entries.filter(e => e.level === filter);
  const errorCount = entries.filter(e => e.level === "error").length;
  const warnCount  = entries.filter(e => e.level === "warn").length;

  const copyForSupport = () => {
    navigator.clipboard.writeText(logger.toSupportText())
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  };

  return (
    <div className="dep-log-panel">
      {/* Header / toggle */}
      <button
        type="button"
        className="dep-log-header"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="dep-log-header-left">
          <ClipboardList size={14} />
          <span>Activity log</span>
          <span className="dep-log-count">{entries.length}</span>
          {errorCount > 0 && <span className="dep-log-badge dep-log-badge-error">{errorCount} error{errorCount !== 1 ? "s" : ""}</span>}
          {warnCount  > 0 && <span className="dep-log-badge dep-log-badge-warn">{warnCount} warn{warnCount !== 1 ? "s" : ""}</span>}
        </span>
        <span className="dep-log-chevron" style={{ transform: open ? "rotate(180deg)" : "none" }}>▾</span>
      </button>

      {open && (
        <div className="dep-log-body">
          {/* Toolbar */}
          <div className="dep-log-toolbar">
            <div className="dep-log-filters">
              {(["all", "error", "warn", "success", "info", "debug"] as const).map(lvl => (
                <button
                  key={lvl}
                  type="button"
                  className={`dep-log-filter${filter === lvl ? " active" : ""}`}
                  onClick={() => setFilter(lvl)}
                >
                  {lvl === "all" ? "All" : LEVEL_STYLE[lvl]?.label ?? lvl}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" className="dep-log-action" onClick={copyForSupport} title="Copy all logs for support">
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? "Copied!" : "Copy for support"}
              </button>
              <button type="button" className="dep-log-action" onClick={() => logger.clear()} title="Clear logs">
                Clear
              </button>
            </div>
          </div>

          {/* Entries */}
          <div className="dep-log-entries">
            {visible.length === 0 && (
              <p className="dep-log-empty">No {filter === "all" ? "" : filter + " "}entries yet.</p>
            )}
            {visible.map(entry => {
              const style = LEVEL_STYLE[entry.level];
              const time  = new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
              return (
                <div key={entry.id} className="dep-log-entry" style={{ borderLeftColor: style.color }}>
                  <div className="dep-log-entry-head">
                    <span className="dep-log-badge-inline" style={{ background: style.bg, color: style.color }}>
                      {style.label}
                    </span>
                    <span className="dep-log-ctx">{entry.context}</span>
                    {entry.ref && <span className="dep-log-ref" title="Transaction reference">{entry.ref.slice(0, 20)}{entry.ref.length > 20 ? "…" : ""}</span>}
                    {entry.durationMs != null && <span className="dep-log-dur">{entry.durationMs}ms</span>}
                    <span className="dep-log-time">{time}</span>
                  </div>
                  <p className="dep-log-msg">{entry.message}</p>
                  {entry.details && (
                    <details className="dep-log-details">
                      <summary>Details</summary>
                      <pre>{JSON.stringify(entry.details, null, 2)}</pre>
                    </details>
                  )}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN — DepositCenter
// =============================================================================

export default function DepositCenter() {
  const [method,         setMethod]        = useState<Method>("momo");
  const [resumeBankRef,  setResumeBankRef]  = useState<string | undefined>();
  const [resumeOpayRef,  setResumeOpayRef]  = useState<string | undefined>();

  useEffect(() => {
    logger.info("lifecycle", "DepositCenter mounted", { details: { url: window.location.href } });

    if (typeof window !== "undefined") {
      const params  = new URLSearchParams(window.location.search);
      const m       = params.get("method");
      const r       = params.get("reference") ?? undefined;

      if (m === "ngbank-v4" && r) {
        logger.info("lifecycle", `Detected return from bank redirect — method=${m} ref=${r}`, {
          ref: r, details: { method: m, reference: r },
        });
        setMethod("ngbank");
        setResumeBankRef(r);
        window.history.replaceState(null, "", window.location.pathname);
      } else if (m === "ngopay-v4" && r) {
        logger.info("lifecycle", `Detected return from OPay redirect — method=${m} ref=${r}`, {
          ref: r, details: { method: m, reference: r },
        });
        setMethod("ngopay");
        setResumeOpayRef(r);
        window.history.replaceState(null, "", window.location.pathname);
      }
    }

    return () => { logger.info("lifecycle", "DepositCenter unmounted"); };
  }, []);

  const isNgn    = method !== "momo";
  const active   = METHODS.find(m => m.key === method)!;

  const changeMethod = (m: Method) => {
    logger.info("lifecycle", `Method changed: ${method} → ${m}`, { details: { from: method, to: m } });
    setMethod(m);
  };

  return (
    <div className="dep-page">
      <DepStyles />

      <section className="dep-hero">
        <span className="dep-hero-icon"><Wallet size={22} /></span>
        <h1>Deposit</h1>
        <p>Fund your wallet — choose your payment method below.</p>
      </section>

      <div className="dep-body">
        {/* Currency tabs */}
        <div className="dep-currency-tabs">
          <button type="button" className={!isNgn ? "active" : ""} onClick={() => changeMethod("momo")}>
            <Smartphone size={14} />Ghana (GHS)
          </button>
          <button type="button" className={isNgn ? "active" : ""} onClick={() => changeMethod("ngbank")}>
            <Landmark size={14} />Nigeria (NGN)
          </button>
        </div>

        {/* NGN sub-method tabs */}
        {isNgn && (
          <div className="dep-ng-tabs">
            {(["ngbank", "ngpwbt", "ngussd", "ngopay"] as NgMethod[]).map(k => {
              const m    = METHODS.find(x => x.key === k)!;
              const Icon = m.icon;
              return (
                <button type="button" key={k} className={method === k ? "active" : ""} onClick={() => changeMethod(k)}>
                  <Icon size={13} />{m.title}
                </button>
              );
            })}
          </div>
        )}

        {/* Method summary */}
        <div className="dep-method-summary">
          <span className={`dep-form-icon dep-accent-${active.accent}`}><active.icon size={16} /></span>
          <div>
            <h3>{active.title}</h3>
            <p>{active.sub} · {active.eta}</p>
          </div>
        </div>

        {/* Form card */}
        <section className="dep-card">
          {method === "momo"   && <MoMoForm />}
          {method === "ngbank" && <NgBankForm resumeReference={resumeBankRef} />}
          {method === "ngpwbt" && <NgPwbtForm />}
          {method === "ngussd" && <NgUssdForm />}
          {method === "ngopay" && <NgOpayForm resumeReference={resumeOpayRef} />}
        </section>

        {/* Info cards */}
        <section className="dep-card dep-info-card">
          <span className="dep-info-icon"><ShieldCheck size={20} /></span>
          <h3>Deposit safely</h3>
          <p>All deposits are processed by Flutterwave. We never see or store your PIN or banking credentials. Transfers and USSD payments confirm automatically once received.</p>
        </section>

        <section className="dep-card dep-info-card">
          <span className="dep-info-icon dep-info-icon-gold"><Zap size={20} /></span>
          <h3>Need help?</h3>
          <p>If a deposit hasn't arrived after a few minutes, use the activity log below to copy your transaction details, then contact our <a href="/support">Support Centre</a>.</p>
        </section>

        {/* Log panel — always visible */}
        <LogPanel />
      </div>
    </div>
  );
}

// =============================================================================
// STYLES
// =============================================================================

function DepStyles() {
  return (
    <style>{`
      .dep-page{ background:#0A0A0A; min-height:60vh; }

      /* Hero */
      .dep-hero{ display:flex; flex-direction:column; align-items:flex-start; gap:8px; padding:28px 26px 30px;
        background:linear-gradient(135deg,var(--gold-hi) 0%,var(--blue) 65%,#0b2e70 130%); color:#fff; border-radius:0 0 18px 18px; }
      .dep-hero-icon{ display:flex; align-items:center; justify-content:center; width:44px; height:44px; border-radius:12px;
        background:rgba(255,255,255,.16); border:1px solid rgba(255,255,255,.3); margin-bottom:4px; }
      .dep-hero h1{ margin:0; font:800 30px 'DM Sans',sans-serif; letter-spacing:-.02em; }
      .dep-hero p{ margin:0; font-size:.85rem; color:rgba(255,255,255,.82); max-width:420px; }

      /* Body */
      .dep-body{ padding:22px 26px 50px; max-width:640px; margin:0 auto; display:flex; flex-direction:column; gap:14px; }

      /* Currency tabs */
      .dep-currency-tabs{ display:flex; gap:8px; }
      .dep-currency-tabs button{ flex:1; display:flex; align-items:center; justify-content:center; gap:7px; padding:11px;
        border-radius:10px; background:#141414; border:1.5px solid var(--line); color:#8b8b8b;
        font:700 .8rem 'DM Sans',sans-serif; cursor:pointer; transition:all .15s ease; }
      .dep-currency-tabs button.active{ background:rgba(30,107,255); border-color:var(--blue); color:var(--blue); }

      /* NGN sub-method tabs */
      .dep-ng-tabs{ display:flex; gap:6px; flex-wrap:wrap; }
      .dep-ng-tabs button{ display:flex; align-items:center; gap:6px; padding:8px 13px; border-radius:8px;
        background:#141414; border:1.5px solid var(--line); color:#8b8b8b;
        font:700 .75rem 'DM Sans',sans-serif; cursor:pointer; transition:all .15s ease; }
      .dep-ng-tabs button.active{ background:rgba(255,176,32,.08); border-color:#FFB020; color:#FFB020; }

      /* Method summary */
      .dep-method-summary{ display:flex; align-items:center; gap:12px; }
      .dep-form-icon{ display:flex; align-items:center; justify-content:center; width:34px; height:34px;
        border-radius:9px; flex-shrink:0; background:rgba(95,102,115,.1); color:#9a9a9a; }
      .dep-form-icon.dep-accent-blue{ background:rgba(30,107,255); color:var(--blue); }
      .dep-form-icon.dep-accent-gold{ background:rgba(255,176,32,.14); color:#FFB020; }
      .dep-method-summary h3{ margin:0; font:800 15px 'DM Sans',sans-serif; color:#F4F1F0; }
      .dep-method-summary p{ margin:2px 0 0; font-size:.72rem; color:#8b8b8b; font-weight:600; }

      /* Form card */
      .dep-card{ background:#141414; border:1px solid var(--line); box-shadow:var(--shadow); border-radius:14px; padding:20px; }
      .dep-form{ display:flex; flex-direction:column; gap:13px; }
      .dep-field{ display:flex; flex-direction:column; gap:5px; font-size:.72rem; font-weight:700; color:#9a9a9a; text-transform:uppercase; letter-spacing:.05em; }
      .dep-field input,.dep-field select{ padding:12px; font-size:.88rem; font-weight:600; color:#F4F1F0; background:#1B1B1B;
        border:1px solid var(--line); border-radius:8px; outline:0; font-family:'DM Sans',sans-serif;
        transition:border-color .14s ease,background-color .14s ease; text-transform:none; letter-spacing:normal; }
      .dep-field input:focus,.dep-field select:focus{ border-color:var(--blue); background:#141414; }

      /* Quick amounts */
      .dep-quick-amounts{ display:flex; gap:7px; flex-wrap:wrap; }
      .dep-quick-amounts button{ padding:7px 13px; border-radius:999px; background:#1B1B1B; color:#9a9a9a;
        border:1px solid var(--line); font-size:.72rem; font-weight:700; cursor:pointer;
        transition:background-color .14s ease,color .14s ease,border-color .14s ease; }
      .dep-quick-amounts button.active{ background:var(--blue); color:#fff; border-color:var(--blue); }

      /* Buttons */
      .dep-submit{ display:flex; align-items:center; justify-content:center; gap:8px; width:100%;
        min-height:48px; border-radius:10px; font-size:.86rem; font-weight:800; color:#fff;
        background:var(--blue); cursor:pointer; margin-top:4px; border:none;
        transition:transform .16s ease,box-shadow .2s ease; }
      .dep-submit-gold{ background:linear-gradient(135deg,var(--gold-hi),#1246a8); }
      .dep-submit:hover{ transform:translateY(-2px); box-shadow:0 8px 20px rgba(30,107,255); }
      .dep-submit:disabled{ opacity:.6; cursor:default; transform:none; box-shadow:none; }
      .dep-ghost-btn{ display:inline-flex; align-items:center; gap:6px; background:transparent; color:#9a9a9a;
        border:1px solid var(--line); border-radius:8px; padding:9px 18px; font-size:.76rem; font-weight:700; cursor:pointer; }

      /* Errors / notes */
      .dep-inline-error{ display:flex; align-items:flex-start; gap:8px; margin:0; padding:10px 13px; border-radius:9px;
        background:rgba(30,107,255); color:#4d8dff; font-size:.78rem; font-weight:600; line-height:1.5; }
      .dep-inline-note{ margin:0; color:#8b8b8b; font-size:.76rem; text-align:center; }
      .dep-note{ display:flex; align-items:flex-start; gap:7px; margin:2px 0 0; color:#8b8b8b; font-size:.74rem; line-height:1.55; }
      .dep-note svg{ flex-shrink:0; margin-top:1px; }

      /* PWBT account box */
      .dep-pwbt{ display:flex; flex-direction:column; align-items:center; text-align:center; gap:8px; }
      .dep-pwbt h4{ margin:0; font:800 16px 'DM Sans',sans-serif; color:#F4F1F0; }
      .dep-account-box{ width:100%; background:#1B1B1B; border-radius:10px; border:1px solid var(--line); overflow:hidden; margin:4px 0; }
      .dep-account-row{ display:flex; align-items:center; gap:10px; padding:12px 14px; border-bottom:1px solid var(--line); font-size:.82rem; }
      .dep-account-row:last-child{ border-bottom:none; }
      .dep-account-row span{ color:#8b8b8b; font-weight:600; min-width:90px; text-align:left; }
      .dep-account-row strong{ flex:1; color:#F4F1F0; font-size:.9rem; text-align:left; font-family:monospace; letter-spacing:.04em; }
      .dep-copy-btn{ display:flex; align-items:center; padding:5px; background:rgba(95,102,115,.15); border:none; border-radius:6px; cursor:pointer; color:#9a9a9a; }

      /* Info cards */
      .dep-info-card{ display:flex; flex-direction:column; align-items:flex-start; }
      .dep-info-icon{ display:flex; align-items:center; justify-content:center; width:38px; height:38px; border-radius:10px;
        background:rgba(13,166,83,.1); color:var(--nature); margin-bottom:12px; }
      .dep-info-icon-gold{ background:rgba(255,176,32,.14); color:#FFB020; }
      .dep-info-card h3{ margin:0; font:800 16px 'DM Sans',sans-serif; letter-spacing:-.01em; color:#F4F1F0; }
      .dep-info-card p{ margin:8px 0 0; font-size:.8rem; color:#8b8b8b; line-height:1.6; }
      .dep-info-card a{ color:var(--blue); font-weight:700; }

      /* Status screen */
      .dep-status{ display:flex; flex-direction:column; align-items:center; text-align:center; gap:6px; padding:10px 4px 4px; }
      .dep-status-badge{ display:flex; align-items:center; justify-content:center; width:52px; height:52px; border-radius:50%;
        background:rgba(30,107,255); color:var(--blue); border:2px solid rgba(30,107,255); margin-bottom:6px; }
      .dep-status-badge.dep-status-wait{ background:rgba(255,176,32,.12); color:#FFB020; border-color:rgba(255,176,32,.3); }
      .dep-status-badge.dep-status-ok{ background:rgba(13,166,83,.12); color:var(--nature); border-color:rgba(13,166,83,.3); }
      .dep-status-badge.dep-status-bad{ background:rgba(30,107,255); color:var(--blue); border-color:rgba(30,107,255); }
      .dep-status h4{ margin:0; font:800 16px 'DM Sans',sans-serif; color:#F4F1F0; }
      .dep-status-sub{ margin:0; max-width:340px; color:#8b8b8b; font-size:.8rem; line-height:1.6; }
      .dep-phone-chip{ display:inline-flex; align-items:center; gap:7px; padding:8px 13px; border-radius:999px;
        background:rgba(30,107,255); color:var(--blue); font-size:.76rem; font-weight:700; margin-top:6px; }
      .dep-progress{ width:100%; max-width:220px; height:3px; border-radius:99px; background:var(--line); overflow:hidden; margin-top:14px; }
      .dep-progress span{ display:block; height:100%; width:100%; background:var(--gold-hi); transform-origin:left;
        animation-name:dep-progress-fill; animation-timing-function:linear; animation-fill-mode:forwards; }
      @keyframes dep-progress-fill{ from{ transform:scaleX(0); } to{ transform:scaleX(1); } }
      .dep-poll-count{ margin-top:8px; color:#6e6e6e; font-size:.72rem; max-width:300px; line-height:1.5; }
      .dep-timer-hint{ margin-top:6px; color:#6e6e6e; font-size:.68rem; }
      .dep-ref-hint{ margin-top:2px; color:#4a4a4a; font-size:.64rem; font-family:monospace; }

      /* ── LOG PANEL ── */
      .dep-log-panel{ border-radius:12px; border:1px solid var(--line); background:#0F0F0F; overflow:hidden; }

      .dep-log-header{ display:flex; align-items:center; justify-content:space-between; width:100%; padding:13px 16px;
        background:transparent; border:none; cursor:pointer; color:#6b7280; font:700 .78rem 'DM Sans',sans-serif;
        text-align:left; transition:background .12s ease; }
      .dep-log-header:hover{ background:#141414; }
      .dep-log-header-left{ display:flex; align-items:center; gap:8px; }
      .dep-log-count{ background:#1e1e1e; color:#6b7280; border-radius:999px; padding:1px 7px; font-size:.7rem; }
      .dep-log-badge{ border-radius:999px; padding:2px 8px; font-size:.68rem; font-weight:700; }
      .dep-log-badge-error{ background:rgba(77,141,255); color:#4d8dff; }
      .dep-log-badge-warn{  background:rgba(255,176,32,.12); color:#FFB020; }
      .dep-log-chevron{ font-size:.8rem; transition:transform .2s ease; display:inline-block; }

      .dep-log-body{ border-top:1px solid var(--line); }

      .dep-log-toolbar{ display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap;
        gap:8px; padding:10px 14px; background:#0A0A0A; border-bottom:1px solid var(--line); }
      .dep-log-filters{ display:flex; gap:5px; flex-wrap:wrap; }
      .dep-log-filter{ padding:4px 10px; border-radius:6px; background:#141414; border:1px solid var(--line);
        color:#6b7280; font:700 .68rem 'DM Sans',sans-serif; cursor:pointer; transition:all .12s ease; }
      .dep-log-filter.active{ background:rgba(88,130,255,.1); border-color:#6B8BFF; color:#6B8BFF; }
      .dep-log-action{ display:flex; align-items:center; gap:5px; padding:5px 11px; border-radius:7px; background:#1a1a1a;
        border:1px solid var(--line); color:#6b7280; font:600 .7rem 'DM Sans',sans-serif; cursor:pointer; transition:all .12s ease; }
      .dep-log-action:hover{ background:#252525; color:#9a9a9a; }

      .dep-log-entries{ max-height:340px; overflow-y:auto; display:flex; flex-direction:column; gap:1px; padding:6px; }

      .dep-log-entry{ border-left:3px solid #333; border-radius:6px; background:#141414; padding:8px 10px; }
      .dep-log-entry-head{ display:flex; align-items:center; gap:7px; flex-wrap:wrap; margin-bottom:3px; }
      .dep-log-badge-inline{ border-radius:4px; padding:1px 6px; font:700 .64rem 'DM Sans',sans-serif; }
      .dep-log-ctx{ font:700 .7rem 'DM Sans',sans-serif; color:#9a9a9a; }
      .dep-log-ref{ font-size:.64rem; font-family:monospace; color:#4a4a4a; background:#1a1a1a;
        padding:1px 5px; border-radius:3px; max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .dep-log-dur{ font-size:.64rem; color:#4a4a4a; }
      .dep-log-time{ font-size:.64rem; color:#4a4a4a; margin-left:auto; }
      .dep-log-msg{ margin:0; font-size:.74rem; color:#c0c0c0; line-height:1.5; word-break:break-word; }
      .dep-log-details{ margin-top:4px; }
      .dep-log-details summary{ font-size:.66rem; color:#555; cursor:pointer; }
      .dep-log-details pre{ margin:4px 0 0; padding:6px 8px; background:#0A0A0A; border-radius:4px;
        font-size:.64rem; color:#6b7280; overflow-x:auto; max-height:160px; overflow-y:auto; }
      .dep-log-empty{ padding:16px; text-align:center; color:#4a4a4a; font-size:.76rem; margin:0; }

      @media(max-width:560px){
        .dep-hero{ padding:22px 16px 24px; }
        .dep-hero h1{ font-size:26px; }
        .dep-body{ padding:16px 12px 40px; }
        .dep-ng-tabs button{ padding:7px 10px; font-size:.7rem; }
        .dep-log-toolbar{ flex-direction:column; align-items:flex-start; }
      }
    `}</style>
  );
}
