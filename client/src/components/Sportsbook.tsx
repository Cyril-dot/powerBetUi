import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Bike, CalendarDays, CircleDot, Dumbbell, Flame, Radio, RefreshCw, Sparkles, Star, Trophy, TriangleAlert, Zap } from "lucide-react";
import {
  categorise, fetchAdminMatches, fetchSport, formatKickoff, formatKickoffDate, getLastFetchStatus, liveClock,
  isMatchLive, mergeMatchLists, parseKickoff, TWO_WAY_SPORTS,
  type EnrichedMatch, type SportKey,
} from "@/lib/sportsbook";
import {
  SportyGroupHead, SportyMarketTabs, SportyMatchCard, sportyDayKey, sportyDayLabel,
  type CardMarket,
} from "./SportyCards";
import { DEFAULT_ADMIN_CREST } from "@/lib/logoCatalog";
import { TOP_SIX_COMPETITIONS } from "@/lib/competitionCatalog";

export type Pick = {
  id: string; match: string; market: string; selection: string; odd: number;
  league?: string; homeTeam?: string; awayTeam?: string; kickoffAt?: string;
  isLive?: boolean; scoreHome?: number; scoreAway?: number;
};

export const SPORT_TABS: { key: SportKey; label: string; icon: typeof Trophy; swatch: string }[] = [
  { key: "football", label: "Football", icon: CircleDot, swatch: "#0da653" },
  { key: "basketball", label: "Basketball", icon: Dumbbell, swatch: "#d97706" },
  { key: "tennis", label: "Tennis", icon: Star, swatch: "#b8f33c" },
  { key: "baseball", label: "Baseball", icon: Trophy, swatch: "#2563eb" },
  { key: "nfl", label: "NFL", icon: Flame, swatch: "#7c3aed" },
  { key: "mma", label: "MMA", icon: Bike, swatch: "#1e6bff" },
];

const PAGE_SIZE = 15;
const ENDED_PAGE_SIZE = 5;
// Keep all active match categories visible: live first, then today, then upcoming.
const UPCOMING_ONLY = false;
const TOP_SIX_LEAGUE_KEYS = new Set(TOP_SIX_COMPETITIONS.filter((c) => c.tier === "league").map((c) => c.key));

/**
 * TOP 10 LEAGUES (owner, 2026-10-09 — homepage section modelled on the
 * MSport reference): the six catalogued top leagues plus the Champions
 * League, Europa League, Primeira Liga and the Championship, matched by
 * resolved competition key where the catalogue has one and by league name
 * for the rest.
 */
const TOP_TEN_LEAGUES: { id: string; label: string; keys?: string[]; pattern?: RegExp }[] = [
  { id: "premier-league", label: "Premier League", keys: ["england.premier-league"] },
  { id: "la-liga", label: "La Liga", keys: ["spain.la-liga"] },
  { id: "serie-a", label: "Serie A", keys: ["italy.serie-a"] },
  { id: "bundesliga", label: "Bundesliga", keys: ["germany.bundesliga"] },
  { id: "ligue-1", label: "Ligue 1", keys: ["france.ligue-1"] },
  { id: "champions-league", label: "Champions League", pattern: /champions league/i },
  { id: "europa-league", label: "Europa League", pattern: /europa league/i },
  { id: "eredivisie", label: "Eredivisie", keys: ["netherlands.eredivisie"] },
  { id: "primeira-liga", label: "Primeira Liga", pattern: /primeira|liga portugal/i },
  { id: "championship", label: "Championship", pattern: /championship/i },
];
const topTenLeagueOf = (m: EnrichedMatch) => TOP_TEN_LEAGUES.find((l) => (
  (l.keys && m.competitionKey && l.keys.includes(m.competitionKey)) ||
  (l.pattern && l.pattern.test(m.league ?? ""))
));

