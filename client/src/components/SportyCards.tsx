/**
 * SportyBet-mirror match cards — the owner-approved sample v10 design
 * (~/workspace/playbet-rebrand/sample-v10-cards) as one shared card system
 * for every match listing: homepage In-Play Arena + Coming Up, and the
 * sportsbook page (Live / Today / Upcoming / Ended / Top-10 rail).
 * Typography is Roboto — SportyBet's own web product runs on Roboto
 * (core CSS: `font-family:Roboto,Arial,sans-serif`).
 *
 * Data honesty: the list feeds carry 1X2 odds only (EnrichedMatch.oddsMap),
 * so the market tab strip switches the card columns structurally — 1X2
 * renders the real prices wired to the betslip exactly as before, while
 * O/U, Double Chance, Handicap and GG/NG render the app's standard
 * unavailable "—" boxes (those markets are priced on the match page).
 * No price is ever invented. Ribbons follow real data signals only:
 * SPECIAL for admin-created fixtures, HOT for matches the feed flags
 * `featured`. There is no "BEST ODDS" ribbon — the data carries no such
 * signal. "+N markets" is omitted: the feed exposes no market count.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ChevronRight, Star } from "lucide-react";
import {
  formatKickoff, generateCrest, isMatchLive, liveClock, parseKickoff,
  type EnrichedMatch,
} from "@/lib/sportsbook";
import { useFavorites } from "@/lib/favorites";
import type { Pick } from "./Sportsbook";
import "../sporty.css";

export type CardMarket = "1X2" | "OU" | "DC" | "HCP" | "GGNG";

export const CARD_MARKETS: { key: CardMarket; label: string }[] = [
  { key: "1X2", label: "1X2" },
  { key: "OU", label: "O/U" },
  { key: "DC", label: "Double Chance" },
  { key: "HCP", label: "Handicap" },
  { key: "GGNG", label: "GG/NG" },
];

/** Column headers shown in the group band for the active market. */
export function marketColumns(market: CardMarket, hasDraw: boolean): string[] {
  switch (market) {
    case "1X2": return hasDraw ? ["1", "X", "2"] : ["1", "2"];
    case "OU": return ["Goals", "Over", "Under"];
    case "DC": return ["1X", "12", "2X"];
    case "HCP": return ["Goals", "1", "2"];
    case "GGNG": return ["GG", "NG"];
  }
}

