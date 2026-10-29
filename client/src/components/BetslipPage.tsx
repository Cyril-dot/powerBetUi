import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle2, ChevronRight, Info, Loader2, QrCode, Radio, Trash2, WalletCards, X } from "lucide-react";
import api, { ApiError } from "@/lib/api";
import { parseKickoff } from "@/lib/sportsbook";
import { buildMatchLabel, extractOdds, selectionState, selectionToPick } from "@/lib/bookingCode";
import type { Pick } from "./Sportsbook";
import { useSession } from "../lib/session";
import { resolveIsAdmin } from "./WalletCenter";
import BookingCodeReceipt from "./BookingCodeReceipt";

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

const MIN_STAKE = 200;
const MAX_STAKE = 20000;

// ---------------------------------------------------------------------------
// Admin receipt code (owner, 2026-10-29): after an admin/super-admin places
// a bet, mint a REAL shareable booking code for that exact slip via the same
// admin endpoint the Admin Panel already uses. Body shape mirrors
// AdminPanelPage's booking-code creation. Returns null on any failure —
// minting must never fail the bet itself.
// ---------------------------------------------------------------------------
async function mintReceiptCode(picks: Pick[], stake: number): Promise<string | null> {
  try {
    const selections = picks.map((p) => {
      const row: Record<string, unknown> = { fixture_id: p.id, match: p.match, market: p.market, odds: p.odd, result: null, pick: p.selection };
      if (p.market === "CORRECT_SCORE") {
        const m = /^(\d+)-(\d+)$/.exec(p.selection);
        if (m) { row.home_goals = Number(m[1]); row.away_goals = Number(m[2]); }
      }
      return row;
    });
    const result = await api.adminBooking.createBookingCode({
      kind: picks.length === 1 ? picks[0].market : "MULTIPLE",
      label: "Placed bet booking code",
      stake, currency: "GHS", selections,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }) as Record<string, unknown> | null;
    const raw = result?.code ?? result?.bookingCode ?? result?.value;
    const codeValue = typeof raw === "string" ? raw.trim() : "";
    return codeValue || null;
  } catch { return null; }
}
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
  booking?: Record<string, unknown> & { selections?: unknown[] };
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
      const status = String(data?.booking?.status ?? "").toUpperCase();
      if (status && status !== "ACTIVE") {
        setError(status === "EXPIRED" ? "That booking code has expired." : "That booking code is no longer active.");
        return;
      }
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
  // Honest availability: selections the payload marks started/unavailable are
  // previewed and flagged but never loaded; selections the code carried that
  // the backend no longer returns are reported as missing, not dropped quietly.
  const rows = enrichedSelections.map((sel) => ({ sel, state: selectionState(sel) }));
  const loadable = rows.filter((r) => !r.state.started && !r.state.unavailable);
  const startedCount = rows.filter((r) => r.state.started && !r.state.unavailable).length;
  const unavailableCount = rows.filter((r) => r.state.unavailable).length;
  const totalInCode = Array.isArray(bookingData.selections) ? bookingData.selections.length : null;
  const missingCount = totalInCode != null && totalInCode > enrichedSelections.length ? totalInCode - enrichedSelections.length : 0;

  const handleAddToSlip = () => {
    const mapped = loadable.map((r) => selectionToPick(r.sel));
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
          {missingCount > 0 && (
            <div className="bc-note">{missingCount} of the {totalInCode} selections in this code {missingCount !== 1 ? "are" : "is"} no longer available and {missingCount !== 1 ? "were" : "was"} not loaded.</div>
          )}
          <div className="bc-preview-list">
            {rows.map(({ sel, state }, i) => {
              const blocked = state.started || state.unavailable;
              return (
                <div className={`bc-preview-row${blocked ? " blocked" : ""}`} key={i}>
                  <div>
                    <small>{buildMatchLabel(sel)}</small>
                    <b>{String(sel.market ?? "")}: {String(sel.selection ?? "")}</b>
                    {state.unavailable
                      ? <span className="bc-flag grey">Unavailable</span>
                      : state.started
                        ? <span className="bc-flag red">Already started</span>
                        : null}
                  </div>
                  <span>{extractOdds(sel).toFixed(2)}</span>
                </div>
              );
            })}
          </div>
          {(startedCount > 0 || unavailableCount > 0) && (
            <p className="bc-excluded">
              {[
                startedCount > 0 ? `${startedCount} already started` : "",
                unavailableCount > 0 ? `${unavailableCount} unavailable` : "",
              ].filter(Boolean).join(" · ")} — these won't be added to your slip.
            </p>
          )}
          {loadable.length > 0 ? (
            <button type="button" className="gold-button full bc-add-btn" onClick={handleAddToSlip} disabled={added}>
              {added ? <><CheckCircle2 size={14} /> Added to slip</> : `Add ${loadable.length} Selection${loadable.length !== 1 ? "s" : ""} to Slip`}
            </button>
          ) : (
            <div className="bc-error"><Info size={13} /> All selections in this code have already started or are unavailable — nothing to add.</div>
          )}
        </div>
      )}
    </section>
  );
}