const topSixFirst = (a: EnrichedMatch, b: EnrichedMatch) => {
  const aTop = a.competitionKey && TOP_SIX_LEAGUE_KEYS.has(a.competitionKey) ? 0 : 1;
  const bTop = b.competitionKey && TOP_SIX_LEAGUE_KEYS.has(b.competitionKey) ? 0 : 1;
  if (aTop !== bTop) return aTop - bTop;
  const at = a.kickoffAt ? parseKickoff(a.kickoffAt).getTime() : Number.MAX_SAFE_INTEGER;
  const bt = b.kickoffAt ? parseKickoff(b.kickoffAt).getTime() : Number.MAX_SAFE_INTEGER;
  return at - bt;
};

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="sb-row sb-skel">
          <div className="sb-skel-block" style={{ width: "62%", height: 12 }} />
          <div className="sb-skel-block" style={{ width: 44, height: 30 }} />
          <div className="sb-skel-block" style={{ width: 44, height: 30 }} />
          <div className="sb-skel-block" style={{ width: 44, height: 30 }} />
        </div>
      ))}
    </>
  );
}

function OddButton({
  label, value, clickable, selected, onClick,
}: { label: string; value: number; clickable: boolean; selected: boolean; onClick: () => void }) {
  const empty = !value || value <= 0;
  const unavailable = empty || !clickable;
  return (
    <button
      className={`sb-odd${selected ? " sel" : ""}${unavailable ? " display-only" : ""}${empty ? " empty" : ""}`}
      onClick={!unavailable ? onClick : undefined}
      disabled={unavailable}
      aria-label={`${label} ${empty ? "unavailable" : value.toFixed(2)}`}
      type="button"
    >
      <span>{label}</span>
      <b>{empty ? "—" : value.toFixed(2)}</b>
    </button>
  );
}

/**
 * Ticks independently of the 30s data-poll cycle so the running minute count
 * actually advances smoothly (every 15s) instead of only jumping forward
 * whenever the next background refetch happens to land. Used for every live
 * match row — Live Now section AND Power Specials both render through
 * MatchRow, so both get this automatically.
 */
export function LiveClock({ match }: { match: EnrichedMatch }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, [match.id]);
  return <>{liveClock(match)}</>;
}

export function TeamCrest({ url, name }: { url?: string; name: string }) {
  const fallback = DEFAULT_ADMIN_CREST;
  const safeUrl = url;
  const initials = (name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("") || "?").toUpperCase();
  const [src, setSrc] = useState(safeUrl || fallback);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setSrc(safeUrl || fallback); setFailed(false); }, [safeUrl, fallback]);
  return (
    <span className="sb-crest" aria-hidden>
      {!failed && <img src={src} alt="" loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer" onError={() => { setFailed(true); setSrc(fallback); }} />}
      {failed && <span className="sb-crest-fallback" style={{ backgroundImage: `url(${fallback})` }}>{initials}</span>}
    </span>
  );
}

const LEAGUE_ICONS = ["🔥", "⚡", "🏆", "🛡️", "⚽", "🌟"];
function leagueIconFor(league?: string): string {
  const value = league ?? "";
  let hash = 0; for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return LEAGUE_ICONS[hash % LEAGUE_ICONS.length];
}
/**
 * Every match row on the board renders through the shared SportyBet-mirror
 * card (SportyCards.tsx) — one card system for Live / Today / Upcoming /
 * Ended. The Pick contract, favourites and ended behaviour are unchanged;
 * only the presentation moved.
 */
function MatchRow({
  match, hasDraw, picks, onPick, isAdmin = false, ended = false, market = "1X2",
}: { match: EnrichedMatch; hasDraw: boolean; picks: Pick[]; onPick: (p: Pick) => void; isAdmin?: boolean; ended?: boolean; market?: CardMarket }) {
  void isAdmin; // admin state rides on match.isAdmin inside the card
  return (
    <SportyMatchCard match={match} market={market} hasDraw={hasDraw} picks={picks} onPick={onPick} ended={ended} />
  );
}

/** Groups by day (Today/Yesterday/date) rather than by league — for the
 * Recently Ended section, "which day did this finish" matters more to a
 * user scanning results than "which league". Capped to a handful shown by
 * default (matching the same "Show more" pattern used elsewhere) since a
 * busy day's worth of finished matches would otherwise dump dozens of dead
 * rows onto the page every time. */
