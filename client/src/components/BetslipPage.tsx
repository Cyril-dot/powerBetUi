import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle2, ChevronRight, Info, Loader2, QrCode, Radio, Trash2, WalletCards, X } from "lucide-react";
import api, { ApiError } from "@/lib/api";
import { parseKickoff } from "@/lib/sportsbook";
import { buildMatchLabel, extractOdds, selectionToPick } from "@/lib/bookingCode";
import type { Pick } from "./Sportsbook";

function formatCountdown(kickoffAt?: string): string {
  if (!kickoffAt) return "";
  const diff = parseKickoff(kickoffAt).getTime() - Date.now();
  if (Number.isNaN(diff)) return "";
  if (diff <= 0) return "Starting soon";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  const days = Math.floor(h / 24);
  if (days > 0) return `${days}d ${h % 24}h`;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const MIN_STAKE = 150;
const MAX_STAKE = 20000;
export const BET_PLACED_NOTICE_KEY = "superbet_bet_placed_notice";

function SelectionCard({ pick, onRemove }: { pick: Pick; onRemove: () => void }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (pick.isLive || !pick.kickoffAt) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [pick.isLive, pick.kickoffAt]);

  return (
    <div className="bp-card">
      {pick.league && <div className="bp-league">{pick.league}</div>}
      <div className="bp-teams">
        <span>{pick.homeTeam ?? pick.match.split(" vs ")[0]}</span>
        <span className="bp-vs">vs</span>
        <span>{pick.awayTeam ?? pick.match.split(" vs ")[1] ?? ""}</span>
      </div>
      <div className="bp-meta-row">
        {pick.isLive ? (
          <span className="bp-live"><Radio size={12} /> LIVE {pick.scoreHome != null && pick.scoreAway != null ? `· ${pick.scoreHome} - ${pick.scoreAway}` : ""}</span>
        ) : pick.kickoffAt ? (
          <span className="bp-countdown">Starts in {formatCountdown(pick.kickoffAt)}</span>
        ) : null}
      </div>
      <div className="bp-selection-row">
        <div>
          <small>Market: {pick.market}</small>
          <b>{pick.selection === "1" ? pick.homeTeam ?? "Home" : pick.selection === "2" ? pick.awayTeam ?? "Away" : pick.selection === "X" ? "Draw" : pick.selection}</b>
        </div>
        <strong>{pick.odd.toFixed(2)}</strong>
        <button className="bp-remove" onClick={onRemove} aria-label="Remove selection" type="button"><X size={14} /></button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Booking code redeem
// ---------------------------------------------------------------------------

interface RedeemResult {
  booking?: Record<string, unknown>;
  enrichedSelections?: Record<string, unknown>[];
  currentTotalOdds?: number;
}

function BookingCodePanel({ picks, onAdd }: { picks: Pick[]; onAdd: (newPicks: Pick[]) => void }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [added, setAdded] = useState(false);

  const handleLoad = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setAdded(false);
    try {
      const data = (await api.booking.redeem({ code: trimmed })) as RedeemResult;
      const selections = data?.enrichedSelections ?? [];
      if (!Array.isArray(selections) || selections.length === 0) {
        setError("That code has no valid selections right now.");
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Invalid or expired booking code.");
    } finally {
      setLoading(false);
    }
  };

  const enrichedSelections = result?.enrichedSelections ?? [];
  const bookingData = result?.booking ?? {};
  const totalOdds = result?.currentTotalOdds ?? Number(bookingData.totalOdds ?? 0);

  const handleAddToSlip = () => {
    const mapped = enrichedSelections.map(selectionToPick);
    const existingKeys = new Set(picks.map((p) => `${p.id}-${p.market}-${p.selection}`));
    const fresh = mapped.filter((p) => !existingKeys.has(`${p.id}-${p.market}-${p.selection}`));
    onAdd(fresh);
    setAdded(true);
    setTimeout(() => { setResult(null); setCode(""); setAdded(false); }, 1400);
  };

  return (
    <section className="panel simple-card bc-panel">
      <div className="module-title bc-title">
        <h3><QrCode size={15} /> Booking Code</h3>
      </div>
      <p className="bc-sub">Have a code from a friend or our socials? Load it straight into your betslip.</p>

      <div className={`bc-input-row${error ? " has-error" : ""}`}>
        <input
          type="text"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); setResult(null); }}
          onKeyDown={(e) => e.key === "Enter" && handleLoad()}
          placeholder="Enter code e.g. ABC12345"
          disabled={loading}
          className="bc-input"
        />
        <button type="button" className="bc-load-btn" onClick={handleLoad} disabled={loading || !code.trim()}>
          {loading ? <Loader2 size={14} className="bc-spin" /> : "Load"}
        </button>
      </div>

      {error && <div className="bc-error"><Info size={13} /> {error}</div>}

      {result && (
        <div className="bc-preview">
          <div className="bc-preview-head">
            <span className="bc-preview-code">{String(bookingData.code ?? code)}</span>
            <span className="bc-preview-meta">{enrichedSelections.length} selection{enrichedSelections.length !== 1 ? "s" : ""} · Odds {totalOdds.toFixed(2)}×</span>
          </div>
          <div className="bc-preview-list">
            {enrichedSelections.map((sel, i) => (
              <div className="bc-preview-row" key={i}>
                <div>
                  <small>{buildMatchLabel(sel)}</small>
                  <b>{String(sel.market ?? "")}: {String(sel.selection ?? "")}</b>
                </div>
                <span>{extractOdds(sel).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <button type="button" className="gold-button full bc-add-btn" onClick={handleAddToSlip} disabled={added}>
            {added ? <><CheckCircle2 size={14} /> Added to slip</> : `Add ${enrichedSelections.length} Selection${enrichedSelections.length !== 1 ? "s" : ""} to Slip`}
          </button>
        </div>
      )}
    </section>
  );
}

function BookingCodeStyles() {
  return (
    <style>{`
      .bc-panel{ padding:20px 22px; margin-top:14px; }
      .bc-title h3{ display:flex; align-items:center; gap:7px; }
      .bc-sub{ margin:6px 0 14px; color:#8b8b8b; font-size:.78rem; line-height:1.5; }
      .bc-input-row{ display:flex; align-items:stretch; gap:0; border:1px solid var(--line); border-radius:10px; overflow:hidden; background:#0A0A0A; transition:border-color .15s ease; }
      .bc-input-row:focus-within{ border-color:var(--gold); }
      .bc-input-row.has-error{ border-color:var(--blue); }
      .bc-input{ flex:1; min-width:0; padding:12px 14px; border:0; outline:0; background:transparent; color:#F4F1F0; font:700 13px 'DM Sans',sans-serif; letter-spacing:.08em; text-transform:uppercase; }
      .bc-input::placeholder{ text-transform:none; letter-spacing:normal; color:#8b8b8b; font-weight:500; }
      .bc-load-btn{ flex-shrink:0; padding:0 20px; background:var(--blue); color:#fff; font:800 11px 'DM Sans',sans-serif; letter-spacing:.04em; text-transform:uppercase; cursor:pointer; display:flex; align-items:center; justify-content:center; min-width:64px; transition:opacity .15s ease; }
      .bc-load-btn:disabled{ opacity:.55; cursor:not-allowed; }
      .bc-spin{ animation:bcSpin .8s linear infinite; }
      @keyframes bcSpin{ to{ transform:rotate(360deg); } }
      .bc-error{ display:flex; align-items:center; gap:6px; margin-top:9px; padding:8px 11px; border-radius:8px; background:rgba(30,107,255); border:1px solid rgba(30,107,255); color:var(--blue); font-size:.72rem; font-weight:600; }
      .bc-preview{ margin-top:14px; border:1px solid var(--line); border-radius:12px; overflow:hidden; background:#141414; }
      .bc-preview-head{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:11px 14px; border-bottom:1px solid var(--line); flex-wrap:wrap; }
      .bc-preview-code{ font:800 13px 'DM Sans',sans-serif; letter-spacing:.1em; color:var(--gold-hi); }
      .bc-preview-meta{ font-size:.7rem; color:#8b8b8b; }
      .bc-preview-list{ max-height:180px; overflow-y:auto; }
      .bc-preview-row{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:9px 14px; border-top:1px solid var(--line); }
      .bc-preview-row:first-child{ border-top:none; }
      .bc-preview-row small{ display:block; color:#8b8b8b; font-size:.68rem; }
      .bc-preview-row b{ display:block; margin-top:2px; font-size:.78rem; color:#F4F1F0; }
      .bc-preview-row span{ flex-shrink:0; font-weight:800; color:var(--gold-hi); font-size:.82rem; }
      .bc-add-btn{ margin:12px; width:calc(100% - 24px); display:flex; align-items:center; justify-content:center; gap:7px; }
      @media(max-width:960px){ .bc-panel{ margin-top:12px; } }
    `}</style>
  );
}

// ---------------------------------------------------------------------------
// Betslip page
// ---------------------------------------------------------------------------

export default function BetslipPage({
  picks, setPicks, onPlace,
}: { picks: Pick[]; setPicks: (p: Pick[]) => void; onPlace: (stake: number) => Promise<void> }) {
  const [, setLocation] = useLocation();
  const [stake, setStake] = useState("");
  const [placing, setPlacing] = useState(false);
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    api.wallet.getWallet()
      .then((w) => {
        const raw = (w as Record<string, unknown>)?.balance ?? (w as Record<string, unknown>)?.availableBalance;
        const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : null;
        if (n !== null && Number.isFinite(n)) setBalance(n);
      })
      .catch(() => undefined);
  }, []);

  const totalOdds = picks.reduce((a, p) => a * p.odd, 1);
  const stakeValue = stake === "" ? 0 : Number(stake);
  const potentialReturn = stakeValue * totalOdds;
  const stakeInvalid = stake === "" || !Number.isFinite(stakeValue) || stakeValue < MIN_STAKE || stakeValue > MAX_STAKE || (balance !== null && stakeValue > balance);

  const remove = (pick: Pick) => setPicks(picks.filter((p) => !(p.id === pick.id && p.selection === pick.selection && p.market === pick.market)));

  const addFromBookingCode = (newPicks: Pick[]) => {
    if (newPicks.length === 0) return;
    setPicks([...picks, ...newPicks]);
  };

  const place = async () => {
    setNotice(null);
    if (picks.length === 0) return;
    if (stakeInvalid) { setNotice({ type: "error", text: stake === "" ? "Enter your stake amount to continue." : balance !== null && stakeValue > balance ? "Stake exceeds your available balance." : `Stake must be between GHS ${MIN_STAKE} and GHS ${MAX_STAKE}.` }); return; }
    setPlacing(true);
    try {
      await onPlace(stakeValue);
      try { window.sessionStorage.setItem(BET_PLACED_NOTICE_KEY, JSON.stringify({ placedAt: Date.now(), text: "Bet placed successfully" })); } catch { /* storage may be unavailable */ }
      setPicks([]);
      setLocation("/open-bets");
    } catch (e) {
      setNotice({ type: "error", text: e instanceof ApiError ? e.message : "We could not place this bet. Please try again." });
    } finally {
      setPlacing(false);
    }
  };

  return (
    <main className="wrap betslip-page">
      <BookingCodeStyles />
      <div className="bp-header">
        <div>
          <span className="eyebrow">Your slip</span>
          <h1>Betslip </h1>
        </div>
        {picks.length > 0 && <button className="text-action" onClick={() => setPicks([])} type="button"><Trash2 size={13} /> Clear all</button>}
      </div>

      {picks.length === 0 ? (
        <>
          <section className="panel simple-card bp-empty">
            <WalletCards size={34} />
            <h3>No selections yet</h3>
            <p>Select odds from any match to add them to your betslip.</p>
            <Link href="/" className="gold-button">Browse Sports <ChevronRight size={15} /></Link>
          </section>
          <BookingCodePanel picks={picks} onAdd={addFromBookingCode} />
        </>
      ) : (
        <div className="bp-grid">
          <div className="bp-list">
            {picks.map((p) => <SelectionCard key={`${p.id}-${p.selection}-${p.market}`} pick={p} onRemove={() => remove(p)} />)}
            <BookingCodePanel picks={picks} onAdd={addFromBookingCode} />
          </div>

          <aside className="panel bp-summary">
            
            <div className="bp-summary-row"><span>Total odds</span><b>{totalOdds.toFixed(2)}</b></div>
            <label className="bp-stake-field">
              <span>Stake (GHS)</span>
              <input type="number" min={MIN_STAKE} max={MAX_STAKE} value={stake} placeholder="Enter amount" onChange={(e) => setStake(e.target.value)} />
            </label>
            <div className="bp-stake-hint">Min GHS {MIN_STAKE} · Max GHS {MAX_STAKE}{balance !== null && ` · Balance GHS ${balance.toFixed(2)}`}</div>
            <div className="bp-summary-row highlight"><span>Potential return</span><b>GHS {potentialReturn.toFixed(2)}</b></div>
            <button className="gold-button full" onClick={place} disabled={placing || stakeInvalid}>{placing ? "Placing…" : "Place Bet"}</button>
            {notice && <small className={notice.type === "error" ? "auth-notice" : "auth-notice bp-success"}>{notice.text}</small>}
          </aside>
        </div>
      )}
    </main>
  );
}
