import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CalendarDays, ChevronDown, Clock3, RefreshCw } from "lucide-react";
import api, { ApiError, type Bet } from "@/lib/api";
import type { Pick } from "./Sportsbook";

const STATUS_LABEL: Record<Bet["status"], string> = {
  PENDING: "Pending", WON: "Won", LOST: "Lost", VOID: "Void", CASHED_OUT: "Cashed Out",
};
const STATUS_CLASS: Record<Bet["status"], string> = {
  PENDING: "bh-pending", WON: "bh-won", LOST: "bh-lost", VOID: "bh-void", CASHED_OUT: "bh-cashed",
};

const STATUS_FILTERS: { value: "ALL" | Bet["status"]; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
  { value: "CASHED_OUT", label: "Cashed Out" },
  { value: "VOID", label: "Void" },
];

function dayKey(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

function dayLabel(key: string): { day: string; mon: string } {
  const d = new Date(`${key}T00:00:00`);
  return { day: d.toLocaleDateString(undefined, { day: "2-digit" }), mon: d.toLocaleDateString(undefined, { month: "short" }) };
}

function BetCard({ bet, onRemix }: { bet: Bet; onRemix: (bet: Bet) => void }) {
  const isMultiple = bet.selections.length > 1;
  // "Total Return" only reads as non-zero once the bet has actually settled
  // in the bettor's favour — otherwise it mirrors the sportsbook convention
  // of showing 0.00 while pending/lost, exactly like the reference UI.
  const totalReturn = bet.status === "WON" || bet.status === "CASHED_OUT" ? bet.potentialReturn : 0;

  return (
    <div className="bh-card">
      <div className={`bh-card-head ${STATUS_CLASS[bet.status]}`}>
        <span>{isMultiple ? "Multiple" : "Singles"}</span>
        <span className="bh-status-badge">{STATUS_LABEL[bet.status]}</span>
      </div>
      <div className="bh-card-body">
        <div className="bh-ticket-meta"><span>Ticket #{bet.id.slice(0, 10).toUpperCase()}</span><span>{new Date(bet.placedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span></div>
        <div className="bh-totals">
          <div><span>Total Stake (GHS)</span><b>{bet.stake.toFixed(2)}</b></div>
          <div><span>{bet.status === "WON" || bet.status === "CASHED_OUT" ? "Winnings" : "Potential return"}</span><b>{totalReturn.toFixed(2)}</b></div>
          <div><span>Total Odds</span><b>{bet.totalOdds.toFixed(2)}</b></div>
        </div>
        <div className="bh-selections">
          {bet.selections.map((s, i) => {
            const result = s.result ?? (bet.status === "WON" ? "Won" : bet.status === "LOST" ? "Lost" : STATUS_LABEL[bet.status]);
            return <div className="bh-selection" key={s.id ?? i}>
              <div className="bh-selection-main"><small>Sport · {s.market}</small><b>{s.homeTeam && s.awayTeam ? `${s.homeTeam} v ${s.awayTeam}` : s.market}</b><span>{s.selection}</span></div>
              <div className="bh-selection-side"><b>{s.oddsLocked.toFixed(2)}</b><span className={`bh-result ${STATUS_CLASS[bet.status]}`}>{result}</span></div>
            </div>;
          })}
        </div>
        <div className="bh-card-foot">
          <small>{bet.settledAt ? `Settled ${new Date(bet.settledAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : "Awaiting settlement"}</small>
          <button type="button" className="bh-remix" onClick={() => onRemix(bet)}>Remix Bet</button>
        </div>
      </div>
    </div>
  );
}

export default function BetHistoryCenter({ onRemix }: { onRemix?: (picks: Pick[]) => void }) {
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | Bet["status"]>("ALL");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const page = await api.bets.getMine(0, 20);
      setBets(page.content ?? []);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? "Sign in to view your bet history." : "Bet history is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () => (statusFilter === "ALL" ? bets : bets.filter((b) => b.status === statusFilter)),
    [bets, statusFilter],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Bet[]>();
    for (const b of filtered) {
      const key = dayKey(b.placedAt);
      const list = map.get(key) ?? [];
      list.push(b);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  const remix = (bet: Bet) => {
    if (!onRemix) return;
    const picks: Pick[] = bet.selections.map((s) => ({
      id: s.matchId, match: s.homeTeam && s.awayTeam ? `${s.homeTeam} vs ${s.awayTeam}` : s.market,
      market: s.market, selection: s.selection, odd: s.oddsLocked, homeTeam: s.homeTeam, awayTeam: s.awayTeam,
    }));
    onRemix(picks);
  };

  return (
    <section className="panel simple-card bh-panel" style={{ gridColumn: "1 / -1" }}>
      <BetHistoryStyles />
      <div className="module-title">
        <h3>Your betting history</h3>
        <button className="text-action" onClick={load} type="button"><RefreshCw size={12} /> Refresh</button>
      </div>

      {!loading && !error && bets.length > 0 && (
        <div className="bh-filters">
          <label className="bh-filter">
            <ChevronDown size={13} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "ALL" | Bet["status"])}>
              {STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>
        </div>
      )}

      {loading ? (
        <p className="muted">Loading bets…</p>
      ) : error ? (
        <>
          <p className="muted">{error}</p>
          <Link href="/login" className="gold-button" style={{ marginTop: 12, display: "inline-flex" }}>Sign in</Link>
        </>
      ) : filtered.length === 0 ? (
        <>
          <Clock3 size={24} />
          <p className="muted">{bets.length === 0 ? "Placed bets and settlement activity will appear here once you place a wager." : "No bets match this filter."}</p>
          {bets.length === 0 && <Link href="/" className="gold-button" style={{ marginTop: 12, display: "inline-flex" }}>Browse matches</Link>}
        </>
      ) : (
        <div className="bh-days">
          {grouped.map(([key, dayBets]) => {
            const { day, mon } = dayLabel(key);
            return (
              <div className="bh-day" key={key}>
                <div className="bh-day-label"><CalendarDays size={13} /><span>{mon}</span><b>{day}</b></div>
                <div className="bh-day-cards">
                  {dayBets.map((bet) => <BetCard key={bet.id} bet={bet} onRemix={remix} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function BetHistoryStyles() {
  return (
    <style>{`
      .bh-filters{ display:flex; gap:8px; margin:14px 0 4px; }
      .bh-filter{ display:flex; align-items:center; gap:6px; padding:8px 12px; border-radius:8px; border:1px solid var(--line); background:#141414; }
      .bh-filter select{ border:0; background:transparent; font-size:.76rem; font-weight:700; color:#F4F1F0; outline:0; }

      .bh-days{ display:flex; flex-direction:column; gap:18px; margin-top:16px; }
      .bh-day-label{ display:flex; align-items:center; gap:6px; color:#8b8b8b; font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.05em; margin-bottom:8px; }
      .bh-day-label b{ color:#F4F1F0; font-size:.82rem; }
      .bh-day-cards{ display:flex; flex-direction:column; gap:10px; }

      .bh-card{ border:1px solid #dfe7f3; border-radius:12px; overflow:hidden; background:#fff; box-shadow:none; }
      .bh-card-head{ display:flex; align-items:center; justify-content:space-between; padding:10px 14px; font-size:.72rem; font-weight:800; color:#1246a8; background:#eaf2ff; border-bottom:1px solid #cbd9ec; }
      .bh-card-head.bh-won,.bh-card-head.bh-cashed{ background:#e4f7ed; color:#16854b; }.bh-card-head.bh-lost,.bh-card-head.bh-void{ background:#eef2f7; color:#52647d; }.bh-card-head.bh-pending{ background:#fff8e6; color:#8a6100; }
      .bh-status-badge{ text-transform:uppercase; letter-spacing:.04em; }

      .bh-card-body{ padding:12px 14px 14px; color:#20242d; }.bh-ticket-meta{display:flex;justify-content:space-between;gap:10px;margin-bottom:10px;color:#71809a;font-size:.68rem}.bh-totals{ display:flex; gap:22px; padding-bottom:10px; margin-bottom:10px; border-bottom:1px dashed #dfe7f3; }
      .bh-totals div{ display:flex; flex-direction:column; gap:3px; }
      .bh-totals span{ font-size:.64rem; color:#71809a; text-transform:uppercase; letter-spacing:.04em; }.bh-totals b{ font-size:.9rem; color:#20242d; }

      .bh-selections{display:flex;flex-direction:column;gap:7px;margin-bottom:12px}.bh-selection{display:flex;justify-content:space-between;gap:12px;padding:9px 10px;border:1px solid #dfe7f3;border-radius:9px;background:#f7faff}.bh-selection-main{display:flex;flex-direction:column;gap:3px;min-width:0}.bh-selection-main small{color:#71809a;font-size:.63rem}.bh-selection-main b{color:#20242d;font-size:.75rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bh-selection-main span{color:#52647d;font-size:.7rem}.bh-selection-side{display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0}.bh-selection-side>b{color:#1246a8;font-size:.76rem}.bh-result{font-size:.62rem;font-weight:800;text-transform:uppercase}.bh-result.bh-won,.bh-result.bh-cashed{color:#16854b}.bh-result.bh-lost,.bh-result.bh-void{color:#52647d}.bh-result.bh-pending{color:#8a6100}

      .bh-card-foot{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
      .bh-card-foot small{ color:#71809a; font-size:.68rem; }
      .bh-remix{
        display:inline-flex; align-items:center; padding:8px 14px; border-radius:8px; background:#1e6bff;
        color:#fff; font-size:.72rem; font-weight:800; cursor:pointer;
      }
    `}</style>
  );
}