function EndedMatchList({ list, hasDraw, picks, onPick }: { list: EnrichedMatch[]; hasDraw: boolean; picks: Pick[]; onPick: (p: Pick) => void }) {
  const [visible, setVisible] = useState(ENDED_PAGE_SIZE);
  useEffect(() => { setVisible(ENDED_PAGE_SIZE); }, [list.length]);

  if (list.length === 0) return null;
  const shown = list.slice(0, visible);
  const byDay = new Map<string, EnrichedMatch[]>();
  for (const m of shown) {
    const key = sportyDayKey(m.kickoffAt);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(m);
  }
  return (
    <>
      <div className="sp-list">
        {Array.from(byDay.entries()).map(([day, matches]) => (
          <div key={day}>
            <SportyGroupHead label={sportyDayLabel(matches[0].kickoffAt)} market="1X2" hasDraw={hasDraw} cols={false} />
            {matches.map((m) => <MatchRow key={m.id} match={m} hasDraw={hasDraw} picks={picks} onPick={onPick} ended />)}
          </div>
        ))}
      </div>
      {visible < list.length && (
        <button className="sb-load-more" onClick={() => setVisible((v) => v + ENDED_PAGE_SIZE)} type="button">
          Show more ({list.length - visible} remaining)
        </button>
      )}
    </>
  );
}

/**
 * Horizontally-swipeable "featured" match cards sitting above the vertical
 * Live/Today lists — a genuinely distinct section from those, not just a
 * restyle of the same rows. Contains ALL of today's matches (not a capped
 * preview), real-odds ones surfaced first — "featured" here means "we
 * actually have real pricing for this one", not a fabricated hype signal.
 * No invented "HOT"/"BEST ODDS" badges without a real basis behind them;
 * badges shown are the same genuine ones used elsewhere (POWER, LIVE clock,
 * EST. ODDS).
 */
