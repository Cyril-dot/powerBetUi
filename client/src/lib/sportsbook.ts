// =============================================================================
// sportsbook.ts — match aggregation, normalization & synthetic odds engine
// Every match reaching the UI gets an odds map. Real odds (from the feed) are
// fully clickable. Synthetic odds (generated when the feed has none) and live
// odds are shown at full color but are NOT clickable — display-only.
// =============================================================================

import api, { type Match } from "./api";

export type SportKey = "football" | "basketball" | "tennis" | "baseball" | "nfl" | "mma";

export interface OddsMap {
  home: number;
  draw: number;
  away: number;
}

export interface EnrichedMatch extends Match {
  oddsMap?: OddsMap;
  isSyntheticOdds?: boolean;
  isAdmin?: boolean;
  displayHomeLogo?: string;
  displayAwayLogo?: string;
}

/** The bets API accepts backend match UUIDs, not provider fixture numbers. */
export function isBettableMatchId(id: string | undefined): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id ?? "");
}

export type MatchCategory = "live" | "today" | "upcoming" | "ended";

export const TWO_WAY_SPORTS = new Set<SportKey>(["baseball", "basketball", "nfl", "mma"]);

export const LIVE_STATUSES = new Set([
  "LIVE", "live", "IN_PLAY", "in_play", "inplay", "IN_PROGRESS", "in_progress", "PLAYING", "playing",
  "FIRST_HALF", "first_half", "1H", "1h", "1ST", "1st", "SECOND_HALF", "second_half", "2H", "2h", "2ND", "2nd",
  "HALFTIME", "halftime", "HALF_TIME", "half_time", "HT", "ht",
  "EXTRA_TIME", "extra_time", "ET", "et", "ET1", "et1", "ET2", "et2", "OT", "ot", "OVERTIME", "overtime",
  "PENALTIES", "penalties", "PEN", "pen", "SHOOTOUT", "shootout",
  "BREAK", "break", "SUSPENDED", "suspended", "INTERRUPTED", "interrupted", "DELAYED", "delayed",
  "1ST_QUARTER", "2ND_QUARTER", "3RD_QUARTER", "4TH_QUARTER", "Q1", "Q2", "Q3", "Q4",
  "1ST_SET", "2ND_SET", "3RD_SET", "4TH_SET", "5TH_SET", "SET1", "SET2", "SET3", "SET4", "SET5",
  "STATUS_IN_PROGRESS", "STATUS_HALFTIME", "STATUS_FIRST_HALF", "STATUS_SECOND_HALF", "STATUS_OVERTIME",
  "STATUS_END_PERIOD", "STATUS_DELAYED",
]);

/** Normalizes a status string for comparison: uppercases and collapses spaces/dashes to underscores. */
function normalizeStatus(status: string): string {
  return status.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

/** Case/format-insensitive live check — catches "1st Half", "In-Play", "in play", etc. even if not in the exact-match set above. */
export function isLiveStatus(status: string): boolean {
  if (!status) return false;
  if (LIVE_STATUSES.has(status)) return true;
  const norm = normalizeStatus(status);
  if (LIVE_STATUSES.has(norm)) return true;
  return /^(LIVE|IN_PLAY|IN_PROGRESS|1ST|2ND|3RD|4TH|HALF|HT|ET|OT|PEN|Q[1-4]|SET[1-5])/.test(norm);
}

/** Statuses we don't recognize as either finished or clearly-live get logged once so real backend
 * status values can be captured and added above, instead of silently mis-bucketing live matches. */
const seenUnknownStatuses = new Set<string>();
function logUnknownStatus(status: string, context: string): void {
  if (!status || seenUnknownStatuses.has(status)) return;
  seenUnknownStatuses.add(status);
  // eslint-disable-next-line no-console
  console.debug(`[sportsbook] Unrecognized match status "${status}" seen in ${context} — if this match is actually live or finished, add it to LIVE_STATUSES/FINISHED_STATUSES in lib/sportsbook.ts.`);
}

export const FINISHED_STATUSES = new Set([
  "FINISHED", "finished", "FULL_TIME", "full_time", "FT", "ft",
  "AWARDED", "awarded", "CANCELLED", "cancelled", "CANCELED", "canceled",
  "POSTPONED", "postponed", "ABANDONED", "abandoned", "VOID", "void",
  "AFTER_EXTRA_TIME", "AET", "aet", "AFTER_PENALTIES", "AP", "ap",
  "ENDED", "ended", "COMPLETED", "completed", "COMPLETE", "complete",
  "STATUS_FINAL", "STATUS_FULL_TIME", "STATUS_POSTPONED", "STATUS_CANCELED", "STATUS_SUSPENDED",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seededFraction(seed: string, salt: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const x = Math.sin(h + salt) * 10000;
  return x - Math.floor(x);
}
function seededRange(seed: string, salt: number, min: number, max: number): number {
  return +(min + seededFraction(seed, salt) * (max - min)).toFixed(2);
}

function generateRandomOdds(seed: string): OddsMap {
  return {
    home: seededRange(seed, 1, 1.4, 3.8),
    draw: seededRange(seed, 2, 2.6, 3.9),
    away: seededRange(seed, 3, 1.4, 4.6),
  };
}

/** Guarantee every match has an oddsMap: real odds pass through, otherwise generate stable synthetic odds. */
export function ensureOdds(matches: EnrichedMatch[]): EnrichedMatch[] {
  const withOdds = matches.map((m) => {
    if (m.oddsMap && m.oddsMap.home > 0 && m.oddsMap.away > 0 && !m.isSyntheticOdds) {
      return { ...m, isSyntheticOdds: false };
    }
    const seed = m.id || `${m.homeTeam ?? ""}-${m.awayTeam ?? ""}`;
    return { ...m, oddsMap: generateRandomOdds(seed), isSyntheticOdds: true };
  });
  return resolveDisplayLogos(withOdds);
}

function numberValue(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

// ---------------------------------------------------------------------------
// Team crest handling — real logos from the feed, deterministic generated
// fallback (colored initials) when the feed has none.
// ---------------------------------------------------------------------------

const CREST_PALETTE: [string, string][] = [
  ["#2f6fd6", "#123b78"], ["#0B6E4F", "#043A2C"], ["#1D4ED8", "#0F2A6B"], ["#B4820F", "#6B4C08"],
  ["#7C3AED", "#3F1D75"], ["#0F766E", "#08403C"], ["#2f6fd6", "#123b78"], ["#334155", "#1A2230"],
];

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function teamInitials(name: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** Deterministic generated crest (SVG data URI) — same team always gets the same colors/initials. */
export function generateCrest(teamName: string): string {
  const name = (teamName ?? "").trim() || "Team";
  const h = hashString(name.toLowerCase());
  const [from, to] = CREST_PALETTE[h % CREST_PALETTE.length];
  const initials = teamInitials(name);
  const fontSize = initials.length > 1 ? 15 : 20;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>` +
    `</linearGradient></defs>` +
    `<circle cx="20" cy="20" r="20" fill="url(#g)"/>` +
    `<text x="20" y="20" font-family="sans-serif" font-size="${fontSize}" font-weight="800"` +
    ` fill="#ffffff" text-anchor="middle" dominant-baseline="central" letter-spacing="-0.5">${initials}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function sanitizeLogo(url: string | undefined | null): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (trimmed.startsWith("blob:")) return "";
  return trimmed;
}

/** Digs a team logo out of nested feed shapes: flat fields, a `logos[]` array, or a nested `team` object. */
function extractTeamLogo(teamObj: Record<string, unknown> | null): string {
  if (!teamObj) return "";
  const flat = teamObj.logo ?? teamObj.logoUrl ?? teamObj.logo_url ?? teamObj.crest ?? teamObj.badge ?? teamObj.image;
  if (typeof flat === "string" && flat.trim()) return sanitizeLogo(flat);
  const arr = teamObj.logos;
  if (Array.isArray(arr) && arr.length > 0) {
    for (const entry of arr as Record<string, unknown>[]) {
      const href = entry?.href ?? entry?.url ?? entry?.src;
      if (typeof href === "string" && href.trim()) return sanitizeLogo(href);
    }
  }
  const nested = teamObj.team;
  if (nested && typeof nested === "object") return extractTeamLogo(nested as Record<string, unknown>);
  return "";
}

// ---------------------------------------------------------------------------
// Admin-created "special game" logo fallback pool. Admin matches have no
// real team on record, so instead of the generated-initials crest used for
// every other match, they draw from a fixed pool of stock club-badge-style
// images (same categorised pool + rotation/cooldown/assignment scheme used
// by the reference sportsbook match list). Once a home/away pairing is
// assigned to an admin match id, it's cached in localStorage so the same
// match always shows the same two badges across reloads.
// ---------------------------------------------------------------------------

const ADMIN_HOME_LOGOS: string[] = ["/admin-logos/home-01.svg", "/admin-logos/home-02.svg", "/admin-logos/home-03.svg", "/admin-logos/home-04.svg", "/admin-logos/home-05.svg", "/admin-logos/home-06.svg", "/admin-logos/home-07.svg", "/admin-logos/home-08.svg", "/admin-logos/home-09.svg", "/admin-logos/home-10.svg", "/admin-logos/home-11.svg", "/admin-logos/home-12.svg", "/admin-logos/home-13.svg", "/admin-logos/home-14.svg", "/admin-logos/home-15.svg", "/admin-logos/home-16.svg", "/admin-logos/home-17.svg", "/admin-logos/home-18.svg", "/admin-logos/home-19.svg", "/admin-logos/home-20.svg", "/admin-logos/home-21.svg", "/admin-logos/home-22.svg", "/admin-logos/home-23.svg", "/admin-logos/home-24.svg", "/admin-logos/home-25.svg", "/admin-logos/home-26.svg", "/admin-logos/home-27.svg", "/admin-logos/home-28.svg", "/admin-logos/home-29.svg", "/admin-logos/home-30.svg"];
const ADMIN_AWAY_LOGOS: string[] = ["/admin-logos/away-01.svg", "/admin-logos/away-02.svg", "/admin-logos/away-03.svg", "/admin-logos/away-04.svg", "/admin-logos/away-05.svg", "/admin-logos/away-06.svg", "/admin-logos/away-07.svg", "/admin-logos/away-08.svg", "/admin-logos/away-09.svg", "/admin-logos/away-10.svg", "/admin-logos/away-11.svg", "/admin-logos/away-12.svg", "/admin-logos/away-13.svg", "/admin-logos/away-14.svg", "/admin-logos/away-15.svg", "/admin-logos/away-16.svg", "/admin-logos/away-17.svg", "/admin-logos/away-18.svg", "/admin-logos/away-19.svg", "/admin-logos/away-20.svg", "/admin-logos/away-21.svg", "/admin-logos/away-22.svg", "/admin-logos/away-23.svg", "/admin-logos/away-24.svg", "/admin-logos/away-25.svg", "/admin-logos/away-26.svg", "/admin-logos/away-27.svg", "/admin-logos/away-28.svg", "/admin-logos/away-29.svg", "/admin-logos/away-30.svg"];
// Keep home and away pools separate so one admin fixture never receives the same
// fallback crest on both sides. Selection is rotated and persisted per match.
const ADMIN_LOGO_CATEGORIES: string[][] = [ADMIN_HOME_LOGOS, ADMIN_AWAY_LOGOS];
const ADMIN_LOGO_USAGE_KEY = "admin_logo_usage_v1";
const ADMIN_LOGO_ASSIGN_KEY = "admin_logo_assignments_v1";
const ADMIN_LOGO_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

interface AdminLogoAssignment { home: string; away: string }

function loadLogoUsage(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ADMIN_LOGO_USAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, number>;
  } catch { /* ignore */ }
  return {};
}
function saveLogoUsage(usage: Record<string, number>): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(ADMIN_LOGO_USAGE_KEY, JSON.stringify(usage)); } catch { /* ignore */ }
}
function loadLogoAssignments(): Record<string, AdminLogoAssignment> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ADMIN_LOGO_ASSIGN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, AdminLogoAssignment>;
  } catch { /* ignore */ }
  return {};
}
function saveLogoAssignments(assignments: Record<string, AdminLogoAssignment>): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(ADMIN_LOGO_ASSIGN_KEY, JSON.stringify(assignments)); } catch { /* ignore */ }
}