export function SportyMarketTabs({ market, onChange }: { market: CardMarket; onChange: (m: CardMarket) => void }) {
  return (
    <div className="sp-tabs" role="tablist" aria-label="Market">
      {CARD_MARKETS.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={market === t.key}
          className={`sp-tab${market === t.key ? " on" : ""}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function SportyGroupHead({
  label, live = false, market, hasDraw, cols = true,
}: { label: string; live?: boolean; market: CardMarket; hasDraw: boolean; cols?: boolean }) {
  return (
    <div className="sp-ghead">
      <span className="sp-dt">{live && <span className="sp-livedot" aria-hidden="true" />}{label}</span>
      {cols && (
        <div className="sp-cols" aria-hidden="true">
          {marketColumns(market, hasDraw).map((c) => <span key={c}>{c}</span>)}
        </div>
      )}
    </div>
  );
}

/** SportyBet group-band label: "22/10 Thursday". */
export function sportyDayLabel(kickoffAt?: string): string {
  if (!kickoffAt) return "Fixtures";
  const d = parseKickoff(kickoffAt);
  if (Number.isNaN(d.getTime())) return "Fixtures";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm} ${d.toLocaleDateString("en-GB", { weekday: "long" })}`;
}

/** Local calendar-day key for grouping (yyyy-mm-dd in the device's timezone). */
export function sportyDayKey(kickoffAt?: string): string {
  if (!kickoffAt) return "unknown";
  const d = parseKickoff(kickoffAt);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toLocaleDateString("en-CA");
}

/** "England - Premier League" when the catalogue resolved a country and the
 * league name doesn't already carry it; otherwise the league name alone. */
function leagueLine(match: EnrichedMatch): string {
  const league = (match.league || match.sport || "Football").trim();
  const country = (match.competitionCountry ?? "").trim();
  if (country && !league.toLowerCase().startsWith(country.toLowerCase())) return `${country} - ${league}`;
  return league;
}

/** The provider match number from externalId ("espn-401861106" → "401861106"). */
function providerId(match: EnrichedMatch): string | null {
  const raw = String(match.externalId ?? "").trim();
  if (!raw) return null;
  if (/^\d{1,12}$/.test(raw)) return raw;
  const tail = raw.match(/(\d{4,12})$/)?.[1];
  return tail ?? null;
}

/** Same 15s self-ticking clock the sportsbook rows have always used. */
function SportyLiveClock({ match }: { match: EnrichedMatch }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, [match.id]);
  return <>{liveClock(match)}</>;
}

/**
 * Team crest for every card — live, today and upcoming (owner, 2026-10-23:
 * the actual logos must show wherever the feed provides them). The feed's
 * real logo URL reaches the card as displayHomeLogo/displayAwayLogo
 * (resolved in lib/sportsbook: logos unioned across duplicate feed copies,
 * real logo first, generated initials crest only when the feed has none).
 * If the image fails to load, fall back to the generated initials crest;
 * if even that fails, an initials disc.
 */
function TeamMark({ logo, name }: { logo?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const [crestFailed, setCrestFailed] = useState(false);
  useEffect(() => { setFailed(false); setCrestFailed(false); }, [logo]);
  if (!logo || failed) {
    // No feed logo, or it failed to load → the generated initials crest.
    if (crestFailed) return <span className="sp-crest" aria-hidden="true" />;
    return (
      <span className="sp-crest" aria-hidden="true">
        <img src={generateCrest(name)} alt="" loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer" onError={() => setCrestFailed(true)} />
      </span>
    );
  }
  return (
    <span className="sp-crest" aria-hidden="true">
      <img src={logo} alt="" loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    </span>
  );
}

function OddsBox({
  value, selected, onClick, label, move,
}: {
  value: number | null; selected?: boolean; onClick?: () => void; label: string;
  move?: "up" | "down";
}) {
  const empty = value == null || value <= 0;
  return (
    <button
      type="button"
      className={`sp-obox${selected ? " sel" : ""}`}
      disabled={empty}
      onClick={empty ? undefined : onClick}
      aria-label={`${label} ${empty ? "unavailable" : value.toFixed(2)}`}
    >
      <span className="sp-pr">
        {empty ? "—" : value.toFixed(2)}
        {!empty && move && <i className={`sp-move ${move}`} aria-hidden="true">{move === "up" ? "▲" : "▼"}</i>}
      </span>
    </button>
  );
}

export function SportyMatchCard({
  match, market = "1X2", hasDraw = true, picks, onPick, ended = false, compact = false,
}: {
  match: EnrichedMatch; market?: CardMarket; hasDraw?: boolean;
  picks: Pick[]; onPick: (p: Pick) => void; ended?: boolean; compact?: boolean;
}) {
  const live = !ended && isMatchLive(match);
  const odds = match.oddsMap;
  const matchLabel = `${match.homeTeam} vs ${match.awayTeam}`;
  const { has, toggle } = useFavorites();
  const favored = has("match", match.id);
  const isSel = (sel: string) => picks.some((p) => p.id === match.id && p.market === "1X2" && p.selection === sel);
  const pick = (sel: string, odd: number) => onPick({
    id: match.id, match: matchLabel, market: "1X2", selection: sel, odd,
    league: match.league, homeTeam: match.homeTeam, awayTeam: match.awayTeam,
    kickoffAt: match.kickoffAt, isLive: live, scoreHome: match.scoreHome, scoreAway: match.scoreAway,
  });
  const href = `/match/${match.id}?sport=${encodeURIComponent(match.sport ?? "football")}${match.isAdmin ? "&admin=1" : ""}`;
  const extId = providerId(match);
  const showScore = live || ended;

  // Live price-movement arrows, same behaviour the old live rows had.
  const prevOddsRef = useRef<Record<string, number>>({});
  useEffect(() => {
    const cur: Record<string, number> = {};
    if (odds?.home) cur["1"] = odds.home;
    if (odds?.draw) cur["X"] = odds.draw;
    if (odds?.away) cur["2"] = odds.away;
    prevOddsRef.current = cur;
  });
  const moveOf = (sel: string, val: number): "up" | "down" | undefined => {
    if (!live) return undefined;
    const prev = prevOddsRef.current[sel];
    if (!prev || !val || prev === val) return undefined;
    return val > prev ? "up" : "down";
  };

  const unavailable = (labels: string[], withLine: boolean) => (
    <>
      {withLine && <span className="sp-obox sp-line" aria-hidden="true"><span className="sp-ln">—</span></span>}
      {labels.map((l) => <OddsBox key={l} label={l} value={null} />)}
    </>
  );

  const boxes = (() => {
    switch (market) {
      case "1X2": {
        const slots: [string, number][] = hasDraw
          ? [["1", odds?.home ?? 0], ["X", odds?.draw ?? 0], ["2", odds?.away ?? 0]]
          : [["1", odds?.home ?? 0], ["2", odds?.away ?? 0]];
        return slots.map(([sel, val]) => (
          <OddsBox
            key={sel}
            label={sel}
            value={val > 0 ? val : null}
            selected={isSel(sel)}
            move={moveOf(sel, val)}
            onClick={() => pick(sel, val)}
          />
        ));
      }
      case "OU": return unavailable(["Over", "Under"], true);
      case "DC": return unavailable(["1X", "12", "2X"], false);
      case "HCP": return unavailable(["1", "2"], true);
      case "GGNG": return unavailable(["GG", "NG"], false);
    }
  })();

  return (
    <div className={`sp-match${compact ? " sp-compact" : ""}`}>
      <div className="sp-meta">
        {match.isAdmin && <span className="sp-ribbon sp-special">SPECIAL</span>}
        {match.featured && <span className="sp-ribbon sp-hot">HOT 🔥</span>}
        {live
          ? <span className="sp-live-tm"><SportyLiveClock match={match} /></span>
          : ended
            ? <span className="sp-ft">FT</span>
            : <span className="sp-tm">{formatKickoff(match.kickoffAt)}</span>}
        {extId && <span className="sp-id">ID {extId}</span>}
        {match.isSyntheticOdds && !live && !ended && <span className="sp-est">EST. ODDS</span>}
        <span className="sp-lg">{leagueLine(match)}</span>
        <button
          type="button"
          className={`sp-fav${favored ? " active" : ""}`}
          aria-label={favored ? "Remove from favorites" : "Add to favorites"}
          onClick={() => toggle({ kind: "match", id: match.id, label: matchLabel, meta: match.league })}
        >
          <Star size={14} fill={favored ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="sp-teams-row">
        <Link href={href} className="sp-teams">
          <div className="sp-team">
            <TeamMark logo={match.displayHomeLogo} name={match.homeTeam ?? ""} />
            <span className="sp-team-name">{match.homeTeam}</span>
          </div>
          <div className="sp-team">
            <TeamMark logo={match.displayAwayLogo} name={match.awayTeam ?? ""} />
            <span className="sp-team-name">{match.awayTeam}</span>
          </div>
        </Link>
        {showScore && (
          <div className="sp-score-col" aria-label="Score">{match.scoreHome ?? 0}<br />{match.scoreAway ?? 0}</div>
        )}
        {!ended && <div className="sp-odds">{boxes}</div>}
      </div>
      {ended && (
        <Link href={href} className="sp-ended-note">Final score — view match <ChevronRight size={13} /></Link>
      )}
    </div>
  );
}
