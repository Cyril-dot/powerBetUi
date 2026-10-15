import { useEffect, useState } from "react";
import { Banknote, CheckCircle2, Loader2, X } from "lucide-react";
import api, { ApiError, type Bet } from "@/lib/api";

/**
 * CashoutPanel — real cashout flow against futballBackend.
 * Fetches a live offer via GET /api/bets/{id}/cashout/preview, then settles
 * via POST /api/bets/{id}/cashout/full or /partial?pct=N.
 */
export default function CashoutPanel({ bet, onDone, onClose }: {
  bet: Bet;
  onDone: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [pct, setPct] = useState(50);
  const [offer, setOffer] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<number | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const p = await api.bets.cashoutPreview(bet.id, 100);
        if (!dead) setOffer(Number(p.amount) || 0);
      } catch (e) {
        if (!dead) setError(e instanceof ApiError ? e.message : "Could not fetch cashout offer.");
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => { dead = true; };
  }, [bet.id]);

  const payout = offer == null ? null : mode === "full" ? offer : Math.round(offer * pct) / 100;

  const confirm = async () => {
    if (busy || payout == null) return;
    setBusy(true);
    setError("");
    try {
      const updated = mode === "full"
        ? await api.bets.cashoutFull(bet.id)
        : await api.bets.cashoutPartial(bet.id, pct);
      const credited = Number((updated as { payout?: unknown })?.payout ?? payout);
      setDone(Number.isFinite(credited) ? credited : payout);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Cashout failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const cur = bet.currency === "NGN" ? "₦" : "GH₵";

  return (
    <div className="co-panel" onClick={(e) => e.stopPropagation()}>
      <style>{`
        .co-panel{ margin-top:10px; border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:12px; background:rgba(0,0,0,.25); }
        .co-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .co-head b{ font-size:.82rem; }
        .co-x{ background:none; border:none; color:#9aa3b2; cursor:pointer; padding:4px; }
        .co-offer{ display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
        .co-offer small{ display:block; color:#9aa3b2; font-size:.68rem; }
        .co-offer strong{ font-size:1.25rem; color:#22c55e; }
        .co-toggle{ display:flex; border:1px solid rgba(255,255,255,.14); border-radius:8px; overflow:hidden; }
        .co-toggle button{ background:none; border:none; color:#9aa3b2; font-size:.72rem; font-weight:700; padding:7px 12px; cursor:pointer; }
        .co-toggle button.on{ background:#1e6bff; color:#fff; }
        .co-slider{ display:flex; align-items:center; gap:10px; margin:10px 0; }
        .co-slider input{ flex:1; accent-color:#1e6bff; }
        .co-slider b{ font-size:.8rem; min-width:38px; text-align:right; }
        .co-confirm{ width:100%; padding:12px; border:none; border-radius:10px; background:#16a34a; color:#fff; font-size:.85rem; font-weight:800; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; }
        .co-confirm:disabled{ opacity:.55; cursor:not-allowed; }
        .co-error{ color:#f87171; font-size:.72rem; margin:8px 0 0; }
        .co-done{ text-align:center; padding:8px 0; }
        .co-done strong{ display:block; font-size:1.3rem; color:#22c55e; margin:6px 0; }
        .co-done p{ color:#9aa3b2; font-size:.75rem; margin:0 0 10px; }
        .co-done button{ padding:10px 22px; border:none; border-radius:10px; background:#1e6bff; color:#fff; font-weight:800; font-size:.8rem; cursor:pointer; }
        .op-spin{ animation:opspin 1s linear infinite; }
        @keyframes opspin{ to{ transform:rotate(360deg); } }
      `}</style>

      {done != null ? (
        <div className="co-done">
          <CheckCircle2 size={34} color="#22c55e" />
          <strong>{cur}{done.toFixed(2)}</strong>
          <p>Cashout successful. The amount has been credited to your wallet.</p>
          <button type="button" onClick={onDone}>Done</button>
        </div>
      ) : (
        <>
          <div className="co-head">
            <b>Cash out</b>
            <button type="button" className="co-x" onClick={onClose} aria-label="Close cashout">
              <X size={16} />
            </button>
          </div>
          {loading ? (
            <p style={{ color: "#9aa3b2", fontSize: ".78rem", display: "flex", alignItems: "center", gap: 8 }}>
              <Loader2 size={15} className="op-spin" /> Fetching your offer…
            </p>
          ) : offer != null ? (
            <>
              <div className="co-offer">
                <div>
                  <small>You get</small>
                  <strong>{cur}{Number(payout).toFixed(2)}</strong>
                </div>
                <div className="co-toggle" role="group" aria-label="Cashout type">
                  <button type="button" className={mode === "full" ? "on" : ""} onClick={() => setMode("full")}>Full</button>
                  <button type="button" className={mode === "partial" ? "on" : ""} onClick={() => setMode("partial")}>Partial</button>
                </div>
              </div>
              {mode === "partial" && (
                <div className="co-slider">
                  <input type="range" min={10} max={90} step={5} value={pct}
                    onChange={(e) => setPct(Number(e.target.value))} aria-label="Cashout percentage" />
                  <b>{pct}%</b>
                </div>
              )}
              <button type="button" className="co-confirm" disabled={busy} onClick={confirm}>
                {busy ? <><Loader2 size={15} className="op-spin" /> Processing…</>
                  : <><Banknote size={15} /> Cash out {cur}{Number(payout).toFixed(2)}</>}
              </button>
            </>
          ) : null}
          {error && <p className="co-error" role="alert">{error}</p>}
        </>
      )}
    </div>
  );
}
