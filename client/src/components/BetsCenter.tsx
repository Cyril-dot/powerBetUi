import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  CalendarDays, CheckCircle2, ChevronDown, ChevronRight, Clock3, Info, RefreshCw, Trash2, Trophy, X,
} from "lucide-react";
import api, { ApiError, type Bet, type Match } from "@/lib/api";
import { resolveIsAdmin } from "./WalletCenter";
import { BET_PLACED_NOTICE_KEY } from "./BetslipPage";
import { useSession } from "../lib/session";

const HIDDEN_TICKETS_KEY = "powerbet_hidden_tickets";

function readHiddenTickets(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_TICKETS_KEY) || "[]")); }
  catch { return new Set(); }
}

const STATUS_LABEL: Record<Bet["status"], string> = {
  PENDING: "Pending", WON: "Won", LOST: "Lost", VOID: "Void", CASHED_OUT: "Cashed Out",
};
const STATUS_CLASS: Record<Bet["status"], string> = {
  PENDING: "bh-pending", WON: "bh-won", LOST: "bh-lost", VOID: "bh-void", CASHED_OUT: "bh-cashed",
};
const STATUS_FILTERS: { value: "ALL" | Bet["status"]; label: string }[] = [
  { value: "ALL", label: "Bet Status: All" },
  { value: "PENDING", label: "Pending" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
  { value: "CASHED_OUT", label: "Cashed Out" },
  { value: "VOID", label: "Void" },
];
const RESULT_FILTERS = [
  { value: "ALL", label: "Bet Result: All" },
  { value: "WIN", label: "Winning bets" },
  { value: "LOSS", label: "Losing bets" },
];

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}
function dayLabel(key: string): { day: string; mon: string } {
  const d = new Date(`${key}T00:00:00`);
  return { day: d.toLocaleDateString(undefined, { day: "2-digit" }), mon: d.toLocaleDateString(undefined, { month: "short" }) };
}