function pickRandomAdminLogo(usage: Record<string, number>, exclude: Set<string>, categoryIndex = 0): string {
  const now = Date.now();
  const nonEmptyCategories = ADMIN_LOGO_CATEGORIES
    .map((cat) => cat.map(sanitizeLogo).filter((url) => url && !exclude.has(url)))
    .filter((cat) => cat.length > 0);
  if (nonEmptyCategories.length === 0) return "";
  const preferred = nonEmptyCategories[categoryIndex] ?? nonEmptyCategories[0];
  const orderedCategories = [preferred, ...nonEmptyCategories.filter((cat) => cat !== preferred)];
  for (const cat of orderedCategories) {
    const available = cat.filter((url) => !usage[url] || now - usage[url] > ADMIN_LOGO_COOLDOWN_MS);
    if (available.length > 0) return available[Math.floor(Math.random() * available.length)];
  }
  const all = nonEmptyCategories.flat();
  let best = all[0];
  let bestTime = usage[best] ?? 0;
  for (const url of all) {
    const t = usage[url] ?? 0;
    if (t < bestTime) { best = url; bestTime = t; }
  }
  return best;
}

/**
 * Assigns (and persistently caches) a home/away logo pair for each
 * admin-created match that doesn't already carry its own hardcoded crest.
 * Mirrors the reference sportsbook match list's admin-logo rotation exactly:
 * pulled from a fixed categorised pool, cooldown-aware so the same badge
 * isn't reused back-to-back across matches within a few days, and cached by
 * match id in localStorage so a given admin match always shows the same
 * pair on every subsequent load.
 */
function assignAdminLogos(adminMatches: EnrichedMatch[]): Map<string, AdminLogoAssignment> {
  const usage = loadLogoUsage();
  const assignments = loadLogoAssignments();
  let usageChanged = false;
  let assignmentsChanged = false;
  const result = new Map<string, AdminLogoAssignment>();

  for (const m of adminMatches) {
    const hardHome = sanitizeLogo(m.homeLogo);
    const hardAway = sanitizeLogo(m.awayLogo);
    const cached = assignments[m.id];
    let homeUrl = hardHome;
    let awayUrl = hardAway;

    if (!homeUrl) {
      if (cached?.home) homeUrl = cached.home;
      else {
        homeUrl = pickRandomAdminLogo(usage, new Set(), 0);
        if (homeUrl) { usage[homeUrl] = Date.now(); usageChanged = true; }
      }
    }
    if (!awayUrl) {
      if (cached?.away) awayUrl = cached.away;
      else {
        awayUrl = pickRandomAdminLogo(usage, new Set(homeUrl ? [homeUrl] : []), 1);
        if (awayUrl) { usage[awayUrl] = Date.now(); usageChanged = true; }
      }
    }

    if (!cached || cached.home !== homeUrl || cached.away !== awayUrl) {
      assignments[m.id] = { home: homeUrl, away: awayUrl };
      assignmentsChanged = true;
    }
    result.set(m.id, { home: homeUrl, away: awayUrl });
  }

  if (usageChanged) saveLogoUsage(usage);
  if (assignmentsChanged) saveLogoAssignments(assignments);
  return result;
}

/** Resolves the crest actually shown in the UI: real logo from the feed,
 * the admin stock-badge pool for admin-created "special games" that lack
 * their own hardcoded crest, or a generated-initials fallback for everyone
 * else. */
function resolveDisplayLogos(matches: EnrichedMatch[]): EnrichedMatch[] {
  const adminMatches = matches.filter((m) => m.isAdmin);
  const adminLogos = adminMatches.length > 0 ? assignAdminLogos(adminMatches) : new Map<string, AdminLogoAssignment>();

  return matches.map((m) => {
    if (m.isAdmin) {
      const assigned = adminLogos.get(m.id);
      return {
        ...m,
        displayHomeLogo: sanitizeLogo(m.homeLogo) || assigned?.home || generateCrest(m.homeTeam ?? ""),
        displayAwayLogo: sanitizeLogo(m.awayLogo) || assigned?.away || generateCrest(m.awayTeam ?? ""),
      };
    }
    return {
      ...m,
      displayHomeLogo: sanitizeLogo(m.homeLogo) || generateCrest(m.homeTeam ?? ""),
      displayAwayLogo: sanitizeLogo(m.awayLogo) || generateCrest(m.awayTeam ?? ""),
    };
  });
}

function extractOddsMap(oddsArray: unknown[], homeTeam: string, awayTeam: string): OddsMap | undefined {
  if (!Array.isArray(oddsArray) || oddsArray.length === 0) return undefined;
  const pool = oddsArray as Array<Record<string, unknown>>;
  const parseOdd = (o: Record<string, unknown>) => parseFloat(String(o.odd ?? o.value ?? o.odds ?? o.price ?? "0"));
  const norm = (s: string) => s.toLowerCase().trim();
  const nh = norm(homeTeam), na = norm(awayTeam);
  const matchTeam = (sel: string, t: string) => { const s = norm(sel); return s === t || s.includes(t) || t.includes(s); };
  let home = 0, draw = 0, away = 0;
  for (const o of pool) {
    const sel = norm(String(o.selection ?? o.outcome ?? o.name ?? o.label ?? o.type ?? ""));
    const val = parseOdd(o);
    if (val <= 1 || val > 200) continue;
    // Backend "1X2" selections are literally "1" (home), "X" (draw), "2" (away) —
    // see integration-audit.md. Previously only "home"/"away"/"draw" strings were
    // recognized, so every real match's odds fell through to the team-name match
    // (which also fails for "1"/"2"), left home/away at 0, and got discarded by
    // ensureOdds() in favor of random synthetic odds. This is why matches that
    // genuinely had live backend odds still showed as "EST. ODDS" and non-clickable
    // — on the home page lists AND on the match-details page, since both call
    // this same function.
    if (sel === "home" || sel === "1") { if (!home) home = val; }
    else if (sel === "away" || sel === "2") { if (!away) away = val; }
    else if (sel === "draw" || sel === "x") { if (!draw) draw = val; }
    else if (matchTeam(sel, nh)) { if (!home) home = val; }
    else if (matchTeam(sel, na)) { if (!away) away = val; }
  }
  if (!home && !draw && !away) {
    const vals = pool.map(parseOdd).filter((v) => v > 1 && v < 50);
    if (vals.length >= 3) return { home: vals[0], draw: vals[1], away: vals[2] };
    if (vals.length === 2) return { home: vals[0], draw: 0, away: vals[1] };
    return undefined;
  }
  return { home, draw, away };
}

function normalizeMatch(raw: unknown, sport: SportKey): EnrichedMatch | null {
  if (!raw || typeof raw !== "object") return null;
  // api.ts unwraps the backend envelope ({ success, data }) before this
  // module receives it. The football list endpoints then provide each item
  // as { match: {...UUID-backed match...}, odds: [...] }. Normalize the
  // nested match object instead of looking for id on the outer item.
  const outer = raw as Record<string, unknown>;
  const r = outer.match && typeof outer.match === "object"
    ? outer.match as Record<string, unknown>
    : outer;
  const idCandidates = [r.backendId, r.backend_id, r.uuid, r.matchUuid, r.match_uuid, r.id, r.matchId, r.match_id, r.fixtureId, r.fixture_id]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const id = idCandidates.find((candidate) => isBettableMatchId(candidate)) ?? "";
  if (!id) return null;

  // Dig home/away team objects out of ESPN-style nested competitor arrays,
  // falling back to flat homeTeam/awayTeam fields when present.
  let competitorHome: Record<string, unknown> | null = null;
  let competitorAway: Record<string, unknown> | null = null;
  const competitorsArr = Array.isArray(r.competitors) ? r.competitors as Record<string, unknown>[] : null;
  const competitionsArr = Array.isArray(r.competitions) ? r.competitions as Record<string, unknown>[] : null;
  const firstComp = competitionsArr?.[0] as Record<string, unknown> | undefined;
  const nestedCompetitors = Array.isArray(firstComp?.competitors) ? firstComp!.competitors as Record<string, unknown>[] : null;
  const resolveCompetitors = (arr: Record<string, unknown>[]) => {
    for (const c of arr) {
      const side = String(c.homeAway ?? c.type ?? "").toLowerCase();
      const teamObj = (c.team && typeof c.team === "object") ? c.team as Record<string, unknown> : c;
      if (side === "home") competitorHome = teamObj; else if (side === "away") competitorAway = teamObj;
    }
    if (!competitorHome && !competitorAway && arr.length >= 2) {
      const t0 = arr[0]; const t1 = arr[1];
      competitorHome = (t0.team && typeof t0.team === "object") ? t0.team as Record<string, unknown> : t0;
      competitorAway = (t1.team && typeof t1.team === "object") ? t1.team as Record<string, unknown> : t1;
    }
  };
  if (competitorsArr) resolveCompetitors(competitorsArr);
  if (!competitorHome && !competitorAway && nestedCompetitors) resolveCompetitors(nestedCompetitors);
  const homeObj = competitorHome ?? ((r.home && typeof r.home === "object") ? r.home as Record<string, unknown> : null);
  const awayObj = competitorAway ?? ((r.away && typeof r.away === "object") ? r.away as Record<string, unknown> : null);

  const homeTeam = String(r.homeTeam ?? r.home_team ?? r.homeName ?? homeObj?.name ?? homeObj?.displayName ?? homeObj?.teamName ?? "").trim();
  const awayTeam = String(r.awayTeam ?? r.away_team ?? r.awayName ?? awayObj?.name ?? awayObj?.displayName ?? awayObj?.teamName ?? "").trim();
  if (!homeTeam && !awayTeam) return null;

  const league = String(r.league ?? r.leagueName ?? r.competition ?? "");
  const status = String(r.status ?? r.matchStatus ?? "");
  const kickoffAt = String(r.kickoffAt ?? r.kickoff_at ?? r.startTime ?? r.date ?? "");
  let scoreHome = numberValue(r.scoreHome ?? r.score_home ?? r.homeScore ?? homeObj?.score);
  let scoreAway = numberValue(r.scoreAway ?? r.score_away ?? r.awayScore ?? awayObj?.score);
  // ESPN-style competitor entries commonly look like
  // { homeAway: "home", score: "2", team: { name, logos... } } — resolveCompetitors
  // above pulls `c.team` into homeObj/awayObj (for name/logo), which discards the
  // sibling `score` field that lives on `c` itself, not on `c.team`. That silently
  // dropped every live score for this very common shape. Re-scan the raw
  // competitors array directly (not the already-unwrapped team objects) for score.
  if (scoreHome == null || scoreAway == null) {
    const scoreCompetitors = competitorsArr ?? nestedCompetitors ?? [];
    for (const c of scoreCompetitors) {
      const side = String(c.homeAway ?? c.type ?? "").toLowerCase();
      const s = c.score != null ? numberValue(c.score) : undefined;
      if (side === "home" && s != null && scoreHome == null) scoreHome = s;
      if (side === "away" && s != null && scoreAway == null) scoreAway = s;
    }
  }
  const minutePlayed = numberValue(r.minutePlayed ?? r.minute_played);
  const homeLogo = extractTeamLogo(homeObj) || sanitizeLogo(String(r.homeLogo ?? r.home_logo ?? ""));
  const awayLogo = extractTeamLogo(awayObj) || sanitizeLogo(String(r.awayLogo ?? r.away_logo ?? ""));
  return {
    id,
    externalId: String(r.externalId ?? r.external_id ?? r.eventId ?? r.event_id ?? "") || undefined,
    source: (r.source as Match["source"]) ?? "ESPN", homeTeam, awayTeam, league, status,
    kickoffAt, scoreHome, scoreAway, homeLogo, awayLogo, sport, minutePlayed, createdAt: String(r.createdAt ?? ""),
  } as EnrichedMatch;
}

