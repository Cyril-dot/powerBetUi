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

      <style>{`
        .bcr-receipt{ text-align:left; font-family:Roboto,Arial,sans-serif; }
        .bcr-code-block{ padding:6px 2px 10px; }
        .bcr-code-label{ display:block; font-size:.78rem; font-weight:700; color:#71809a; letter-spacing:.02em; }
        .bcr-code-row{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:2px; }
        .bcr-code{ font-size:2rem; font-weight:900; letter-spacing:.04em; color:#00A651; line-height:1.15; overflow-wrap:anywhere; }
        .bcr-code-pending{ display:block; margin-top:6px; font-size:.9rem; font-weight:700; color:#71809a; }
        .bcr-code-missing{ display:block; margin-top:6px; font-size:.82rem; font-weight:700; color:#7a5b00; line-height:1.45; }
        .bcr-copy{ flex-shrink:0; display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:999px; border:1px solid rgba(0,166,81,.5); background:transparent; color:#00A651; font-size:.74rem; font-weight:800; cursor:pointer; }
        .bcr-odds-panel{ background:#F5F8F7; border:1px solid #e3e3ef; border-radius:10px; padding:12px 14px; }
        .bcr-odds-panel div{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .bcr-odds-panel span{ font-size:.82rem; color:#71809a; }
        .bcr-odds-panel b{ font-size:1.05rem; color:#20242d; }
        .bcr-section-title{ margin:10px 0 0; padding:8px 12px; background:#E1F3E7; border:1px solid #bfe3cd; border-bottom:0; border-radius:10px 10px 0 0; font-size:.78rem; font-weight:800; color:#0B7A43; }
        .bcr-example{ border:1px solid #e3e3ef; border-top:0; border-radius:0 0 10px 10px; padding:4px 12px 10px; }
        .bcr-example div{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 0; border-top:1px solid #eef1f4; }
        .bcr-example div:first-child{ border-top:0; }
        .bcr-example span{ font-size:.82rem; color:#71809a; }
        .bcr-example b{ font-size:.92rem; color:#20242d; }
        .bcr-selections{ border:1px solid #e3e3ef; border-top:0; border-radius:0 0 10px 10px; max-height:260px; overflow-y:auto; }
        .bcr-sel{ display:flex; align-items:flex-start; justify-content:space-between; gap:10px; padding:9px 12px; border-top:1px solid #eef1f4; }
        .bcr-sel:first-child{ border-top:0; }
        .bcr-sel b{ display:block; font-size:.86rem; color:#20242d; }
        .bcr-sel small{ display:block; margin-top:2px; font-size:.74rem; color:#71809a; line-height:1.4; }
        .bcr-sel > strong{ flex-shrink:0; font-size:.9rem; color:#00A651; }
        /* Bottom-sheet receipt (owner, 2026-10-29): NOT a full-screen
           sheet — a compact card pushed to the bottom, about a third of
           the screen height, full width. Nothing else is covered: the
           slip page stays visible above it. */
        .pb-receipt-overlay{ position:fixed; left:0; right:0; bottom:0; z-index:200; }
        .pb-receipt-sheet{ background:#ffffff; border-radius:18px 18px 0 0; padding:12px 14px 22px; box-shadow:0 -8px 30px rgba(0,0,0,.45); max-height:72vh; overflow-y:auto; }
        /* Brand row on top of the card (owner, 2026-10-29): like
           SportyBet's own card — the PlayBet logo text label sits on top,
           same site logo the header uses, X kept on the right. */
        .pb-receipt-top{ display:flex; align-items:center; justify-content:space-between; margin:-12px -14px 10px; padding:10px 14px; background:linear-gradient(165deg,#10234A 0%,#0A1B3D 100%); border-radius:18px 18px 0 0; }
        .pb-receipt-brand{ height:30px; width:auto; display:block; }
        .pb-receipt-close{ display:flex; margin:0; background:transparent; border:0; color:#fff; cursor:pointer; padding:8px; }
      `}</style>
    </div>
  );
}
