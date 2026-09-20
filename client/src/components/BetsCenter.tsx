import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  CalendarDays, ChevronDown, ChevronRight, Clock3, Info, RefreshCw, Share2, Trash2, Trophy, X,
} from "lucide-react";
import api, { ApiError, type Bet, type Match } from "@/lib/api";

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
    <div className="bh-card" onClick={() => setLocation(`/bets/${bet.id}`)} role="button" tabIndex={0}>
      <div className="bh-card-top">
        <span className="bh-type">{isMultiple ? "Multiple" : "Singles"} <em>· {bet.selections.length} pick{bet.selections.length !== 1 ? "s" : ""}</em></span>
        <span className={`bh-pill ${STATUS_CLASS[bet.status]}`}>{won && <Trophy size={12} />} {STATUS_LABEL[bet.status]}</span>
      </div>
      <div className="bh-card-body">
        <div className="bh-totals">
          <div><span>Stake</span><b>GHS {bet.stake.toFixed(2)}</b></div>
          <div><span>Odds</span><b>{bet.totalOdds.toFixed(2)}×</b></div>
          <div><span>Return</span><b className={won ? "bh-return-won" : ""}>GHS {totalReturn.toFixed(2)}</b></div>
        </div>
        <div className="bh-matches">
          {visible.map((s, i) => (
            <div className="bh-match" key={s.id ?? i}><span className="bh-dot" />{matchLine(s)}</div>
          ))}
          {rest > 0 && <div className="bh-more">…and {rest} other match{rest > 1 ? "es" : ""}</div>}
        </div>
        <div className="bh-card-foot">
          <span>View ticket</span><ChevronRight size={14} />
        </div>
      </div>
    </div>
  );
}

/* ── Open-bet card: pending, cashout is UI-only (no backend cashout endpoint exists) ── */
function OpenBetCard({ bet }: { bet: Bet }) {
  const [expanded, setExpanded] = useState(true);
  const isMultiple = bet.selections.length > 1;

  return (
    <div className="bh-card">
      <div className="bh-card-head bh-open-head">
        <span>{isMultiple ? "Multiple" : "Singles"}</span>
        <button type="button" className="bh-share" onClick={() => navigator.clipboard?.writeText(`${bet.id}`).catch(() => undefined)} aria-label="Share">
          <Share2 size={14} />
        </button>
      </div>
      <div className="bh-card-body">
        {expanded && (
          <div className="bh-legs">
            {bet.selections.map((s, i) => (
              <div className="bh-leg" key={s.id ?? i}>
                <span className="bh-leg-check">✓</span>
                <div className="bh-leg-info">
                  <b>{s.selection} @ {s.oddsLocked?.toFixed(2)}</b>
                  <small>{s.market}</small>
                  <small className="bh-leg-teams">{s.homeTeam ?? "Home"} vs {s.awayTeam ?? "Away"}</small>
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
        <button type="button" className="bh-cashout-btn" disabled title="Cashout isn't available yet">
          Cashout Unavailable
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
  const [matchScores, setMatchScores] = useState<Record<string, Match>>({});
  const hiddenTickets = useMemo(readHiddenTickets, []);

  useEffect(() => { setTab(defaultTab); }, [defaultTab]);

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

  const openBets = useMemo(() => bets.filter((b) => b.status === "PENDING"), [bets]);
  const settledBets = useMemo(() => bets.filter((b) => b.status !== "PENDING"), [bets]);

  // Enrich settled tickets with real previous-match scores from the match
  // list (api.matches.getById) — Bet.selections only carries the matchId,
  // not the final score, so this is the "reference the match list" lookup
  // the history cards need for their FT score.
  useEffect(() => {
    const ids = Array.from(new Set(settledBets.flatMap((b) => b.selections.map((s) => s.matchId)).filter(Boolean)));
    const missing = ids.filter((mid) => !(mid in matchScores));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.allSettled(missing.map((mid) => api.matches.getById(mid))).then((results) => {
      if (cancelled) return;
      setMatchScores((prev) => {
        const next = { ...prev };
        results.forEach((r, i) => { if (r.status === "fulfilled") next[missing[i]] = r.value; });
        return next;
      });
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledBets]);

  const filteredSettled = useMemo(() => {
    let list = settledBets;
    if (statusFilter !== "ALL") list = list.filter((b) => b.status === statusFilter);
    if (resultFilter === "WIN") list = list.filter((b) => b.status === "WON" || b.status === "CASHED_OUT");
    if (resultFilter === "LOSS") list = list.filter((b) => b.status === "LOST");
    return list;
  }, [settledBets, statusFilter, resultFilter]);

  // "Cashout Available" / "Live Games" are UI-only groupings — there is no
  // cashout or live-match feed wired into the Bet type yet, so both simply
  // show nothing until that data exists rather than fake a number.
  const filteredOpen = useMemo(() => {
    if (openSubFilter === "all") return openBets;
    return [];
  }, [openBets, openSubFilter]);

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
              {filteredOpen.map((bet) => <OpenBetCard key={bet.id} bet={bet} />)}
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
      .bh-totals{ display:grid; grid-template-columns:repeat(3,1fr); gap:6px; padding-bottom:12px; margin-bottom:12px; border-bottom:1px dashed var(--line); }
      .bh-totals div{ display:flex; flex-direction:column; gap:3px; }
      .bh-totals span{ font-size:.62rem; color:#8b8b8b; text-transform:uppercase; letter-spacing:.04em; }
      .bh-totals b{ font-size:.86rem; color:#F4F1F0; }
      .bh-return-won{ color:var(--nature); }

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
      .bh-leg-teams{ margin-top:1px; }
      .bh-toggle-details{ color:var(--nature); font-size:.72rem; font-weight:800; cursor:pointer; }
      .bh-cashout-btn{ width:100%; padding:13px; border-radius:10px; background:rgba(30,107,255); color:rgba(30,107,255); font-size:.8rem; font-weight:800; cursor:not-allowed; }

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

      @media(max-width:560px){ .bh-card-head{ padding:10px 13px; } .bh-card-body{ padding:12px 13px 14px; } }
    `}</style>
  );
}