function FeaturedMatchCarousel({ list, hasDraw, picks, onPick }: { list: EnrichedMatch[]; hasDraw: boolean; picks: Pick[]; onPick: (p: Pick) => void }) {
  const featured = useMemo(() => {
    const real = list.filter((m) => !m.isSyntheticOdds);
    const synth = list.filter((m) => m.isSyntheticOdds);
    const live = (arr: EnrichedMatch[]) => arr.filter((m) => isMatchLive(m));
    const notLive = (arr: EnrichedMatch[]) => arr.filter((m) => !isMatchLive(m));
    return [...live(real), ...notLive(real), ...live(synth), ...notLive(synth)];
  }, [list]);

  if (featured.length === 0) return null;

  return (
    <div className="featured-carousel-wrap">
      <div className="featured-carousel-hdr">
        <span className="featured-carousel-hdr-icon"><Sparkles size={13} /></span>
        <span className="featured-carousel-hdr-text">Featured Matches</span>
        <b className="featured-carousel-hdr-count">{featured.length}</b>
      </div>
      <div className="featured-carousel">
        {featured.map((m) => (
          <FeaturedMatchCard key={m.id} match={m} hasDraw={hasDraw} picks={picks} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}

function FeaturedMatchCard({ match, hasDraw, picks, onPick }: { match: EnrichedMatch; hasDraw: boolean; picks: Pick[]; onPick: (p: Pick) => void }) {
  const isLive = isMatchLive(match);
  // Featured live matches can also be added when their odds are priced.
  const clickable = true;
  const odds = match.oddsMap;
  const matchLabel = `${match.homeTeam} vs ${match.awayTeam}`;
  const isSel = (sel: string) => picks.some((p) => p.id === match.id && p.market === "1X2" && p.selection === sel);
  const pick = (sel: string, odd: number) => onPick({
    id: match.id, match: matchLabel, market: "1X2", selection: sel, odd,
    league: match.league, homeTeam: match.homeTeam, awayTeam: match.awayTeam,
    kickoffAt: match.kickoffAt, isLive, scoreHome: match.scoreHome, scoreAway: match.scoreAway,
  });
  const slots = hasDraw
    ? [["1", odds?.home ?? 0], ["X", odds?.draw ?? 0], ["2", odds?.away ?? 0]]
    : [["1", odds?.home ?? 0], ["2", odds?.away ?? 0]];
  const matchHref = `/match/${match.id}?sport=${encodeURIComponent(match.sport ?? "football")}&admin=1`;

  return (
    <div className={`featured-card${isLive ? " is-live" : ""}`}>
      <div className="featured-card-top">
        <span className="featured-card-league"><span className="sb-league-icon" title={match.league || match.sport || "League"} aria-label={match.league || match.sport || "League"}>{leagueIconFor(match.league || match.sport)}</span></span>
      </div>
      <Link href={matchHref} className="featured-card-fixture">
        <div className="featured-card-side">
          <TeamCrest url={match.displayHomeLogo} name={match.homeTeam ?? ""} />
          <span className="featured-card-side-label">HOME</span>
          <span className="featured-card-team-name">{match.homeTeam}</span>
          {isLive && match.scoreHome != null && <em>{match.scoreHome}</em>}
        </div>
        <div className="featured-card-mid">
          {isLive ? <LiveClock match={match} /> : (
            <>
              <b>{formatKickoff(match.kickoffAt)}</b>
              <small>{formatKickoffDate(match.kickoffAt)}</small>
            </>
          )}
        </div>
        <div className="featured-card-side">
          <TeamCrest url={match.displayAwayLogo} name={match.awayTeam ?? ""} />
          <span className="featured-card-side-label">AWAY</span>
          <span className="featured-card-team-name">{match.awayTeam}</span>
          {isLive && match.scoreAway != null && <em>{match.scoreAway}</em>}
        </div>
      </Link>
      <span className="featured-card-market-label">1X2</span>
      <div className="featured-card-odds">
        {slots.map(([label, val]) => (
          <OddButton
            key={label as string}
            label={label as string}
            value={val as number}
            clickable={clickable}
            selected={isSel(label as string)}
            onClick={() => pick(label as string, val as number)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * LIVE MATCHES — SportyBet-mirror white list panel inside the dark section
 * shell: market tab strip, "Live · In-Play" group band with the market's
 * column headers, then the shared SportyMatchCard rows. Live odds are
 * fully stakeable — there is no live gate — and the cards keep the live
 * clock and price-movement arrows the old rows had.
 */
function LiveMatchesSection({
  list, hasDraw, picks, onPick, loading, market, onMarketChange,
}: {
  list: EnrichedMatch[]; hasDraw: boolean; picks: Pick[]; onPick: (p: Pick) => void; loading: boolean;
  market: CardMarket; onMarketChange: (m: CardMarket) => void;
}) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  useEffect(() => { setVisible(PAGE_SIZE); }, [list.length]);
  return (
    <section id="sb-section-live" className="panel sb-section sb-live-section sb-live-dark">
      <div className="sb-section-head live-head">
        <span className="live-head-title">
          <i className="live-dot live-dot-green" aria-hidden="true" />
          <Radio size={15} />
          Live Matches
          <b>({list.length})</b>
        </span>
        <span className="live-head-pill"><i className="live-dot live-dot-green" aria-hidden="true" /> LIVE</span>
      </div>
      <div className="sb-section-body live-body">
        {loading && list.length === 0 ? <SkeletonRows /> : list.length === 0 ? (
          <p className="live-empty">No matches are live right now — games appear here the moment they kick off, with live odds you can bet on straight away.</p>
        ) : (
          <>
            <div className="sp-list">
              <SportyMarketTabs market={market} onChange={onMarketChange} />
              <SportyGroupHead label="Live · In-Play" live market={market} hasDraw={hasDraw} />
              {list.slice(0, visible).map((m) => (
                <SportyMatchCard key={m.id} match={m} market={market} hasDraw={hasDraw} picks={picks} onPick={onPick} />
              ))}
            </div>
            {visible < list.length && (
              <button className="sb-load-more live-load-more" onClick={() => setVisible((v) => v + PAGE_SIZE)} type="button">
                Show more live ({list.length - visible} remaining)
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}


/**
 * One Top-10 rail slide — the same shared SportyBet-mirror card as every
 * other listing (compact width), so the rail bets exactly like the lists.
 */
function TopLeagueCard({
  match, hasDraw, picks, onPick, market,
}: { match: EnrichedMatch; hasDraw: boolean; picks: Pick[]; onPick: (p: Pick) => void; market: CardMarket }) {
  return (
    <div className="sp-slide">
      <div className="sp-list">
        <SportyMatchCard match={match} market={market} hasDraw={hasDraw} picks={picks} onPick={onPick} compact />
      </div>
    </div>
  );
}

/**
 * TOP 10 LEAGUES — upcoming fixtures from the ten biggest competitions,
 * as a swipeable card rail with league filter chips (MSport reference,
 * owner 2026-10-09). Renders nothing when no top-10 fixture is upcoming.
 */
function TopLeaguesSection({
  list, hasDraw, picks, onPick, market,
}: { list: EnrichedMatch[]; hasDraw: boolean; picks: Pick[]; onPick: (p: Pick) => void; market: CardMarket }) {
  const [leagueId, setLeagueId] = useState<string>("all");
  const present = useMemo(() => TOP_TEN_LEAGUES
    .map((l) => ({ ...l, count: list.filter((m) => topTenLeagueOf(m)?.id === l.id).length }))
    .filter((l) => l.count > 0), [list]);
  if (list.length === 0) return null;
  const shown = leagueId === "all" ? list : list.filter((m) => topTenLeagueOf(m)?.id === leagueId);
  return (
    <section className="panel sb-section sb-top10-section">
      <div className="fm-head">
        <span className="fm-ball" aria-hidden="true">⚽</span>
        <h2 className="fm-title">Featured Matches</h2>
        <span className="fm-tag">Upcoming</span>
      </div>
      <div className="sb-section-body">
      <div className="t10-chips" role="tablist" aria-label="Filter top leagues">
        <button type="button" role="tab" aria-selected={leagueId === "all"} className={`t10-chip${leagueId === "all" ? " active" : ""}`} onClick={() => setLeagueId("all")}>All<b>{list.length}</b></button>
        {present.map((l) => (
          <button key={l.id} type="button" role="tab" aria-selected={leagueId === l.id} className={`t10-chip${leagueId === l.id ? " active" : ""}`} onClick={() => setLeagueId(l.id)}>
            {leagueIconFor(l.label)}{l.label}<b>{l.count}</b>
          </button>
        ))}
      </div>
      <div className="t10-rail">
        {shown.map((m) => (
          <TopLeagueCard key={m.id} match={m} hasDraw={hasDraw} picks={picks} onPick={onPick} market={market} />
        ))}
      </div>
      </div>
    </section>
  );
}

function SectionShell({
  title, icon, count, live, special, badge, id, children,
}: { title: string; icon: React.ReactNode; count?: number; live?: boolean; special?: boolean; badge?: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`panel sb-section${live ? " sb-live-section" : ""}${special ? " sb-special-section" : ""}`}>
      <div className="sb-section-head">
        <span className="sb-section-title">{icon}{title}{typeof count === "number" && <b>({count})</b>}</span>
        {live && <span className="live-pulse">LIVE</span>}
        {special && badge && <span className="sb-special-tag"><Sparkles size={11} />{badge}</span>}
      </div>
      <div className="sb-section-body">{children}</div>
    </section>
  );
}

/**
 * Today / Upcoming lists in the SportyBet-mirror system: white panel,
 * market tab strip, matches grouped under SportyBet-style date bands
 * ("22/10 Thursday") with the active market's column headers. EVERY
 * fixture in the list renders, grouped by calendar day (owner,
 * 2026-10-22: fixtures beyond today were being hidden — first by the
 * homepage's top-8 slice, here by the old scroll-window; both are gone).
 */
function PaginatedLeagueList({
  list, hasDraw, picks, onPick, emptyLabel, market, onMarketChange,
}: {
  list: EnrichedMatch[]; hasDraw: boolean; picks: Pick[]; onPick: (p: Pick) => void; emptyLabel: string; pageSize?: number;
  market: CardMarket; onMarketChange: (m: CardMarket) => void;
}) {
  if (list.length === 0) return <p className="sb-empty">{emptyLabel}</p>;

  const byDay = new Map<string, EnrichedMatch[]>();
  for (const m of list) {
    const key = sportyDayKey(m.kickoffAt);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(m);
  }

  return (
    <div className="sp-list">
      <SportyMarketTabs market={market} onChange={onMarketChange} />
      {Array.from(byDay.entries()).map(([day, matches]) => (
        <div key={day}>
          <SportyGroupHead label={sportyDayLabel(matches[0].kickoffAt)} market={market} hasDraw={hasDraw} />
          {matches.map((m) => <MatchRow key={m.id} match={m} hasDraw={hasDraw} picks={picks} onPick={onPick} market={market} />)}
        </div>
      ))}
    </div>
  );
}

export default function Sportsbook({
  picks, onPick, mode = "all", sport: sportProp, onSportChange, leagueFilter, hoursFilter,
  onMeta, hideLive = false, hideFeatured = false,
}: {
  picks: Pick[]; onPick: (p: Pick) => void; mode?: "all" | "live-only";
  sport?: SportKey; onSportChange?: (s: SportKey) => void; leagueFilter?: string | null;
  hideLive?: boolean; hideFeatured?: boolean;
  /** Only used for the "Today" section — caps it to matches kicking off
   * within this many hours from now (e.g. 3, for a "Football in next 3
   * hours" quick filter). Ignored for Live/Upcoming/Ended since "starting
   * soon" only makes sense against not-yet-started matches. */
  hoursFilter?: number | null;
  onMeta?: (meta: {
    sport: SportKey; leagues: string[]; leagueCounts: Record<string, number>;
    counts: { live: number; today: number; upcoming: number; total: number }; loading: boolean;
  }) => void;
}) {
  const [internalSport, setInternalSport] = useState<SportKey>("football");
  const sport = sportProp ?? internalSport;
  const setSport = onSportChange ?? setInternalSport;
  // One market-tab selection shared by every list on the board (SportyBet
  // switches the market for the whole list from a single strip).
  const [cardMarket, setCardMarket] = useState<CardMarket>("1X2");

  const [matches, setMatches] = useState<Record<SportKey, EnrichedMatch[]>>({ football: [], basketball: [], tennis: [], baseball: [], nfl: [], mma: [] });
  const [adminMatches, setAdminMatches] = useState<EnrichedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [restLoading, setRestLoading] = useState(true);
  const [apiUnreachable, setApiUnreachable] = useState(false);
  // Scroll gate for the heavy football feeds: the first board load fetches
  // the live feed only; the gate opens when the reader scrolls towards the
  // sections below Live (or after a fallback delay), and stays open for
  // every later refresh. The watcher arms only once the live rows have
  // painted — before that the page is still short and empty, so the
  // sentinel would sit next to the fold and open the gate instantly.
  const gateRef = useRef<{ promise: Promise<void>; open: () => void } | null>(null);
  const unlockedRef = useRef(false);
  const restSentinelRef = useRef<HTMLDivElement | null>(null);
  const [livePainted, setLivePainted] = useState(false);
  const makeGate = () => {
    let open!: () => void;
    const promise = new Promise<void>((resolve) => { open = () => { unlockedRef.current = true; resolve(); }; });
    gateRef.current = { promise, open };
    return promise;
  };
  useEffect(() => {
    if (!livePainted) return;
    const node = restSentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) gateRef.current?.open(); },
      { rootMargin: "900px 0px" },
    );
    observer.observe(node);
    const fallback = setTimeout(() => gateRef.current?.open(), 20_000);
    return () => { observer.disconnect(); clearTimeout(fallback); };
  }, [livePainted]);
  const [liveLeagueTab, setLiveLeagueTab] = useState<string | null>(null);
  const loaded = useRef<Set<SportKey>>(new Set());

  // background=true is the poll path (owner, 2026-10-23): no loading flags,
  // no progressive re-paints — results merge into the current list in place
  // via mergeMatchLists, so scores/odds update silently with no remount,
  // no spinner and no scroll jump.
  const load = async (s: SportKey, background = false) => {
    if (!background) {
      setLoading(true);
      setRestLoading(true);
    }
    try {
      let firstBatch = true;
      const progress = s === "football"
        ? (batch: EnrichedMatch[]) => {
            setMatches((prev) => ({ ...prev, football: mergeMatchLists(prev.football, batch) }));
            // The first football batch is the live feed — the board's main
            // loading state ends there, not after the heavy feeds finish.
            if (firstBatch) { firstBatch = false; setLoading(false); setLivePainted(true); }
          }
        : undefined;
      const adminPromise = s === "football" ? fetchAdminMatches().then((admin) => { setAdminMatches((prev) => mergeMatchLists(prev, admin)); return admin; }) : Promise.resolve(adminMatches);
      const opts = s !== "football" ? undefined
        : mode === "live-only" ? { liveOnly: true }
        : unlockedRef.current ? undefined
        : { restGate: gateRef.current?.promise ?? makeGate() };
      const sportPromise = fetchSport(s, progress, opts);
      const [sportResult] = await Promise.all([sportPromise, adminPromise]);
      setMatches((prev) => ({ ...prev, [s]: background ? mergeMatchLists(prev[s], sportResult) : sportResult }));
      loaded.current.add(s);
      setApiUnreachable(getLastFetchStatus().allFailed);
    } catch {
      setApiUnreachable(true);
    } finally {
      if (!background) {
        setLoading(false);
        setRestLoading(false);
      }
      if (s === "football") setLivePainted(true);
    }
  };

  useEffect(() => { load(sport); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sport]);
  useEffect(() => { setLiveLeagueTab(null); }, [sport]);

  useEffect(() => {
    const interval = setInterval(() => { if (document.visibilityState === "visible") load(sport, true); }, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport]);

  useEffect(() => {
    if (sport !== "football") return;
    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      fetchAdminMatches().then((rows) => setAdminMatches((prev) => mergeMatchLists(prev, rows))).catch(() => undefined);
    }, 5_000);
    return () => clearInterval(interval);
  }, [sport]);

  const hasDraw = !TWO_WAY_SPORTS.has(sport);
  // Hard gate: admin-created fixtures belong exclusively to the dedicated
  // Featured matches section above. Some backend football feeds also return
  // ADMIN_CREATED rows inside the normal list, so filter by both the enriched
  // flag and the backend source before Today/Upcoming/Ended grouping.
  const current = matches[sport].filter((match) => (
    !match.isAdmin && String(match.source ?? "").trim().toUpperCase() !== "ADMIN_CREATED"
  ));

  const grouped = useMemo(() => {
    const cats: Record<"live" | "today" | "upcoming" | "ended", EnrichedMatch[]> = { live: [], today: [], upcoming: [], ended: [] };
    for (const m of current) { const c = categorise(m); if (c) cats[c].push(m); }
    // Most-recently-finished first, so "Recently Ended" reads newest-to-oldest.
    cats.ended.sort((a, b) => {
      const at = a.kickoffAt ? parseKickoff(a.kickoffAt).getTime() : 0;
      const bt = b.kickoffAt ? parseKickoff(b.kickoffAt).getTime() : 0;
      return bt - at;
    });
    cats.live.sort(topSixFirst);
    cats.today.sort(topSixFirst);
    cats.upcoming.sort(topSixFirst);
    return cats;
  }, [current]);

  const leagues = useMemo(() => Array.from(new Set(current.map((m) => m.league).filter((l): l is string => !!l))).sort(), [current]);

  const leagueCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of current) { if (!m.league) continue; map[m.league] = (map[m.league] ?? 0) + 1; }
    return map;
  }, [current]);

  // LIVE GATE REMOVED: every live fixture — public feed AND admin-created —
  // belongs in the Live Matches section. Admin live games are merged in and
  // deduped by id (the grouped.live copy wins when both sources carry it).
  const liveMatches = useMemo(() => {
    const byId = new Map<string, EnrichedMatch>();
    for (const m of grouped.live) byId.set(m.id, m);
    for (const m of adminMatches) {
      if (isMatchLive(m) && !byId.has(m.id)) byId.set(m.id, m);
    }
    return Array.from(byId.values()).sort(topSixFirst);
  }, [grouped.live, adminMatches]);

  useEffect(() => {
    onMeta?.({
      sport, leagues, leagueCounts,
      counts: { live: liveMatches.length, today: grouped.today.length, upcoming: grouped.upcoming.length, total: current.length },
      loading,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport, leagues.join("|"), loading, liveMatches.length, grouped.today.length, grouped.upcoming.length, current.length]);

  const applyFilter = (list: EnrichedMatch[]) => (leagueFilter ? list.filter((m) => m.league === leagueFilter) : list);
  const applyHoursFilter = (list: EnrichedMatch[]) => {
    const base = applyFilter(list);
    if (!hoursFilter) return base;
    return base.filter((m) => {
      if (!m.kickoffAt) return false;
      const diffH = (parseKickoff(m.kickoffAt).getTime() - Date.now()) / 3_600_000;
      return diffH >= 0 && diffH <= hoursFilter;
    });
  };
  // TOP 10 LEAGUES: every not-yet-started fixture from the ten biggest
  // competitions (today's remaining games + the upcoming bucket), soonest
  // first, for the homepage rail.
  const topTenUpcoming = useMemo(() => {
    const now = Date.now();
    return [...grouped.today, ...grouped.upcoming]
      .filter((m) => {
        const t = m.kickoffAt ? parseKickoff(m.kickoffAt).getTime() : 0;
        return t > now && !!topTenLeagueOf(m);
      })
      .sort((a, b) => (parseKickoff(a.kickoffAt).getTime() || 0) - (parseKickoff(b.kickoffAt).getTime() || 0));
  }, [grouped.today, grouped.upcoming]);

  const visibleLive = applyFilter(liveMatches);

  return (
    <div className="sb-wrap">
      {apiUnreachable && (
        <div className="sb-error-banner">
          <TriangleAlert size={15} />
          <div>
            <b>Couldn't reach the match data service.</b>
            <span>This isn't "no matches" — the API request failed (network issue, CORS block, or the backend is down). Open your browser console for details, or tap Retry.</span>
          </div>
          <button onClick={() => load(sport)} type="button">Retry</button>
        </div>
      )}

      {mode === "all" && sport === "football" && (
        <TopLeaguesSection list={applyFilter(topTenUpcoming)} hasDraw={hasDraw} picks={picks} onPick={onPick} market={cardMarket} />
      )}

      {!hideLive && (mode === "live-only" || loading || visibleLive.length > 0) && (
        <LiveMatchesSection list={visibleLive} hasDraw={hasDraw} picks={picks} onPick={onPick} loading={loading} market={cardMarket} onMarketChange={setCardMarket} />
      )}

      {mode === "all" && <div ref={restSentinelRef} aria-hidden="true" style={{ height: 1 }} />}

      {mode === "all" && (
        <>
          {!UPCOMING_ONLY && (
            <section id="sb-section-today" className="panel sb-section sb-today-section">
              <div className="fm-head">
                <span className="fm-ball fm-ball-icon" aria-hidden="true"><CalendarDays size={16} /></span>
                <h2 className="fm-title">Today</h2>
                <span className="fm-sub">({applyFilter(grouped.today).length})</span>
                <span className="fm-tag">{new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span>
              </div>
              <div className="sb-section-body">
                {(loading || restLoading) && grouped.today.length === 0 ? (
                  <SkeletonRows />
                ) : (
                  <PaginatedLeagueList list={applyFilter(grouped.today)} hasDraw={hasDraw} picks={picks} onPick={onPick} emptyLabel="No matches scheduled for today." pageSize={10} market={cardMarket} onMarketChange={setCardMarket} />
                )}
              </div>
            </section>
          )}

          <SectionShell id="sb-section-upcoming" title="Upcoming" icon={<Trophy size={14} />} count={applyFilter(grouped.upcoming).length}>
            {(loading || restLoading) && grouped.upcoming.length === 0 ? (
              <SkeletonRows />
            ) : (
              <PaginatedLeagueList list={applyFilter(grouped.upcoming)} hasDraw={hasDraw} picks={picks} onPick={onPick} emptyLabel="No upcoming matches found." pageSize={10} market={cardMarket} onMarketChange={setCardMarket} />
            )}
          </SectionShell>

          {!UPCOMING_ONLY && applyFilter(grouped.ended).length > 0 && (
            <SectionShell id="sb-section-ended" title="Recently Ended" icon={<Trophy size={14} />} count={applyFilter(grouped.ended).length}>
              <EndedMatchList list={applyFilter(grouped.ended)} hasDraw={hasDraw} picks={picks} onPick={onPick} />
            </SectionShell>
          )}
        </>
      )}
    </div>
  );
}