function unwrapList(raw: unknown, sport: SportKey): EnrichedMatch[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((m) => normalizeMatch(m, sport)).filter((m): m is EnrichedMatch => !!m);
  const obj = raw as Record<string, unknown>;
  if (!obj.success || !obj.data) return [];
  if (Array.isArray(obj.data)) return obj.data.map((m) => normalizeMatch(m, sport)).filter((m): m is EnrichedMatch => !!m);
  const all: unknown[] = [];
  if (typeof obj.data === "object") for (const v of Object.values(obj.data as Record<string, unknown>)) if (Array.isArray(v)) all.push(...v);
  return all.map((m) => normalizeMatch(m, sport)).filter((m): m is EnrichedMatch => !!m);
}

function unwrapWithOdds(raw: unknown, sport: SportKey): Array<{ match: EnrichedMatch; odds: unknown[] }> {
  if (!raw) return [];
  const obj = raw as Record<string, unknown>;
  // get() in api.ts already unwraps { success, data }, so raw is normally
  // the data array here. Keep support for the wrapped shape for direct use.
  const data: unknown = Array.isArray(raw) ? raw : obj.success ? obj.data : undefined;
  if (!data) return [];
  const items: Array<{ match: EnrichedMatch; odds: unknown[] }> = [];
  const process = (item: unknown) => {
    const i = item as Record<string, unknown>;
    const match = normalizeMatch(i.match ?? i, sport);
    if (!match?.id) return;
    const odds: unknown[] = Array.isArray(i.match_result) ? i.match_result : Array.isArray(i.odds) ? i.odds : Array.isArray(i.markets) ? i.markets : [];
    items.push({ match, odds });
  };
  if (Array.isArray(data)) data.forEach(process);
  else if (typeof data === "object") for (const v of Object.values(data as Record<string, unknown>)) if (Array.isArray(v)) v.forEach(process);
  return items;
}

/**
 * Dedup by match id — but NOT simple first-wins. If one entry is LIVE and a
 * duplicate isn't (e.g. a stale "today" list still has the old status while
 * the live() endpoint already updated it), the live one always wins. This
 * prevents live matches from silently reverting to "upcoming"/"today" just
 * because of endpoint response order.
 */
function dedupById(matches: EnrichedMatch[]): EnrichedMatch[] {
  const byId = new Map<string, EnrichedMatch>();
  for (const m of matches) {
    if (!m.id) continue;
    const existing = byId.get(m.id);
    if (!existing) { byId.set(m.id, m); continue; }
    const existingLive = isLiveStatus(existing.status ?? "");
    const currentLive = isLiveStatus(m.status ?? "");
    if (currentLive && !existingLive) { byId.set(m.id, m); continue; }
    if (existingLive && !currentLive) continue;
    const existingHasScore = existing.scoreHome != null || existing.scoreAway != null;
    const currentHasScore = m.scoreHome != null || m.scoreAway != null;
    if (currentHasScore && !existingHasScore) byId.set(m.id, m);
  }
  return Array.from(byId.values());
}

/**
 * Second dedup pass, by (home team + away team + kickoff day) fingerprint
 * rather than id. Id-based dedup alone misses cases where two different feed
 * endpoints describe the exact same real-world fixture under two different
 * id schemes — this became a real issue once football's fetch started
 * pulling from several livescore endpoints (fixtures, all-leagues/today,
 * all-cups/today) alongside the main football/matches endpoints, since those
 * don't necessarily share an id namespace with each other. Without this, the
 * same match could render as two separate rows in "Today". Prefers whichever
 * duplicate is live, then whichever has a real score, then whichever has
 * real (non-synthetic-eligible) odds data already attached — same priority
 * order as the id-based pass above, just keyed differently.
 */
function dedupByFingerprint(matches: EnrichedMatch[]): EnrichedMatch[] {
  const byFp = new Map<string, EnrichedMatch>();
  let noFpCounter = 0;
  for (const m of matches) {
    const home = (m.homeTeam ?? "").trim().toLowerCase();
    const away = (m.awayTeam ?? "").trim().toLowerCase();
    if (!home || !away) { byFp.set(`__nofp_${noFpCounter++}`, m); continue; }
    const dayKey = m.kickoffAt ? parseKickoff(m.kickoffAt).toISOString().slice(0, 10) : "";
    const fp = `${home}|${away}|${dayKey}`;
    const existing = byFp.get(fp);
    if (!existing) { byFp.set(fp, m); continue; }
    // The same fixture can arrive from the main backend table with a UUID
    // and from ESPN/livescore with a short provider ID. Keep the UUID record
    // so detail, market, and bet endpoints receive the ID they understand.
    const existingBackendId = isBettableMatchId(existing.id);
    const currentBackendId = isBettableMatchId(m.id);
    if (currentBackendId && !existingBackendId) { byFp.set(fp, m); continue; }
    if (existingBackendId && !currentBackendId) continue;
    const existingLive = isLiveStatus(existing.status ?? "");
    const currentLive = isLiveStatus(m.status ?? "");
    if (currentLive && !existingLive) { byFp.set(fp, m); continue; }
    if (existingLive && !currentLive) continue;
    const existingHasScore = existing.scoreHome != null || existing.scoreAway != null;
    const currentHasScore = m.scoreHome != null || m.scoreAway != null;
    if (currentHasScore && !existingHasScore) { byFp.set(fp, m); continue; }
    if (existingHasScore && !currentHasScore) continue;
    const existingHasOdds = !!existing.oddsMap && (existing.oddsMap.home > 0 || existing.oddsMap.away > 0);
    const currentHasOdds = !!m.oddsMap && (m.oddsMap.home > 0 || m.oddsMap.away > 0);
    if (currentHasOdds && !existingHasOdds) byFp.set(fp, m);
  }
  return Array.from(byFp.values());
}

/**
 * Single source of truth for "is this match live", used by BOTH the section
 * bucketing (categorise, below) and the match row's own render logic
 * (Sportsbook.tsx MatchRow). Previously those two used different checks —
 * categorise() had a kickoff-time fallback for unrecognized status strings,
 * but MatchRow only checked isLiveStatus(status) directly. That meant a
 * match with NO status at all (common for schedule-only feeds like
 * livescore/fixtures or livescore/all-leagues/today, which list fixtures
 * but don't carry live tracking data) could get bucketed into "Live Now" by
 * categorise()'s time-based guess, while MatchRow — seeing no live status —
 * still rendered it as a scheduled match: kickoff time + "Starting soon"
 * countdown, no score, no running clock. Matches would sit in the Live
 * section looking exactly like non-live fixtures.
 *
 * Fix: the time-based "maybe live" fallback now only fires when the feed
 * gave us SOME status string that we just don't recognize (a genuine
 * unfamiliar live-status label) — not when status is completely empty,
 * which really just means "no live data available" and shouldn't be guessed
 * at. Both categorise() and MatchRow now call this exact function.
 */
/**
 * Backend kickoff timestamps are meant to be UTC, but when the string has no
 * explicit UTC/offset marker (e.g. "2026-08-16T15:00:00" instead of
 * "...15:00:00Z"), the JS Date parser's spec behavior is to interpret a
 * date-TIME string with no timezone designator as LOCAL time in whatever
 * timezone the browser happens to be running in — not UTC. That silently
 * shifts every kickoff time by the visitor's UTC offset, and the shift is
 * different depending on where the page happens to load. Ghana is UTC+0
 * year-round, so a Ghana visitor might not notice a small shift, but anyone
 * elsewhere would see kickoffs off by hours. This normalizes any bare
 * date-time string to explicit UTC before parsing, so the true kickoff
 * instant is always correct regardless of where the browser is running —
 * and everything downstream (formatKickoff, formatKickoffDate, the live
 * clock, categorise, Countdown) then renders it via the browser's own local
 * timezone automatically (no manual geo/country lookup needed — the browser
 * already knows the visitor's timezone; for a Ghana device that's UTC+0).
 */
export function parseKickoff(kickoffAt?: string): Date {
  if (!kickoffAt) return new Date(NaN);
  const s = kickoffAt.trim();
  const hasTimePart = /T\d{2}:\d{2}/.test(s);
  const hasZoneDesignator = /Z$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
  const normalized = hasTimePart && !hasZoneDesignator ? `${s}Z` : s;
  return new Date(normalized);
}

export function isMatchLive(match: EnrichedMatch): boolean {
  const status = match.status ?? "";
  if (FINISHED_STATUSES.has(status)) return false;
  if (isLiveStatus(status)) return true;
  if (status && match.kickoffAt) {
    const kickoff = parseKickoff(match.kickoffAt);
    const now = new Date();
    if (!Number.isNaN(kickoff.getTime())) {
      const minutesSinceKickoff = (now.getTime() - kickoff.getTime()) / 60_000;
      if (minutesSinceKickoff > 0 && minutesSinceKickoff < 180) {
        logUnknownStatus(status, "isMatchLive (treated as live by kickoff time, status was non-empty but unrecognized)");
        return true;
      }
    }
  }
  return false;
}

/** How long after kickoff a match is still worth showing in "Recently Ended"
 * before it just quietly disappears — no one needs to see a week-old result
 * sitting in the home page match list. */
const RECENTLY_ENDED_WINDOW_MS = 24 * 60 * 60 * 1000;

function hasRealScore(match: EnrichedMatch): boolean {
  return match.scoreHome != null && match.scoreAway != null;
}