function isOpenMatchLive(match: Match | undefined): boolean {
  if (!match) return false;
  const status = String(match.status ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (["FINISHED", "FT", "ENDED", "COMPLETED", "CANCELLED", "POSTPONED"].includes(status)) return false;
  if (["LIVE", "IN_PLAY", "IN_PROGRESS", "FIRST_HALF", "SECOND_HALF", "HALFTIME", "HALF_TIME", "HT"].includes(status) || /^\d+(ST|ND|RD|TH)_HALF$/.test(status)) return true;
  // Some admin-created fixtures have no live status. Infer the normal 90-minute
  // window plus the half-time interval from kickoff so Open Bets still updates.
  if (match.kickoffAt) {
    const elapsed = (Date.now() - new Date(match.kickoffAt).getTime()) / 60000;
    return Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 105;
  }
  return false;
}
function openMatchClock(match: Match | undefined): string {
  if (!match) return "";
  const status = String(match.status ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (["HALFTIME", "HALF_TIME", "HALF_TIME_BREAK", "HT"].includes(status)) return "HT";
  if (match.minutePlayed != null) return `${match.minutePlayed}'`;
  const kickoff = match.kickoffAt ? new Date(match.kickoffAt).getTime() : NaN;
  if (Number.isNaN(kickoff)) return "LIVE";
  const elapsed = (Date.now() - kickoff) / 60000;
  if (elapsed < 0) return "LIVE";
  if (elapsed <= 45) return `${Math.max(1, Math.floor(elapsed))}'`;
  if (elapsed <= 60) return "HT";
  if (elapsed <= 105) return `${45 + Math.floor(elapsed - 60)}'`;
  return "90+'";
}

function openMatchStartTime(match: Match | undefined): string {
  if (!match?.kickoffAt) return "";
  const kickoff = new Date(match.kickoffAt);
  if (Number.isNaN(kickoff.getTime())) return "";
  return `${isOpenMatchLive(match) ? "Started" : "Starts"} ${kickoff.toLocaleDateString(undefined, { day: "2-digit", month: "short" })}, ${kickoff.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

/* ── History card: full-width, rounded, colour-coded, clickable ── */
function HistoryCard({ bet, scores }: { bet: Bet; scores: Record<string, Match> }) {
  const [, setLocation] = useLocation();
  const isMultiple = bet.selections.length > 1;
  const visible = bet.selections.slice(0, 3);
  const rest = bet.selections.length - visible.length;
  const totalReturn = bet.status === "WON" || bet.status === "CASHED_OUT" ? bet.potentialReturn : 0;
  const won = bet.status === "WON";

  const matchLine = (s: Bet["selections"][number]) => {
    const names = s.homeTeam && s.awayTeam ? `${s.homeTeam} v ${s.awayTeam}` : s.market;
    const m = scores[s.matchId];
    const ft = m && m.scoreHome != null && m.scoreAway != null ? ` · FT ${m.scoreHome}-${m.scoreAway}` : "";
    return `${names}${ft}`;
  };

  return (
	    <div className={`bh-card ${STATUS_CLASS[bet.status]}`} onClick={() => setLocation(`/bets/${bet.id}`)} role="button" tabIndex={0}>
	      <div className="bh-card-top">
	        <span className="bh-type">{isMultiple ? "Multiple" : "Singles"} <em>· {bet.selections.length} pick{bet.selections.length !== 1 ? "s" : ""}</em></span>
	        <div className="bh-card-actions">
	          <button type="button" className="bh-ticket-link" onClick={(event) => { event.stopPropagation(); setLocation(`/bets/${bet.id}`); }}>View ticket <ChevronRight size={12} /></button>
	          <span className={`bh-pill ${STATUS_CLASS[bet.status]}`}>{won && <Trophy size={12} />} {STATUS_LABEL[bet.status]}</span>
	        </div>
      </div>
	      {won && <span className="bh-won-badge" aria-label="Won"><Trophy size={15} /><small>WON</small></span>}
	      <div className="bh-card-body">
	        <div className="bh-matches">
	          {visible.map((s, i) => (
	            <div className="bh-match" key={s.id ?? i}><span className="bh-dot" />{matchLine(s)}</div>
	          ))}
	          {rest > 0 && <div className="bh-more">…and {rest} other match{rest > 1 ? "es" : ""}</div>}
	        </div>
	        <div className="bh-totals">
	          <div><span>Stake</span><b>GHS {bet.stake.toFixed(2)}</b></div>
	          <div><span>Odds</span><b>{bet.totalOdds.toFixed(2)}×</b></div>
	          <div className="bh-payout-row"><span>{won || bet.status === "CASHED_OUT" ? "Amount won" : "Potential return"}</span><b className={won ? "bh-return-won" : ""}>GHS {totalReturn.toFixed(2)}</b></div>
	        </div>
	      </div>
    </div>
  );
}

/* ── Open-bet card: admins can trigger the backend cashout action. ── */
function OpenBetCard({ bet, scores, isAdmin, onCashout }: { bet: Bet; scores: Record<string, Match>; isAdmin: boolean; onCashout: (bet: Bet) => Promise<void> }) {
  const [expanded, setExpanded] = useState(true);
  const isMultiple = bet.selections.length > 1;

  return (
    <div className="bh-card">
      <div className="bh-card-head bh-open-head">
        <span>{isMultiple ? "Multiple" : "Singles"}</span>
      </div>
      <div className="bh-card-body">
        {expanded && (
          <div className="bh-legs">
            {bet.selections.map((s, i) => (
              <div className="bh-leg bh-open-mapped-leg" key={s.id ?? i}>
                <span className="bh-leg-check">✓</span>
                <div className="bh-leg-info">
                  <div className="bh-open-leg-head"><b>{s.market || "1X2"} · {s.homeTeam ?? scores[s.matchId]?.homeTeam ?? "Home"} vs {s.awayTeam ?? scores[s.matchId]?.awayTeam ?? "Away"}</b>{isOpenMatchLive(scores[s.matchId]) && <span className="bh-live-match"><i /><small>live</small><b>{openMatchClock(scores[s.matchId])}</b></span>}</div>
                  {openMatchStartTime(scores[s.matchId]) && <small className="bh-open-kickoff">{openMatchStartTime(scores[s.matchId])}</small>}
                  <small>{s.selection} @ {s.oddsLocked?.toFixed(2)}</small>
                  <div className="bh-open-team-row"><span>{s.homeTeam ?? scores[s.matchId]?.homeTeam ?? "Home"}</span>{isOpenMatchLive(scores[s.matchId]) && scores[s.matchId]?.scoreHome != null && <strong>{scores[s.matchId].scoreHome}</strong>}</div>
                  <div className="bh-open-team-row"><span>{s.awayTeam ?? scores[s.matchId]?.awayTeam ?? "Away"}</span>{isOpenMatchLive(scores[s.matchId]) && scores[s.matchId]?.scoreAway != null && <strong>{scores[s.matchId].scoreAway}</strong>}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="bh-toggle-details" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Hide Match Details" : "Show Match Details"}
        </button>
        <div className="bh-totals bh-open-totals">
          <div><span>Stake</span><b>{bet.stake.toFixed(2)}</b></div>
          <div><span>Pot. Win</span><b>{bet.potentialReturn.toFixed(2)}</b></div>
        </div>
        <button type="button" className="bh-cashout-btn" onClick={() => undefined} title="Cashout">
          Cashout
        </button>
      </div>
    </div>
  );
}


export default function BetsCenter({ defaultTab = "history" }: { defaultTab?: "open" | "history" }) {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"open" | "history">(defaultTab);
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | Bet["status"]>("ALL");
  const [resultFilter, setResultFilter] = useState("ALL");
  const [openSubFilter, setOpenSubFilter] = useState<"all" | "cashout" | "live">("all");
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [placedNotice, setPlacedNotice] = useState(false);
  const { user } = useSession();
  const isAdmin = resolveIsAdmin(user);
  const [matchScores, setMatchScores] = useState<Record<string, Match>>({}); const [, repaint] = useState(0);
  const hiddenTickets = useMemo(readHiddenTickets, []);

  useEffect(() => { setTab(defaultTab); }, [defaultTab]);
  useEffect(() => { const timer = window.setInterval(() => repaint((n) => n + 1), 1000); return () => window.clearInterval(timer); }, []);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const page = await api.bets.getMine(0, 50);
      setBets((page.content ?? []).filter((b) => !hiddenTickets.has(b.id)));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? "Sign in to view your bets." : "Bets are temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(BET_PLACED_NOTICE_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw) as { placedAt?: number };
      if (!payload.placedAt || Date.now() - payload.placedAt < 120000) setPlacedNotice(true);
      window.sessionStorage.removeItem(BET_PLACED_NOTICE_KEY);
    } catch { /* storage may be unavailable */ }
  }, []);

  const openBets = useMemo(() => bets.filter((b) => b.status === "PENDING"), [bets]);
  const settledBets = useMemo(() => bets.filter((b) => b.status !== "PENDING"), [bets]);

  // Load match status, live scores, and timers for both open and settled bets.
  useEffect(() => {
    const ids = Array.from(new Set([...openBets, ...settledBets].flatMap((b) => b.selections.map((s) => s.matchId)).filter(Boolean)));
    if (ids.length === 0) return;
    let cancelled = false;
    const refresh = () => Promise.allSettled(ids.map(async (mid) => { try { return await api.matches.getById(mid); } catch { return api.publicAdminMatches.getById(mid); } })).then((results) => {
      if (cancelled) return;
      setMatchScores((prev) => {
        const next = { ...prev };
        results.forEach((r, i) => { if (r.status === "fulfilled") next[ids[i]] = r.value; });
        return next;
      });
    });
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openBets, settledBets]);

  const filteredSettled = useMemo(() => {
    let list = settledBets;
    if (statusFilter !== "ALL") list = list.filter((b) => b.status === statusFilter);
    if (resultFilter === "WIN") list = list.filter((b) => b.status === "WON" || b.status === "CASHED_OUT");
    if (resultFilter === "LOSS") list = list.filter((b) => b.status === "LOST");
    return list;
  }, [settledBets, statusFilter, resultFilter]);

  const filteredOpen = useMemo(() => {
    if (openSubFilter === "all") return openBets;
    if (openSubFilter === "live") return openBets.filter((bet) => bet.selections.some((selection) => isOpenMatchLive(matchScores[selection.matchId])));
    return [];
  }, [openBets, openSubFilter, matchScores]);

  const grouped = useMemo(() => {
    const map = new Map<string, Bet[]>();
    for (const b of filteredSettled) {
      const key = dayKey(b.placedAt);
      const list = map.get(key) ?? [];
      list.push(b);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filteredSettled]);

  const clearFilters = () => { setStatusFilter("ALL"); setResultFilter("ALL"); };
  const cashout = async (bet: Bet) => {
    try {
      await api.bets.cashout(bet.id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Cashout could not be completed.");
    }
  };

  return (
    <div className="bc-page">
      <BetsCenterStyles />

      <div className="bc-tabs">
        <button type="button" className={tab === "open" ? "active" : ""} onClick={() => { setTab("open"); setLocation("/open-bets"); }}>
          My Bets ({openBets.length})
        </button>
        <button type="button" className={tab === "history" ? "active" : ""} onClick={() => { setTab("history"); setLocation("/bets"); }}>
          Bet History
        </button>
      </div>

      {placedNotice && <div className="bc-placement-success" role="status"><span className="bc-success-icon"><CheckCircle2 size={19} /></span><div><strong>Bet placed successfully</strong><span>Your wager is now listed under Open Bets.</span></div><button type="button" onClick={() => setPlacedNotice(false)} aria-label="Dismiss success message"><X size={15} /></button></div>}

      {tab === "history" && (
        <div className="bc-toolbar">
          <label className="bh-filter">
            <ChevronDown size={13} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "ALL" | Bet["status"])}>
              {STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>
          <label className="bh-filter">
            <ChevronDown size={13} />
            <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value)}>
              {RESULT_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>
          <button type="button" className="bc-icon-btn" onClick={load} aria-label="Refresh"><RefreshCw size={15} /></button>
          <button type="button" className="bc-icon-btn" onClick={clearFilters} aria-label="Clear filters"><Trash2 size={15} /></button>
        </div>
      )}

      {tab === "open" && openBets.length > 0 && (
        <>
          {!bannerDismissed && (
            <div className="bc-auto-banner">
              <span><Info size={13} /> Set a rule to <b>Auto Cashout</b> your bet.</span>
              <button type="button" onClick={() => setBannerDismissed(true)} aria-label="Dismiss"><X size={14} /></button>
            </div>
          )}
          <div className="bc-toolbar bc-open-toolbar">
            {(["all", "cashout", "live"] as const).map((v) => (
              <button key={v} type="button" className={openSubFilter === v ? "bc-chip active" : "bc-chip"} onClick={() => setOpenSubFilter(v)}>
                {v === "all" ? "All" : v === "cashout" ? "Cashout Available" : "Live Games"}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="bc-body">
        {loading ? (
          <p className="muted bc-pad">Loading…</p>
        ) : error ? (
          <div className="bc-pad">
            <p className="muted">{error}</p>
            <Link href="/login" className="gold-button" style={{ marginTop: 12, display: "inline-flex" }}>Sign in</Link>
          </div>
        ) : tab === "open" ? (
          filteredOpen.length === 0 ? (
            <div className="ob-empty">
              <Clock3 size={24} />
              <p className="muted">No bets open.</p>
            </div>
          ) : (
            <div className="bc-flat-list">
              {filteredOpen.map((bet) => <OpenBetCard key={bet.id} bet={bet} scores={matchScores} isAdmin={isAdmin} onCashout={cashout} />)}
            </div>
          )
        ) : filteredSettled.length === 0 ? (
          <div className="ob-empty">
            <Clock3 size={24} />
            <p className="muted">{settledBets.length === 0 ? "Settled bets will appear here once a wager finishes." : "No bets match this filter."}</p>
          </div>
        ) : (
          <div className="bc-days">
            {grouped.map(([key, dayBets]) => {
              const { day, mon } = dayLabel(key);
              return (
                <div className="bh-day" key={key}>
                  <div className="bh-day-label"><CalendarDays size={13} /><span>{mon}</span><b>{day}</b></div>
                  <div className="bh-day-cards">
                    {dayBets.map((bet) => <HistoryCard key={bet.id} bet={bet} scores={matchScores} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

}

function BetsCenterStyles() {
  return (
    <style>{`
      .bc-page{ background:#0A0A0A; min-height:70vh; padding-bottom:40px; }

      .bc-tabs{
        display:flex; gap:4px; background:#1a1c22; border-radius:14px; overflow:hidden;
        margin:35px 16px 0; padding:4px;
      }
      .bc-tabs button{
        flex:1; padding:12px 8px; font-size:.8rem; font-weight:800; color:rgba(255,255,255,.55); cursor:pointer;
        border-radius:10px; transition:background .15s ease, color .15s ease;
      }
      .bc-tabs button.active{ background:#141414; color:#F4F1F0; box-shadow:0 4px 12px rgba(0,0,0,.18); }

      .bc-toolbar{ display:flex; align-items:center; gap:8px; padding:12px 12px; flex-wrap:wrap; background:#141414; border-bottom:1px solid var(--line); }
      .bh-filter{ display:flex; align-items:center; gap:6px; padding:8px 12px; border-radius:999px; border:1px solid var(--line); background:#141414; }
      .bh-filter select{ border:0; background:transparent; font-size:.72rem; font-weight:700; color:#F4F1F0; outline:0; }
      .bc-icon-btn{ width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center; background:#1B1B1B; color:#9a9a9a; cursor:pointer; }

      .bc-auto-banner{
        display:flex; align-items:center; justify-content:space-between; gap:10px; margin:12px; padding:10px 14px;
        border-radius:10px; background:rgba(31,184,112,.1); color:var(--nature); font-size:.76rem; font-weight:700;
      }
      .bc-auto-banner span{ display:flex; align-items:center; gap:6px; }
      .bc-auto-banner button{ color:#8b8b8b; cursor:pointer; }

      .bc-open-toolbar{ background:transparent; border:none; padding-top:0; }
      .bc-chip{ padding:8px 14px; border-radius:999px; background:#232323; color:#9a9a9a; font-size:.74rem; font-weight:700; cursor:pointer; }
      .bc-chip.active{ background:#F4F1F0; color:#fff; }

      .bc-pad{ padding:24px 16px; }
      .bc-body{ padding:0 0 20px; }

      .ob-empty{ display:flex; flex-direction:column; align-items:center; text-align:center; padding:34px 16px 20px; }
      .ob-empty h3{ font:800 20px 'DM Sans',sans-serif; color:#F4F1F0; margin:0; }
      .ob-empty p{ margin:6px 0 0; color:#8b8b8b; font-size:.85rem; }

      .bc-days,.bc-flat-list{ display:flex; flex-direction:column; gap:16px; padding:14px 10px 0; }
      .bh-day-label{ display:flex; align-items:center; gap:6px; color:#8b8b8b; font-size:.7rem; font-weight:700; text-transform:uppercase; letter-spacing:.05em; margin:0 4px 8px; }
      .bh-day-label b{ color:#F4F1F0; font-size:.82rem; }
      .bh-day-cards{ display:flex; flex-direction:column; gap:10px; }

      .bh-card{
        display:block; width:100%; border-radius:18px; overflow:hidden; background:#141414; cursor:pointer;
        box-shadow:0 2px 10px rgba(20,24,33,.06); border:1px solid var(--line); text-decoration:none; color:inherit;
        transition:transform .16s ease, box-shadow .16s ease;
      }
      .bh-card:hover{ transform:translateY(-2px); box-shadow:0 10px 26px rgba(20,24,33,.12); }

      .bh-card-head{ display:flex; align-items:center; justify-content:space-between; padding:11px 16px; font-size:.76rem; font-weight:800; color:#F4F1F0; }
      .bh-card-head.bh-open-head{ background:#1B1B1B; color:#F4F1F0; }
      .bh-share{ color:#9a9a9a; }

	      .bh-card-top{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:14px 16px 0; }
	      .bh-type{ font-size:.8rem; font-weight:800; color:#F4F1F0; }
	      .bh-type em{ font-style:normal; font-weight:600; color:#a8a8a8; font-size:.72rem; }
	      .bh-card-actions{ display:flex; align-items:center; justify-content:flex-end; gap:6px; min-width:0; }
	      .bh-ticket-link{ display:inline-flex; align-items:center; gap:2px; padding:5px 7px; border:1px solid #cbd9ec; border-radius:7px; background:#fff; color:#1246a8; font-size:.62rem; font-weight:900; white-space:nowrap; cursor:pointer; }
	      .bh-ticket-link:hover{ background:#eef5ff; border-color:#8bb5f4; }
      .bh-pill{
        display:flex; align-items:center; gap:4px; padding:5px 11px; border-radius:999px; font-size:.66rem;
        font-weight:800; text-transform:uppercase; letter-spacing:.04em; color:#fff; background:#9a9a9a; flex-shrink:0;
      }
      .bh-pill.bh-won{ background:var(--nature); }
      .bh-pill.bh-lost{ background:#6b7280; }
      .bh-pill.bh-pending{ background:#FFB020; color:#141414; }
      .bh-pill.bh-void{ background:#8b8b8b; }
      .bh-pill.bh-cashed{ background:#0da653; }

	      .bh-card-body{ padding:12px 16px 14px; }
	      .bh-totals{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; padding-bottom:12px; margin-top:12px; margin-bottom:12px; border-bottom:1px dashed var(--line); }
	      .bh-totals div{ display:flex; flex-direction:column; gap:3px; }
	      .bh-totals span{ font-size:.62rem; color:#8b8b8b; text-transform:uppercase; letter-spacing:.04em; }
	      .bh-totals b{ font-size:.86rem; color:#F4F1F0; }
	      .bh-return-won{ color:var(--nature); }
	      .bh-totals .bh-payout-row{
	        grid-column:1 / -1;
	        display:flex;
	        flex-direction:row;
	        align-items:center;
	        justify-content:space-between;
	        gap:12px;
	        min-width:0;
	        margin-top:4px;
	        padding:11px 13px;
	        border:1px solid #d97706;
	        border-radius:10px;
	        background:linear-gradient(135deg,#f59e0b 0%,#ffb703 100%);
	        box-shadow:0 4px 12px rgba(217,119,6,.22);
	      }
	      .bh-totals .bh-payout-row span,
	      .bh-totals .bh-payout-row b{
	        color:#2b1600!important;
	        text-shadow:none;
	      }
	      .bh-totals .bh-payout-row span{ font-weight:900; }
	      .bh-totals .bh-payout-row b{ max-width:70%; overflow-wrap:anywhere; text-align:right; font-size:1rem; font-weight:900; font-variant-numeric:tabular-nums; }

      .bh-matches{ display:flex; flex-direction:column; gap:6px; }
      .bh-match{ display:flex; align-items:center; gap:8px; font-size:.8rem; color:#F4F1F0; font-weight:600; }
      .bh-dot{ width:5px; height:5px; border-radius:50%; background:var(--gold-hi); flex-shrink:0; }
      .bh-more{ font-size:.72rem; color:#8b8b8b; padding-left:13px; }

      .bh-card-foot{
        display:flex; align-items:center; justify-content:flex-end; gap:3px; margin-top:12px; padding-top:10px;
        border-top:1px solid var(--line); color:var(--gold-hi); font-size:.72rem; font-weight:800;
      }

      .bh-open-totals{ border-top:1px dashed var(--line); border-bottom:none; margin-top:12px; padding-top:12px; margin-bottom:12px; }
      .bh-legs{ display:flex; flex-direction:column; gap:10px; margin-bottom:6px; }
      .bh-leg{ display:flex; gap:10px; align-items:flex-start; }
      .bh-leg-check{ width:18px; height:18px; border-radius:50%; background:var(--nature); color:#fff; font-size:.62rem; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:1px; }
      .bh-leg-info b{ display:block; font-size:.82rem; color:#F4F1F0; }
      .bh-leg-info small{ display:block; color:#8b8b8b; font-size:.7rem; }
      .bh-leg-info .bh-open-kickoff{ margin-top:4px; color:#c9962c; font-size:.68rem; font-weight:800; letter-spacing:.01em; }
      .bh-leg-teams{ margin-top:1px; }
      .bh-toggle-details{ color:var(--nature); font-size:.72rem; font-weight:800; cursor:pointer; }
      .bh-cashout-btn{ width:100%; padding:13px; border-radius:10px; background:rgba(30,107,255); color:rgba(30,107,255); font-size:.8rem; font-weight:800; cursor:not-allowed; }

      .bc-placement-success{ display:flex; align-items:center; gap:11px; margin:14px 10px 0; padding:13px 14px; border:1px solid #8ed9ad; border-radius:14px; background:linear-gradient(135deg,#eafff1,#f5fff8); color:#174b32; box-shadow:0 8px 22px rgba(26,130,75,.12); }
      .bc-placement-success .bc-success-icon{ width:32px; height:32px; border-radius:50%; display:grid; place-items:center; flex-shrink:0; color:#fff; background:linear-gradient(135deg,#1eaf61,#087b43); }
      .bc-placement-success div{ display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
      .bc-placement-success strong{ font-size:.82rem; font-weight:900; }
      .bc-placement-success div span{ color:#4f7763; font-size:.7rem; }
      .bc-placement-success button{ color:#4f7763; cursor:pointer; padding:4px; }
      .bh-outcome-ribbon{ display:flex; align-items:center; gap:6px; margin:0 16px 0 20px; padding:8px 10px; border-radius:9px; font-size:.68rem; font-weight:900; letter-spacing:.04em; text-transform:uppercase; }
      .bh-card.bh-won{ background:linear-gradient(145deg,#f5fff8 0%,#e5faec 100%); border-color:#89d7a6; box-shadow:0 10px 28px rgba(20,137,75,.14); }
      .bh-card.bh-won::before{ width:6px; background:linear-gradient(#0c9b51,#b8e638); }
      .bh-card.bh-won .bh-outcome-ribbon{ color:#116438; background:rgba(68,193,111,.16); border:1px solid rgba(54,166,95,.25); }
      .bh-card.bh-won .bh-dot{ background:#18a957; box-shadow:0 0 0 4px rgba(24,169,87,.12); }
      .bh-card.bh-lost{ background:linear-gradient(145deg,#fffafa 0%,#fff0f0 100%); border-color:#efb0b4; box-shadow:0 10px 28px rgba(185,54,65,.10); }
      .bh-card.bh-lost::before{ width:6px; background:linear-gradient(#d74757,#f1a04e); }
      .bh-card.bh-lost .bh-outcome-ribbon{ color:#a52c38; background:rgba(226,86,98,.12); border:1px solid rgba(210,75,87,.22); }
      .bh-card.bh-lost .bh-dot{ background:#db5360; box-shadow:0 0 0 4px rgba(219,83,96,.10); }
      .bh-card.bh-lost .bh-return-won{ color:#a52c38!important; }

      /* History refresh: a richer visual treatment than the old flat white cards. */
      .bc-page{ max-width:1120px; margin:0 auto; padding:22px 16px 54px; }
      .bc-tabs{ background:linear-gradient(135deg,#10241e,#152c3a); border:1px solid rgba(104,221,151,.25); box-shadow:0 12px 28px rgba(10,31,28,.16); }
      .bc-tabs button{ color:#9bb3ae; }
      .bc-tabs button.active{ color:#fff; background:linear-gradient(135deg,#2d9c5a,#176e49); box-shadow:0 5px 14px rgba(45,156,90,.3); }
      .bc-toolbar{ background:#f5f8f7; border:1px solid #dfe9e4; border-radius:14px; margin:14px 10px 4px; padding:10px; }
      .bh-filter{ background:#fff; border-color:#d8e5df; color:#34564a; }
      .bh-filter select{ color:#34564a; }
      .bc-icon-btn{ background:#fff; border-color:#d8e5df; color:#356553; }
      .bh-day-label{ color:#648177; }
      .bh-day-label b{ color:#173a2b; }
      .bh-card{ position:relative; background:linear-gradient(145deg,#ffffff,#f6fbf8); border:1px solid #d7e8df; box-shadow:0 8px 24px rgba(24,68,52,.08); }
      .bh-card::before{ content:""; position:absolute; inset:0 auto 0 0; width:4px; background:linear-gradient(#28a95f,#b3e52e); }
      .bh-card:hover{ border-color:#7ad2a0; box-shadow:0 14px 30px rgba(24,105,69,.16); }
      .bh-card-top{ padding-left:20px; }
      .bh-type{ color:#173b2b; letter-spacing:.01em; }
      .bh-type em{ color:#668077; }
      .bh-card-body{ padding-left:20px; }
      .bh-totals{ border-bottom-color:#dceae3; }
      .bh-totals span{ color:#6d8b80; }
      .bh-totals b{ color:#173b2b; }
      .bh-match{ color:#264d3d; }
      .bh-more{ color:#6d8b80; }
      .bh-card-foot{ border-top-color:#dceae3; }
      .bh-day-cards .bh-card:nth-child(3n+2)::before{ background:linear-gradient(#e7a33d,#ef6e54); }
      .bh-day-cards .bh-card:nth-child(3n)::before{ background:linear-gradient(#4c8ee8,#8258d6); }
      .bh-pill.bh-lost{ background:#e85e64; color:#fff; }
      .bh-pill.bh-void{ background:#879b93; color:#fff; }
      .bh-pill.bh-won,.bh-pill.bh-cashed{ box-shadow:0 3px 10px rgba(13,166,83,.2); }
      .bh-return-won{ color:#148448!important; }

      /* Premium settled-ticket finish: neutral card surfaces, restrained status accents, and a clear win marker. */
      .bh-card{ background:linear-gradient(145deg,#ffffff 0%,#f7f7f9 100%); border-color:#dedee5; box-shadow:0 9px 24px rgba(22,25,34,.08); }
      .bh-card::before{ width:3px; background:#c8c9d2; }
      .bh-card:hover{ border-color:#c9a75d; box-shadow:0 15px 30px rgba(31,34,45,.13); }
      .bh-card.bh-won{ background:linear-gradient(145deg,#ffffff 0%,#fbfaf7 100%); border-color:#d9c28f; box-shadow:0 11px 28px rgba(131,96,29,.12); }
      .bh-card.bh-won::before{ width:4px; background:linear-gradient(#d3a83b,#f0c96a); }
      .bh-card.bh-lost{ background:linear-gradient(145deg,#ffffff 0%,#faf9fa 100%); border-color:#d9d8df; box-shadow:0 9px 24px rgba(40,42,51,.08); }
      .bh-card.bh-lost::before{ width:4px; background:linear-gradient(#a9aab4,#d8d8df); }
      .bh-won-badge{ position:absolute; top:12px; right:13px; z-index:2; display:flex; align-items:center; gap:5px; padding:6px 8px 6px 7px; border-radius:9px; color:#fff; background:linear-gradient(145deg,#19a957,#08743c); box-shadow:0 5px 12px rgba(12,111,58,.24); }
      .bh-won-badge small{ font-size:8px; font-weight:900; letter-spacing:.1em; line-height:1; }
      .bh-card.bh-won .bh-card-top{ padding-right:78px; }
      .bh-card.bh-won .bh-return-won{ color:#d78317!important; font-size:1rem; font-weight:900; text-shadow:0 1px 0 rgba(255,255,255,.7); }
	      .bh-card.bh-won .bh-totals .bh-payout-row{ padding:11px 13px; margin-top:4px; background:linear-gradient(135deg,#f59e0b 0%,#ffb703 100%); border-color:#d97706; }
	      .bh-card.bh-won .bh-totals .bh-payout-row span{ color:#2b1600!important; }
      .bh-card.bh-won .bh-dot{ background:#c9962c; box-shadow:0 0 0 3px rgba(201,150,44,.13); }
      .bh-card.bh-lost .bh-pill{ background:#eeeef1; color:#656774; border:1px solid #d8d8df; }
      .bh-card.bh-lost .bh-return-won{ color:#747681!important; }
      .bh-card.bh-cashed{ border-color:#c4d8ec; }
      .bh-card.bh-cashed::before{ background:linear-gradient(#4f91c9,#9ac3e5); }
	      .bh-card.bh-cashed .bh-return-won{ color:#2877ad!important; }

	      /* Final history-card cleanup: action in header, no side stripe, clear win/loss surfaces. */
	      .bh-card::before{ display:none!important; }
	      .bh-card.bh-won{ border:1px solid #9bd8ad!important; }
	      .bh-card.bh-lost{ border:1px solid #efb0b4!important; }
	      .bh-card.bh-won .bh-card-top{ padding-right:16px!important; }
	      .bh-card.bh-won .bh-won-badge{ display:none; }
	      .bh-card .bh-totals .bh-payout-row,
	      .bh-card.bh-won .bh-totals .bh-payout-row{
	        background:#dcfce7!important;
	        border-color:#86c99a!important;
	        box-shadow:0 4px 12px rgba(34,139,70,.12);
	      }
	      .bh-card .bh-totals .bh-payout-row span,
	      .bh-card .bh-totals .bh-payout-row b,
	      .bh-card.bh-won .bh-totals .bh-payout-row span,
	      .bh-card.bh-won .bh-totals .bh-payout-row b{
	        color:#14532d!important;
	        opacity:1!important;
	        visibility:visible!important;
	        text-shadow:none!important;
	      }
	      .bh-card .bh-totals .bh-payout-row span{ font-weight:900!important; }
	      .bh-card .bh-totals .bh-payout-row b{ font-size:1rem!important; font-weight:900!important; }

	      @media(max-width:560px){ .bh-card-head{ padding:10px 13px; } .bh-card-body{ padding:12px 13px 14px; } .bh-totals .bh-payout-row{ padding:10px 11px; } .bh-totals .bh-payout-row b{ max-width:64%; font-size:.94rem; } }
    `}</style>
  );
}
