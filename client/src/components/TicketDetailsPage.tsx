import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft, Headphones, Home, Trophy, CheckCircle2 } from "lucide-react";
import api, { ApiError, type Bet, type Match } from "@/lib/api";
import TrophyCelebration from "./TrophyCelebration";

const HIDDEN_TICKETS_KEY = "powerbet_hidden_tickets";

function hideTicket(id: string) {
  try {
    const list = JSON.parse(localStorage.getItem(HIDDEN_TICKETS_KEY) || "[]") as string[];
    if (!list.includes(id)) list.push(id);
    localStorage.setItem(HIDDEN_TICKETS_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

function verifyCode(bet: Bet): string {
  const raw = bet.id.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return `GH${raw.slice(0, 4)}${raw.slice(-6)}`;
}

type RawScoredMatch = Match & {
  finalScoreHome?: number | string;
  finalScoreAway?: number | string;
  score_home?: number | string;
  score_away?: number | string;
  homeScore?: number | string;
  awayScore?: number | string;
  match?: Match;
};

function scoreNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function formatTicketKickoff(kickoffAt?: string): string {
  if (!kickoffAt) return "";
  const kickoff = new Date(kickoffAt);
  if (Number.isNaN(kickoff.getTime())) return "";
  return `Starts ${kickoff.toLocaleDateString(undefined, { day: "2-digit", month: "short" })}, ${kickoff.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

/** Finished-result feeds carry the authoritative FT score, even when the
 * individual ticket/slip response does not include it. */
function normalizeFinishedScore(raw: unknown): Match | null {
  if (!raw || typeof raw !== "object") return null;
  const outer = raw as RawScoredMatch;
  const source = outer.match && typeof outer.match === "object" ? outer.match as RawScoredMatch : outer;
  const home = scoreNumber(source.scoreHome ?? source.score_home ?? source.homeScore ?? source.finalScoreHome);
  const away = scoreNumber(source.scoreAway ?? source.score_away ?? source.awayScore ?? source.finalScoreAway);
  if (home == null || away == null || !source.id) return null;
  return { ...source, scoreHome: home, scoreAway: away } as Match;
}

async function loadTicketMatchScores(ids: string[]): Promise<Record<string, Match>> {
  const byId: Record<string, Match> = {};
  const direct = await Promise.allSettled(ids.map(async (matchId) => {
    try { return await api.matches.getById(matchId); }
    catch { return api.adminMatches.getById(matchId); }
  }));
  direct.forEach((result, index) => {
    if (result.status === "fulfilled") {
      const match = normalizeFinishedScore(result.value) ?? result.value;
      byId[ids[index]] = match;
    }
  });

  const missing = ids.filter((matchId) => {
    const match = byId[matchId];
    return !match || match.scoreHome == null || match.scoreAway == null;
  });
  if (!missing.length) return byId;

  // Reuse the same finished/results feeds that populate Bet History. These
  // feeds contain the final score after the match endpoint has stopped
  // returning live fields or the slip response omits them entirely.
  const feeds = await Promise.allSettled([
    api.matches.results(100),
    api.publicFootball.results(100),
    api.publicBasketball.results(100),
    api.publicTennis.results(100),
    api.publicBaseball.results(100),
    api.publicNfl.results(),
    api.publicMma.results(100),
  ]);
  const finishedById = new Map<string, Match>();
  feeds.forEach((feed) => {
    if (feed.status !== "fulfilled" || !Array.isArray(feed.value)) return;
    feed.value.forEach((raw) => {
      const scored = normalizeFinishedScore(raw);
      if (scored) finishedById.set(String(scored.id), scored);
    });
  });
  missing.forEach((matchId) => {
    const scored = finishedById.get(String(matchId));
    if (scored) byId[matchId] = { ...(byId[matchId] ?? scored), scoreHome: scored.scoreHome, scoreAway: scored.scoreAway, status: scored.status ?? byId[matchId]?.status };
  });
  return byId;
}

const STATUS_TONE: Record<Bet["status"], string> = {
  PENDING: "td-pending", WON: "td-won", LOST: "td-lost", VOID: "td-void", CASHED_OUT: "td-cashed",
};
const STATUS_LABEL: Record<Bet["status"], string> = {
  PENDING: "Pending", WON: "Won", LOST: "Lost", VOID: "Void", CASHED_OUT: "Cashed Out",
};

export default function TicketDetailsPage({ id }: { id: string }) {
  const [, setLocation] = useLocation();
  const [bet, setBet] = useState<Bet | null>(null);
  const [matches, setMatchesById] = useState<Record<string, Match>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showTrophy, setShowTrophy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api.bets.getOne(id)
      .then(async (b) => {
        if (cancelled) return;
        setBet(b);
        // The Bet.selections payload itself doesn't carry the final score.
        const ids = Array.from(new Set(b.selections.map((s) => s.matchId).filter(Boolean)));
        if (cancelled) return;
        const byId = await loadTicketMatchScores(ids);
        if (cancelled) return;
        setMatchesById(byId);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof ApiError ? e.message : "This ticket could not be loaded."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const deleteTicket = () => {
    if (!bet) return;
    if (!window.confirm("Remove this ticket from your history? This only hides it on this device.")) return;
    setDeleting(true);
    hideTicket(bet.id);
    setLocation("/bets");
  };

  return (
    <div className="td-page">
      <TicketDetailsStyles />
      <header className="td-header">
        <button type="button" className="td-header-btn" onClick={() => setLocation("/bets")} aria-label="Back">
          <ChevronLeft size={20} />
        </button>
        <h1>Ticket Details</h1>
        <div className="td-header-right">
          <Link href="/support" className="td-header-btn" aria-label="Support"><Headphones size={18} /></Link>
          <Link href="/" className="td-header-btn" aria-label="Home"><Home size={18} /></Link>
        </div>
      </header>

      {loading ? (
        <p className="muted td-pad">Loading ticket…</p>
      ) : error || !bet ? (
        <div className="td-pad">
          <p className="muted">{error || "Ticket not found."}</p>
          <Link href="/bets" className="gold-button" style={{ marginTop: 12, display: "inline-flex" }}>Back to bet history</Link>
        </div>
      ) : (
        <>
          <section className="td-summary">
            <div className="td-summary-top">
              <span className="td-ticket-id">Ticket ID: {bet.id.slice(0, 8).toUpperCase()}</span>
              <span className="td-date">{new Date(bet.placedAt).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div className="td-summary-row">
              <span className="td-kind">{bet.selections.length > 1 ? "Multiple" : "Singles"}</span>
              <span className={`td-status ${STATUS_TONE[bet.status]}`}>
                {bet.status === "WON" && <Trophy size={14} />} {STATUS_LABEL[bet.status]}
              </span>
            </div>
            <div className="td-stat"><span>Total Return</span><b className={bet.status === "WON" || bet.status === "CASHED_OUT" ? "td-return-won" : ""}>{(bet.status === "WON" || bet.status === "CASHED_OUT" ? bet.potentialReturn : 0).toFixed(2)}</b></div>
            <div className="td-stat"><span>Total Stake</span><b>GHS {bet.stake.toFixed(2)}</b></div>
            <div className="td-stat"><span>Total Odds</span><b>{bet.totalOdds.toFixed(2)}</b></div>
            <div className="td-verify-strip">Verify Code: <b>{verifyCode(bet)}</b></div>
            {bet.status === "WON" && (
              <div className="td-win-banner">
                <div className="td-win-message"><Trophy size={18} /><span>Congratulations! You are<br /><b>Amazing!</b></span></div>
                <button type="button" className="td-trophy-btn" onClick={() => setShowTrophy(true)} aria-label="View winning trophy">Show Off</button>
              </div>
            )}
          </section>

          <section className="td-legs">
            {bet.selections.map((s, i) => {
              const match = matches[s.matchId];
              const home = s.homeTeam ?? match?.homeTeam ?? "Home";
              const away = s.awayTeam ?? match?.awayTeam ?? "Away";
              const ftScore = match && match.scoreHome != null && match.scoreAway != null ? `FT ${match.scoreHome}-${match.scoreAway}` : "FT —";
              const won = s.result ? s.result.toLowerCase() === "won" || s.result.toLowerCase() === "win" : bet.status === "WON";
              return (
                <div className="td-leg-card" key={s.id ?? i}>
                  <div className="td-leg-top">
                    {won && <CheckCircle2 size={18} className="td-leg-check" />}
                    <div>
                      <div className="td-leg-teams">{home} <span>v</span> {away}</div>
                      <div className="td-leg-game-id">Game ID: {s.matchId?.slice(0, 8) ?? "—"}</div>
                      {formatTicketKickoff(match?.kickoffAt) && <div className="td-leg-kickoff">{formatTicketKickoff(match?.kickoffAt)}</div>}
                    </div>
                  </div>
                  <div className={`td-leg-pick ${won ? "td-pick-won" : ""}`}>
                    <div className="td-leg-row"><span>Pick</span><b>{s.selection} @ {s.oddsLocked?.toFixed(2)} {won && "✓"}</b></div>
                    <div className="td-leg-row"><span>Market</span><b>{s.market}</b></div>
                    <div className="td-leg-row"><span>FT Score</span><b>{ftScore}</b></div>
                    <div className="td-leg-row"><span>Outcome</span><b>{s.result ?? (match && match.scoreHome != null && match.scoreAway != null ? ftScore : "—")}</b></div>
                  </div>
                </div>
              );
            })}
          </section>

          <button type="button" className="td-delete" onClick={deleteTicket} disabled={deleting}>Delete Ticket</button>
        </>
      )}

      {showTrophy && bet && <TrophyCelebration bet={bet} onClose={() => setShowTrophy(false)} />}
    </div>
  );
}

function TicketDetailsStyles() {
  return (
    <style>{`
      :root{ --td-blue:#1e6bff; --td-blue-deep:#1246a8; --td-line:#dfe7f3; --td-muted:#71809a; }
      .td-page{ min-height:100vh; background:#f7faff; padding-bottom:40px; }
      .td-pad{ padding:24px 18px; color:rgba(255,255,255,.6); }
      .td-header{
        display:flex; align-items:center; justify-content:space-between; padding:16px 12px;
        background:linear-gradient(120deg,var(--td-blue-deep),var(--td-blue)); color:#fff;
      }
      .td-header h1{ font:800 16px 'DM Sans',sans-serif; margin:0; }
      .td-header-right{ display:flex; gap:6px; }
      .td-header-btn{
        width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center;
        background:rgba(255,255,255,.16); color:#fff; cursor:pointer; border:none;
      }

      .td-summary{ margin:14px 12px; border:1px solid var(--td-line); border-radius:14px; background:#fff; color:#20242d; overflow:hidden; box-shadow:none; }
      .td-summary-top{ display:flex; justify-content:space-between; font-size:.7rem; color:var(--td-muted); padding:12px 16px 8px; }
      .td-summary-row{ display:flex; align-items:center; justify-content:space-between; padding:0 16px 10px; }
      .td-kind{ font:800 17px 'DM Sans',sans-serif; }
      .td-status{ display:flex; align-items:center; gap:4px; font-size:.8rem; font-weight:800; text-transform:uppercase; letter-spacing:.03em; }
      .td-status.td-won{ color:var(--td-blue); }.td-status.td-lost,.td-status.td-void{ color:var(--td-muted); }.td-status.td-pending{ color:#8a6100; }.td-status.td-cashed{ color:#16854b; }

      .td-stat{ display:flex; align-items:center; justify-content:space-between; padding:6px 16px; font-size:.82rem; color:var(--td-muted); }.td-stat b{ color:#20242d; font-size:.94rem; }.td-return-won{ color:var(--td-blue) !important; font-size:1.2rem !important; font-weight:800; }
      .td-verify-strip{
        margin-top:8px; padding:12px 16px; font-size:.76rem; color:var(--td-muted); background:#f7faff; border-top:1px solid var(--td-line);
      }
      .td-verify-strip b{ color:var(--td-blue-deep); letter-spacing:.03em; }
      .td-trophy-btn{
        display:flex; align-items:center; justify-content:center; gap:7px; width:calc(100% - 32px); margin:12px 16px 16px;
        padding:12px 10px; border-radius:10px; background:#eaf2ff; border:1px solid #cbd9ec; color:var(--td-blue-deep); font-size:.8rem; font-weight:800; cursor:pointer;
      }

      .td-legs{ display:flex; flex-direction:column; gap:10px; margin:0 12px; }
      .td-leg-card{ border-radius:12px; background:#fff; padding:14px 16px; color:#20242d; box-shadow:none; border:1px solid var(--td-line); }
      .td-leg-top{ display:flex; align-items:flex-start; gap:8px; margin-bottom:10px; }
      .td-leg-check{ color:var(--td-blue); flex-shrink:0; margin-top:2px; }
      .td-leg-teams{ font:700 14px 'DM Sans',sans-serif; margin-bottom:2px; }
      .td-leg-teams span{ color:var(--td-muted); font-weight:500; margin:0 4px; }.td-leg-game-id{ font-size:.68rem; color:var(--td-muted); }.td-leg-kickoff{ margin-top:4px; color:#c9962c; font-size:.7rem; font-weight:800; }.td-leg-pick{ background:#f7faff; border:1px solid var(--td-line); border-radius:10px; padding:10px 12px; }.td-leg-pick.td-pick-won{ background:#eaf2ff; }.td-leg-row{ display:flex; align-items:center; justify-content:space-between; padding:4px 0; font-size:.76rem; color:var(--td-muted); }.td-leg-row b{ color:#20242d; font-weight:700; }.td-pick-won .td-leg-row:first-child b{ color:var(--td-blue-deep); }

      /* Reference-matched winning ticket treatment: blue summary, dark celebration strip, gold action. */
      .td-summary{ margin:0 0 14px; border:0; border-radius:0; background:linear-gradient(160deg,#273ee4 0%,#2236d5 72%,#1829ae 100%); color:#fff; box-shadow:0 8px 18px rgba(20,45,150,.16); }
      .td-summary-top{ color:rgba(255,255,255,.72); padding:12px 14px 7px; }
      .td-summary-row{ padding:0 14px 9px; }
      .td-kind{ color:#fff; font-size:19px; }
      .td-status{ color:#fff!important; text-transform:none; font-size:.82rem; }
      .td-stat{ padding:5px 14px; color:rgba(255,255,255,.76); border-top:0; font-size:.78rem; }
      .td-stat b{ color:#fff; font-size:.84rem; }
      .td-return-won{ color:#44e6a0!important; font-size:1.28rem!important; }
      .td-verify-strip{ margin-top:8px; padding:10px 14px; color:rgba(255,255,255,.72); background:rgba(9,18,108,.26); border-top:1px solid rgba(255,255,255,.14); }
      .td-verify-strip b{ color:#fff; }
      .td-win-banner{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:0; padding:10px 14px; background:#151515; color:#fff; }
      .td-win-message{ display:flex; align-items:center; gap:9px; font-size:.72rem; line-height:1.25; }
      .td-win-message svg{ color:#ffd24a; flex:none; }
      .td-win-message b{ color:#fff; }
      .td-win-banner .td-trophy-btn{ width:auto; min-width:78px; margin:0; padding:9px 12px; border:0; border-radius:8px; background:#ffb51b; color:#241800; font-size:.72rem; font-weight:900; }
      .td-win-banner .td-trophy-btn:hover{ background:#ffc743; transform:none; }
      .td-leg-card{ border-radius:12px; background:#fff; padding:14px 14px; border:1px solid var(--td-line); box-shadow:0 2px 8px rgba(24,51,110,.04); }
      .td-leg-check{ color:#26a968; }
      .td-pick-won .td-leg-row:first-child b{ color:#16854b; }
      @media(max-width:520px){.td-summary-top{font-size:.66rem}.td-stat{font-size:.76rem}.td-stat b{font-size:.82rem}.td-win-message{font-size:.7rem}.td-win-banner .td-trophy-btn{min-width:76px;padding:9px 10px}}

      .td-delete{
        display:block; width:calc(100% - 24px); margin:20px 12px 0; padding:13px; border-radius:10px;
        background:transparent; color:#1e6bff; font-size:.82rem; font-weight:800; cursor:pointer; border:none;
      }
      .td-delete:disabled{ opacity:.5; cursor:default; }
    `}</style>
  );
}
