/**
 * PlayBet homepage — the owner-approved sample v7 design
 * (~/workspace/playbet-rebrand/sample-v7) rebuilt as React components.
 * Sections are fed by the same football feeds the old homepage loaded
 * through Sportsbook (fetchSport / fetchAdminMatches); picks flow through
 * the app's existing Pick/onPick contract, so betslip behaviour is
 * unchanged. (The sample's instant-game rail, casino floor and winners
 * podium/ticker were removed on the owner's order, 2026-10-22; Recent
 * Winners is now a plain static list fed by the same WINNERS data.)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  categorise, fetchAdminMatches, fetchSport, isMatchLive, parseKickoff,
  type EnrichedMatch,
} from "@/lib/sportsbook";
import { type Pick } from "./Sportsbook";
import {
  SportyGroupHead, SportyMarketTabs, SportyMatchCard, sportyDayKey, sportyDayLabel,
  type CardMarket,
} from "./SportyCards";
import "../playbet.css";

/* ── hero carousel (slides verbatim from the approved sample) ───────── */
type HeroSlide = {
  img: string; alt: string; pos?: string; prize?: boolean;
  chip: string; title: React.ReactNode; sub: React.ReactNode; cta: string; href: string;
};
const HERO_SLIDES: HeroSlide[] = [
  {
    img: "/playbet/prize-iphone.webp", alt: "Win an iPhone 17 Pro with PlayBet", prize: true,
    chip: "MEGA PRIZE DRAW · ENDS 31 DEC 2026",
    title: <>Win an <span className="pb-l-green">iPhone</span> <span className="pb-l-outline">17 Pro</span></>,
    sub: <>+ TVs, fridges &amp; more home appliances — <b>every bet is a ticket in the draw.</b></>,
    cta: "Enter Draw →", href: "/promos",
  },
  {
    img: "/playbet/hero-stadium2.jpg", alt: "Packed football stadium at night during a match, seen from the stands", pos: "50% 42%",
    chip: "FOOTBALL · TOP 6 LEAGUES",
    title: <>Where <span className="pb-l-green">Legends</span> Play</>,
    sub: <>Premier League, LaLiga, Serie A, Bundesliga &amp; more — <b>bet every big game, live.</b></>,
    cta: "Bet Now →", href: "/live",
  },
  {
    img: "/playbet/hero-player.webp", alt: "Star footballer celebrating in front of the crowd during a match", pos: "26% 16%",
    chip: "THE GREATS · LIVE EVERY WEEK",
    title: <>Watch <span className="pb-l-green">Greatness</span> Live</>,
    sub: <>The biggest names in world football — <b>every goal, every game, live in your pocket.</b></>,
    cta: "Bet Live →", href: "/live",
  },
  {
    img: "/playbet/hero-squad.jpg", alt: "Football squad locked together in a huge team huddle on the pitch",
    chip: "YOUR TEAM · YOUR COLOURS",
    title: <>Back <span className="pb-l-green">Your</span> Team</>,
    sub: <>Stand with your side through every minute — <b>at home, away, everywhere.</b></>,
    cta: "Find Your Team →", href: "/sports",
  },
  {
    img: "/playbet/hero-match.jpg", alt: "Two players battling for the ball in a floodlit league match", pos: "50% 30%",
    chip: "IN-PLAY · AS IT HAPPENS",
    title: <>Every <span className="pb-l-green">Kick</span> Counts</>,
    sub: <>Derby drama, last-minute winners, full-blooded tackles — <b>ride every second, live.</b></>,
    cta: "Bet In-Play →", href: "/live",
  },
  {
    img: "/playbet/hero-fans.webp", alt: "Football fans waving scarves and celebrating in a stadium",
    chip: "MATCHDAY · EVERY WEEKEND",
    title: <>Feel <span className="pb-l-green">Every</span> Moment</>,
    sub: <>The roar, the scarves, the last-minute winner — <b>be part of it all.</b></>,
    cta: "Bet Now →", href: "/live",
  },
];
const HERO_DUR = 5000;