function BookingCodeStyles() {
  return (
    <style>{`
      .bc-panel{ padding:20px 22px; margin-top:14px; font-family:Roboto,Arial,sans-serif; }
      .bc-title h3{ display:flex; align-items:center; gap:7px; }
      .bc-sub{ margin:6px 0 14px; color:#71809a; font-size:.78rem; line-height:1.5; }
      .bc-input-row{ display:flex; align-items:stretch; gap:0; border:1px solid #dfe5ec; border-radius:10px; overflow:hidden; background:#fff; transition:border-color .15s ease; }
      .bc-input-row:focus-within{ border-color:#00A651; box-shadow:0 0 0 3px rgba(0,166,81,.15); }
      .bc-input-row.has-error{ border-color:#e57373; }
      .bc-input{ flex:1; min-width:0; padding:12px 14px; border:0; outline:0; background:transparent; color:#20242d; font:700 13px Roboto,Arial,sans-serif; letter-spacing:.08em; text-transform:uppercase; }
      .bc-input::placeholder{ text-transform:none; letter-spacing:normal; color:#9aa5b5; font-weight:500; }
      .bc-load-btn{ flex-shrink:0; padding:0 20px; background:#00A651; color:#fff; font:800 11px Roboto,Arial,sans-serif; letter-spacing:.04em; text-transform:uppercase; cursor:pointer; display:flex; align-items:center; justify-content:center; min-width:64px; transition:opacity .15s ease; border:0; }
      .bc-load-btn:disabled{ opacity:.55; cursor:not-allowed; }
      .bc-spin{ animation:bcSpin .8s linear infinite; }
      @keyframes bcSpin{ to{ transform:rotate(360deg); } }
      .bc-error{ display:flex; align-items:center; gap:6px; margin-top:9px; padding:8px 11px; border-radius:8px; background:#fdecec; border:1px solid #f3c2c2; color:#c62828; font-size:.72rem; font-weight:600; }
      .bc-note{ margin:10px 12px 0; padding:8px 11px; border-radius:8px; background:#fff6db; border:1px solid #eed88f; color:#7a5b00; font-size:.72rem; font-weight:600; line-height:1.45; }
      .bc-preview{ margin-top:14px; border:1px solid #e3e3ef; border-radius:12px; overflow:hidden; background:#fff; }
      .bc-preview-head{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:11px 14px; border-bottom:1px solid #e3e3ef; flex-wrap:wrap; }
      .bc-preview-code{ font:800 13px Roboto,Arial,sans-serif; letter-spacing:.1em; color:#00A651; }
      .bc-preview-meta{ font-size:.7rem; color:#71809a; }
      .bc-preview-list{ max-height:180px; overflow-y:auto; }
      .bc-preview-row{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:9px 14px; border-top:1px solid #e3e3ef; }
      .bc-preview-row:first-child{ border-top:none; }
      .bc-preview-row.blocked{ opacity:.55; }
      .bc-preview-row small{ display:block; color:#71809a; font-size:.68rem; }
      .bc-preview-row b{ display:block; margin-top:2px; font-size:.78rem; color:#20242d; }
      .bc-preview-row span{ flex-shrink:0; font-weight:800; color:#0b7a43; font-size:.82rem; }
      .bc-flag{ display:inline-block; margin-top:4px; font-size:9px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; padding:2px 7px; border-radius:999px; }
      .bc-flag.red{ background:#fdecec; color:#c62828; }
      .bc-flag.grey{ background:#eef0f2; color:#6b7280; }
      .bc-excluded{ margin:10px 14px 0; font-size:.72rem; color:#71809a; line-height:1.5; }
      .bc-add-btn{ margin:12px; width:calc(100% - 24px); display:flex; align-items:center; justify-content:center; gap:7px; }
      .gold-button.bc-add-btn{ background:#00A651; }
      @media(max-width:960px){ .bc-panel{ margin-top:12px; } }

      /* Betslip FULL NAVY (owner, 2026-10-23): the embedded booking-code
         panel goes dark with the rest of the slip page — inset surfaces
         take the slab's deep tone #0A1B3D, text goes light, greens stay
         green. The index.css "Betslip FULL NAVY" block at EOF restates
         these values with !important — both layers agree. */
      .bc-sub{ color:rgba(255,255,255,.6); }
      .bc-input-row{ background:#0A1B3D; border-color:rgba(255,255,255,.2); }
      .bc-input-row:focus-within{ border-color:#00A651; box-shadow:0 0 0 3px rgba(0,166,81,.22); }
      .bc-input-row.has-error{ border-color:rgba(248,113,113,.6); }
      .bc-input{ color:#fff; }
      .bc-input::placeholder{ color:rgba(255,255,255,.38); }
      .bc-error{ background:rgba(248,113,113,.12); border-color:rgba(248,113,113,.35); color:#FF9AA2; }
      .bc-note{ background:rgba(255,176,32,.12); border-color:rgba(255,176,32,.35); color:#FFCF6B; }
      .bc-preview{ background:#0A1B3D; border-color:rgba(255,255,255,.14); }
      .bc-preview-head{ border-bottom-color:rgba(255,255,255,.12); }
      .bc-preview-code{ color:#00E85F; }
      .bc-preview-meta{ color:rgba(255,255,255,.55); }
      .bc-preview-row{ border-top-color:rgba(255,255,255,.1); }
      .bc-preview-row small{ color:rgba(255,255,255,.55); }
      .bc-preview-row b{ color:#fff; }
      .bc-preview-row span{ color:#00E85F; }
      .bc-flag.red{ background:rgba(248,113,113,.15); color:#FF9AA2; }
      .bc-flag.grey{ background:rgba(255,255,255,.1); color:rgba(255,255,255,.65); }
      .bc-excluded{ color:rgba(255,255,255,.55); }
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
  const [stake, setStake] = useState(String(MIN_STAKE));
  const [stakeEdited, setStakeEdited] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [placedInfo, setPlacedInfo] = useState<{
    stake: number; totalOdds: number; potentialReturn: number; count: number;
    selections: Pick[]; bookingCode: string | null; codeState: "ready" | "generating" | "failed"; isAdmin: boolean;
  } | null>(null);
  const { user } = useSession();
  const isAdmin = resolveIsAdmin(user);
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
    const placedPicks = picks;
    try {
      await onPlace(stakeValue);
      setPlacedInfo({ stake: stakeValue, totalOdds, potentialReturn, count: placedPicks.length, selections: placedPicks, bookingCode: null, codeState: isAdmin ? "generating" : "ready", isAdmin });
      setPicks([]);
      // Admin/super-admin receipt (owner, 2026-10-29): mint the shareable
      // code in the background. A mint failure only leaves the receipt
      // without a code — the bet itself already succeeded.
      if (isAdmin) {
        mintReceiptCode(placedPicks, stakeValue).then((codeValue) => {
          setPlacedInfo((prev) => prev ? { ...prev, bookingCode: codeValue, codeState: codeValue ? "ready" : "failed" } : prev);
        });
      }
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
        <>
        <div className="bp-grid">
          <div className="bp-list">
            {picks.map((p) => <SelectionCard key={`${p.id}-${p.selection}-${p.market}`} pick={p} onRemove={() => remove(p)} />)}
          </div>

          <aside className="panel bp-summary">
            
            <div className="bp-summary-row"><span>Total odds</span><b>{totalOdds.toFixed(2)}</b></div>
            <label className="bp-stake-field">
              <span>Stake (GHS)</span>
              <input type="number" min={MIN_STAKE} max={MAX_STAKE} value={stake} placeholder="Enter amount" onChange={(e) => { setStakeEdited(true); setStake(e.target.value); }} />
            </label>
            <div className="bp-stake-hint">Min GHS {MIN_STAKE} · Max GHS {MAX_STAKE}{balance !== null && ` · Balance GHS ${balance.toFixed(2)}`}</div>
            {stakeEdited && stake !== "" && Number.isFinite(stakeValue) && stakeValue < MIN_STAKE && <small className="bp-stake-error" role="alert">Deposit an additional GHS {Math.max(0, MIN_STAKE - stakeValue).toFixed(2)} to place this bet.</small>}
            <div className="bp-summary-row highlight"><span>Potential return</span><b>GHS {potentialReturn.toFixed(2)}</b></div>
            <button className={`gold-button full${stakeInvalid ? " stake-button-disabled" : ""}`} onClick={place} disabled={placing || stakeInvalid}>{placing ? "Placing…" : "Place Bet"}</button>
            {notice && <small className={notice.type === "error" ? "auth-notice" : "auth-notice bp-success"}>{notice.text}</small>}
          </aside>
        </div>
        <BookingCodePanel picks={picks} onAdd={addFromBookingCode} />
        </>
      )}
      {placedInfo && (placedInfo.isAdmin ? (
        /* Full-screen admin receipt (owner, 2026-10-29): matches his
           SportyBet/KingzBet cards — full height, full width, no extra
           labels, no buttons. X closes back to the slip; My Bets is one
           tap away on the bottom nav. */
        <div className="pb-receipt-overlay">
          <div className="pb-receipt-sheet">
            <div className="pb-receipt-top">
              <img className="pb-receipt-brand" src="/playbet/logo.png" alt="PlayBet" />
              <button type="button" className="pb-receipt-close" onClick={() => setPlacedInfo(null)} aria-label="Close receipt"><X size={22} /></button>
            </div>
            <BookingCodeReceipt code={placedInfo.bookingCode} codeState={placedInfo.codeState} stake={placedInfo.stake} totalOdds={placedInfo.totalOdds} picks={placedInfo.selections} />
          </div>
        </div>
      ) : (
        <div className="pb-success-overlay" onClick={() => setPlacedInfo(null)}>
          <div className="pb-success-card" onClick={(e) => e.stopPropagation()}>
            <div className="pb-success-badge"><CheckCircle2 size={34} /></div>
            <h3>Bet placed successfully</h3>
            <p>Your bet is in. Good luck!</p>
            <div className="pb-success-rows">
              <div><span>Selections</span><b>{placedInfo.count}</b></div>
              <div><span>Stake</span><b>GHS {placedInfo.stake.toFixed(2)}</b></div>
              <div><span>Total odds</span><b>{placedInfo.totalOdds.toFixed(2)}</b></div>
              <div className="ret"><span>Potential return</span><b>GHS {placedInfo.potentialReturn.toFixed(2)}</b></div>
            </div>
            <button className="gold-button full" onClick={() => setLocation("/open-bets")}>View my bets</button>
            <button className="ghost-button full" onClick={() => setPlacedInfo(null)}>Done</button>
          </div>
        </div>
      ))}
    </main>
  );
}
