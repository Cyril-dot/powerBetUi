import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, CheckCircle2, ChevronRight, Clock3, Copy, Loader2, ShieldCheck, Smartphone, WalletCards, XCircle, Zap } from "lucide-react";
import api, { ApiError, type WebRabbitNetwork, type WebRabbitTransaction } from "@/lib/api";

const MIN_GHS = 50;
const QUICK_AMOUNTS = [50, 100, 250, 500, 1000];
const NETWORKS: Array<{ value: WebRabbitNetwork; label: string; hint: string }> = [
  { value: "MTN", label: "MTN Mobile Money", hint: "024, 025, 053, 054, 055, 059" },
  { value: "TELECEL", label: "Telecel Cash", hint: "020, 050" },
  { value: "AT", label: "AirtelTigo Money", hint: "026, 027, 056, 057" },
  { value: "GMONEY", label: "G-Money", hint: "Use your registered G-Money number" },
];
const SUCCESS = new Set(["approved", "successful", "succeeded", "success", "completed", "confirmed", "settled"]);
const FAILURE = new Set(["failed", "declined", "cancelled", "canceled", "expired", "reversed", "rejected", "error"]);
const POLL_MS = [3000, 5000, 8000, 12000, 15000];
type Status = "idle" | "pending" | "success" | "failed";

function transactionId(tx: WebRabbitTransaction) { return String(tx.transaction_id ?? tx.transactionId ?? tx.id ?? ""); }
function statusOf(tx: WebRabbitTransaction) { return String(tx.reason_code ?? tx.reasonCode ?? tx.status ?? "pending").toLowerCase(); }
function maskPhone(value: string) { const digits = value.replace(/\D/g, ""); return digits.length < 5 ? "••••" : `${digits.slice(0, 3)}••••${digits.slice(-2)}`; }
function normalizePhone(value: string) { const compact = value.replace(/[\s-]/g, ""); if (compact.startsWith("+233")) return `0${compact.slice(4)}`; if (compact.startsWith("233") && compact.length === 12) return `0${compact.slice(3)}`; return compact; }

