import { useState } from "react";
import { useLocation } from "wouter";
import { Ticket, ChevronRight, Search, ArrowLeft, Loader2, CircleCheck, CircleX, Info } from "lucide-react";
import api, { ApiError, type RedeemResponse } from "../lib/api";
import { buildMatchLabel, extractOdds, selectionState, selectionToPick } from "../lib/bookingCode";
import type { Pick } from "./Sportsbook";

// Booking code loading page — the 7up flow in PlayBet's current system
// (white, Roboto, PlayBet green): enter a code, Load fetches its selections
// from POST /api/booking/redeem, the loadable ones go into the betslip and
// the user lands on the slip. Selections the payload marks started or
// unavailable are shown, flagged, and never silently loaded; selections the
// code carried that the backend no longer returns are reported as missing.
export default function BookingCodePage({ picks, setPicks }: { picks: Pick[]; setPicks: (p: Pick[]) => void }) {
  const [, setLocation] = useLocation();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RedeemResponse | null>(null);
  const [added, setAdded] = useState(false);

  const handleLoad = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError("Please enter a booking code.");
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);
    setAdded(false);
    try {
      const data = await api.booking.redeem({ code: trimmed });
      const status = String(data.booking?.status ?? "").toUpperCase();
      if (status && status !== "ACTIVE") {
        setError(status === "EXPIRED" ? "That booking code has expired." : "That booking code is no longer active.");
        return;
      }
      const enriched = data.enrichedSelections ?? [];
      if (enriched.length === 0) {
        setError("That code has no valid selections right now.");
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Booking code not found. Please check the code and try again.");
    } finally {
      setLoading(false);
    }
  };

  const enriched = result?.enrichedSelections ?? [];
  const rows = enriched.map((sel) => ({ sel, state: selectionState(sel) }));
  const loadable = rows.filter((r) => !r.state.started && !r.state.unavailable);
  const startedCount = rows.filter((r) => r.state.started && !r.state.unavailable).length;
  const unavailableCount = rows.filter((r) => r.state.unavailable).length;
  const totalInCode = Array.isArray(result?.booking?.selections) ? result.booking.selections.length : null;
  const missingCount = totalInCode != null && totalInCode > enriched.length ? totalInCode - enriched.length : 0;
  const bookingCode = String(result?.booking?.code ?? code.trim().toUpperCase());
  const shownTotalOdds = loadable.length === enriched.length
    ? (result?.currentTotalOdds ?? Number(result?.booking?.totalOdds ?? 0) ?? loadable.reduce((a, r) => a * extractOdds(r.sel), 1))
    : loadable.reduce((a, r) => a * extractOdds(r.sel), 1);

  const handleAddToSlip = () => {
    const mapped = loadable.map((r) => selectionToPick(r.sel));
    const existingKeys = new Set(picks.map((p) => `${p.id}-${p.market}-${p.selection}`));
    const fresh = mapped.filter((p) => !existingKeys.has(`${p.id}-${p.market}-${p.selection}`));
    if (fresh.length > 0) setPicks([...picks, ...fresh]);
    setAdded(true);
    setTimeout(() => setLocation("/betslip"), 700);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleLoad();
  };

  return (
    <main className="wrap simple-page bkp-page" style={{ maxWidth: 560, margin: "0 auto", paddingTop: 24 }}>
      {/* Back button */}
      <button type="button" className="bkp-back" onClick={() => setLocation("/")}>
        <ArrowLeft size={15} /> Back to home
      </button>

      {/* Header */}
      <div className="bkp-head">
        <span className="bkp-chip-icon">
          <Ticket size={20} color="#ffffff" />
        </span>
        <div>
          <h2 className="bkp-title">Load booking code</h2>
          <p className="bkp-sub">Enter a code shared by another user to copy their bet slip.</p>
        </div>
      </div>

      {/* Input card */}
      <section className="panel bkp-card">
        <label className="bkp-label" htmlFor="bkp-input">Booking code</label>
        <div className="bkp-input-row">
          <input
            id="bkp-input"
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setResult(null); setError(""); }}
            onKeyDown={handleKeyDown}
            placeholder="e.g. RBGH12345"
            maxLength={20}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="bkp-load" onClick={handleLoad} disabled={loading}>
            {loading ? <Loader2 size={17} className="bkp-spin" /> : <><Search size={16} /> Load</>}
          </button>
        </div>

        {error && (
          <div className="bkp-error" role="alert">
            <CircleX size={15} />
            {error}
          </div>
        )}

        {/* Loaded selections preview */}
        {result && enriched.length > 0 && (
          <div className="bkp-result">
            <div className="bkp-success">
              <CircleCheck size={15} />
              Booking code {bookingCode} loaded — {enriched.length} selection{enriched.length !== 1 ? "s" : ""}
            </div>

            {missingCount > 0 && (
              <div className="bkp-note">
                <Info size={14} />
                {missingCount} of the {totalInCode} selections in this code {missingCount !== 1 ? "are" : "is"} no longer available and {missingCount !== 1 ? "were" : "was"} not loaded.
              </div>
            )}

            <div className="bkp-list">
              {rows.map(({ sel, state }, i) => {
                const blocked = state.started || state.unavailable;
                return (
                  <div key={i} className={`bkp-row${blocked ? " blocked" : ""}`}>
                    <div className="bkp-row-main">
                      <div className="bkp-row-match">{buildMatchLabel(sel)}</div>
                      <div className="bkp-row-meta">
                        {String(sel.market ?? "")} · <strong>{String(sel.selection ?? "")}</strong>
                        {state.unavailable
                          ? <span className="bkp-flag grey">Unavailable</span>
                          : state.started
                            ? <span className="bkp-flag red">Already started</span>
                            : null}
                      </div>
                    </div>
                    <span className="bkp-row-odd">{extractOdds(sel).toFixed(2)}</span>
                  </div>
                );
              })}
            </div>

            <div className="bkp-total">
              <span>Total odds{loadable.length !== enriched.length ? " (loadable selections)" : ""}</span>
              <strong>{shownTotalOdds.toFixed(2)}</strong>
            </div>

            {(startedCount > 0 || unavailableCount > 0) && (
              <p className="bkp-excluded">
                {[
                  startedCount > 0 ? `${startedCount} already started` : "",
                  unavailableCount > 0 ? `${unavailableCount} unavailable` : "",
                ].filter(Boolean).join(" · ")} — these won't be added to your slip.
              </p>
            )}

            {loadable.length > 0 ? (
              <button type="button" className="bkp-add" onClick={handleAddToSlip} disabled={added}>
                {added
                  ? <><CircleCheck size={15} /> Added — opening betslip…</>
                  : <>Add {loadable.length} selection{loadable.length !== 1 ? "s" : ""} to betslip <ChevronRight size={15} /></>}
              </button>
            ) : (
              <div className="bkp-error" role="alert">
                <CircleX size={15} />
                All selections in this code have already started or are unavailable — nothing to add.
              </div>
            )}
          </div>
        )}
      </section>

      {/* Info tip */}
      {!result && (
        <p className="bkp-tip">
          Booking codes let you instantly load a pre-built bet shared by another user.
          <br />
          You can find them shared in chats or generated from your own betslip.
        </p>
      )}

      <style>{`
        .bkp-page{ font-family:Roboto,Arial,sans-serif; }
        .bkp-back{ display:flex; align-items:center; gap:6px; background:none; border:none; color:#5b7186; font-size:13px; font-weight:600; cursor:pointer; padding:0 0 18px; font-family:inherit; }
        .bkp-head{ display:flex; align-items:center; gap:12px; margin-bottom:6px; }
        .bkp-chip-icon{ width:40px; height:40px; border-radius:10px; background:linear-gradient(135deg,#00A651,#076e37); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .bkp-title{ margin:0; font-size:20px; font-weight:800; color:#20242d; }
        .bkp-sub{ margin:2px 0 0; font-size:13px; color:#71809a; }
        .bkp-card{ margin-top:22px; padding:20px 0 0; overflow:hidden; }
        .bkp-label{ display:block; padding:0 18px; font-size:12px; font-weight:700; color:#71809a; letter-spacing:.06em; text-transform:uppercase; }
        .bkp-input-row{ display:flex; gap:8px; padding:8px 18px 18px; }
        .bkp-input-row input{ flex:1; min-width:0; padding:11px 13px; border-radius:10px; border:1px solid #dfe5ec; background:#fff; color:#20242d; font-size:15px; font-weight:700; letter-spacing:.1em; outline:none; font-family:inherit; }
        .bkp-input-row input:focus{ border-color:#00A651; box-shadow:0 0 0 3px rgba(0,166,81,.15); }
        .bkp-load{ flex-shrink:0; display:flex; align-items:center; justify-content:center; gap:7px; padding:0 20px; min-width:86px; border:0; border-radius:10px; background:#00A651; color:#fff; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit; }
        .bkp-load:disabled{ opacity:.6; cursor:not-allowed; }
        .bkp-spin{ animation:bkpSpin .8s linear infinite; }
        @keyframes bkpSpin{ to{ transform:rotate(360deg); } }
        .bkp-error{ display:flex; align-items:center; gap:8px; margin:0 18px 16px; padding:10px 13px; border-radius:10px; background:#fdecec; border:1px solid #f3c2c2; color:#c62828; font-size:13px; font-weight:600; }
        .bkp-result{ display:flex; flex-direction:column; }
        .bkp-success{ display:flex; align-items:center; gap:8px; padding:0 18px; color:#00A651; font-size:13px; font-weight:700; }
        .bkp-note{ display:flex; align-items:center; gap:8px; margin:12px 18px 0; padding:9px 12px; border-radius:10px; background:#fff6db; border:1px solid #eed88f; color:#7a5b00; font-size:12.5px; font-weight:600; }
        .bkp-list{ margin-top:14px; border-top:1px solid #eef1f4; }
        .bkp-row{ display:flex; justify-content:space-between; align-items:center; gap:8px; padding:11px 18px; border-bottom:1px solid #eef1f4; }
        .bkp-row.blocked{ opacity:.55; }
        .bkp-row-main{ min-width:0; }
        .bkp-row-match{ font-weight:700; font-size:13px; line-height:1.4; color:#20242d; }
        .bkp-row-meta{ display:flex; align-items:center; gap:7px; flex-wrap:wrap; font-size:11px; color:#71809a; margin-top:2px; }
        .bkp-row-meta strong{ color:#20242d; }
        .bkp-flag{ font-size:9px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; padding:2px 7px; border-radius:999px; }
        .bkp-flag.red{ background:#fdecec; color:#c62828; }
        .bkp-flag.grey{ background:#eef0f2; color:#6b7280; }
        .bkp-row-odd{ font-size:13px; font-weight:800; color:#0b7a43; flex-shrink:0; }
        .bkp-total{ display:flex; justify-content:space-between; align-items:center; padding:11px 18px; background:#f6fbf7; font-size:13px; color:#52647d; }
        .bkp-total strong{ color:#0b7a43; font-size:15px; }
        .bkp-excluded{ margin:12px 18px 0; font-size:12px; color:#71809a; line-height:1.5; }
        .bkp-add{ display:flex; align-items:center; justify-content:center; gap:8px; width:calc(100% - 36px); margin:14px 18px 18px; min-height:46px; border:0; border-radius:10px; background:#00A651; color:#fff; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit; }
        .bkp-add:disabled{ opacity:.65; cursor:not-allowed; }
        .bkp-result .bkp-error{ margin-top:14px; }
        .bkp-tip{ font-size:12px; color:#71809a; text-align:center; margin-top:20px; line-height:1.7; }
      `}</style>
    </main>
  );
}
