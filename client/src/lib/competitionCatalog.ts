export type CompetitionTier = "league" | "cup";

export interface CompetitionDefinition {
  key: string;
  country: string;
  tier: CompetitionTier;
  label: string;
  aliases: string[];
  teams: string[];
}

export interface ResolvedCompetition {
  key: string;
  label: string;
  tier: CompetitionTier;
  country: string;
  matchedBy: "competition" | "team" | "fallback";
}

/**
 * Research-backed 2026/27 catalogue for the six domestic leagues currently
 * treated as the product's top-six set, plus their domestic cup competitions.
 * Display names stay canonical; matching uses normalized aliases and team names.
 * Cup rosters are intentionally not hard-coded because open cups change every
 * round. The cup competition aliases classify those fixtures safely.
 */
export const TOP_SIX_COMPETITIONS: CompetitionDefinition[] = [
  {
    key: "england.premier-league", country: "England", tier: "league", label: "Premier League",
    aliases: ["Premier League", "EPL", "English Premier League", "PL"],
    teams: ["Arsenal", "Aston Villa", "Bournemouth", "Brentford", "Brighton and Hove Albion", "Chelsea", "Coventry City", "Crystal Palace", "Everton", "Fulham", "Hull City", "Ipswich Town", "Leeds United", "Liverpool", "Manchester City", "Manchester United", "Newcastle United", "Nottingham Forest", "Sunderland", "Tottenham Hotspur"],
  },
  {
    key: "england.fa-cup", country: "England", tier: "cup", label: "FA Cup",
    aliases: ["The Emirates FA Cup", "Emirates FA Cup", "FA Cup", "The FA Cup", "Football Association Challenge Cup"], teams: [],
  },
  {
    key: "spain.la-liga", country: "Spain", tier: "league", label: "LaLiga EA SPORTS",
    aliases: ["LaLiga EA SPORTS", "LaLiga", "La Liga", "Primera Division", "Spanish La Liga", "La Liga Santander"],
    teams: ["Athletic Club", "Atlético de Madrid", "CA Osasuna", "Celta", "Deportivo Alavés", "Elche CF", "FC Barcelona", "Getafe CF", "Levante UD", "Málaga CF", "R. Racing Club", "Rayo Vallecano", "RC Deportivo", "RCD Espanyol de Barcelona", "Real Betis", "Real Madrid", "Real Sociedad", "Sevilla FC", "Valencia CF", "Villarreal CF"],
  },
  {
    key: "spain.copa-del-rey", country: "Spain", tier: "cup", label: "Copa del Rey",
    aliases: ["Copa del Rey Mapfre", "Copa del Rey", "Copa de S.M. el Rey", "Spanish Cup"], teams: [],
  },
  {
    key: "germany.bundesliga", country: "Germany", tier: "league", label: "Bundesliga",
    aliases: ["Bundesliga", "German Bundesliga", "1. Bundesliga", "Bundesliga (Germany)", "GER Bundesliga"],
    teams: ["FC Bayern München", "Borussia Dortmund", "RB Leipzig", "VfB Stuttgart", "TSG Hoffenheim", "Bayer 04 Leverkusen", "Sport-Club Freiburg", "Eintracht Frankfurt", "FC Augsburg", "1. FSV Mainz 05", "1. FC Union Berlin", "Borussia Mönchengladbach", "Hamburger SV", "1. FC Köln", "SV Werder Bremen", "FC Schalke 04", "SV Elversberg", "SC Paderborn 07"],
  },
  {
    key: "germany.dfb-pokal", country: "Germany", tier: "cup", label: "DFB-Pokal",
    aliases: ["DFB-Pokal", "DFB Pokal", "German Cup", "German DFB Cup", "DFB Cup", "Germany Cup"], teams: [],
  },
  {
    key: "italy.serie-a", country: "Italy", tier: "league", label: "Serie A Enilive",
    aliases: ["Serie A Enilive", "Serie A", "Italian Serie A", "ITA.1"],
    teams: ["Atalanta", "Bologna", "Cagliari", "Como", "Fiorentina", "Frosinone", "Genoa", "Internazionale", "Juventus", "Lazio", "Lecce", "Milan", "Monza", "Napoli", "Parma", "Roma", "Sassuolo", "Torino", "Udinese", "Venezia"],
  },
  {
    key: "italy.coppa-italia", country: "Italy", tier: "cup", label: "Coppa Italia",
    aliases: ["Coppa Italia Frecciarossa", "Coppa Italia", "Italian Cup", "ITA.COPPA_ITALIA"], teams: [],
  },
  {
    key: "france.ligue-1", country: "France", tier: "league", label: "Ligue 1",
    aliases: ["Ligue 1 McDonald's", "Ligue 1 Uber Eats", "French Ligue 1", "France Ligue 1", "FRA.1", "L1"],
    teams: ["Angers SCO", "AJ Auxerre", "AS Monaco", "Stade Brestois 29", "FC Lorient", "Le Havre AC", "LOSC Lille", "OGC Nice", "Olympique Lyonnais", "Olympique de Marseille", "Paris FC", "Paris Saint-Germain", "RC Lens", "Stade Rennais FC", "RC Strasbourg Alsace", "Toulouse FC", "Le Mans FC", "ESTAC Troyes"],
  },
  {
    key: "france.coupe-de-france", country: "France", tier: "cup", label: "Coupe de France",
    aliases: ["Coupe de France Crédit Agricole", "Coupe de France", "French Cup", "France Coupe de France", "FRA.COUPE_DE_FRANCE", "CDF"], teams: [],
  },
  {
    key: "netherlands.eredivisie", country: "Netherlands", tier: "league", label: "Eredivisie",
    aliases: ["Eredivisie", "Dutch Eredivisie", "Netherlands Eredivisie", "VriendenLoterij Eredivisie", "NED.1", "NED1"],
    teams: ["ADO Den Haag", "Ajax", "AZ", "Excelsior Rotterdam", "FC Groningen", "FC Twente", "FC Utrecht", "Feyenoord", "Fortuna Sittard", "Go Ahead Eagles", "N.E.C. Nijmegen", "PEC Zwolle", "PSV", "SC Cambuur", "sc Heerenveen", "Sparta Rotterdam", "Telstar", "Willem II"],
  },
  {
    key: "netherlands.knvb-cup", country: "Netherlands", tier: "cup", label: "KNVB Cup",
    aliases: ["KNVB Cup", "Eurojackpot KNVB Beker", "KNVB Beker", "Dutch Cup", "Dutch KNVB Beker", "Netherlands Cup", "TOTO KNVB Beker", "TOTO KNVB Cup", "Nederlandse Beker", "NED.CUP"], teams: [],
  },
];