export default function DepositCenter() {
  const [amount, setAmount] = useState("100");
  const [phone, setPhone] = useState("");
  const [network, setNetwork] = useState<WebRabbitNetwork>("MTN");
  const [status, setStatus] = useState<Status>("idle");
  const [transaction, setTransaction] = useState<WebRabbitTransaction | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = transaction ? transactionId(transaction) : "";

  const verify = useCallback(async () => {
    if (!id) return;
    try {
      const result = await api.deposits.webRabbitMomoVerify(id);
      setTransaction(result);
      const providerStatus = statusOf(result);
      setMessage(result.message ?? "");
      if (SUCCESS.has(providerStatus)) setStatus("success");
      else if (FAILURE.has(providerStatus)) setStatus("failed");
      else setStatus("pending");
      setPollCount((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "We could not check the payment yet. We will keep trying.");
    }
  }, [id]);

  useEffect(() => {
    if (status !== "pending" || !id) return;
    let cancelled = false;
    let attempt = 0;
    const tick = async () => {
      if (cancelled) return;
      await verify();
      if (cancelled) return;
      timer.current = setTimeout(tick, POLL_MS[Math.min(attempt++, POLL_MS.length - 1)]);
    };
    void tick();
    return () => { cancelled = true; if (timer.current) clearTimeout(timer.current); };
  }, [status, id, verify]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError("");
    const value = Number(amount); const normalizedPhone = normalizePhone(phone);
    if (!Number.isFinite(value) || value < MIN_GHS) { setError(`Enter at least GHS ${MIN_GHS.toFixed(2)}.`); return; }
    if (!/^0\d{9}$/.test(normalizedPhone)) { setError("Enter a valid Ghana number, for example 024 123 4567."); return; }
    setLoading(true);
    try {
      const result = await api.deposits.webRabbitMomoInit({ amount: value, phone: normalizedPhone, network });
      if (!transactionId(result)) throw new Error("The payment provider did not return a transaction reference.");
      setTransaction(result); setMessage(result.message ?? "Approve the payment prompt on your phone. Your wallet will update automatically."); setStatus("pending"); setPollCount(0);
    } catch (err) { setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Could not start the deposit. Please try again."); }
    finally { setLoading(false); }
  };
  const reset = () => { if (timer.current) clearTimeout(timer.current); setStatus("idle"); setTransaction(null); setMessage(""); setError(""); setPollCount(0); };
  const copyReference = () => { if (!id) return; navigator.clipboard.writeText(id).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }).catch(() => undefined); };
  const selectedNetwork = NETWORKS.find((item) => item.value === network)!;

  return <main className="deposit-page">
    <section className="deposit-hero"><div className="deposit-hero-icon"><WalletCards size={24} /></div><div><span className="deposit-eyebrow">SECURE WALLET FUNDING</span><h1>Deposit with Mobile Money</h1><p>Ghana only · fast, private, and confirmed automatically.</p></div><div className="deposit-hero-trust"><ShieldCheck size={16} /> PIN stays on your phone</div></section>
    <div className="deposit-shell"><div className="deposit-rail"><span className="deposit-rail-dot" /><span>Web Rabbit Mobile Money</span><span className="deposit-rail-live">ONLINE</span></div>
      {status === "idle" ? <form className="deposit-panel" onSubmit={submit}>
        <div className="deposit-panel-heading"><div><h2>Choose your network</h2><p>We will send an approval prompt to your Ghanaian number.</p></div><Smartphone size={22} /></div>
        <div className="deposit-network-grid">{NETWORKS.map((item) => <button type="button" key={item.value} className={`deposit-network ${network === item.value ? "selected" : ""}`} onClick={() => setNetwork(item.value)}><span className="deposit-network-mark">{item.value === "MTN" ? "M" : item.value === "AT" ? "A" : item.value === "TELECEL" ? "T" : "G"}</span><span><strong>{item.label}</strong><small>{item.hint}</small></span>{network === item.value && <Check size={16} />}</button>)}</div>
        {error && <div className="deposit-error"><AlertCircle size={15} />{error}</div>}
        <label className="deposit-field"><span>Mobile Money number</span><input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" placeholder="024 123 4567" /></label>
        <div className="deposit-field"><span>Amount in Ghana cedis</span><div className="deposit-amount-wrap"><b>GHS</b><input value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" type="text" placeholder="100.00" /></div></div>
        <div className="deposit-quick-row">{QUICK_AMOUNTS.map((value) => <button type="button" key={value} className={amount === String(value) ? "selected" : ""} onClick={() => setAmount(String(value))}>GHS {value}</button>)}</div>
        <button className="deposit-submit" type="submit" disabled={loading}>{loading ? <><Loader2 size={17} className="deposit-spin" />Sending secure prompt…</> : <>Send payment prompt <ChevronRight size={17} /></>}</button><p className="deposit-footnote"><ShieldCheck size={14} />You approve the charge with your own Mobile Money PIN. We never see or store it.</p>
      </form> : <section className={`deposit-panel deposit-status-panel ${status}`}>
        <div className="deposit-status-icon">{status === "pending" ? <Loader2 className="deposit-spin" size={28} /> : status === "success" ? <CheckCircle2 size={30} /> : <XCircle size={30} />}</div><span className="deposit-status-label">{status === "pending" ? "PAYMENT IN PROGRESS" : status === "success" ? "PAYMENT CONFIRMED" : "PAYMENT NOT COMPLETED"}</span><h2>{status === "pending" ? "Approve the prompt on your phone" : status === "success" ? "Your wallet is funded" : "The payment was not completed"}</h2><p className="deposit-status-copy">{status === "pending" ? (message || `A prompt was sent to ${maskPhone(phone)} on ${selectedNetwork.label}.`) : status === "success" ? "Your deposit has been verified and credited to your wallet." : (message || "No funds were credited. Check your number and try again.")}</p>
        {status === "pending" && <div className="deposit-progress"><span /><small><Clock3 size={13} /> Checking automatically · {pollCount} check{pollCount === 1 ? "" : "s"}</small></div>}
        {id && <div className="deposit-reference"><span>Transaction reference</span><strong>{id}</strong><button type="button" onClick={copyReference}>{copied ? <><Check size={14} />Copied</> : <><Copy size={14} />Copy</>}</button></div>}
        {status !== "success" && <p className="deposit-background-note"><Zap size={14} />You can leave this page. The server webhook verifies successful payments in the background.</p>}<button className="deposit-secondary" type="button" onClick={reset}>{status === "failed" ? "Try again" : "Make another deposit"}</button>
      </section>}
      <section className="deposit-safety-grid"><div><ShieldCheck size={18} /><div><strong>Verified automatically</strong><p>Web Rabbit confirms the transaction before your balance changes.</p></div></div><div><Zap size={18} /><div><strong>No waiting on support</strong><p>Webhook verification runs in the background, even if you close this page.</p></div></div></section><p className="deposit-help">Need help with a deposit? <a href="/support">Contact the Support Centre</a> and include your transaction reference.</p>
    </div>
    <style>{`.deposit-page{min-height:70vh;background:#0a0a0a;color:#f4f1f0;padding-bottom:56px}.deposit-hero{position:relative;overflow:hidden;display:flex;align-items:center;gap:16px;padding:28px max(22px,calc((100% - 900px)/2));background:linear-gradient(118deg,#ffd84d,#1e6bff 78%,#0b2e70);color:#10172e}.deposit-hero:after{content:"";position:absolute;width:260px;height:260px;border:1px solid rgba(255,255,255,.3);border-radius:50%;right:-80px;top:-100px}.deposit-hero-icon{display:grid;place-items:center;width:50px;height:50px;border-radius:15px;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.35)}.deposit-eyebrow{font-size:10px;font-weight:900;letter-spacing:.14em}.deposit-hero h1{margin:5px 0 4px;font-size:clamp(25px,4vw,36px);letter-spacing:-.04em}.deposit-hero p{margin:0;font-size:13px;color:rgba(16,23,46,.75)}.deposit-hero-trust{position:relative;z-index:1;margin-left:auto;display:flex;align-items:center;gap:6px;padding:9px 12px;border-radius:999px;background:rgba(255,255,255,.18);font-size:10px;font-weight:800}.deposit-shell{width:min(720px,calc(100% - 32px));margin:24px auto 0}.deposit-rail{display:flex;align-items:center;gap:8px;margin:0 2px 10px;color:#9a9a9a;font-size:11px;font-weight:800}.deposit-rail-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.12)}.deposit-rail-live{margin-left:auto;color:#22c55e;font-size:9px;letter-spacing:.1em}.deposit-panel{background:#151515;border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:24px;box-shadow:0 14px 40px rgba(0,0,0,.25)}.deposit-panel-heading{display:flex;justify-content:space-between;gap:12px;margin-bottom:18px}.deposit-panel-heading h2{margin:0;font-size:18px}.deposit-panel-heading p{margin:5px 0 0;color:#969696;font-size:12px}.deposit-panel-heading>svg{color:#ffd84d}.deposit-network-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.deposit-network{display:flex;align-items:center;gap:10px;text-align:left;padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:#1d1d1d;color:#d8d8d8;cursor:pointer;transition:.18s}.deposit-network:hover,.deposit-network.selected{border-color:#ffd84d;background:rgba(255,216,77,.08)}.deposit-network>svg{margin-left:auto;color:#ffd84d}.deposit-network-mark{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:#242424;color:#ffd84d;font-weight:900}.deposit-network strong,.deposit-network small{display:block}.deposit-network strong{font-size:11px}.deposit-network small{margin-top:3px;color:#888;font-size:9px}.deposit-error{display:flex;align-items:flex-start;gap:7px;padding:10px 11px;margin-top:14px;border-radius:10px;background:rgba(239,68,68,.1);color:#ff9a9a;font-size:11px;line-height:1.5}.deposit-field{display:block;margin-top:16px;color:#9f9f9f;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.deposit-field input{display:block;width:100%;box-sizing:border-box;margin-top:7px;padding:13px 14px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:#1d1d1d;color:#fff;font:600 14px 'DM Sans',sans-serif;outline:none}.deposit-field input:focus{border-color:#ffd84d;box-shadow:0 0 0 3px rgba(255,216,77,.1)}.deposit-amount-wrap{display:flex;align-items:center;margin-top:7px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:#1d1d1d}.deposit-amount-wrap:focus-within{border-color:#ffd84d}.deposit-amount-wrap b{padding-left:14px;color:#ffd84d;font-size:12px}.deposit-amount-wrap input{margin:0;border:0;background:transparent}.deposit-quick-row{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.deposit-quick-row button{padding:7px 10px;border:1px solid rgba(255,255,255,.1);border-radius:999px;background:#202020;color:#aaa;font-size:10px;font-weight:800;cursor:pointer}.deposit-quick-row button.selected{background:#ffd84d;border-color:#ffd84d;color:#121212}.deposit-submit,.deposit-secondary{display:flex;justify-content:center;align-items:center;gap:7px;width:100%;margin-top:20px;padding:13px 16px;border:0;border-radius:10px;background:#ffd84d;color:#171717;font:900 12px 'DM Sans',sans-serif;cursor:pointer;transition:.18s}.deposit-submit:hover{background:#ffe783;transform:translateY(-1px)}.deposit-submit:disabled{opacity:.65;cursor:wait;transform:none}.deposit-footnote,.deposit-background-note{display:flex;align-items:flex-start;gap:7px;margin:13px 0 0;color:#888;font-size:10px;line-height:1.6}.deposit-footnote svg,.deposit-background-note svg{flex:none;color:#22c55e}.deposit-status-panel{text-align:center;padding:36px 24px}.deposit-status-icon{display:grid;place-items:center;width:62px;height:62px;margin:0 auto 13px;border-radius:20px;background:rgba(255,216,77,.1);color:#ffd84d}.deposit-status-panel.success .deposit-status-icon{background:rgba(34,197,94,.12);color:#4ade80}.deposit-status-panel.failed .deposit-status-icon{background:rgba(239,68,68,.12);color:#fb7185}.deposit-status-label{font-size:9px;font-weight:900;letter-spacing:.14em;color:#ffd84d}.deposit-status-panel.success .deposit-status-label{color:#4ade80}.deposit-status-panel.failed .deposit-status-label{color:#fb7185}.deposit-status-panel h2{margin:8px 0 7px;font-size:20px}.deposit-status-copy{max-width:460px;margin:0 auto;color:#aaa;font-size:12px;line-height:1.7}.deposit-progress{max-width:390px;margin:22px auto 0}.deposit-progress>span{display:block;height:5px;overflow:hidden;border-radius:999px;background:linear-gradient(90deg,#ffd84d,#1e6bff,#ffd84d);background-size:200% 100%;animation:deposit-flow 1.5s linear infinite}.deposit-progress small{display:flex;justify-content:center;align-items:center;gap:5px;margin-top:9px;color:#858585;font-size:10px}.deposit-reference{display:grid;grid-template-columns:1fr auto;gap:6px 10px;max-width:470px;margin:22px auto 0;padding:12px;text-align:left;border:1px solid rgba(255,255,255,.09);border-radius:10px;background:#1c1c1c}.deposit-reference span{grid-column:1/-1;color:#777;font-size:9px;text-transform:uppercase;letter-spacing:.08em}.deposit-reference strong{overflow:hidden;text-overflow:ellipsis;color:#ddd;font-size:11px}.deposit-reference button{display:flex;align-items:center;gap:4px;border:0;background:transparent;color:#ffd84d;font-size:10px;font-weight:800;cursor:pointer}.deposit-secondary{max-width:260px;margin:22px auto 0;background:#242424;color:#ddd;border:1px solid rgba(255,255,255,.12)}.deposit-safety-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.deposit-safety-grid>div{display:flex;gap:10px;padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:#141414}.deposit-safety-grid svg{flex:none;color:#ffd84d}.deposit-safety-grid strong{font-size:11px}.deposit-safety-grid p{margin:5px 0 0;color:#828282;font-size:10px;line-height:1.5}.deposit-help{text-align:center;margin:18px 0 0;color:#777;font-size:11px}.deposit-help a{color:#ffd84d;font-weight:800}.deposit-spin{animation:deposit-spin .8s linear infinite}@keyframes deposit-spin{to{transform:rotate(360deg)}}@keyframes deposit-flow{to{background-position:-200% 0}}@media(max-width:600px){.deposit-hero{align-items:flex-start;padding:22px 16px}.deposit-hero-trust{display:none}.deposit-shell{width:calc(100% - 22px);margin-top:17px}.deposit-panel{padding:18px}.deposit-network-grid,.deposit-safety-grid{grid-template-columns:1fr}.deposit-hero h1{font-size:26px}}`}</style>
  </main>;
}