export function categorise(match: EnrichedMatch): MatchCategory | null {
  const status = match.status ?? "";
  const kickoff = match.kickoffAt ? parseKickoff(match.kickoffAt) : null;
  const kickoffValid = kickoff && !Number.isNaN(kickoff.getTime());
  const msSinceKickoff = kickoffValid ? Date.now() - kickoff!.getTime() : null;

  if (FINISHED_STATUSES.has(status)) {
    // The backend explicitly told us this match is over. Previously this
    // returned null unconditionally — meaning even a properly finished match
    // with a real final score was just thrown away and never shown anywhere.
    // Show it with its score if it's recent enough to matter; otherwise let
    // it drop off same as before.
    if (hasRealScore(match) && (msSinceKickoff == null || msSinceKickoff < RECENTLY_ENDED_WINDOW_MS)) return "ended";
    return null;
  }

  if (isMatchLive(match)) return "live";

  if (kickoffValid && msSinceKickoff != null) {
    // Kickoff was more than 3 hours ago (longer than any normal match,
    // including stoppage time) and nothing marked it live or finished. Most
    // likely it genuinely has ended and the feed just never sent a proper
    // FINISHED status for it (common for matches that only ever appear in
    // schedule/fixture-listing endpoints, not the dedicated results feed).
    // Rather than leaving it sitting under "Today" with a stale kickoff time
    // and a "Starting soon" countdown that's obviously wrong by now: show it
    // as ended WITH its real score if the feed happened to give us one
    // anyway, or hide it entirely if not — never guess at a result we can't
    // actually back up with real score data.
    if (msSinceKickoff > 180 * 60_000) {
      if (hasRealScore(match) && msSinceKickoff < RECENTLY_ENDED_WINDOW_MS) return "ended";
      return null;
    }
    // "Today" is a rolling near-term window (kickoff within the next 3
    // days, or already past but not live/finished), not strictly "same
    // calendar date" — a match kicking off tomorrow or the day after is
    // still near-term and belongs here. "Upcoming" is reserved for fixtures
    // genuinely more than 3 days out. Each row still shows its own precise
    // day label (Today/Tomorrow/date) via formatKickoffDate() below, so
    // nothing about which specific day a match falls on is lost — this only
    // changes which section groups it under.
    const daysUntil = -msSinceKickoff / 86_400_000;
    if (daysUntil > 3) return "upcoming";
    return "today";
  }
  return "upcoming";
}

export function formatKickoff(kickoffAt?: string): string {
  if (!kickoffAt) return "--:--";
  const d = parseKickoff(kickoffAt);
  // No explicit timeZone passed — toLocaleTimeString then renders in
  // whatever timezone the device itself is set to, which is exactly what we
  // want: the visitor's own local time, automatically, with no separate
  // country/geo lookup required. A Ghana device is already configured for
  // Africa/Accra (UTC+0) at the OS level.
  return Number.isNaN(d.getTime()) ? "--:--" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Short date label ("Today", "Tomorrow", "Yesterday", or "16 Aug") to sit
 * next to the kickoff time. */
export function formatKickoffDate(kickoffAt?: string): string {
  if (!kickoffAt) return "";
  const d = parseKickoff(kickoffAt);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  // Compare using the browser's LOCAL calendar date, not the UTC date — using
  // toISOString() here (UTC-based) would mislabel "Today"/"Tomorrow" for any
  // visitor whose local date has already rolled over relative to UTC (e.g.
  // evening kickoffs for timezones ahead of UTC). toLocaleDateString with the
  // 'en-CA' locale reliably formats as YYYY-MM-DD in the LOCAL timezone.
  const localKey = (date: Date) => date.toLocaleDateString("en-CA");
  const dKey = localKey(d);
  const todayKey = localKey(now);
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const tomorrowKey = localKey(tomorrow);
  const yesterday = new Date(now.getTime() - 86_400_000);
  const yesterdayKey = localKey(yesterday);
  if (dKey === todayKey) return "Today";
  if (dKey === tomorrowKey) return "Tomorrow";
  if (dKey === yesterdayKey) return "Yesterday";
  return d.toLocaleDateString([], { day: "2-digit", month: "short" });
}

/**
 * Standard football timing, derived purely from kickoff time:
 *   0–45 min after kickoff  → first half, minute ticks 1'–45'
 *   45–60 min after kickoff → half-time break (15 min)
 *   60–105 min after kickoff → second half, minute ticks 45'–90' (elapsed-60+45)
 *   105+ min after kickoff  → treated as full time (90+') unless the backend
 *                             explicitly says extra time / penalties
 *
 * This is the fallback used whenever the feed hasn't given us a real
 * `minutePlayed` or a recognizable live status — which is common for matches
 * that only ever appear in schedule/fixture-style endpoints (no live
 * tracking data). Previously those matches showed a static "LIVE" label
 * forever with no moving clock. Whenever the backend DOES give us real
 * minutePlayed/status, that's used instead — this is a fallback, not an
 * override of real data.
 */
function deriveClockFromKickoff(kickoffAt: string): string {
  const kickoff = parseKickoff(kickoffAt).getTime();
  if (Number.isNaN(kickoff)) return "LIVE";
  const elapsedMin = (Date.now() - kickoff) / 60_000;
  if (elapsedMin < 0) return "LIVE";
  if (elapsedMin <= 45) return `${Math.max(1, Math.floor(elapsedMin))}'`;
  if (elapsedMin <= 60) return "HT";
  if (elapsedMin <= 105) return `${45 + Math.floor(elapsedMin - 60)}'`;
  return "90+'";
}

export function liveClock(match: EnrichedMatch): string {
  const s = match.status ?? "";
  if (["HALFTIME", "halftime", "HT", "ht"].includes(s)) return "HT";
  if (["PENALTIES", "penalties", "PEN", "pen"].includes(s)) return "PEN";
  if (["EXTRA_TIME", "extra_time", "ET", "et"].includes(s)) return "ET";
  if (match.minutePlayed != null) return `${match.minutePlayed}'`;
  if (match.kickoffAt) return deriveClockFromKickoff(match.kickoffAt);
  return "LIVE";
}

// ---------------------------------------------------------------------------
// Per-sport fetchers — always return matches WITH odds guaranteed (ensureOdds)
// ---------------------------------------------------------------------------

async function settleList<T>(p: Promise<T>): Promise<T | undefined> {
  fetchStats.total++;
  try { return await p; } catch { fetchStats.failed++; return undefined; }
}

/** Like settleList, but preserves whether the call actually succeeded vs.
 * threw (settleList collapses both a genuine empty response and a thrown
 * error to the same `undefined`, which made it impossible to tell "this
 * endpoint has no data" apart from "this endpoint 404'd" in diagnostics). */
async function settlePromise<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try { return { ok: true, value: await p }; }
  catch (err) { return { ok: false, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) }; }
}

/** Tracks how many of the most recent batch of API calls failed, so the UI
 * can tell "genuinely no matches" apart from "couldn't reach the API". */
const fetchStats = { total: 0, failed: 0 };
function resetFetchStats() { fetchStats.total = 0; fetchStats.failed = 0; }
export function getLastFetchStatus(): { total: number; failed: number; allFailed: boolean } {
  return { total: fetchStats.total, failed: fetchStats.failed, allFailed: fetchStats.total > 0 && fetchStats.failed === fetchStats.total };
}

/** Keep whichever odds array is longer for a given match id — a later source
 * (e.g. "today") may carry a fuller markets list than an earlier one. */
function mergeOddsById(target: Map<string, unknown[]>, entries: Array<{ match: EnrichedMatch; odds: unknown[] }>): void {
  for (const { match, odds } of entries) {
    if (!odds.length) continue;
    const existing = target.get(match.id);
    if (!existing || odds.length > existing.length) target.set(match.id, odds);
  }
}

/**
 * Reconcile provider-only IDs against the UUID-backed football feed before
 * rows are rendered. Some source endpoints expose the same fixture with a
 * short ESPN ID while /matches/live exposes the backend UUID. The two records
 * are not always identical enough for a single fingerprint pass, so aliases
 * are reconciled explicitly by external ID and then by team pair.
 */
function reconcileFootballBackendIds(matches: EnrichedMatch[]): EnrichedMatch[] {
  const uuidRecords = matches.filter((m) => isBettableMatchId(m.id));
  const byExternalId = new Map<string, EnrichedMatch>();
  const byTeams = new Map<string, EnrichedMatch>();
  const teamKey = (m: EnrichedMatch) => `${(m.homeTeam ?? "").trim().toLowerCase()}|${(m.awayTeam ?? "").trim().toLowerCase()}`;
  for (const m of uuidRecords) {
    const external = String(m.externalId ?? "").trim().toLowerCase();
    if (external) {
      byExternalId.set(external, m);
      byExternalId.set(external.replace(/^espn-/, ""), m);
    }
    const teams = teamKey(m);
    if (teams !== "|") byTeams.set(teams, m);
  }
  return matches.map((m) => {
    if (isBettableMatchId(m.id)) return m;
    const external = String(m.externalId ?? "").trim().toLowerCase();
    const alias = byExternalId.get(external) ?? byExternalId.get(external.replace(/^espn-/, ""));
    const teamMatch = byTeams.get(teamKey(m));
    const canonical = alias ?? teamMatch;
    if (!canonical) return m;
    return { ...canonical, ...m, id: canonical.id, externalId: m.externalId ?? canonical.externalId };
  });
}

