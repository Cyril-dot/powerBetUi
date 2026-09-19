import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Radio, Star } from "lucide-react";
import { fetchMatchDetail, fetchMatchAllOdds, formatKickoff, isBettableMatchId, isMatchLive, normalizeSportKey, parseKickoff, type AllMatchOdds, type MatchDetail, type OddsGroup, type SportKey } from "@/lib/sportsbook";
import { TeamCrest, LiveClock } from "./Sportsbook";
import { useFavorites } from "@/lib/favorites";
import type { Pick } from "./Sportsbook";

function Countdown({ kickoffAt }: { kickoffAt?: string }) {
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  if (!kickoffAt) return null;
  const diff = parseKickoff(kickoffAt).getTime() - Date.now();
  if (Number.isNaN(diff) || diff <= 0) return <span className="md-countdown">Starting soon</span>;
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  const secs = Math.floor((diff % 60_000) / 1000);
  return <span className="md-countdown">Starts in {days > 0 ? `${days}d ${hours}h` : `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`}</span>;
}

/** Generic simple-options grid — used for Half Time and any other market
 * that's just a flat list of selections (not the paired-line handicap shape
 * or the score-grid shape). */
function MarketGroup({
  group, market, matchId, picks, onPick, clickable, homeTeam, awayTeam,
}: {
  group: OddsGroup; market: string; matchId: string; picks: Pick[]; onPick: (p: Pick) => void;
  clickable: boolean; homeTeam?: string; awayTeam?: string;
}) {
  const isSel = (sel: string) => picks.some((p) => p.id === matchId && p.market === market && p.selection === sel);
  const pick = (sel: string, odd: number) => {
    if (!clickable || !odd || odd <= 0) return;
    onPick({ id: matchId, match: `${homeTeam ?? ""} vs ${awayTeam ?? ""}`, market, selection: sel, odd, homeTeam, awayTeam });
  };
  return (
    <div className="md-market-section">
      <div className="md-market-title">{group.market.replace(/_/g, " ")}</div>
      <div className={`md-odds-row${group.options.length > 3 ? " md-odds-wrap" : ""}`}>
        {group.options.map((opt) => (
          <button
            key={opt.label}
            className={`sb-odd md-odd${isSel(opt.label) ? " sel" : ""}${!clickable ? " display-only" : ""}${opt.odd <= 0 ? " empty" : ""}`}
            onClick={() => pick(opt.label, opt.odd)}
            disabled={!clickable || opt.odd <= 0}
            type="button"
          >
            <span>{opt.label}</span>
            <b>{opt.odd > 0 ? opt.odd.toFixed(2) : "—"}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Correct Score — grouped into Home win / Draw / Away win buckets, each
 * sorted by total goals, matching how bettors expect to scan this market. */
function CorrectScoreSection({
  groups, matchId, picks, onPick, clickable, homeTeam, awayTeam,
}: {
  groups: OddsGroup[]; matchId: string; picks: Pick[]; onPick: (p: Pick) => void;
  clickable: boolean; homeTeam?: string; awayTeam?: string;
}) {
  const market = groups[0]?.market ?? "correct_score";
  const scores = useMemo(() => {
    const all = groups.flatMap((g) => g.options);
    const map = new Map<string, number>();
    for (const o of all) {
      const existing = map.get(o.label);
      if (existing === undefined || o.odd < existing) map.set(o.label, o.odd);
    }
    const parseScore = (s: string) => { const m = s.match(/(\d+)[:\-](\d+)/); return m ? { h: parseInt(m[1]), a: parseInt(m[2]) } : null; };
    return Array.from(map.entries()).map(([label, odd]) => ({ label, odd })).sort((a, b) => {
      const am = parseScore(a.label), bm = parseScore(b.label);
      if (!am || !bm) return a.label.localeCompare(b.label);
      const atype = am.h > am.a ? 0 : am.h === am.a ? 1 : 2;
      const btype = bm.h > bm.a ? 0 : bm.h === bm.a ? 1 : 2;
      if (atype !== btype) return atype - btype;
      return (am.h + am.a) - (bm.h + bm.a);
    });
  }, [groups]);

  const isSel = (sel: string) => picks.some((p) => p.id === matchId && p.market === market && p.selection === sel);
  const pick = (sel: string, odd: number) => {
    if (!clickable || !odd || odd <= 0) return;
    onPick({ id: matchId, match: `${homeTeam ?? ""} vs ${awayTeam ?? ""}`, market, selection: sel, odd, homeTeam, awayTeam });
  };

  const parseScore = (s: string) => { const m = s.match(/(\d+)[:\-](\d+)/); return m ? { h: parseInt(m[1]), a: parseInt(m[2]) } : null; };
  const homeWins = scores.filter((s) => { const p = parseScore(s.label); return p && p.h > p.a; });
  const draws = scores.filter((s) => { const p = parseScore(s.label); return p && p.h === p.a; });
  const awayWins = scores.filter((s) => { const p = parseScore(s.label); return p && p.h < p.a; });
  const other = scores.filter((s) => !parseScore(s.label));

  const Group = ({ title, items }: { title: string; items: typeof scores }) => {
    if (!items.length) return null;
    return (
      <div className="md-cs-group">
        <div className="md-cs-head">{title}</div>
        <div className="md-cs-grid">
          {items.map((s) => (
            <button
              key={s.label}
              className={`md-cs-btn${isSel(s.label) ? " sel" : ""}${!clickable ? " display-only" : ""}`}
              onClick={() => pick(s.label, s.odd)}
              disabled={!clickable}
              type="button"
            >
              <span>{s.label}</span>
              <b>{s.odd.toFixed(2)}</b>
            </button>
          ))}
        </div>
      </div>
    );
  };

  if (!scores.length) return null;
  return (
    <div className="md-market-section">
      <div className="md-market-title">Correct Score</div>
      <Group title={`${homeTeam ?? "Home"} win`} items={homeWins} />
      <Group title="Draw" items={draws} />
      <Group title={`${awayTeam ?? "Away"} win`} items={awayWins} />
      <Group title="Other" items={other} />
    </div>
  );
}

/** Handicap / Spread — each line rendered as its own row (team + line +
 * odds) rather than a plain button grid, since the label always carries a
 * "Team (+1.5)" shape that reads better as a row. */
function HandicapSection({
  groups, matchId, picks, onPick, clickable, homeTeam, awayTeam,
}: {
  groups: OddsGroup[]; matchId: string; picks: Pick[]; onPick: (p: Pick) => void;
  clickable: boolean; homeTeam?: string; awayTeam?: string;
}) {
  const isSel = (market: string, sel: string) => picks.some((p) => p.id === matchId && p.market === market && p.selection === sel);
  const pick = (market: string, sel: string, odd: number) => {
    if (!clickable || !odd || odd <= 0) return;
    onPick({ id: matchId, match: `${homeTeam ?? ""} vs ${awayTeam ?? ""}`, market, selection: sel, odd, homeTeam, awayTeam });
  };
  return (
    <div className="md-market-section">
      <div className="md-market-title">Handicap</div>
      {groups.map((group, gi) => (
        <div key={gi} className="md-hc-group">
          <div className="md-hc-line-label">{group.market}</div>
          {group.options.map((opt) => {
            const m = opt.label.match(/^(.+?)\s*\(([^)]+)\)$/);
            const teamName = m ? m[1] : opt.label;
            const line = m ? m[2] : "";
            const selKey = `${opt.label}|${gi}`;
            return (
              <button
                key={opt.label}
                className={`md-hc-row${isSel("handicap", selKey) ? " sel" : ""}${!clickable ? " display-only" : ""}`}
                onClick={() => pick("handicap", selKey, opt.odd)}
                disabled={!clickable}
                type="button"
              >
                <span className="md-hc-team">{teamName}{line && <em>{line}</em>}</span>
                <b>{opt.odd.toFixed(2)}</b>
                </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function MatchDetailsPage({ id, picks, onPick, sportHint, adminHint }: { id: string; picks: Pick[]; onPick: (p: Pick) => void; sportHint?: string; adminHint?: boolean }) {
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [allOdds, setAllOdds] = useState<AllMatchOdds | null>(null);
  const [oddsLoading, setOddsLoading] = useState(false);
  const { has, toggle } = useFavorites();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFound(false);
    setLoadError(false);
    setAllOdds(null);
    const hint = adminHint ? "admin" : (sportHint as SportKey | undefined);
    // Visible (not console.debug, which many browsers hide by default
    // behind a "Verbose" log-level filter) log of exactly which id and
    // hints are about to trigger the match-details lookup, so it's always
    // possible to confirm from the console which id a given /match/:id
    // page URL actually resolved to and sent onward to fetchMatchDetail.
    // eslint-disable-next-line no-console
    console.log("[MatchDetailsPage] TRIGGER fetchMatchDetail", { urlId: id, sportHint, adminHint, resolvedHint: hint });
    fetchMatchDetail(id, hint, adminHint).then((m) => {
      if (!active) return;
      if (!m) {
        // eslint-disable-next-line no-console
        console.log("[MatchDetailsPage] fetchMatchDetail returned null — showing not-found", { urlId: id, sportHint, adminHint });
        setNotFound(true);
        setLoading(false);
        return;
      }
      // eslint-disable-next-line no-console
      console.log("[MatchDetailsPage] match resolved", { urlId: id, resolvedMatchId: m.id, sameId: m.id === id, sport: m.sport, isAdmin: m.isAdmin, status: m.status, oddsMap: m.oddsMap, isSyntheticOdds: m.isSyntheticOdds });
      setMatch(m);
      setLoading(false);
      setOddsLoading(true);
      const sportForOdds: SportKey | "admin" = m.isAdmin ? "admin" : normalizeSportKey(m.sport);
      // This is the id that actually drives the odds lookup — it comes
      // from the RESOLVED match object (m.id), not necessarily the raw
      // URL id, so logging it explicitly here confirms exactly what
      // fetchMatchAllOdds was triggered with.
      // eslint-disable-next-line no-console
      console.log("[MatchDetailsPage] TRIGGER fetchMatchAllOdds", { urlId: id, oddsLookupId: m.id, sportForOdds });
      fetchMatchAllOdds(m.id, sportForOdds).then((odds) => {
        if (!active) return;
        // eslint-disable-next-line no-console
        console.log("[MatchDetailsPage] extra markets loaded", { oddsLookupId: m.id, sportForOdds, odds1x2: odds.odds1x2.length, oddsHalfTime: odds.oddsHalfTime.length, oddsCorrectScore: odds.oddsCorrectScore.length, oddsHandicap: odds.oddsHandicap.length });
        setAllOdds(odds);
        setOddsLoading(false);
      }).catch(() => {
        if (!active) return;
        setOddsLoading(false);
      });
    }).catch(() => {
      if (!active) return;
      setLoadError(true);
      setLoading(false);
    });
    return () => { active = false; };
  }, [id, sportHint, adminHint]);

  if (loading) {
    return (
      <main className="wrap match-details-page">
        <div className="skeleton-block" style={{ width: 160, height: 14, marginBottom: 20 }} />
        <div className="panel simple-card"><p className="muted">Loading match…</p></div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="wrap match-details-page">
        <Link href="/" className="back-link"><ArrowLeft size={14} /> Back to matches</Link>
        <section className="panel simple-card md-state-card" style={{ marginTop: 16 }}>
          <h3>Match details unavailable</h3>
          <p className="muted">We could not load this match right now. Please return to the sportsbook and try again.</p>
          <Link href="/" className="gold-button" style={{ marginTop: 12, display: "inline-flex" }}>Return to sportsbook</Link>
        </section>
      </main>
    );
  }

  if (notFound || !match) {
    return (
      <main className="wrap match-details-page">
        <Link href="/" className="back-link"><ArrowLeft size={14} /> Back to matches</Link>
        <section className="panel simple-card" style={{ marginTop: 16 }}>
          <h3>Match not found</h3>
          <p className="muted">This match may have finished or is no longer available.</p>
          <Link href="/" className="gold-button" style={{ marginTop: 12, display: "inline-flex" }}>Browse matches</Link>
        </section>
      </main>
    );
  }

  const isLive = isMatchLive(match);
  const favored = has("match", match.id);
  const odds = match.oddsMap;
  const matchSportKey = normalizeSportKey(match.sport);
  const hasDraw = matchSportKey !== "basketball" && matchSportKey !== "nfl" && matchSportKey !== "baseball" && matchSportKey !== "mma";
  const clickable = isBettableMatchId(match.id);
  const matchLabel = `${match.homeTeam} vs ${match.awayTeam}`;
  const isSel = (sel: string) => picks.some((p) => p.id === match.id && p.market === "1X2" && p.selection === sel);
  const pick = (sel: string, odd: number) => {
    if (!odd || odd <= 0) return;
    onPick({
      id: match.id, match: matchLabel, market: "1X2", selection: sel, odd,
      league: match.league, homeTeam: match.homeTeam, awayTeam: match.awayTeam,
      kickoffAt: match.kickoffAt, isLive, scoreHome: match.scoreHome, scoreAway: match.scoreAway,
    });
  };

  const slots = hasDraw
    ? [["1", match.homeTeam, odds?.home ?? 0], ["X", "Draw", odds?.draw ?? 0], ["2", match.awayTeam, odds?.away ?? 0]]
    : [["1", match.homeTeam, odds?.home ?? 0], ["2", match.awayTeam, odds?.away ?? 0]];

  return (
    <main className="wrap match-details-page">
      <Link href="/" className="back-link"><ArrowLeft size={14} /> Back to matches</Link>

      <section className="panel md-hero">
        <div className="md-hero-top">
          <span className="md-league">{match.isAdmin && <span className="sb-badge special">SPECIAL</span>} {match.league || match.sport}</span>
          <button className={`sb-fav${favored ? " active" : ""}`} onClick={() => toggle({ kind: "match", id: match.id, label: matchLabel, meta: match.league })} type="button" aria-label="Toggle favorite">
            <Star size={15} fill={favored ? "currentColor" : "none"} />
          </button>
        </div>
        <div className="md-teams">
          <div className={`md-team${isLive && (match.scoreHome ?? 0) > (match.scoreAway ?? 0) ? " winning" : ""}`}>
            <TeamCrest url={match.displayHomeLogo} name={match.homeTeam ?? ""} />
            <span className="md-team-name">{match.homeTeam}</span>
            {isLive && <span className="md-score">{match.scoreHome ?? 0}</span>}
          </div>
          <div className="md-status">
            {isLive ? (
              <span className="md-live"><Radio size={13} /> <LiveClock match={match} /></span>
            ) : (
              <>
                <span className="md-time">{formatKickoff(match.kickoffAt)}</span>
                <Countdown kickoffAt={match.kickoffAt} />
              </>
            )}
          </div>
          <div className={`md-team${isLive && (match.scoreAway ?? 0) > (match.scoreHome ?? 0) ? " winning" : ""}`}>
            <TeamCrest url={match.displayAwayLogo} name={match.awayTeam ?? ""} />
            <span className="md-team-name">{match.awayTeam}</span>
            {isLive && <span className="md-score">{match.scoreAway ?? 0}</span>}
          </div>
        </div>
        {match.isSyntheticOdds && !isLive && <p className="md-synth-note">This match does not have confirmed backend odds yet, so it is not available for betting.</p>}
        {isLive && <p className="md-synth-note">Live odds update in real time.</p>}
        {!isBettableMatchId(match.id) && <p className="md-synth-note">This fixture is not currently available for betting. Please choose a match with current backend odds.</p>}
      </section>

      <section className="panel simple-card md-markets">
        <div className="module-title"><h3>Match Result</h3></div>
        <div className="md-odds-row">
          {slots.map(([label, name, val]) => (
            <button
              key={label as string}
              className={`sb-odd md-odd${isSel(label as string) ? " sel" : ""}${!clickable ? " display-only" : ""}${!val || (val as number) <= 0 ? " empty" : ""}`}
              onClick={() => clickable && pick(label as string, val as number)}
              disabled={!clickable || !val || (val as number) <= 0}
              type="button"
            >
              <span>{name}</span>
              <b>{val && (val as number) > 0 ? (val as number).toFixed(2) : "—"}</b>
            </button>
          ))}
        </div>

        {oddsLoading ? (
          <p className="muted" style={{ marginTop: 16, fontSize: 12 }}>Loading more markets…</p>
        ) : (
          <>
            {allOdds?.oddsHalfTime && allOdds.oddsHalfTime.length > 0 && allOdds.oddsHalfTime.map((g, i) => (
              <MarketGroup key={`ht-${i}`} group={g} market={g.market} matchId={match.id} picks={picks} onPick={onPick} clickable={clickable} homeTeam={match.homeTeam} awayTeam={match.awayTeam} />
            ))}
            {allOdds?.oddsCorrectScore && allOdds.oddsCorrectScore.length > 0 && (
              <CorrectScoreSection groups={allOdds.oddsCorrectScore} matchId={match.id} picks={picks} onPick={onPick} clickable={clickable} homeTeam={match.homeTeam} awayTeam={match.awayTeam} />
            )}
            {allOdds?.oddsHandicap && allOdds.oddsHandicap.length > 0 && (
              <HandicapSection groups={allOdds.oddsHandicap} matchId={match.id} picks={picks} onPick={onPick} clickable={clickable} homeTeam={match.homeTeam} awayTeam={match.awayTeam} />
            )}
            {(!allOdds || (allOdds.oddsHalfTime.length === 0 && allOdds.oddsCorrectScore.length === 0 && allOdds.oddsHandicap.length === 0)) && (
              <p className="muted" style={{ marginTop: 14, fontSize: 12 }}>
                No additional markets (half time, correct score, handicap) are available for this match yet — Match Result is the only market currently priced.
              </p>
            )}
          </>
        )}
      </section>

    </main>
  );
}
