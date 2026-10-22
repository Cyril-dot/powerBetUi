// ---------------------------------------------------------------------------
// Shared booking-code redeem helpers.
//
// The /api/booking/redeem response's exact field names for each selection
// aren't nailed down anywhere (they were originally reverse-engineered, not
// documented), so these read several plausible variants defensively rather
// than assuming one fixed contract. Used by both the BookingCodePanel inside
// the betslip page and the standalone /booking-code page — kept in one
// place so the two never drift into handling the same response differently.
// ---------------------------------------------------------------------------

import type { Pick } from "../components/Sportsbook";

export function buildMatchLabel(s: Record<string, unknown>): string {
  if (s.matchLabel) return String(s.matchLabel);
  if (s.match_label) return String(s.match_label);
  if (s.match) return String(s.match);
  const home = (s.homeTeam ?? s.home_team) as string | undefined;
  const away = (s.awayTeam ?? s.away_team) as string | undefined;
  if (home && away) return `${home} vs ${away}`;
  const id = String(s.matchId ?? s.match_id ?? "");
  return id ? `Match …${id.slice(-6)}` : "Unknown match";
}

export function extractOdds(sel: Record<string, unknown>): number {
  const candidates: unknown[] = [
    sel.currentOdds, sel.oddsLocked, sel.odds, sel.value, sel.odd, sel.price, sel.oddsValue, sel.rate,
  ];
  for (const raw of candidates) {
    const n = Number(raw);
    if (!Number.isNaN(n) && n > 1) return n;
  }
  return 1;
}

export function selectionToPick(sel: Record<string, unknown>): Pick {
  const id = String(sel.matchId ?? sel.match_id ?? sel.fixtureId ?? sel.fixture_id ?? "");
  const homeTeam = (sel.homeTeam ?? sel.home_team) as string | undefined;
  const awayTeam = (sel.awayTeam ?? sel.away_team) as string | undefined;
  const kickoffRaw = (sel.kickoffAt ?? sel.kickoff ?? sel.startTime ?? sel.startAt) as string | undefined;
  return {
    id,
    match: buildMatchLabel(sel),
    market: String(sel.market ?? sel.marketKey ?? ""),
    selection: String(sel.selection ?? sel.pick ?? sel.name ?? sel.label ?? ""),
    odd: extractOdds(sel),
    homeTeam,
    awayTeam,
    ...(kickoffRaw ? { kickoffAt: String(kickoffRaw) } : {}),
    ...(selectionState(sel).started ? { isLive: true } : {}),
  };
}

// ---------------------------------------------------------------------------
// Availability of a redeemed selection, read defensively like everything
// else in this file (the redeem payload's exact field names aren't
// documented). A selection is "started" when its match is live/finished or
// its kickoff has passed; "unavailable" when the payload explicitly marks
// it so. Started/unavailable selections must never be silently loaded into
// a slip that then fails at placement — callers flag and exclude them.
// ---------------------------------------------------------------------------

const STARTED_STATES = new Set(["LIVE", "IN_PLAY", "INPLAY", "STARTED", "FINISHED", "FT", "ENDED"]);
const UNAVAILABLE_STATES = new Set(["UNAVAILABLE", "REMOVED", "VOID", "VOIDED", "CANCELLED", "CANCELED", "SUSPENDED", "CLOSED"]);

export interface SelectionState {
  started: boolean;
  unavailable: boolean;
}

export function selectionState(sel: Record<string, unknown>): SelectionState {
  const status = String(sel.status ?? sel.matchStatus ?? sel.state ?? "").toUpperCase();
  let started =
    sel.live === true || sel.isLive === true || sel.started === true || STARTED_STATES.has(status);
  if (!started) {
    const ko = (sel.kickoffAt ?? sel.kickoff ?? sel.startTime ?? sel.startAt) as string | undefined;
    if (ko) {
      const t = Date.parse(String(ko));
      if (!Number.isNaN(t) && t <= Date.now()) started = true;
    }
  }
  const unavailable =
    sel.available === false || sel.isAvailable === false || UNAVAILABLE_STATES.has(status);
  return { started, unavailable };
}