export async function fetchFootball(onProgress?: (matches: EnrichedMatch[]) => void): Promise<EnrichedMatch[]> {
  resetFetchStats();
  const log = (...args: unknown[]) => { /* eslint-disable-next-line no-console */ console.debug("[sportsbook][fetchFootball]", ...args); };
  // The /matches feeds are the canonical sportsbook sources. Their nested
  // match.id is the backend UUID required by detail, odds, and bet APIs.
  // Livescore feeds expose raw ESPN/provider event numbers instead; they may
  // be used for scoreboard enrichment, but must not become row IDs here.
  // Stage 1: live matches are the highest-value content. Resolve this before
  // requesting the larger upcoming/today/finished feeds and publish them to
  // the UI immediately when a progressive caller is present.
  const live = await settleList(api.publicFootball.live());
  const preview = (sources: unknown[]): EnrichedMatch[] => {
    const items = sources.flatMap((source) => [
      ...unwrapWithOdds(source, "football").map((i) => i.match),
      ...unwrapList(source, "football"),
    ]);
    return ensureOdds(dedupById(reconcileFootballBackendIds(items).filter((m) => isBettableMatchId(m.id))));
  };
  onProgress?.(preview([live]));

  // Stage 2: upcoming and today are loaded together after live is available.
  const [upcoming, today, cupsUp, cupsToday, cupsLive] = await Promise.all([
    settleList(api.publicFootball.upcoming()),
    settleList(api.publicFootball.today()),
    settleList(api.publicFootball.allCupsUpcoming()),
    settleList(api.publicFootball.allCupsToday()),
    settleList(api.publicFootball.allCupsLive()),
  ]);
  onProgress?.(preview([live, upcoming, today, cupsUp, cupsToday, cupsLive]));

  // Stage 3: finished results and the odds index are lower priority and are
  // fetched only after live/upcoming/today have been requested.
  const [withOdds, results] = await Promise.all([
    settleList(api.publicFootball.withAllOdds()),
    settleList(api.publicFootball.results(50)),
  ]);

  // Pull embedded odds out of every response shape that can carry them, not
  // just withAllOdds — "live"/"upcoming"/"today" can each embed their own
  // per-match odds/markets array, and previously anything embedded there was
  // silently discarded because those three were only run through the
  // odds-less unwrapList(). Whichever source has the fullest odds list for a
  // given match id wins.
  const withOddsItems = unwrapWithOdds(withOdds, "football");
  const liveOddsItems = unwrapWithOdds(live, "football");
  const upcomingOddsItems = unwrapWithOdds(upcoming, "football");
  const todayOddsItems = unwrapWithOdds(today, "football");
  const oddsById = new Map<string, unknown[]>();
  mergeOddsById(oddsById, withOddsItems);
  mergeOddsById(oddsById, liveOddsItems);
  mergeOddsById(oddsById, upcomingOddsItems);
  mergeOddsById(oddsById, todayOddsItems);

  // Per-source raw counts, logged unconditionally (not just on error) so a
  // report of "today's matches are missing/wrong" can be diagnosed from the
  // browser console directly: which source(s) came back empty or failed,
  // rather than guessing blind. A source showing 0 here when it should have
  // data means that specific backend endpoint is the problem, not this
  // client code; a source failing (undefined, due to settleList's catch)
  // means the request itself errored (network/CORS/5xx) — check
  // getLastFetchStatus() / the network tab for that specific path.
  log("raw per-source match counts", {
    withOdds: withOdds === undefined ? "FAILED" : withOddsItems.length,
    live: live === undefined ? "FAILED" : unwrapList(live, "football").length,
    upcoming: upcoming === undefined ? "FAILED" : unwrapList(upcoming, "football").length,
    today: today === undefined ? "FAILED" : unwrapList(today, "football").length,
    results: results === undefined ? "FAILED" : unwrapList(results, "football").length,
    cupsUpcoming: cupsUp === undefined ? "FAILED" : unwrapList(cupsUp, "football").length,
    cupsToday: cupsToday === undefined ? "FAILED" : unwrapList(cupsToday, "football").length,
    cupsLive: cupsLive === undefined ? "FAILED" : unwrapList(cupsLive, "football").length,
  });

  const all: EnrichedMatch[] = [
    ...withOddsItems.map((i) => i.match),
    ...unwrapList(live, "football"),
    ...unwrapList(upcoming, "football"),
    ...unwrapList(today, "football"),
    ...unwrapList(results, "football"),
    ...unwrapList(cupsUp, "football"),
    ...unwrapList(cupsToday, "football"),
    ...unwrapList(cupsLive, "football"),
  ];
  log("combined (pre-dedup) match count", all.length);
  // Keep the reconciliation guard for provider aliases that may appear in a
  // main feed, but never let a numeric provider ID reach the sportsbook UI.
  const reconciled = reconcileFootballBackendIds(all).filter((m) => isBettableMatchId(m.id));
  log("after canonical backend-ID reconciliation", {
    total: reconciled.length,
    uuidBacked: reconciled.filter((m) => isBettableMatchId(m.id)).length,
  });
  for (let i = 0; i < all.length; i += 1) {
    const sourceId = all[i]?.id;
    const canonicalId = reconciled[i]?.id;
    const sourceOdds = sourceId ? oddsById.get(sourceId) : undefined;
    if (sourceOdds?.length && canonicalId && canonicalId !== sourceId) {
      const existing = oddsById.get(canonicalId);
      if (!existing || sourceOdds.length > existing.length) oddsById.set(canonicalId, sourceOdds);
    }
  }

  const deduped = dedupById(reconciled);
  log("after id-based dedup", deduped.length);
  const enrichedPass1 = deduped.map((m) => {
    const oddsMap = extractOddsMap(oddsById.get(m.id) ?? [], m.homeTeam, m.awayTeam);
    return { ...m, oddsMap, _needsOdds: !oddsMap && !FINISHED_STATUSES.has(m.status ?? "") };
  });

  // Second pass: for any match still without odds after the bulk endpoints,
  // fetch its odds individually. Bulk feeds sometimes only embed odds for a
  // subset of matches even when odds do exist per-match. Capped at 30 to
  // avoid hammering the backend on a page with a large fixture list.
  const needsIndividualOdds = enrichedPass1.filter((m) => m._needsOdds).slice(0, 30);
  const individualResults = await Promise.all(
    needsIndividualOdds.map((m) => settleList(api.publicFootball.odds(m.id)))
  );
  const individualOddsById = new Map<string, unknown[]>();
  needsIndividualOdds.forEach((m, idx) => {
    const raw = individualResults[idx];
    const arr = Array.isArray(raw) ? raw : [];
    if (arr.length) individualOddsById.set(m.id, arr);
  });

  const enriched = enrichedPass1.map(({ _needsOdds, ...m }) => {
    if (!_needsOdds) return m as EnrichedMatch;
    const indOdds = individualOddsById.get(m.id);
    if (!indOdds) return m as EnrichedMatch;
    return { ...m, oddsMap: extractOddsMap(indOdds, m.homeTeam, m.awayTeam) } as EnrichedMatch;
  });

  // Fingerprint dedup runs last (after odds are attached) so that when the
  // same real-world fixture arrived under two different ids from two
  // different endpoints, we keep whichever copy ended up with real odds
  // attached, not an arbitrary one.
  const final = ensureOdds(dedupByFingerprint(enriched));
  const catCounts = { live: 0, today: 0, upcoming: 0, ended: 0, hidden: 0 };
  for (const m of final) { const c = categorise(m); if (c) catCounts[c]++; else catCounts.hidden++; }
  log("final match count after all dedup passes", final.length, "categorised as", catCounts);
  return final;
}

export async function fetchBasketball(): Promise<EnrichedMatch[]> {
  resetFetchStats();
  const [live, upcoming, results] = await Promise.all([
    settleList(api.publicBasketball.live()), settleList(api.publicBasketball.upcoming()), settleList(api.publicBasketball.results()),
  ]);
  const items = [...unwrapWithOdds(live, "basketball"), ...unwrapWithOdds(upcoming, "basketball"), ...unwrapWithOdds(results, "basketball")];
  const fallback = [...unwrapList(live, "basketball"), ...unwrapList(upcoming, "basketball"), ...unwrapList(results, "basketball")];
  const source = items.length ? items.map((i) => ({ ...i.match, oddsMap: extractOddsMap(i.odds, i.match.homeTeam, i.match.awayTeam) })) : fallback;
  return ensureOdds(dedupById(source));
}

export async function fetchTennis(): Promise<EnrichedMatch[]> {
  resetFetchStats();
  const [live, upcoming, results] = await Promise.all([
    settleList(api.publicTennis.live()), settleList(api.publicTennis.upcoming()), settleList(api.publicTennis.results()),
  ]);
  const all = [...unwrapList(live, "tennis"), ...unwrapList(upcoming, "tennis"), ...unwrapList(results, "tennis")];
  return ensureOdds(dedupById(all));
}

export async function fetchBaseball(): Promise<EnrichedMatch[]> {
  resetFetchStats();
  const [live, upcoming, today] = await Promise.all([
    settleList(api.publicBaseball.live()), settleList(api.publicBaseball.upcoming()), settleList(api.publicBaseball.today()),
  ]);
  const all = [...unwrapList(live, "baseball"), ...unwrapList(upcoming, "baseball"), ...unwrapList(today, "baseball")];
  return ensureOdds(dedupById(all));
}

export async function fetchNfl(): Promise<EnrichedMatch[]> {
  resetFetchStats();
  const [live, upcoming, results] = await Promise.all([
    settleList(api.publicNfl.live()), settleList(api.publicNfl.upcoming()), settleList(api.publicNfl.results()),
  ]);
  const all = [...unwrapList(live, "nfl"), ...unwrapList(upcoming, "nfl"), ...unwrapList(results, "nfl")];
  return ensureOdds(dedupById(all));
}

export async function fetchMma(): Promise<EnrichedMatch[]> {
  resetFetchStats();
  const [live, upcoming, results] = await Promise.all([
    settleList(api.publicMma.live()), settleList(api.publicMma.upcoming()), settleList(api.publicMma.results()),
  ]);
  const all = [...unwrapList(live, "mma"), ...unwrapList(upcoming, "mma"), ...unwrapList(results, "mma")];
  return ensureOdds(dedupById(all));
}

export async function fetchSport(sport: SportKey, onProgress?: (matches: EnrichedMatch[]) => void): Promise<EnrichedMatch[]> {
  switch (sport) {
    case "football": return fetchFootball(onProgress);
    case "basketball": return fetchBasketball();
    case "tennis": return fetchTennis();
    case "baseball": return fetchBaseball();
    case "nfl": return fetchNfl();
    case "mma": return fetchMma();
  }
}

// ---------------------------------------------------------------------------
// Lightweight cache for cross-page search (avoids refetching football on
// every keystroke; short TTL keeps it reasonably fresh).
// ---------------------------------------------------------------------------

let searchCache: { at: number; matches: EnrichedMatch[] } | null = null;
const SEARCH_TTL_MS = 60_000;

export async function getSearchableMatches(): Promise<EnrichedMatch[]> {
  if (searchCache && Date.now() - searchCache.at < SEARCH_TTL_MS) return searchCache.matches;
  const matches = await fetchFootball();
  searchCache = { at: Date.now(), matches };
  return matches;
}

// ---------------------------------------------------------------------------
// Admin-created special games — shown alongside real matches, always flagged
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Admin-created special games — shown alongside real matches, always flagged.
// The instant a special game's status reports finished, it's excluded from
// the list on the very next fetch — no grace/linger window, and this check
// runs fresh off the match's own status for every request, so it applies
// identically for every user (not a per-browser dismiss).
// ---------------------------------------------------------------------------

/** Filters out special games that have finished playing. */
function filterVisibleAdminMatches(matches: EnrichedMatch[]): EnrichedMatch[] {
  return matches.filter((m) => !FINISHED_STATUSES.has(m.status ?? ""));
}

/** Admin-created matches come straight from the raw backend Match object
 * (never routed through normalizeMatch(), which is what forces `sport` to
 * one of our fixed lowercase SportKey values everywhere else). The backend's
 * own SportEnum uses uppercase values ("FOOTBALL", "BASKETBALL", ...), so an
 * admin match's `sport` field could arrive as "FOOTBALL" untouched. Anywhere
 * that compares match.sport against a lowercase SportKey (e.g. the match
 * details page's `hasDraw` check for basketball/nfl/baseball/mma admin
 * specials) would then always fail the comparison — an admin-created
 * basketball special would still be treated as draw-eligible on the details
 * page and show a spurious 3-way market instead of 2-way. This normalizes
 * any raw sport string to one of our known keys, defaulting to "football".
 */
export function normalizeSportKey(raw: unknown): SportKey {
  const s = String(raw ?? "").trim().toLowerCase();
  const known: SportKey[] = ["football", "basketball", "tennis", "baseball", "nfl", "mma"];
  return (known as string[]).includes(s) ? (s as SportKey) : "football";
}

export async function fetchAdminMatches(): Promise<EnrichedMatch[]> {
  const raw = await settleList(api.publicAdminMatches.getAll());
  const list = Array.isArray(raw) ? raw : [];
  if (!list.length) return [];
  const withOdds = await Promise.all(
    list.map(async (m) => {
      const odds = await settleList(api.publicAdminMatches.odds(m.id));
      const oddsMap = extractOddsMap(Array.isArray(odds) ? odds : [], m.homeTeam, m.awayTeam);
      return { ...m, sport: normalizeSportKey(m.sport), oddsMap, isAdmin: true } as EnrichedMatch;
    })
  );
  return filterVisibleAdminMatches(ensureOdds(withOdds));
}

// ---------------------------------------------------------------------------
// Single match lookup (for the match details page) — tries every sport's
// public endpoint plus admin-created matches until one resolves.
// ---------------------------------------------------------------------------

export interface MatchDetail extends EnrichedMatch {
  h2h?: Record<string, unknown>;
}

/**
 * Football's list (fetchFootball) doesn't only pull from
 * /api/public/football/matches/* (the table publicFootball.getById actually
 * queries) — it also merges in matches from the separate livescore data
 * source (publicFootballLivescore.live/today/fixtures/allLeaguesToday/
 * allCupsToday) and the all-cups endpoints. Those bulk sources use their own
 * id scheme with NO dedicated "get one by id" route on the backend, so
 * publicFootball.getById(id) — and every other sport's getById in the
 * cascade below — legitimately 404s for them. That's why a match renders
 * fine in "Today"/"Live Now" (list-only, no per-id lookup needed) but shows
 * "not found" the moment you click into it: the details page's only lookup
 * strategy was "ask each sport's getById", and none of those tables have
 * ever heard of a livescore-sourced id.
 *
 * Fix: when every getById attempt misses, fall back to re-fetching those
 * same bulk sources fresh and scanning them for a match with this id,
 * exactly the way the list already found it the first time. There's still
 * no per-id odds route for this id, so odds are fetched via
 * publicFootball.odds(id) on a best-effort basis (some backends key that
 * route more loosely); if that also comes back empty, ensureOdds() below
 * still guarantees the page gets a full display-ready match with synthetic
 * odds rather than a false "not found".
 */
