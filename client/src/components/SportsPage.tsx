import { useMemo, useRef, useState } from "react";
import { ChevronRight, Flame, Search, Star, Trophy, X } from "lucide-react";
import Sportsbook, { SPORT_TABS, type Pick } from "./Sportsbook";
import type { SportKey } from "@/lib/sportsbook";
import { useFavorites } from "@/lib/favorites";

/**
 * Sports page — 7up structure (owner, 2026-10-23): like the owner's 7UP
 * BET sportsbook, the page is a search bar over an A–Z index — first the
 * sports themselves (icon + name rows in one flat card, 7up's #azList),
 * then the competitions A–Z with match counts as the league navigation
 * (7up's sport page groups by league; here the index filters the board).
 * The match lists below stay the settled SportyBet card system, and the
 * page chrome is flat: no shadows, no gradient overlays (see the .spage
 * block in sporty.css).
 */
export default function SportsPage({ picks, onPick }: { picks: Pick[]; onPick: (p: Pick) => void }) {
  const [sport, setSport] = useState<SportKey>("football");
  const [leagueFilter, setLeagueFilter] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<string[]>([]);
  const [leagueCounts, setLeagueCounts] = useState<Record<string, number>>({});
  const [counts, setCounts] = useState({ live: 0, today: 0, upcoming: 0, total: 0 });
  const [query, setQuery] = useState("");
  const { favorites } = useFavorites();
  const favoriteMatches = favorites.filter((f) => f.kind === "match");
  const boardRef = useRef<HTMLDivElement | null>(null);

  const activeTab = SPORT_TABS.find((t) => t.key === sport) ?? SPORT_TABS[0];

  // 7up's A–Z list: sports in alphabetical order, live-filtered by the
  // search bar exactly like 7up's sportSearch() filters its #azList rows.
  const visibleSports = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...SPORT_TABS].sort((a, b) => a.label.localeCompare(b.label));
    return q ? sorted.filter((t) => t.label.toLowerCase().includes(q)) : sorted;
  }, [query]);

  const visibleLeagues = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? leagues.filter((l) => l.toLowerCase().includes(q)) : leagues;
    return [...filtered].sort((a, b) => (leagueCounts[b] ?? 0) - (leagueCounts[a] ?? 0) || a.localeCompare(b));
  }, [leagues, leagueCounts, query]);

  // One-page adaptation of 7up's tap-through: on phones the index sits
  // above the board, so a tap also brings the board into view.
  const scrollToBoard = () => {
    if (window.innerWidth <= 960) boardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const changeSport = (s: SportKey) => { setSport(s); setLeagueFilter(null); setQuery(""); scrollToBoard(); };
  const chooseLeague = (l: string | null) => { setLeagueFilter(l); scrollToBoard(); };

  return (
    <main className="wrap spage">
      <div className="spage-head">
        <h1 className="spage-title">Sports</h1>
        {counts.live > 0 && (
          <span className="spage-live-chip"><i className="spage-livedot" aria-hidden="true" />{counts.live} live now</span>
        )}
      </div>

      {/* 7up: the search bar sits at the very top of the sports page and
          filters the A–Z index as you type. */}
      <div className="spage-search">
        <Search size={16} aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sports, leagues…"
          aria-label="Search sports and leagues"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={15} /></button>
        )}
      </div>

      <div className="sports-page-grid">
        <aside className="spage-rail">
          {/* A–Z sports index (7up #azList): one flat card, icon + name
              rows. Per-sport match counts aren't loaded for unselected
              sports, so rows carry no invented numbers — the live dot
              shows on the active sport only, as before. */}
          <section className="spage-card" aria-label="All sports A to Z">
            <div className="spage-card-head"><Flame size={14} /> All Sports <span className="spage-card-head-note">A–Z</span></div>
            <div className="spage-az-list">
              {visibleSports.length === 0 ? (
                <p className="spage-empty">No sports match "{query}".</p>
              ) : visibleSports.map((t) => {
                const Icon = t.icon;
                const isActive = sport === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    className={`spage-az-row${isActive ? " on" : ""}`}
                    onClick={() => changeSport(t.key)}
                    aria-current={isActive ? "true" : undefined}
                  >
                    <span className="spage-az-icon" style={{ background: "#e1f3e7", color: "#0b7a43" }}><Icon size={15} /></span>
                    <span className="spage-az-label">{t.label}</span>
                    {isActive && counts.live > 0 && <i className="spage-livedot" aria-hidden="true" />}
                    <ChevronRight size={15} className="spage-az-chev" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </section>

          {/* Competitions A–Z: the league navigation layer (7up groups
              its sport page by league; here a tap filters the board). */}
          <section className="spage-card" aria-label="Competitions">
            <div className="spage-card-head"><Trophy size={14} /> Competitions <span className="spage-card-head-note">{activeTab.label}</span></div>
            <div className="spage-comp-list">
              <button
                type="button"
                className={`spage-comp-row${leagueFilter === null ? " on" : ""}`}
                onClick={() => chooseLeague(null)}
              >
                <span className="spage-comp-label">All competitions</span>
                <b className="spage-comp-count">{counts.total}</b>
              </button>
              {leagues.length === 0 ? (
                <p className="spage-empty">No competitions loaded yet.</p>
              ) : visibleLeagues.length === 0 ? (
                <p className="spage-empty">No competitions match "{query}".</p>
              ) : (
                visibleLeagues.map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={`spage-comp-row${leagueFilter === l ? " on" : ""}`}
                    onClick={() => chooseLeague(l)}
                  >
                    <span className="spage-comp-label">{l}</span>
                    <b className="spage-comp-count">{leagueCounts[l] ?? 0}</b>
                  </button>
                ))
              )}
            </div>
          </section>

          {favoriteMatches.length > 0 && (
            <section className="spage-card" aria-label="Favorites">
              <div className="spage-card-head"><Star size={14} /> Favorites</div>
              <p className="spage-empty" style={{ padding: "10px 14px 12px" }}>{favoriteMatches.length} favorite match{favoriteMatches.length === 1 ? "" : "es"} — view on the <a href="/favorites" style={{ color: "#0b7a43", fontWeight: 800 }}>Favorites page</a>.</p>
            </section>
          )}
        </aside>

        <div className="main-column" ref={boardRef}>
          {leagueFilter && (
            <div className="sports-filter-chip">
              <Trophy size={13} />
              Filtering by <b>{leagueFilter}</b>
              <button type="button" onClick={() => setLeagueFilter(null)} aria-label="Clear competition filter"><X size={13} /></button>
            </div>
          )}

          <Sportsbook
            picks={picks}
            onPick={onPick}
            sport={sport}
            onSportChange={changeSport}
            leagueFilter={leagueFilter}
            onMeta={({ leagues: l, leagueCounts: lc, counts: c }) => { setLeagues(l); setLeagueCounts(lc); setCounts(c); }}
          />
        </div>
      </div>
    </main>
  );
}
