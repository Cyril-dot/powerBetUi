import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { Pick } from "./Sportsbook";

// ---------------------------------------------------------------------------
// BookingCodeReceipt — the post-stake receipt for ADMIN / SUPER_ADMIN users
// (owner, 2026-10-29), laid out like the SportyBet / KingzBet booking-code
// cards the owner supplied: big Booking Code on top, an Odds panel, an
// Example Bet panel (Stake / Payout), then the Selections list.
//
// HONESTY RULES baked in here, do not work around them:
// - The code is minted for real from the just-placed slip via
//   POST /api/admin/booking-codes (see BetslipPage). It is never invented.
// - There is NO Max Bonus / Bonus row: PlayBet has no bonus engine
//   anywhere in the frontend or the bet-placement backend, so any bonus
//   figure here would be invented money. If the owner ever names a real
//   bonus rule, add the row then, from that rule — not before.
// - Payout is exactly stake x total odds (the bet's potential return).
// ---------------------------------------------------------------------------

export function receiptSelectionLabel(pick: Pick): string {
  if (pick.selection === "1") return pick.homeTeam ?? "Home";
  if (pick.selection === "2") return pick.awayTeam ?? "Away";
  if (pick.selection === "X") return "Draw";
  return pick.selection;
}

interface BookingCodeReceiptProps {
  code: string | null;
  codeState: "ready" | "generating" | "failed";
  stake: number;
  totalOdds: number;
  picks: Pick[];
}

export default function BookingCodeReceipt({ code, codeState, stake, totalOdds, picks }: BookingCodeReceiptProps) {
  const [copied, setCopied] = useState(false);
  const payout = stake * totalOdds;

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const el = document.createElement("textarea");
      el.value = code;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="bcr-receipt">
      <div className="bcr-code-block">
        <span className="bcr-code-label">Booking Code</span>
        {codeState === "generating" ? (
          <span className="bcr-code-pending">Generating code…</span>
        ) : codeState === "failed" || !code ? (
          <span className="bcr-code-missing">Code unavailable — your bet still went through.</span>
        ) : (
          <div className="bcr-code-row">
            <strong className="bcr-code">{code}</strong>
            <button type="button" className="bcr-copy" onClick={copy}>
              {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
            </button>
          </div>
        )}
      </div>

      <div className="bcr-odds-panel">
        <div><span>Odds</span><b>{totalOdds.toFixed(2)}</b></div>
      </div>

      <div className="bcr-section-title">Example Bet</div>
      <div className="bcr-example">
        <div><span>Stake</span><b>{stake.toFixed(2)}</b></div>
        <div><span>Payout</span><b>{payout.toFixed(2)}</b></div>
      </div>

      <div className="bcr-section-title">Selections</div>
      <div className="bcr-selections">
        {picks.map((p, i) => (
          <div className="bcr-sel" key={`${p.id}-${p.market}-${p.selection}-${i}`}>
            <div>
              <b>{receiptSelectionLabel(p)}</b>
              <small>{p.match}</small>
            </div>
            <strong>{p.odd.toFixed(2)}</strong>
          </div>
        ))}
      </div>

      {code && <p className="bcr-foot">Share this code — it loads this exact slip from the Booking Code page.</p>}

      <style>{`
        .bcr-receipt{ text-align:left; font-family:Roboto,Arial,sans-serif; }
        .bcr-code-block{ padding:6px 2px 14px; }
        .bcr-code-label{ display:block; font-size:.78rem; font-weight:700; color:rgba(255,255,255,.65); letter-spacing:.02em; }
        .bcr-code-row{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:2px; }
        .bcr-code{ font-size:1.9rem; font-weight:900; letter-spacing:.04em; color:#00E85F; line-height:1.15; overflow-wrap:anywhere; }
        .bcr-code-pending{ display:block; margin-top:6px; font-size:.9rem; font-weight:700; color:rgba(255,255,255,.65); }
        .bcr-code-missing{ display:block; margin-top:6px; font-size:.82rem; font-weight:700; color:#FFCF6B; line-height:1.45; }
        .bcr-copy{ flex-shrink:0; display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:999px; border:1px solid rgba(0,232,95,.5); background:transparent; color:#00E85F; font-size:.74rem; font-weight:800; cursor:pointer; }
        .bcr-odds-panel{ background:#12284E; border:1px solid rgba(255,255,255,.12); border-radius:10px; padding:12px 14px; }
        .bcr-odds-panel div{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .bcr-odds-panel span{ font-size:.82rem; color:rgba(255,255,255,.7); }
        .bcr-odds-panel b{ font-size:1.05rem; color:#fff; }
        .bcr-section-title{ margin:14px 0 0; padding:8px 12px; background:rgba(0,166,81,.16); border:1px solid rgba(0,166,81,.3); border-bottom:0; border-radius:10px 10px 0 0; font-size:.78rem; font-weight:800; color:#7BDCA8; }
        .bcr-example{ border:1px solid rgba(255,255,255,.12); border-top:0; border-radius:0 0 10px 10px; padding:4px 12px 10px; }
        .bcr-example div{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 0; border-top:1px solid rgba(255,255,255,.08); }
        .bcr-example div:first-child{ border-top:0; }
        .bcr-example span{ font-size:.82rem; color:rgba(255,255,255,.7); }
        .bcr-example b{ font-size:.92rem; color:#fff; }
        .bcr-selections{ border:1px solid rgba(255,255,255,.12); border-top:0; border-radius:0 0 10px 10px; max-height:260px; overflow-y:auto; }
        .bcr-sel{ display:flex; align-items:flex-start; justify-content:space-between; gap:10px; padding:11px 12px; border-top:1px solid rgba(255,255,255,.08); }
        .bcr-sel:first-child{ border-top:0; }
        .bcr-sel b{ display:block; font-size:.86rem; color:#fff; }
        .bcr-sel small{ display:block; margin-top:2px; font-size:.74rem; color:rgba(255,255,255,.6); line-height:1.4; }
        .bcr-sel > strong{ flex-shrink:0; font-size:.9rem; color:#00E85F; }
        .bcr-foot{ margin:12px 2px 0; font-size:.72rem; color:rgba(255,255,255,.55); line-height:1.5; }
      `}</style>
    </div>
  );
}