/**
 * Football's list (fetchFootball) doesn't only pull from
 * /api/public/football/matches/* (the table publicFootball.getById actually
 * queries) — it also merges in matches from the separate livescore data
 * source (publicFootballLivescore.live/today/fixtures/allLeaguesToday/
 * allCupsToday) and the all-cups endpoints. Those bulk sources use their own
 * id scheme with NO dedicated "get one by id" route on the backend, so
 * publicFootball.getById(id) — and every other sport's getById in the
 * cascade below — legitimately 404s for them. That's why a match renders
 * fine in "Today"/"Live Now" (list-only, no per-id lookup needed) but shows
 * "not found" the moment you click into it: the details page's only lookup
 * strategy was "ask each sport's getById", and none of those tables have
 * ever heard of a livescore-sourced id.
 *
 * Confirmed by direct testing: this same id mismatch also breaks the
 * per-market odds endpoints (odds, odds/half-time, odds/correct-score,
 * odds/handicap) — they all live under /api/public/football/matches/:id/...
 * and 404 with "Match not found" for a livescore/all-cups-sourced id for
 * exactly the same reason. So the bulk sources are not a fallback for a
 * match lookup that "should" work via getById — for these ids, the bulk
 * sources are the ONLY place any data (match or odds) exists at all.
 * findFootballBulkMatchById is used as the PRIMARY lookup for football
 * (before ever touching the per-id endpoints), returning both the match
 * and whatever odds array (if any) the bulk source embedded alongside it,
 * via the same match_result/odds/markets embedding unwrapWithOdds already
 * knows to look for.
 */
/**
 * Every football match id, regardless of which source it came from
 * (main football/matches table, livescore, or all-cups), routed through a
 * single "does any bulk-list source have embedded odds for this id"
 * lookup. This is now the PRIMARY/triggering odds source for football —
 * not a fallback — because direct testing showed the dedicated per-id
 * odds routes (/matches/:id/odds, /odds/half-time, /odds/correct-score,
 * /odds/handicap) can 404 with "Match not found" even for an id that
 * getById itself resolves successfully. In other words: getById and the
 * odds endpoints don't share the same id-matching rule on this backend,
 * so getById succeeding is no guarantee the odds routes will. The bulk
 * "with odds embedded" list endpoints (with-all-odds for the main table,
 * plus livescore/all-cups for matches outside it) are the one place odds
 * reliably travel alongside the same id the match itself was found under,
 * so that's checked first for every football match, unconditionally.
 */
async function findFootballBulkMatchById(id: string): Promise<{ match: Match; odds: unknown[] } | null> {
  const [withAllOdds, lsLive, lsToday, lsFixtures, lsAllLeaguesToday, lsAllCupsToday, cupsUp, cupsToday, cupsLive] = await Promise.all([
    settleList(api.publicFootball.withAllOdds()),
    settleList(api.publicFootballLivescore.live()),
    settleList(api.publicFootballLivescore.today()),
    settleList(api.publicFootballLivescore.fixtures()),
    settleList(api.publicFootballLivescore.allLeaguesToday()),
    settleList(api.publicFootballLivescore.allCupsToday()),
    settleList(api.publicFootball.allCupsUpcoming()),
    settleList(api.publicFootball.allCupsToday()),
    settleList(api.publicFootball.allCupsLive()),
  ]);
  const pool: Array<{ match: EnrichedMatch; odds: unknown[] }> = [
    // withAllOdds FIRST — it's the richest, most likely-to-have-real-odds
    // source and covers the main table (where getById-resolved matches
    // like this one live), so any hit here wins before the thinner
    // livescore/all-cups sources are even considered.
    ...unwrapWithOdds(withAllOdds, "football"),
    ...unwrapWithOdds(lsLive, "football"),
    ...unwrapWithOdds(lsToday, "football"),
    ...unwrapWithOdds(lsFixtures, "football"),
    ...unwrapWithOdds(lsAllLeaguesToday, "football"),
    ...unwrapWithOdds(lsAllCupsToday, "football"),
    ...unwrapWithOdds(cupsUp, "football"),
    ...unwrapWithOdds(cupsToday, "football"),
    ...unwrapWithOdds(cupsLive, "football"),
  ];
  const requestedId = String(id).trim().toLowerCase();
  const requestedProviderId = requestedId.replace(/^espn-/, "");
  const matchesRequestedId = (match: EnrichedMatch) => {
    const matchId = String(match.id ?? "").trim().toLowerCase();
    const externalId = String(match.externalId ?? "").trim().toLowerCase();
    const externalProviderId = externalId.replace(/^espn-/, "");
    return matchId === requestedId || externalId === requestedId ||
      (requestedProviderId.length > 0 && externalProviderId === requestedProviderId);
  };
  const hit = pool.find((entry) => matchesRequestedId(entry.match));
  if (hit) return hit;

  // unwrapWithOdds requires the ApiResponse envelope ({success, data}); a
  // few of these sources may reply as a bare array instead, which
  // unwrapWithOdds treats as "no data" and unwrapList still handles. Retry
  // with the plain-list unwrapper (no embedded odds available in that case)
  // rather than missing the match entirely just because of envelope shape.
  const plainPool: EnrichedMatch[] = [
    ...unwrapList(withAllOdds, "football"),
    ...unwrapList(lsLive, "football"), ...unwrapList(lsToday, "football"), ...unwrapList(lsFixtures, "football"),
    ...unwrapList(lsAllLeaguesToday, "football"), ...unwrapList(lsAllCupsToday, "football"),
    ...unwrapList(cupsUp, "football"), ...unwrapList(cupsToday, "football"), ...unwrapList(cupsLive, "football"),
  ];
  const plainHit = plainPool.find((m) => matchesRequestedId(m));
  return plainHit ? { match: plainHit, odds: [] } : null;
}

export async function fetchMatchDetail(id: string, hintSport?: SportKey | "admin", hintAdmin?: boolean): Promise<MatchDetail | null> {
  const log = (...args: unknown[]) => { /* eslint-disable-next-line no-console */ console.debug("[sportsbook][fetchMatchDetail]", `id=${id}`, ...args); };
  log("start", { hintSport, hintAdmin });
  if (!isBettableMatchId(id)) {
    log("rejected non-UUID match ID before any backend request");
    return null;
  }
  const attempts: Array<{ sport: SportKey | "admin"; get: () => Promise<Match>; odds: () => Promise<unknown> }> = [
    { sport: "football", get: () => api.publicFootball.getById(id), odds: () => api.publicFootball.odds(id) },
    { sport: "basketball", get: () => api.publicBasketball.getById(id), odds: () => api.publicBasketball.odds(id) },
    { sport: "tennis", get: () => api.publicTennis.getById(id), odds: () => api.publicTennis.odds(id) },
    { sport: "baseball", get: () => api.publicBaseball.getById(id), odds: () => api.publicBaseball.odds(id) },
    { sport: "nfl", get: () => api.publicNfl.getById(id), odds: () => api.publicNfl.odds(id) },
    { sport: "mma", get: () => api.publicMma.getById(id), odds: () => api.publicMma.odds(id) },
    { sport: "admin", get: () => api.publicAdminMatches.getById(id), odds: () => api.publicAdminMatches.odds(id) },
  ];

  async function run(attempt: (typeof attempts)[number]): Promise<MatchDetail | null> {
    try {
      const match = await attempt.get();
      if (!match?.id) { log(`attempt[${attempt.sport}]`, "getById returned no id — treating as miss"); return null; }
      log(`attempt[${attempt.sport}]`, "getById OK", { rawSport: match.sport, status: match.status, homeTeam: match.homeTeam, awayTeam: match.awayTeam });
      // The match UUID came directly from the canonical /matches feed, so
      // resolve the match first and request its basic odds in parallel with
      // the optional football H2H request. Do not block the detail page on a
      // bulk feed or a separate enrichment request.
      const oddsPromise = settleList(attempt.odds());
      const h2hPromise = attempt.sport === "football" ? settleList(api.publicFootball.h2h(id)) : Promise.resolve(undefined);
      const [odds, h2h] = await Promise.all([oddsPromise, h2hPromise]);
      const oddsArr = Array.isArray(odds) ? odds : [];
      const oddsMap = extractOddsMap(oddsArr, match.homeTeam, match.awayTeam);
      log(`attempt[${attempt.sport}]`, "odds fetch", { rawOddsCount: oddsArr.length, resolvedOddsMap: oddsMap });
      const resolvedSport = attempt.sport === "admin" ? normalizeSportKey(match.sport) : attempt.sport;
      const enriched: MatchDetail = {
        ...match,
        sport: resolvedSport,
        isAdmin: attempt.sport === "admin",
        oddsMap,
      };
      if (h2h) enriched.h2h = h2h as Record<string, unknown>;
      const result = ensureOdds([enriched])[0];
      log(`attempt[${attempt.sport}]`, "resolved match", { resolvedSport, isAdmin: result.isAdmin, isSyntheticOdds: result.isSyntheticOdds });
      return result;
    } catch (err) {
      log(`attempt[${attempt.sport}]`, "threw — treating as miss", err instanceof Error ? err.message : err);
      return null;
    }
  }

  /**
   * PRIMARY lookup for football (not a fallback). Football's list mixes
   * matches from /api/public/football/matches/* (which getById/odds/etc.
   * can look up individually) with matches from the separate
   * livescore/all-cups bulk sources, which have their own id scheme and NO
   * per-id route on the backend at all — confirmed directly: getById,
   * odds, odds/half-time, odds/correct-score, and odds/handicap ALL 404
   * with "Match not found" for a bulk-sourced id. There's no way to tell
   * which bucket an id belongs to without asking, and re-querying
   * getById/odds first only to fail was exactly what caused matches that
   * render fine in the list to show "not found" — and, once that was
   * patched, still show no extra odds markets — on the details page.
   * Since football is the only sport with this split-source problem, and
   * the bulk sources are searched by scanning fresh lists anyway (there's
   * no per-id call to "try first" there), checking them before the direct
   * getById route costs nothing when the id does belong to the main table
   * (this lookup simply won't find it and falls through immediately) but
   * fixes every match that doesn't.
   */
  async function runFootballBulkPrimary(): Promise<MatchDetail | null> {
    try {
      const hit = await findFootballBulkMatchById(id);
      if (!hit) { log("football bulk-source lookup", "no match with this id in livescore/all-cups sources"); return null; }
      const { match, odds: embeddedOdds } = hit;
      const canonicalId = match.id;
      log("football bulk-source lookup", "found match", { status: match.status, homeTeam: match.homeTeam, awayTeam: match.awayTeam, embeddedOddsCount: embeddedOdds.length });
      let oddsArr = embeddedOdds;
      if (oddsArr.length === 0) {
        // Bulk source didn't embed odds for this match — fall back to the
        // direct per-id odds route as a best-effort second try (it may
        // still work even though getById itself doesn't, since some
        // backends key odds lookups more loosely than the match table).
        const direct = await settleList(api.publicFootball.odds(canonicalId));
        oddsArr = Array.isArray(direct) ? direct : [];
      }
      const oddsMap = extractOddsMap(oddsArr, match.homeTeam, match.awayTeam);
      const enriched: MatchDetail = { ...match, sport: "football", isAdmin: false, oddsMap };
      const h2h = await settleList(api.publicFootball.h2h(canonicalId));
      if (h2h) enriched.h2h = h2h as Record<string, unknown>;
      const result = ensureOdds([enriched])[0];
      log("football bulk-source lookup", "resolved match", { isSyntheticOdds: result.isSyntheticOdds });
      return result;
    } catch (err) {
      log("football bulk-source lookup", "threw — treating as miss", err instanceof Error ? err.message : err);
      return null;
    }
  }

  const effectiveHint: SportKey | "admin" | undefined = hintAdmin ? "admin" : hintSport;

  // A UUID from the rendered football list belongs to the backend match
  // table, so try its direct endpoint first. The previous bulk-first path
  // scanned with-all-odds/livescore feeds on every click, which made details
  // slow and could hit ERR_CONNECTION_RESET before the direct lookup ran.
  if (effectiveHint === "football") {
    // eslint-disable-next-line no-console
    console.log("[fetchMatchDetail] football hint — trying direct UUID lookup first", { id });
    const direct = await run(attempts.find((a) => a.sport === "football")!);
    if (direct) {
      // eslint-disable-next-line no-console
      console.log("[fetchMatchDetail] RESOLVED via direct football getById", { id, isSyntheticOdds: direct.isSyntheticOdds, oddsMap: direct.oddsMap });
      return direct;
    }
    // eslint-disable-next-line no-console
    console.log("[fetchMatchDetail] direct football lookup missed — trying bulk fallback", { id });
    const bulkResult = await runFootballBulkPrimary();
    if (bulkResult) return bulkResult;
  } else if (effectiveHint) {
    // If the caller already knows which sport/admin-status this match is
    // (it came straight off a rendered list, which already tagged it
    // correctly), go straight to that one endpoint and trust it. This is
    // the fix for match detail pages sometimes rendering as
    // "admin"/wrong-sport even for an ordinary match: the old code always
    // cascaded football → basketball → ... → admin trying getById on every
    // sport's endpoint in turn, and whichever one happened to return ANY
    // 200 response won that match's sport label — including the admin
    // endpoint, if the real sport endpoint's getById 404'd for a match
    // that's only indexed in bulk list endpoints (livescore/fixtures,
    // all-leagues/today, etc.) and not by individual id. A match that is
    // genuinely football would then get silently mislabeled isAdmin: true
    // just because /api/public/admin-matches/:id happened to respond first
    // without erroring. Trusting the hint the list already knows to be
    // correct avoids that entirely.
    const hinted = attempts.find((a) => a.sport === effectiveHint);
    if (hinted) {
      log("trying hinted endpoint first", effectiveHint);
      const result = await run(hinted);
      if (result) { log("hinted endpoint resolved the match — done"); return result; }
      log("hinted endpoint had no record of this id — falling back to full cascade");
      // Hinted endpoint genuinely has no record of this id (stale link,
      // deleted match, etc.) — fall through to the full cascade below rather
      // than immediately giving up, so a bad/outdated hint doesn't turn into
      // a false "not found".
    } else {
      log("hint did not match any known attempt sport — ignoring hint", effectiveHint);
    }
  }

  for (const attempt of attempts) {
    if (effectiveHint && attempt.sport === effectiveHint) continue; // already tried above
    const result = await run(attempt);
    if (result) { log("cascade resolved the match at", attempt.sport); return result; }
  }

  // Nothing else matched. If we haven't already tried the football
  // bulk-source lookup as the primary path above (i.e. hint wasn't
  // "football" — an unhinted or non-football-hinted request that still
  // turns out to be an unlisted football match), try it now as the final
  // fallback before giving up entirely.
  if (effectiveHint !== "football") {
    log("cascade missed — trying football bulk-source lookup as last resort");
    const bulkResult = await runFootballBulkPrimary();
    if (bulkResult) { log("bulk-source lookup resolved the match — done"); return bulkResult; }
  }

  log("every attempt missed — match not found");
  return null;
}

