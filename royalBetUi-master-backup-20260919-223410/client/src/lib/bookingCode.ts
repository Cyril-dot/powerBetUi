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
  return {
    id,
    match: buildMatchLabel(sel),
    market: String(sel.market ?? sel.marketKey ?? ""),
    selection: String(sel.selection ?? sel.pick ?? sel.name ?? sel.label ?? ""),
    odd: extractOdds(sel),
    homeTeam,
    awayTeam,
  };
}