const aliasOverrides: Record<string, string[]> = {
  "brighton and hove albion": ["brighton", "brighton & hove albion"],
  "bournemouth": ["afc bournemouth"],
  "manchester city": ["man city", "manchester city fc"],
  "manchester united": ["man utd", "man united", "manchester united fc"],
  "newcastle united": ["newcastle", "newcastle united fc"],
  "nottingham forest": ["nott'm forest", "nottm forest", "notts forest"],
  "tottenham hotspur": ["tottenham", "spurs"],
  "athletic club": ["athletic bilbao", "bilbao"],
  "atlético de madrid": ["atletico madrid", "atletico"],
  "fc barcelona": ["barcelona", "barca", "barça"],
  "real madrid": ["real madrid cf", "madrid"],
  "rc deportivo": ["deportivo", "deportivo la coruna", "deportivo la coruña"],
  "rcd espanyol de barcelona": ["espanyol", "rcd espanyol"],
  "fc bayern münchen": ["bayern", "bayern munich", "fc bayern munchen"],
  "bayer 04 leverkusen": ["bayer leverkusen", "leverkusen"],
  "borussia monchengladbach": ["gladbach", "m'gladbach"],
  "1. fc köln": ["koln", "koeln", "cologne"],
  "sv werder bremen": ["werder bremen", "bremen"],
  "internazionale": ["inter", "inter milan", "internazionale milano"],
  "milan": ["ac milan", "milan ac"],
  "roma": ["as roma", "as rome"],
  "paris saint-germain": ["psg", "paris sg"],
  "olympique lyonnais": ["lyon", "ol"],
  "olympique de marseille": ["marseille", "om"],
  "losc lille": ["losc", "lille", "lille osc"],
  "ajax": ["ajax amsterdam", "afc ajax"],
  "az": ["az alkmaar"],
  "feyenoord": ["feyenoord rotterdam"],
  "psv": ["psv eindhoven"],
  "n.e.c. nijmegen": ["nec", "nec nijmegen"],
  "sc heerenveen": ["heerenveen"],
};

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function aliasesFor(def: CompetitionDefinition): string[] {
  return [...def.aliases, def.label, ...def.teams.flatMap((team) => [team, ...(aliasOverrides[normalize(team)] ?? [])])];
}

export function resolveCompetition(league: string, homeTeam: string, awayTeam: string, sport: string): ResolvedCompetition | null {
  if (sport !== "football") return null;
  const leagueKey = normalize(league);
  const direct = TOP_SIX_COMPETITIONS.find((def) => aliasesFor(def).some((alias) => normalize(alias) === leagueKey));
  if (direct) return { key: direct.key, label: direct.label, tier: direct.tier, country: direct.country, matchedBy: "competition" };

  const teamKeys = [normalize(homeTeam), normalize(awayTeam)].filter(Boolean);
  const teamMatched = TOP_SIX_COMPETITIONS.filter((def) => def.tier === "league").find((def) => {
    const known = new Set(def.teams.flatMap((team) => [normalize(team), ...(aliasOverrides[normalize(team)] ?? []).map(normalize)]));
    return teamKeys.some((team) => known.has(team));
  });
  if (teamMatched) return { key: teamMatched.key, label: teamMatched.label, tier: teamMatched.tier, country: teamMatched.country, matchedBy: "team" };
  return null;
}

export function normalizeCompetitionLabel(value: string): string {
  const normalized = normalize(value);
  return TOP_SIX_COMPETITIONS.find((def) => aliasesFor(def).some((alias) => normalize(alias) === normalized))?.label ?? value.trim();
}

export { normalize as normalizeCompetitionToken };