// ---------------------------------------------------------------------------
// Full multi-market odds (Match Details page) — 1X2, Half Time, Correct
// Score, Handicap. Previously the details page only ever fetched and showed
// the single 1X2/Match-Result market, even though the backend exposes several
// more per-match odds endpoints (see api.ts: oddsHalfTime, oddsCorrectScore,
// oddsHandicap, plus basketball's oddsSpread/oddsTotal). This brings all of
// those in, parsed into a common shape the page can render as separate
// sections — modeled on the richer reference implementation's market parser.
// ---------------------------------------------------------------------------

export interface OddsOption { label: string; odd: number }
export interface OddsGroup { market: string; options: OddsOption[] }

export interface AllMatchOdds {
  odds1x2: OddsGroup[];
  oddsHalfTime: OddsGroup[];
  oddsCorrectScore: OddsGroup[];
  oddsHandicap: OddsGroup[];
}

function emptyAllOdds(): AllMatchOdds {
  return { odds1x2: [], oddsHalfTime: [], oddsCorrectScore: [], oddsHandicap: [] };
}

function parseOddValue(o: Record<string, unknown>): number {
  return parseFloat(String(o.odd ?? o.value ?? o.odds ?? o.price ?? o.decimal ?? o.americanOdds ?? "0"));
}

/**
 * Turns a raw odds response (array of {market, selection, value/odd, handicap?}
 * rows, or an already-grouped {market: [...]} object, or an already-shaped
 * OddsGroup[] payload) into a normalized OddsGroup[]. Handicap rows (which
 * carry a `handicap` field, e.g. Asian handicap lines) get paired up by line
 * so "+1.5"/"-1.5" render together instead of as flat unlabeled odds.
 */
/** Every plausible array key a market-group object might carry its
 * selection rows under, across the different shapes real odds backends use
 * ("options" for an already-final OddsGroup, "selections"/"outcomes"/"odds"
 * for a not-yet-normalized market-group object). Checked in this order. */
const GROUP_ENTRIES_KEYS = ["options", "selections", "outcomes", "odds", "markets", "prices"] as const;

/** True if this object looks like a single market-group ({market, <rows>}),
 * regardless of which key name the backend used for the rows array. */
function findGroupEntriesKey(obj: Record<string, unknown>): string | undefined {
  if (typeof obj.market !== "string" && typeof obj.name !== "string" && typeof obj.label !== "string") return undefined;
  for (const key of GROUP_ENTRIES_KEYS) {
    if (Array.isArray(obj[key]) && (obj[key] as unknown[]).length > 0) return key;
  }
  return undefined;
}

function parseOddsGroups(raw: unknown): OddsGroup[] {
  if (!raw) return [];
  let payload: unknown = raw;
  if (payload && typeof payload === "object" && "data" in (payload as Record<string, unknown>)) {
    payload = (payload as Record<string, unknown>).data;
  }
  if (!Array.isArray(payload)) {
    if (payload && typeof payload === "object") {
      const groups: OddsGroup[] = [];
      for (const [market, entries] of Object.entries(payload as Record<string, unknown>)) {
        if (!Array.isArray(entries)) continue;
        const options = (entries as Array<Record<string, unknown>>)
          .map((e) => ({ label: String(e.selection ?? e.outcome ?? e.name ?? e.label ?? ""), odd: parseOddValue(e) }))
          .filter((o) => o.odd > 0 && o.label);
        if (options.length > 0) groups.push({ market, options });
      }
      return groups;
    }
    return [];
  }

  // Payload is an array. Two possible shapes at this point:
  //   (a) already fully-formed OddsGroup[] — {market, options: [{label, odd}]}
  //   (b) an array of not-yet-normalized market-group objects — one entry
  //       per market, each carrying its rows under some other array key
  //       (selections/outcomes/odds/markets/prices) with raw
  //       selection/odd/value fields still needing extraction.
  // Previously only shape (a) with the exact key "options" was recognized;
  // shape (b) — which is what football's half-time/correct-score/handicap
  // endpoints commonly return even when the main 1X2 endpoint returns flat
  // rows — silently fell through to the flat-row parser below, which then
  // found no usable market/selection/odd fields on what are actually
  // *group* objects, and produced an empty array. That's why those three
  // extra markets showed nothing on the details page while Match Result
  // (parsed from a genuinely flat-row payload) worked fine.
  if (payload.length > 0 && payload.every((item) => item && typeof item === "object")) {
    const items = payload as Array<Record<string, unknown>>;
    const allLookLikeGroups = items.every((item) => findGroupEntriesKey(item) !== undefined);
    if (allLookLikeGroups) {
      const groups: OddsGroup[] = [];
      for (const item of items) {
        const key = findGroupEntriesKey(item)!;
        const market = String(item.market ?? item.name ?? item.label ?? "Other");
        const rawEntries = item[key] as unknown[];
        // key === "options" AND entries are already {label, odd} shaped —
        // pass through as-is (this covers the original fully-formed case).
        if (key === "options" && rawEntries.every((e) => e && typeof e === "object" && "label" in (e as object) && "odd" in (e as object))) {
          groups.push({ market, options: rawEntries as OddsOption[] });
          continue;
        }
        // Otherwise these are raw selection rows nested under this group —
        // extract label/odd the same way the flat-row parser does below.
        const options: OddsOption[] = (rawEntries as Array<Record<string, unknown>>)
          .map((e) => {
            const label = String(e.selection ?? e.outcome ?? e.name ?? e.label ?? "");
            const handicap = e.handicap != null ? String(e.handicap) : undefined;
            const odd = parseOddValue(e);
            return { label: handicap ? `${label} (${handicap})` : label, odd };
          })
          .filter((o) => o.odd > 0 && o.label);
        if (options.length > 0) groups.push({ market, options });
      }
      if (groups.length > 0) return groups;
      // Fell through with zero usable groups (e.g. every group was empty
      // after filtering) — continue to the flat-row parser below rather
      // than returning nothing outright, in case the payload is actually
      // flat rows that merely happen to also have a "market" field.
    }
  }

  const rows = payload as Array<Record<string, unknown>>;
  if (!rows.length) return [];

  const hasHandicap = rows.some((r) => r.handicap != null);
  if (hasHandicap) {
    const lineMap = new Map<string, Map<string, number[]>>();
    const lineOrder: string[] = [];
    for (const o of rows) {
      const handicap = String(o.handicap ?? "");
      const sel = String(o.selection ?? o.outcome ?? o.label ?? "");
      const odd = parseOddValue(o);
      if (!sel || !handicap || odd <= 0) continue;
      if (!lineMap.has(handicap)) { lineMap.set(handicap, new Map()); lineOrder.push(handicap); }
      const selMap = lineMap.get(handicap)!;
      if (!selMap.has(sel)) selMap.set(sel, []);
      selMap.get(sel)!.push(odd);
    }
    const used = new Set<string>();
    const groups: OddsGroup[] = [];
    const sorted = [...lineOrder].sort((a, b) => parseFloat(a) - parseFloat(b));
    for (const line of sorted) {
      if (used.has(line)) continue;
      const mirrorVal = parseFloat(line) * -1;
      const mirrorKey = lineOrder.find((l) => Math.abs(parseFloat(l) - mirrorVal) < 0.001);
      const options: OddsOption[] = [];
      const addFromMap = (key: string) => {
        const selMap = lineMap.get(key);
        if (!selMap) return;
        Array.from(selMap.entries()).forEach(([sel, odds]) => {
          const avg = odds.reduce((a, b) => a + b, 0) / odds.length;
          options.push({ label: `${sel} (${key})`, odd: Math.round(avg * 100) / 100 });
        });
      };
      addFromMap(line);
      if (mirrorKey && mirrorKey !== line) { addFromMap(mirrorKey); used.add(mirrorKey); }
      used.add(line);
      if (options.length > 0) {
        const groupLabel = mirrorKey && mirrorKey !== line ? `${line} / ${mirrorKey}` : line;
        groups.push({ market: groupLabel, options });
      }
    }
    return groups;
  }

  const marketMap = new Map<string, Map<string, number[]>>();
  for (const o of rows) {
    const market = String(o.market ?? o.name ?? o.type ?? "Other");
    const sel = String(o.selection ?? o.outcome ?? o.label ?? o.name ?? "");
    const odd = parseOddValue(o);
    if (!sel || odd <= 0) continue;
    if (!marketMap.has(market)) marketMap.set(market, new Map());
    const selMap = marketMap.get(market)!;
    if (!selMap.has(sel)) selMap.set(sel, []);
    selMap.get(sel)!.push(odd);
  }
  const groups: OddsGroup[] = [];
  Array.from(marketMap.entries()).forEach(([market, selMap]) => {
    const options: OddsOption[] = [];
    Array.from(selMap.entries()).forEach(([sel, odds]) => {
      const avg = odds.reduce((a, b) => a + b, 0) / odds.length;
      options.push({ label: sel, odd: Math.round(avg * 100) / 100 });
    });
    groups.push({ market, options });
  });
  return groups;
}