function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const pausedRef = useRef(false);
  const startXRef = useRef<number | null>(null);
  const count = HERO_SLIDES.length;

  useEffect(() => {
    const STEP = 50;
    const t = window.setInterval(() => {
      if (pausedRef.current) return;
      setElapsed((e) => {
        if (e + STEP >= HERO_DUR) {
          setIndex((i) => (i + 1) % count);
          return 0;
        }
        return e + STEP;
      });
    }, STEP);
    return () => window.clearInterval(t);
  }, [count]);

  const go = (n: number) => { setIndex(((n % count) + count) % count); setElapsed(0); };

  return (
    <section className="pb-hero" id="hero" aria-label="Featured">
      <div className="pb-car">
        <div
          className="pb-car-viewport"
          onPointerDown={(e) => { pausedRef.current = true; startXRef.current = e.clientX; }}
          onPointerUp={(e) => {
            if (startXRef.current === null) return;
            const dx = e.clientX - startXRef.current;
            if (dx <= -42) go(index + 1); else if (dx >= 42) go(index - 1);
            startXRef.current = null; pausedRef.current = false;
          }}
          onPointerLeave={() => { if (startXRef.current === null) pausedRef.current = false; }}
        >
          <div className="pb-car-track" style={{ transform: `translateX(-${index * 100}%)` }}>
            {HERO_SLIDES.map((s, i) => (
              <article key={s.chip} className="pb-car-slide pb-s-photo" aria-hidden={i !== index}>
                <div className={`pb-car-bg${s.prize ? " pb-bg-prize" : ""}`}>
                  <img src={s.img} alt={s.alt} style={s.pos ? { objectPosition: s.pos } : undefined} loading={i === 0 ? "eager" : "lazy"} />
                  <div className="pb-car-shade" />
                </div>
                <div className="pb-slide-in pb-photo-in">
                  <span className="pb-hero-chip"><span className="pb-dot" />{s.chip}</span>
                  <h1>{s.title}</h1>
                  <p className="pb-hero-sub">{s.sub}</p>
                  <div className="pb-hero-ctas"><Link className="pb-btn-hero" href={s.href}><span>{s.cta}</span></Link></div>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="pb-car-ui">
          {HERO_SLIDES.map((s, k) => (
            <button
              key={s.chip}
              type="button"
              className="pb-car-bar"
              aria-label={`Go to slide ${k + 1}`}
              onClick={() => go(k)}
            >
              <i style={{ width: k < index ? "100%" : k === index ? `${(elapsed / HERO_DUR) * 100}%` : "0%" }} />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── presentational data (verbatim from the approved sample) ────────── */
const WINNERS = [
  { name: "Kwame M.", amt: "48,250.00", game: "Football Multi · 8 legs", when: "12 min ago", rank: "TOP WINNER" },
  { name: "Ama S.", amt: "6,940.50", game: "Aviator", when: "26 min ago", rank: "2ND BIGGEST" },
  { name: "Yaw D.", amt: "12,300.00", game: "Live Betting · Serie A", when: "41 min ago", rank: "3RD BIGGEST" },
];
/* Match cards render through the shared SportyBet-mirror system
   (SportyCards.tsx) — same Pick contract as the sportsbook, so betslip
   behaviour is unchanged. */

/* ── the homepage ───────────────────────────────────────────────────── */
export default function PlayBetHome({ picks, onPick }: { picks: Pick[]; onPick: (p: Pick) => void }) {
  const [matches, setMatches] = useState<EnrichedMatch[]>([]);
  const [adminMatches, setAdminMatches] = useState<EnrichedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  // One market-tab selection shared by the In-Play and Coming Up lists.
  const [cardMarket, setCardMarket] = useState<CardMarket>("1X2");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [sportResult, admin] = await Promise.all([
          fetchSport("football", (batch) => { if (active) { setMatches(batch); setLoading(false); } }),
          fetchAdminMatches().catch(() => [] as EnrichedMatch[]),
        ]);
        if (!active) return;
        setMatches(sportResult);
        setAdminMatches(admin);
      } catch {
        /* feeds unreachable — sections render their empty states */
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const poll = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, 30_000);
    const adminPoll = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      fetchAdminMatches().then((rows) => { if (active) setAdminMatches(rows); }).catch(() => undefined);
    }, 5_000);
    return () => { active = false; window.clearInterval(poll); window.clearInterval(adminPoll); };
  }, []);

  const { live, upcoming } = useMemo(() => {
    const feed = matches.filter((m) => !m.isAdmin && String(m.source ?? "").trim().toUpperCase() !== "ADMIN_CREATED");
    const cats: Record<"live" | "today" | "upcoming" | "ended", EnrichedMatch[]> = { live: [], today: [], upcoming: [], ended: [] };
    for (const m of feed) { const c = categorise(m); if (c) cats[c].push(m); }

    const liveById = new Map<string, EnrichedMatch>();
    for (const m of cats.live) liveById.set(m.id, m);
    for (const m of adminMatches) if (isMatchLive(m) && !liveById.has(m.id)) liveById.set(m.id, m);
    const liveList = Array.from(liveById.values());

    const now = Date.now();
    // EVERY upcoming fixture shows (owner, 2026-10-22): the old top-8
    // slice here meant the list filled up with today's games and fixtures
    // on later dates never rendered at all.
    const up = [...cats.today, ...cats.upcoming]
      .filter((m) => { const t = m.kickoffAt ? parseKickoff(m.kickoffAt).getTime() : 0; return t > now; })
      .sort((a, b) => (parseKickoff(a.kickoffAt).getTime() || 0) - (parseKickoff(b.kickoffAt).getTime() || 0));

    return { live: liveList, upcoming: up };
  }, [matches, adminMatches]);

  // Coming Up grouped under SportyBet-style date bands, kickoff order kept.
  const upcomingGroups = useMemo(() => {
    const byDay = new Map<string, EnrichedMatch[]>();
    for (const m of upcoming) {
      const key = sportyDayKey(m.kickoffAt);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(m);
    }
    return Array.from(byDay.entries());
  }, [upcoming]);

  return (
    <div className="pb-root">
      <HeroCarousel />

      {/* LIVE — SportyBet-mirror list on a light ground. The list itself
          sits OUTSIDE .pb-wrap: full-bleed, edge to edge (owner: "the
          width should be 100%"); only the section head stays padded. */}
      <section className="pb-live pb-live-sporty" id="live">
        <div className="pb-wrap">
          <div className="pb-sec-head">
            <div className="pb-grow"><p className="pb-kicker"><span className="pb-dot" />Live now · {live.length} in play</p><h2 className="pb-sec-title">In-Play Arena</h2></div>
            <Link className="pb-sec-link" href="/live">All live →</Link>
          </div>
          {live.length === 0 && (
            <p className="pb-empty-note pb-empty-slim" style={{ color: "var(--pb-ink-2)", background: "#fff", borderColor: "#DFE7F0" }}>{loading ? "Loading live matches…" : "No matches are live right now."}</p>
          )}
        </div>
        {live.length > 0 && (
          <div className="sp-list">
            <SportyMarketTabs market={cardMarket} onChange={setCardMarket} />
            <SportyGroupHead label="Live · In-Play" live market={cardMarket} hasDraw />
            {live.slice(0, 6).map((m) => (
              <SportyMatchCard key={m.id} match={m} market={cardMarket} hasDraw picks={picks} onPick={onPick} />
            ))}
          </div>
        )}
      </section>

      {/* UPCOMING — SportyBet-mirror list grouped by date, full-bleed
          like the live list (only the section head stays in .pb-wrap) */}
      <section className="pb-upcoming" id="upcoming">
        <div className="pb-wrap">
          <div className="pb-sec-head">
            <div className="pb-grow"><p className="pb-kicker">Fixture list</p><h2 className="pb-sec-title">Coming Up</h2></div>
            <Link className="pb-sec-link" href="/sports">All fixtures →</Link>
          </div>
          {upcoming.length === 0 && (
            <p className="pb-empty-note" style={{ color: "var(--pb-ink-2)", background: "#fff", borderColor: "#DFE7F0" }}>{loading ? "Loading fixtures…" : "No upcoming fixtures are available right now — check back soon."}</p>
          )}
        </div>
        {upcoming.length > 0 && (
          <div className="sp-list">
            <SportyMarketTabs market={cardMarket} onChange={setCardMarket} />
            {upcomingGroups.map(([day, ms]) => (
              <div key={day}>
                <SportyGroupHead label={sportyDayLabel(ms[0].kickoffAt)} market={cardMarket} hasDraw />
                {ms.map((m) => (
                  <SportyMatchCard key={m.id} match={m} market={cardMarket} hasDraw picks={picks} onPick={onPick} />
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* WINNERS — static list (owner, 2026-10-22): the scrolling ticker
          and the trophy podium are gone. Each winner is one plain row:
          a Material Symbols icon, the winner's name and the amount.
          Nothing moves, nothing auto-scrolls. */}
      <section className="pb-winners" id="winners">
        <div className="pb-wrap">
          <div className="pb-sec-head">
            <div className="pb-grow"><p className="pb-kicker">Hall of fame</p><h2 className="pb-sec-title">Recent Winners</h2></div>
            <Link className="pb-sec-link" href="/promos">Full board →</Link>
          </div>
          <ul className="pb-winner-list">
            {WINNERS.map((w) => (
              <li key={w.name} className="pb-winner-row">
                <span className="material-symbols-rounded pb-winner-ic" aria-hidden="true">payments</span>
                <span className="pb-winner-name">{w.name}</span>
                <span className="pb-winner-amt">GH₵ {w.amt}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