function isScoreLabel(label: string): boolean { return /^\d+[:\-]\d+$/.test(label.trim()); }
const HT_KEYWORDS = ["halftime", "half-time", "half time", "ht ", "ht/", "firsthalf", "first half", "2ndhalf", "second half"];
function isHalfTimeMarket(market: string): boolean { const m = market.toLowerCase(); return HT_KEYWORDS.some((kw) => m.includes(kw)); }
const HANDICAP_KEYWORDS = ["handicap", "asian", "spread", "ah ", "ah/"];
function isHandicapMarket(market: string): boolean { const m = market.toLowerCase(); return HANDICAP_KEYWORDS.some((kw) => m.includes(kw)); }

/** Admin-created matches store every market flat in one odds array (no
 * dedicated per-market endpoints like the real sport feeds have), so it needs
 * its own classification pass to split it back into 1X2 / half-time /
 * correct-score / handicap groups by inspecting each row's market name and
 * selection shape. */
function classifyAdminOdds(raw: unknown[]): AllMatchOdds {
  const result = emptyAllOdds();
  if (!raw.length) return result;
  const marketMap = new Map<string, Array<{ selection: string; odd: number; handicap?: string }>>();
  for (const row of raw as Array<Record<string, unknown>>) {
    const market = String(row.market ?? row.name ?? "match_result");
    const selection = String(row.selection ?? row.outcome ?? row.label ?? "");
    const odd = parseOddValue(row);
    if (!selection || odd <= 0) continue;
    const handicap = row.handicap != null ? String(row.handicap) : undefined;
    if (!marketMap.has(market)) marketMap.set(market, []);
    marketMap.get(market)!.push({ selection, odd, handicap });
  }
  Array.from(marketMap.entries()).forEach(([market, entries]) => {
    const options: OddsOption[] = entries.map((e) => ({
      label: e.handicap ? `${e.selection} (${e.handicap})` : e.selection,
      odd: Math.round(e.odd * 100) / 100,
    }));
    const group: OddsGroup = { market, options };
    if (isHandicapMarket(market) || entries.some((e) => e.handicap)) { result.oddsHandicap.push(group); return; }
    if (isHalfTimeMarket(market)) { result.oddsHalfTime.push(group); return; }
    if (options.length >= 2 && options.every((o) => isScoreLabel(o.label))) { result.oddsCorrectScore.push(group); return; }
    result.odds1x2.push(group);
  });
  return result;
}

/** Fetches every market this sport's public endpoints expose for one match,
 * in parallel, and returns them grouped and ready to render. */
export async function fetchMatchAllOdds(id: string, sport: SportKey | "admin"): Promise<AllMatchOdds> {
  const log = (...args: unknown[]) => { /* eslint-disable-next-line no-console */ console.debug("[sportsbook][fetchMatchAllOdds]", `id=${id}`, `sport=${sport}`, ...args); };
  log("start");
  const result = emptyAllOdds();
  if (!isBettableMatchId(id)) {
    log("rejected non-UUID match ID before any odds request");
    return result;
  }

  if (sport === "admin") {
    const raw = await settleList(api.publicAdminMatches.odds(id));
    const arr = Array.isArray(raw) ? raw : [];
    log("admin raw odds rows", arr.length);
    const classified = classifyAdminOdds(arr);
    log("admin classified", { odds1x2: classified.odds1x2.length, oddsHalfTime: classified.oddsHalfTime.length, oddsCorrectScore: classified.oddsCorrectScore.length, oddsHandicap: classified.oddsHandicap.length });
    return classified;
  }

  if (sport === "football") {
    // The ID is a backend UUID from the canonical /matches list, so request
    // the dedicated per-match market routes directly. The old implementation
    // also scanned with-all-odds/livescore/all-cups here; that extra bulk
    // request was the source of slow details and ERR_CONNECTION_RESET logs.
    const [r1s, r2s, r3s, r4s] = await Promise.all([
      settlePromise(api.publicFootball.odds(id)),
      settlePromise(api.publicFootball.oddsHalfTime(id)),
      settlePromise(api.publicFootball.oddsCorrectScore(id)),
      settlePromise(api.publicFootball.oddsHandicap(id)),
    ]);
    // Each result logged on its own separate line (not nested inside one
    // combined object) so nothing gets hidden behind a browser console's
    // collapsed object preview — every field is visible without needing to
    // manually expand anything.
    // eslint-disable-next-line no-console
    console.log("[fetchMatchAllOdds] football id:", id);
    // eslint-disable-next-line no-console
    // eslint-disable-next-line no-console
    console.log("[fetchMatchAllOdds] direct odds/1x2 —", r1s.ok ? "OK, raw:" : "THREW:", r1s.ok ? r1s.value : r1s.error);
    // eslint-disable-next-line no-console
    console.log("[fetchMatchAllOdds] direct odds/half-time —", r2s.ok ? "OK, raw:" : "THREW:", r2s.ok ? r2s.value : r2s.error);
    // eslint-disable-next-line no-console
    console.log("[fetchMatchAllOdds] direct odds/correct-score —", r3s.ok ? "OK, raw:" : "THREW:", r3s.ok ? r3s.value : r3s.error);
    // eslint-disable-next-line no-console
    console.log("[fetchMatchAllOdds] direct odds/handicap —", r4s.ok ? "OK, raw:" : "THREW:", r4s.ok ? r4s.value : r4s.error);

    const directOdds1x2 = parseOddsGroups(r1s.ok ? r1s.value : undefined);
    const directHalfTime = parseOddsGroups(r2s.ok ? r2s.value : undefined);
    const directCorrectScore = parseOddsGroups(r3s.ok ? r3s.value : undefined);
    const directHandicap = parseOddsGroups(r4s.ok ? r4s.value : undefined);
    result.odds1x2 = directOdds1x2;
    result.oddsHalfTime = directHalfTime;
    result.oddsCorrectScore = directCorrectScore;
    result.oddsHandicap = directHandicap;

    // eslint-disable-next-line no-console
    console.log("[fetchMatchAllOdds] FINAL for", id, "— odds1x2Source: direct",
      "odds1x2:", result.odds1x2.length, "oddsHalfTime:", result.oddsHalfTime.length,
      "oddsCorrectScore:", result.oddsCorrectScore.length, "oddsHandicap:", result.oddsHandicap.length);
    return result;
  }

  if (sport === "basketball") {
    const [r1, r2, r3] = await Promise.all([
      settlePromise(api.publicBasketball.oddsMoneyline(id)),
      settlePromise(api.publicBasketball.oddsSpread(id)),
      settlePromise(api.publicBasketball.oddsTotal(id)),
    ]);
    // eslint-disable-next-line no-console
    console.log("[fetchMatchAllOdds] basketball id:", id);
    // eslint-disable-next-line no-console
    console.log("[fetchMatchAllOdds] basketball moneyline —", r1.ok ? "OK, raw:" : "THREW:", r1.ok ? r1.value : r1.error);
    // eslint-disable-next-line no-console
    console.log("[fetchMatchAllOdds] basketball spread —", r2.ok ? "OK, raw:" : "THREW:", r2.ok ? r2.value : r2.error);
    // eslint-disable-next-line no-console
    console.log("[fetchMatchAllOdds] basketball total —", r3.ok ? "OK, raw:" : "THREW:", r3.ok ? r3.value : r3.error);
    result.odds1x2 = parseOddsGroups(r1.ok ? r1.value : undefined);
    result.oddsHandicap = parseOddsGroups(r2.ok ? r2.value : undefined);
    result.oddsHalfTime = parseOddsGroups(r3.ok ? r3.value : undefined);
    log("basketball markets parsed", { odds1x2: result.odds1x2.length, spread: result.oddsHandicap.length, total: result.oddsHalfTime.length });
    return result;
  }

  if (sport === "nfl") {
    const r1 = await settlePromise(api.publicNfl.oddsAll(id));
    // eslint-disable-next-line no-console
    console.log("[fetchMatchAllOdds] nfl id:", id, "oddsAll —", r1.ok ? "OK, raw:" : "THREW:", r1.ok ? r1.value : r1.error);
    result.odds1x2 = parseOddsGroups(r1.ok ? r1.value : undefined);
    log("nfl markets parsed", { odds1x2: result.odds1x2.length });
    return result;
  }
  if (sport === "baseball") {
    const r1 = await settlePromise(api.publicBaseball.odds(id));
    // eslint-disable-next-line no-console
    console.log("[fetchMatchAllOdds] baseball id:", id, "odds —", r1.ok ? "OK, raw:" : "THREW:", r1.ok ? r1.value : r1.error);
    result.odds1x2 = parseOddsGroups(r1.ok ? r1.value : undefined);
    log("baseball markets parsed", { odds1x2: result.odds1x2.length });
    return result;
  }
  if (sport === "mma") {
    const r1 = await settlePromise(api.publicMma.oddsAll(id));
    // eslint-disable-next-line no-console
    console.log("[fetchMatchAllOdds] mma id:", id, "oddsAll —", r1.ok ? "OK, raw:" : "THREW:", r1.ok ? r1.value : r1.error);
    result.odds1x2 = parseOddsGroups(r1.ok ? r1.value : undefined);
    log("mma markets parsed", { odds1x2: result.odds1x2.length });
    return result;
  }
  if (sport === "tennis") {
    const r1 = await settlePromise(api.publicTennis.odds(id));
    // eslint-disable-next-line no-console
    console.log("[fetchMatchAllOdds] tennis id:", id, "odds —", r1.ok ? "OK, raw:" : "THREW:", r1.ok ? r1.value : r1.error);
    result.odds1x2 = parseOddsGroups(r1.ok ? r1.value : undefined);
    log("tennis markets parsed", { odds1x2: result.odds1x2.length });
    return result;
  }
  log("unrecognized sport key — returning empty odds", sport);
  return result;
}
