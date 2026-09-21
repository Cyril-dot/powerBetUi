// =============================================================================
// api.ts — Super Bet full backend integration layer
// Confirmed live backend: https://futballbackend-production-7342.up.railway.app
// Browser-safe calls only. Never place provider secrets in this file.
// =============================================================================

export const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "https://futballbackend-production-15ee.up.railway.app";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type MatchSource =
  | "SPORTDB" | "SPORTSRC" | "BSD" | "FOOTBALL_DATA" | "API_FOOTBALL"
  | "VIRTUAL" | "ADMIN_CREATED" | "LIVESCORE" | "ESPN";

export type FootballLeague =
  | "PREMIER_LEAGUE" | "LA_LIGA" | "BUNDESLIGA" | "SERIE_A" | "LIGUE_1"
  | "CHAMPIONS_LEAGUE_GROUP" | "CHAMPIONSHIP" | "EREDIVISIE" | "PRIMEIRA_LIGA"
  | "SCOTTISH_PREM" | "BELGIAN_PRO" | "TURKISH_SUPER" | "RUSSIAN_PREMIER"
  | "GREEK_SUPER" | "UKRAINIAN_PREMIER" | "AUSTRIAN_BUNDESLIGA" | "SWISS_SUPER"
  | "DANISH_SUPER" | "NORWEGIAN_ELITE" | "SWEDISH_ALLSVENSKAN" | "CZECH_FIRST"
  | "POLISH_EKSTRA" | "ROMANIAN_LIGA1" | "CROATIAN_HNL" | "SERBIAN_SUPER"
  | "ISRAELI_PREMIER" | "HUNGARIAN_LIGA" | "SLOVAK_SUPER" | "SLOVENIAN_PRVA"
  | "BELARUSIAN_PREMIER" | "KAZAKH_PREMIER" | "FINNISH_VEIKKAUS"
  | "SOUTH_AFRICAN_PREMIER" | "MOROCCAN_BOTOLA" | "EGYPTIAN_PREMIER"
  | "NIGERIAN_PREMIER" | "GHANAIAN_PREMIER" | "SAUDI_PRO" | "UAE_PRO"
  | "INDIAN_SUPER" | "J1_LEAGUE" | "K_LEAGUE_1" | "CHINESE_SUPER"
  | "THAI_LEAGUE_1" | "MALAYSIAN_SUPER" | "INDONESIAN_LIGA1" | "IRANIAN_PGPL"
  | "A_LEAGUE" | "MLS" | "LIGA_MX" | "BRAZILIAN_SERIE_A" | "ARGENTINE_PRIMERA"
  | "COLOMBIAN_PRIMERA" | "CHILEAN_PRIMERA" | "PERUVIAN_LIGA1"
  | "ECUADORIAN_SERIE_A" | "URUGUAYAN_PRIMERA" | "VENEZUELAN_PRIMERA"
  | "BOLIVIAN_DFP" | "PARAGUAYAN_DP";

export type FootballCup =
  | "FA_CUP" | "EFL_CUP" | "COPA_DEL_REY" | "DFB_POKAL" | "COPPA_ITALIA"
  | "COUPE_DE_FRANCE" | "CHAMPIONS_LEAGUE" | "EUROPA_LEAGUE"
  | "CONFERENCE_LEAGUE" | "NATIONS_LEAGUE" | "EUROS" | "COPA_LIBERTADORES"
  | "COPA_AMERICA" | "CONCACAF_CHAMPIONS" | "AFC_CHAMPIONS" | "CAF_CHAMPIONS"
  | "AFCON" | "WORLD_CUP" | "WOMENS_WORLD_CUP" | "CLUB_WORLD_CUP";

export interface Match {
  id: string;
  source: MatchSource;
  externalId?: string;
  minutePlayed?: number;
  sport?: string;
  league?: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt?: string;
  status?: string;
  scoreHome?: number;
  scoreAway?: number;
  homeLogo?: string;
  awayLogo?: string;
  leagueLogo?: string;
  featured?: boolean;
  createdAt?: string;
}

export interface Odds {
  id: string;
  matchId: string;
  market: string;
  selection: string;
  value: number;
  capturedAt: string;
}

export interface Transaction {
  id: string;
  walletId: string;
  kind: string;
  amount: number;
  balanceAfter: number;
  providerRef?: string;
  status?: string;
  createdAt: string;
}

export interface WithdrawalRequest {
  id: string;
  amount: number;
  currency?: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SETTLED" | "FAILED";
  method: string;
  accountNumber: string;
  accountName: string;
  network?: string;
  createdAt: string;
}

export interface Bet {
  id: string;
  userId: string;
  stake: number;
  currency?: string;
  totalOdds: number;
  potentialReturn: number;
  status: "PENDING" | "WON" | "LOST" | "VOID" | "CASHED_OUT";
  placedAt: string;
  settledAt?: string;
  selections: Array<{
    id: string;
    matchId: string;
    market: string;
    selection: string;
    oddsLocked: number;
    result?: string;
    homeTeam?: string;
    awayTeam?: string;
  }>;
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  last: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// HTTP core
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function authHeaders(path: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = window.localStorage.getItem("accessToken") || window.localStorage.getItem("token") || window.localStorage.getItem("authToken") || window.sessionStorage.getItem("accessToken") || window.sessionStorage.getItem("token") || window.sessionStorage.getItem("authToken");
  const isPublic = path.startsWith("/api/auth/") || path.startsWith("/api/public/") || path.startsWith("/api/geo/");
  return token && !isPublic ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", "Cache-Control": "no-cache", Pragma: "no-cache", ...authHeaders(path), ...extraHeaders };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const debugScheduler = path.includes("/admin/matches/auto");
  const debugBody = (value: unknown): unknown => {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(debugBody);
    const source = value as Record<string, unknown>;
    return Object.fromEntries(Object.entries(source).map(([key, item]) => {
      if (typeof item === "string" && item.startsWith("data:image/")) return [key, `[redacted image data: ${item.length} chars]`];
      if (key.toLowerCase().includes("token") || key.toLowerCase().includes("authorization")) return [key, "[redacted]"];
      return [key, debugBody(item)];
    }));
  };
  if (debugScheduler) {
    console.groupCollapsed(`[Scheduler] ${method} ${BASE_URL}${path}`);
    console.info("Request headers", { ...headers, Authorization: headers.Authorization ? "Bearer [redacted]" : undefined });
    console.info("Request payload", debugBody(body));
    console.groupEnd();
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      credentials: "include",
      cache: "no-store",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    if (debugScheduler) console.error("[Scheduler] Network error", networkErr);

    // Network failure (offline, DNS, CORS preflight) — wrap so callers
    // always get an ApiError and the DepositCenter logger sees httpStatus=0
    throw new ApiError(
      networkErr instanceof Error ? networkErr.message : "Network error — check your connection.",
      0,
    );
  }

  const text = await res.text();
  let payload: unknown;
  try { payload = text ? JSON.parse(text) : undefined; } catch { payload = text; }
  if (debugScheduler) console.info("[Scheduler] Response", { status: res.status, ok: res.ok, contentType: res.headers.get("content-type"), body: payload });

  if (!res.ok) {
    if (debugScheduler) console.error("[Scheduler] HTTP failure", { status: res.status, url: `${BASE_URL}${path}`, body: payload });
    // Try to pull a human-readable message out of the response body.
    // Flutterwave v4 error shape: { "status": "failed", "error": { "message": "..." } }
    // Spring ApiException shape:  { "message": "..." }
    let message = `Request failed (${res.status})`;
    if (payload && typeof payload === "object") {
      const p = payload as Record<string, unknown>;
      if (typeof p.message === "string" && p.message) {
        message = p.message;
      } else if (typeof p.error === "string" && p.error) {
        message = p.error;
      } else if (p.error && typeof p.error === "object") {
        const e = p.error as Record<string, unknown>;
        if (typeof e.message === "string" && e.message) message = e.message;
      } else if (typeof p.detail === "string" && p.detail) {
        message = p.detail;
      } else if (Array.isArray(p.errors) && p.errors.length) {
        message = p.errors.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join("; ");
      }
    }
    if (message === `Request failed (${res.status})`) message = `Request failed (${res.status}) at ${path}`;
    throw new ApiError(message, res.status);
  }

  return payload as T;
}

function unwrap<T>(payload: ApiResponse<T> | T): T {
  if (payload && typeof payload === "object" && "data" in (payload as Record<string, unknown>) && "success" in (payload as Record<string, unknown>)) {
    return (payload as ApiResponse<T>).data;
  }
  return payload as T;
}

const http = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>("POST", path, body, headers),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
};

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const filtered = Object.entries(params).filter(([, v]) => v !== undefined);
  if (!filtered.length) return "";
  return "?" + filtered.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
}

async function get<T>(path: string): Promise<T> { return unwrap(await http.get<ApiResponse<T> | T>(path)); }
async function post<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> { return unwrap(await http.post<ApiResponse<T> | T>(path, body, headers)); }
async function patch<T>(path: string, body?: unknown): Promise<T> { return unwrap(await http.patch<ApiResponse<T> | T>(path, body)); }

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------

export interface AuthResult {
  accessToken: string;
  user?: Record<string, unknown>;
}

function extractAuthResult(raw: unknown): AuthResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const candidates: unknown[] = [
    r.accessToken, r.access_token, r.token, r.jwt, r.authToken, r.idToken,
    (r.data as Record<string, unknown> | undefined)?.accessToken,
    (r.data as Record<string, unknown> | undefined)?.token,
    (r.session as Record<string, unknown> | undefined)?.accessToken,
    (r.session as Record<string, unknown> | undefined)?.token,
    (r.auth as Record<string, unknown> | undefined)?.accessToken,
    (r.auth as Record<string, unknown> | undefined)?.token,
  ];
  const accessToken = candidates.find((c): c is string => typeof c === "string" && c.length > 0);
  if (!accessToken) {
    console.error("[auth] Login/register response did not contain a recognizable token field:", raw);
    throw new ApiError("Signed in, but the server didn't return a session token. Please contact support.", 200);
  }
  const user = (r.user ?? r.account ?? r.profile) as Record<string, unknown> | undefined;
  return { accessToken, user };
}

export const auth = {
  login: (body: { email: string; password: string }) => post<Record<string, unknown>>("/api/auth/login", body).then(extractAuthResult),
  register: (body: { email: string; password: string; firstName: string; lastName: string; phone?: string; country?: string; ref?: string }) =>
    post<Record<string, unknown>>("/api/auth/register", body).then(extractAuthResult),
  logout: () => post<void>("/api/auth/logout"),
  requestPasswordReset: (body: { email: string }) => post<Record<string, string>>("/api/auth/request-password-reset", body),
  resetPassword: (body: { token: string; password: string }) => post<Record<string, string>>("/api/auth/reset-password", body),
};

// ---------------------------------------------------------------------------
// USER
// ---------------------------------------------------------------------------

export const user = {
  me: () => get<Record<string, unknown>>("/api/users/me"),
  update: (body: Record<string, unknown>) => patch<Record<string, unknown>>("/api/users/me", body),
};

// ---------------------------------------------------------------------------
// WALLET
// ---------------------------------------------------------------------------

export const wallet = {
  getWallet: () => get<Record<string, unknown>>("/api/wallet"),
  getTransactions: (page = 0, size = 20) => get<PageResponse<Transaction>>(`/api/wallet/transactions${qs({ page, size })}`),
  withdraw: (body: Record<string, unknown>) => post<Transaction>("/api/wallet/withdraw", body),
};

export const withdrawals = {
  getMine: (page = 0, size = 20) => get<PageResponse<WithdrawalRequest>>(`/api/wallet/withdrawals${qs({ page, size })}`),
  submit: (body: { amount: number; currency?: string; method: string; accountNumber: string; accountName: string; network?: string }) =>
    post<WithdrawalRequest>("/api/wallet/withdrawals", body),
  getById: (id: string) => get<WithdrawalRequest>(`/api/wallet/withdrawals/${id}`),
};

// ---------------------------------------------------------------------------
// DEPOSITS — Flutterwave v4
//
// Five payment rails across two currencies. All share the same idempotent
// backend credit path. Webhooks use HMAC-SHA256(secretHash, rawBody)→base64
// compared against the "flutterwave-signature" header (official v4 algorithm
// per developer.flutterwave.com/docs/webhooks). A background reconciler also
// polls pending charges so a closed tab or missed webhook still credits.
//
// ── Ghana (GHS) ──────────────────────────────────────────────────────────────
//   Mobile Money — push-notification flow (MTN / AirtelTigo / Vodafone).
//   Controller: FlutterwaveGhV4DepositController.java
//   Webhook URL: /api/webhooks/flutterwave/v4/gh
//
//   POST /api/wallet/deposit/flutterwave/gh/v4/init
//     body:    { amount: number, phoneNumber?: string, network: FlutterwaveGhNetwork }
//     returns: FlutterwaveGhInitResponse  { txRef, message }
//
//   POST /api/wallet/deposit/flutterwave/gh/v4/verify
//     body:    { txRef: string }
//     returns: FlutterwaveVerifyResponse  { credited, status, message }
//
// ── Nigeria (NGN) ─────────────────────────────────────────────────────────────
//   Controller: FlutterwaveNgBankV4DepositController.java
//   Webhook URL: /api/webhooks/flutterwave/v4/ng  (all four NGN methods)
//
//   1. Pay with Bank Account (Mono redirect)
//      POST /api/wallet/deposit/flutterwave/v4/ng-bank/init
//        body:    { amount: number }
//        returns: FlutterwaveNgBankInitResponse
//        Flow: frontend sends browser to redirectUrl → bank auth page → backend
//              /redirect → 302 to /deposit?method=ngbank-v4&reference=... →
//              DepositCenter resumes polling /verify
//
//   2. Pay with Bank Transfer — PWBT (dynamic virtual account)
//      POST /api/wallet/deposit/flutterwave/v4/ng-bank/init/bank-transfer
//        body:    { amount: number }
//        returns: FlutterwavePwbtInitResponse
//        Flow: show account number to customer → customer transfers → webhook credits
//        Note: no polling endpoint; credit is webhook-only for PWBT
//
//   3. USSD
//      GET  /api/wallet/deposit/flutterwave/v4/ng-ussd/banks
//        returns: bank list  { data: FlutterwaveUssdBank[] }
//      POST /api/wallet/deposit/flutterwave/v4/ng-ussd/init
//        body:    { amount: number, bankCode: string }
//        returns: FlutterwaveUssdInitResponse  { reference, chargeId, note }
//        Flow: show USSD dial string to customer → customer dials → webhook credits
//
//   4. OPay
//      POST /api/wallet/deposit/flutterwave/v4/ng-opay/init
//        body:    { amount: number }
//        returns: FlutterwaveOpayInitResponse
//        Flow: frontend sends browser to redirectUrl → OPay auth → backend
//              /redirect → 302 to /deposit?method=ngopay-v4&reference=... →
//              DepositCenter resumes polling /verify
//
//   Shared NGN verify (bank_account + ussd + opay — NOT pwbt):
//      GET /api/wallet/deposit/flutterwave/v4/ng/verify?ref={reference}
//        returns: FlutterwaveVerifyResponse  { credited, status, message }
// ---------------------------------------------------------------------------

export type FlutterwaveGhNetwork = "MTN" | "AIRTELTIGO" | "VODAFONE";

// ── Ghana ────────────────────────────────────────────────────────────────────

export interface FlutterwaveGhInitResponse {
  txRef: string;
  message: string;
}

// ── Shared verify response (all methods that support polling) ────────────────

/** Returned by all /verify endpoints. `credited` is false when idempotently
 *  already processed; `status` mirrors AbstractFlutterwaveV4DepositController
 *  SUCCESS_STATUSES / TERMINAL_FAILURE_STATUSES / "pending". */
export interface FlutterwaveVerifyResponse {
  credited: boolean;
  status: string;
  message: string;
}

/** @deprecated alias — kept so existing imports don't break. */
export type FlutterwaveGhVerifyResponse = FlutterwaveVerifyResponse;

// ── Nigeria: Pay with Bank Account ──────────────────────────────────────────

export interface FlutterwaveNgBankInitResponse {
  reference: string;
  chargeId: string;
  /**
   * URL to send the customer to (Mono's bank-selection page).
   * Confirmed v4 path: data.next_action.redirect_url.url
   * Can be null if the backend couldn't extract it — callers MUST handle this.
   */
  redirectUrl: string | null;
  /** next_action.type from the charge response, e.g. "redirect_url". */
  nextActionType?: string;
}

// ── Nigeria: Pay with Bank Transfer (PWBT virtual account) ──────────────────

export interface FlutterwavePwbtInitResponse {
  reference: string;
  /** Virtual account number the customer must transfer to. */
  accountNumber: string;
  /** Bank name, e.g. "Flutterwave MFB". */
  bankName: string;
  /** ISO-8601 expiry datetime of the dynamic virtual account. */
  expiresAt: string;
  /** Human-readable transfer instruction to show the customer. */
  note: string;
  /** The exact NGN amount the customer must transfer. */
  amount: number;
}

// ── Nigeria: USSD ────────────────────────────────────────────────────────────

export interface FlutterwaveUssdBank {
  /** Bank code to pass as bankCode in the USSD init request. e.g. "044" */
  code: string;
  /** Display name, e.g. "Access Bank" */
  name: string;
  id?: string;
}

export interface FlutterwaveUssdInitResponse {
  reference: string;
  chargeId: string;
  /**
   * The USSD instruction string to display to the customer.
   * e.g. "Please dial *1414# to complete this transaction"
   * Confirmed v4 path: data.next_action.payment_instruction.note
   */
  note: string;
}

// ── Nigeria: OPay ────────────────────────────────────────────────────────────

export interface FlutterwaveOpayInitResponse {
  reference: string;
  chargeId: string;
  /**
   * URL to send the customer to (OPay's authorization interface).
   * Confirmed v4 path: data.next_action.redirect_url.url
   * Can be null — callers must handle this.
   */
  redirectUrl: string | null;
}

// ── deposits object ──────────────────────────────────────────────────────────

export const deposits = {
  stripeIntent: (body: Record<string, unknown>) =>
    post<Record<string, unknown>>("/api/wallet/deposit/stripe/intent", body),

  paystackInit: (body: { amount: number; currency?: string }) =>
    post<{ authorizationUrl?: string; reference?: string }>("/api/wallet/deposit/paystack/init", body),

  // ── Ghana GHS: Mobile Money ─────────────────────────────────────────────

  flutterwaveGhInit: (body: { amount: number; phoneNumber?: string; network: FlutterwaveGhNetwork }) =>
    post<FlutterwaveGhInitResponse>("/api/wallet/deposit/flutterwave/gh/v4/init", body),

  flutterwaveGhVerify: (body: { txRef: string }) =>
    post<FlutterwaveVerifyResponse>("/api/wallet/deposit/flutterwave/gh/v4/verify", body),

  // ── Nigeria NGN: Pay with Bank Account (Mono redirect) ──────────────────

  flutterwaveNgBankInit: (body: { amount: number }) =>
    post<FlutterwaveNgBankInitResponse>("/api/wallet/deposit/flutterwave/v4/ng-bank/init", body),

  // ── Nigeria NGN: Pay with Bank Transfer (PWBT virtual account) ──────────

  flutterwaveNgPwbtInit: (body: { amount: number }) =>
    post<FlutterwavePwbtInitResponse>("/api/wallet/deposit/flutterwave/v4/ng-bank/init/bank-transfer", body),

  // ── Nigeria NGN: USSD ────────────────────────────────────────────────────

  /** Fetch the list of supported banks for USSD in Nigeria. */
  flutterwaveNgUssdBanks: () =>
    get<{ data: FlutterwaveUssdBank[] }>("/api/wallet/deposit/flutterwave/v4/ng-ussd/banks"),

  flutterwaveNgUssdInit: (body: { amount: number; bankCode: string }) =>
    post<FlutterwaveUssdInitResponse>("/api/wallet/deposit/flutterwave/v4/ng-ussd/init", body),

  // ── Nigeria NGN: OPay ────────────────────────────────────────────────────

  flutterwaveNgOpayInit: (body: { amount: number }) =>
    post<FlutterwaveOpayInitResponse>("/api/wallet/deposit/flutterwave/v4/ng-opay/init", body),

  // ── Shared NGN verify (bank_account, ussd, opay — NOT pwbt) ─────────────
  //
  // GET with query param ?ref=  (differs from GH which is POST with body)

  flutterwaveNgVerify: (reference: string) =>
    get<FlutterwaveVerifyResponse>(`/api/wallet/deposit/flutterwave/v4/ng/verify${qs({ ref: reference })}`),

  /**
   * @deprecated use flutterwaveNgVerify() — kept as an alias so existing
   * call sites compile without changes.
   */
  flutterwaveNgBankVerify: (reference: string) =>
    get<FlutterwaveVerifyResponse>(`/api/wallet/deposit/flutterwave/v4/ng/verify${qs({ ref: reference })}`),
};

// ---------------------------------------------------------------------------
// BETS
// ---------------------------------------------------------------------------

export const bets = {
  getMine: (page = 0, size = 20) => get<PageResponse<Bet>>(`/api/bets${qs({ page, size })}`),
  place: (body: { stake: number; currency?: string; selections: Array<{ matchId: string; market: string; selection: string; submittedOdds: number }>; bookingCodeUsedId?: string }) =>
    post<Bet>("/api/bets", body),
  getOne: (id: string) => get<Bet>(`/api/bets/${id}`),
  getUnseenWins: () => get<Bet[]>("/api/bets/unseen-wins"),
  dismissWin: (id: string) => post<void>(`/api/bets/${id}/dismiss-win`),
};

// ---------------------------------------------------------------------------
// WEBHOOKS
// ---------------------------------------------------------------------------

export const webhooks = {
  stripe: (payload: string, signature: string) => post<string>("/api/webhooks/stripe", payload, { "Stripe-Signature": signature }),
  paystack: (signature?: string) => post<string>("/api/webhooks/paystack", undefined, signature ? { "x-paystack-signature": signature } : undefined),
};

// ---------------------------------------------------------------------------
// GAMES
// ---------------------------------------------------------------------------

export const games = {
  play: (game: string, body: Record<string, unknown>) => post<Record<string, unknown>>(`/api/games/${game}/play`, body),
  cashout: (game: string, body: Record<string, unknown>) => post<Record<string, unknown>>(`/api/games/${game}/cashout`, body),
  currentRound: (game: string) => get<Record<string, unknown>>(`/api/games/${game}/current-round`),
  history: (limit = 20) => get<Record<string, unknown>[]>(`/api/games/history${qs({ limit })}`),
};

// ---------------------------------------------------------------------------
// BOOKING CODES
// ---------------------------------------------------------------------------

export type BookingCodeSelection = Record<string, unknown>;

export interface BookingCode {
  id: string;
  code: string;
  creatorAdminId?: string;
  label?: string;
  kind?: string;
  bookingType?: string;
  version?: number;
  currency?: string;
  stake?: number;
  selections?: BookingCodeSelection[];
  totalOdds?: number;
  potentialPayout?: number;
  status?: string;
  redemptionCount?: number;
  maxRedemptions?: number;
  expiresAt?: string;
  createdAt?: string;
}

export interface RedeemResponse {
  booking?: BookingCode;
  enrichedSelections?: BookingCodeSelection[];
  currentTotalOdds?: number;
}

export const booking = {
  redeem: (body: { code: string }) => post<RedeemResponse>("/api/booking/redeem", body),
};

export const adminBooking = {
  list: (page = 0, size = 20) => get<PageResponse<Record<string, unknown>>>(`/api/admin/booking-codes${qs({ page, size })}`),
  createBookingCode: (body: Record<string, unknown>) => post<Record<string, unknown>>("/api/admin/booking-codes", body),
  createAdminOnlyBookingCode: (body: Record<string, unknown>) => post<Record<string, unknown>>("/api/admin/booking-codes", { ...body, bookingType: "ADMIN_ONLY" }),
  createMixedBookingCode: (body: Record<string, unknown>) => post<Record<string, unknown>>("/api/admin/booking-codes", { ...body, bookingType: "MIXED" }),
  detail: (id: string) => get<Record<string, unknown>>(`/api/admin/booking-codes/${id}`),
};

// ---------------------------------------------------------------------------
// GEO
// ---------------------------------------------------------------------------

export const geo = {
  getCurrency: () => get<Record<string, string>>("/api/geo/currency"),
};

// ---------------------------------------------------------------------------
// PUBLIC — FOOTBALL
// ---------------------------------------------------------------------------

export const publicFootball = {
  getAll: () => get<Record<string, unknown>>("/api/public/football/matches"),
  upcoming: () => get<Record<string, unknown>[]>("/api/public/football/matches/upcoming"),
  today: () => get<Record<string, unknown>[]>("/api/public/football/matches/today"),
  live: () => get<Record<string, unknown>[]>("/api/public/football/matches/live"),
  future: () => get<Record<string, unknown>[]>("/api/public/football/matches/future"),
  results: (limit = 20) => get<Match[]>(`/api/public/football/matches/results${qs({ limit })}`),
  featured: () => get<Match[]>("/api/public/football/matches/featured"),
  withOdds: () => get<Record<string, unknown>>("/api/public/football/matches/with-odds"),
  withAllOdds: () => get<Record<string, unknown>>("/api/public/football/matches/with-all-odds"),
  top6Upcoming: () => get<Record<string, unknown>[]>("/api/public/football/matches/top6/upcoming"),
  top6Today: () => get<Record<string, unknown>[]>("/api/public/football/matches/top6/today"),
  top6Live: () => get<Record<string, unknown>[]>("/api/public/football/matches/top6/live"),
  cupsUpcoming: () => get<Record<string, unknown>[]>("/api/public/football/matches/cups/upcoming"),
  cupsToday: () => get<Record<string, unknown>[]>("/api/public/football/matches/cups/today"),
  cupsLive: () => get<Record<string, unknown>[]>("/api/public/football/matches/cups/live"),
  allCupsUpcoming: () => get<Record<string, unknown>[]>("/api/public/football/matches/all-cups/upcoming"),
  allCupsToday: () => get<Record<string, unknown>[]>("/api/public/football/matches/all-cups/today"),
  allCupsLive: () => get<Record<string, unknown>[]>("/api/public/football/matches/all-cups/live"),
  getById: (id: string) => get<Match>(`/api/public/football/matches/${id}`),
  stats: (id: string) => get<Record<string, unknown>>(`/api/public/football/matches/${id}/stats`),
  prediction: (id: string) => get<Record<string, unknown>>(`/api/public/football/matches/${id}/prediction`),
  odds: (id: string) => get<Record<string, unknown>[]>(`/api/public/football/matches/${id}/odds`),
  oddsRaw: (id: string) => get<Odds[]>(`/api/public/football/matches/${id}/odds/raw`),
  oddsAll: (id: string) => get<Record<string, unknown>>(`/api/public/football/matches/${id}/odds/all`),
  oddsHandicap: (id: string) => get<Record<string, unknown>[]>(`/api/public/football/matches/${id}/odds/handicap`),
  oddsHalfTime: (id: string) => get<Record<string, unknown>[]>(`/api/public/football/matches/${id}/odds/half-time`),
  oddsCorrectScore: (id: string) => get<Record<string, unknown>[]>(`/api/public/football/matches/${id}/odds/correct-score`),
  oddsGoalscorer: (id: string) => get<Record<string, Record<string, unknown>[]>>(`/api/public/football/matches/${id}/odds/goalscorer`),
  oddsEspn: (id: string) => get<Record<string, unknown>>(`/api/public/football/matches/${id}/odds/espn`),
  oddsCacheStatus: (id: string) => get<Record<string, boolean>>(`/api/public/football/matches/${id}/odds/cache-status`),
  lineups: (id: string) => get<Record<string, unknown>>(`/api/public/football/matches/${id}/lineups`),
  h2h: (id: string) => get<Record<string, unknown>>(`/api/public/football/matches/${id}/h2h`),
  events: (id: string) => get<Record<string, unknown>>(`/api/public/football/matches/${id}/events`),
  detail: (id: string) => get<Record<string, unknown>>(`/api/public/football/matches/${id}/detail`),
  form: (id: string) => get<Record<string, unknown>[]>(`/api/public/football/matches/${id}/form`),
  news: (id: string) => get<Record<string, unknown>[]>(`/api/public/football/matches/${id}/news`),
  videos: (id: string) => get<Record<string, unknown>[]>(`/api/public/football/matches/${id}/videos`),
  venue: (id: string) => get<string>(`/api/public/football/matches/${id}/venue`),
};

export const publicFootballLeagues = {
  upcoming: (league: FootballLeague) => get<Record<string, unknown>[]>(`/api/public/football/leagues/${league}/upcoming`),
  today: (league: FootballLeague) => get<Record<string, unknown>[]>(`/api/public/football/leagues/${league}/today`),
  live: (league: FootballLeague) => get<Record<string, unknown>[]>(`/api/public/football/leagues/${league}/live`),
  top6Upcoming: (league: FootballLeague) => get<Record<string, unknown>[]>(`/api/public/football/leagues/top6/${league}/upcoming`),
  top6Today: (league: FootballLeague) => get<Record<string, unknown>[]>(`/api/public/football/leagues/top6/${league}/today`),
  top6Live: (league: FootballLeague) => get<Record<string, unknown>[]>(`/api/public/football/leagues/top6/${league}/live`),
  top6Finished: (league: FootballLeague) => get<Record<string, unknown>[]>(`/api/public/football/leagues/top6/${league}/results/finished`),
  top6Teams: (league: FootballLeague) => get<Record<string, unknown>>(`/api/public/football/leagues/top6/${league}/teams`),
  top6TeamSchedule: (league: FootballLeague, teamId: string) => get<Record<string, unknown>>(`/api/public/football/leagues/top6/${league}/teams/${teamId}/schedule`),
  top6FixturesByDate: (league: FootballLeague, date: string) => get<Record<string, unknown>[]>(`/api/public/football/leagues/top6/${league}/fixtures/date/${date}`),
};

export const publicFootballCups = {
  upcoming: (cup: FootballCup) => get<Record<string, unknown>[]>(`/api/public/football/cups/${cup}/upcoming`),
  today: (cup: FootballCup) => get<Record<string, unknown>[]>(`/api/public/football/cups/${cup}/today`),
  live: (cup: FootballCup) => get<Record<string, unknown>[]>(`/api/public/football/cups/${cup}/live`),
  finished: (cup: FootballCup) => get<Record<string, unknown>[]>(`/api/public/football/cups/${cup}/results/finished`),
  matchDetail: (cup: FootballCup, eventId: string) => get<Record<string, unknown>>(`/api/public/football/cups/${cup}/matches/${eventId}/detail`),
  fixturesByDate: (date: string) => get<Record<string, unknown>[]>(`/api/public/football/cups/fixtures/date/${date}`),
};

export const publicFootballTeams = {
  upcoming: (team: string) => get<Record<string, unknown>[]>(`/api/public/football/teams/${team}/upcoming`),
  results: (team: string) => get<Match[]>(`/api/public/football/teams/${team}/results`),
  live: (team: string) => get<Record<string, unknown>[]>(`/api/public/football/teams/${team}/live`),
};

export const publicFootballStandings = {
  byCompetition: (competitionId: number) => get<Record<string, unknown>>(`/api/public/football/standings/${competitionId}`),
  top6: () => get<Record<string, Record<string, unknown>>>("/api/public/football/standings/top6"),
  byLeague: (league: FootballLeague) => get<Record<string, unknown>>(`/api/public/football/standings/leagues/${league}`),
  top6ByLeague: (league: FootballLeague) => get<Record<string, unknown>>(`/api/public/football/standings/leagues/top6/${league}`),
  byCup: (cup: FootballCup) => get<Record<string, unknown>>(`/api/public/football/standings/cups/${cup}`),
};

export const publicFootballScorers = {
  byCompetition: (competitionId: number) => get<Record<string, unknown>>(`/api/public/football/scorers/${competitionId}`),
  byLeague: (league: FootballLeague) => get<Record<string, unknown>>(`/api/public/football/scorers/leagues/${league}`),
  top6ByLeague: (league: FootballLeague) => get<Record<string, unknown>>(`/api/public/football/scorers/leagues/top6/${league}`),
};

export const publicFootballLivescore = {
  live: () => get<Record<string, unknown>[]>("/api/public/football/livescore/live"),
  today: () => get<Record<string, unknown>[]>("/api/public/football/livescore/today"),
  fixtures: () => get<Record<string, unknown>[]>("/api/public/football/livescore/fixtures"),
  allLeaguesToday: () => get<Record<string, unknown>[]>("/api/public/football/livescore/all-leagues/today"),
  allCupsToday: () => get<Record<string, unknown>[]>("/api/public/football/livescore/all-cups/today"),
  top6Live: () => get<Record<string, unknown>[]>("/api/public/football/livescore/top6/live"),
  top6Fixtures: () => get<Record<string, unknown>[]>("/api/public/football/livescore/top6/fixtures"),
  top6AllFixtures: () => get<Record<string, unknown>[]>("/api/public/football/livescore/top6/all-fixtures"),
  top6LeagueLive: (league: FootballLeague) => get<Record<string, unknown>[]>(`/api/public/football/livescore/leagues/top6/${league}/live`),
  top6LeagueFixtures: (league: FootballLeague) => get<Record<string, unknown>[]>(`/api/public/football/livescore/leagues/top6/${league}/fixtures`),
  cupsLive: () => get<Record<string, unknown>[]>("/api/public/football/livescore/cups/live"),
  cupsFixtures: () => get<Record<string, unknown>[]>("/api/public/football/livescore/cups/fixtures"),
  cupLive: (cup: FootballCup) => get<Record<string, unknown>[]>(`/api/public/football/livescore/cups/${cup}/live`),
  cupFixtures: (cup: FootballCup) => get<Record<string, unknown>[]>(`/api/public/football/livescore/cups/${cup}/fixtures`),
};

// ---------------------------------------------------------------------------
// PUBLIC — BASKETBALL
// ---------------------------------------------------------------------------

export const publicBasketball = {
  getAll: () => get<Record<string, unknown>>("/api/public/basketball/matches"),
  upcoming: () => get<Record<string, unknown>[]>("/api/public/basketball/matches/upcoming"),
  today: () => get<Record<string, unknown>[]>("/api/public/basketball/matches/today"),
  live: () => get<Record<string, unknown>[]>("/api/public/basketball/matches/live"),
  future: () => get<Record<string, unknown>[]>("/api/public/basketball/matches/future"),
  results: (limit = 20) => get<Match[]>(`/api/public/basketball/matches/results${qs({ limit })}`),
  withOdds: () => get<Record<string, unknown>>("/api/public/basketball/matches/with-odds"),
  withAllOdds: () => get<Record<string, unknown>>("/api/public/basketball/matches/with-all-odds"),
  getById: (id: string) => get<Match>(`/api/public/basketball/matches/${id}`),
  odds: (id: string) => get<Record<string, unknown>[]>(`/api/public/basketball/matches/${id}/odds`),
  oddsAll: (id: string) => get<Record<string, unknown>>(`/api/public/basketball/matches/${id}/odds/all`),
  oddsMoneyline: (id: string) => get<Record<string, unknown>[]>(`/api/public/basketball/matches/${id}/odds/moneyline`),
  oddsSpread: (id: string) => get<Record<string, unknown>[]>(`/api/public/basketball/matches/${id}/odds/spread`),
  oddsTotal: (id: string) => get<Record<string, unknown>[]>(`/api/public/basketball/matches/${id}/odds/total`),
  oddsQuarters: (id: string) => get<Record<string, unknown>[]>(`/api/public/basketball/matches/${id}/odds/quarters`),
  oddsMargin: (id: string) => get<Record<string, unknown>[]>(`/api/public/basketball/matches/${id}/odds/margin`),
  stats: (id: string) => get<Record<string, unknown>>(`/api/public/basketball/matches/${id}/stats`),
  lineups: (id: string) => get<Record<string, unknown>>(`/api/public/basketball/matches/${id}/lineups`),
  h2h: (id: string) => get<Record<string, unknown>>(`/api/public/basketball/matches/${id}/h2h`),
  events: (id: string) => get<Record<string, unknown>>(`/api/public/basketball/matches/${id}/events`),
  detail: (id: string) => get<Record<string, unknown>>(`/api/public/basketball/matches/${id}/detail`),
  standings: () => get<Record<string, unknown>>("/api/public/basketball/standings"),
  teams: () => get<Record<string, unknown>>("/api/public/basketball/teams"),
  teamUpcoming: (team: string) => get<Record<string, unknown>[]>(`/api/public/basketball/teams/${team}/upcoming`),
  teamResults: (team: string) => get<Match[]>(`/api/public/basketball/teams/${team}/results`),
  teamLive: (team: string) => get<Record<string, unknown>[]>(`/api/public/basketball/teams/${team}/live`),
  teamSchedule: (teamId: string) => get<Record<string, unknown>>(`/api/public/basketball/teams/${teamId}/schedule`),
  teamRoster: (teamId: string) => get<Record<string, unknown>>(`/api/public/basketball/teams/${teamId}/roster`),
  teamInfo: (teamId: string) => get<Record<string, unknown>>(`/api/public/basketball/teams/${teamId}/info`),
  espnUpcoming: () => get<Record<string, unknown>[]>("/api/public/basketball/espn/upcoming"),
  espnToday: () => get<Record<string, unknown>[]>("/api/public/basketball/espn/today"),
  espnLive: () => get<Record<string, unknown>[]>("/api/public/basketball/espn/live"),
  espnGameDetail: (espnGameId: string) => get<Record<string, unknown>>(`/api/public/basketball/espn/game/${espnGameId}`),
};

// ---------------------------------------------------------------------------
// PUBLIC — NFL
// ---------------------------------------------------------------------------

export const publicNfl = {
  getAll: () => get<Record<string, unknown>>("/api/public/nfl/matches"),
  upcoming: () => get<Record<string, unknown>[]>("/api/public/nfl/matches/upcoming"),
  today: () => get<Record<string, unknown>[]>("/api/public/nfl/matches/today"),
  live: () => get<Record<string, unknown>[]>("/api/public/nfl/matches/live"),
  results: () => get<Match[]>("/api/public/nfl/matches/results"),
  withOdds: () => get<Record<string, unknown>>("/api/public/nfl/matches/with-odds"),
  getById: (id: string) => get<Match>(`/api/public/nfl/matches/${id}`),
  odds: (id: string) => get<Record<string, unknown>[]>(`/api/public/nfl/matches/${id}/odds`),
  oddsAll: (id: string) => get<Record<string, unknown>>(`/api/public/nfl/matches/${id}/odds/all`),
  score: (id: string) => get<Record<string, unknown>>(`/api/public/nfl/matches/${id}/score`),
  detail: (id: string) => get<Record<string, unknown>>(`/api/public/nfl/matches/${id}/detail`),
  standings: () => get<Record<string, unknown>>("/api/public/nfl/standings"),
  espnCurrentWeek: () => get<Record<string, unknown>[]>("/api/public/nfl/espn/week"),
  espnByWeek: (week: number, seasonType = 2) => get<Record<string, unknown>[]>(`/api/public/nfl/espn/week/${week}${qs({ seasonType })}`),
  espnUpcoming: () => get<Record<string, unknown>[]>("/api/public/nfl/espn/upcoming"),
  espnLive: () => get<Record<string, unknown>[]>("/api/public/nfl/espn/live"),
  espnFinished: () => get<Record<string, unknown>[]>("/api/public/nfl/espn/finished"),
  espnByDate: (date: string) => get<Record<string, unknown>[]>(`/api/public/nfl/espn/date/${date}`),
};

// ---------------------------------------------------------------------------
// PUBLIC — BASEBALL
// ---------------------------------------------------------------------------

export const publicBaseball = {
  getAll: () => get<Record<string, unknown>>("/api/public/baseball/matches"),
  upcoming: () => get<Match[]>("/api/public/baseball/matches/upcoming"),
  today: () => get<Match[]>("/api/public/baseball/matches/today"),
  live: () => get<Match[]>("/api/public/baseball/matches/live"),
  results: (limit = 20) => get<Match[]>(`/api/public/baseball/matches/results${qs({ limit })}`),
  getById: (id: string) => get<Match>(`/api/public/baseball/matches/${id}`),
  odds: (id: string) => get<Record<string, unknown>[]>(`/api/public/baseball/matches/${id}/odds`),
  oddsDb: (id: string) => get<Odds[]>(`/api/public/baseball/matches/${id}/odds/persisted`),
  score: (id: string) => get<Record<string, unknown>>(`/api/public/baseball/matches/${id}/score`),
  detail: (id: string) => get<Record<string, unknown>>(`/api/public/baseball/matches/${id}/detail`),
  standings: () => get<Record<string, unknown>>("/api/public/baseball/standings"),
  teamUpcoming: (team: string) => get<Match[]>(`/api/public/baseball/teams/${team}/upcoming`),
  teamResults: (team: string) => get<Match[]>(`/api/public/baseball/teams/${team}/results`),
  teamLive: (team: string) => get<Match[]>(`/api/public/baseball/teams/${team}/live`),
  espnUpcoming: () => get<Record<string, unknown>[]>("/api/public/baseball/espn/upcoming"),
  espnToday: () => get<Record<string, unknown>[]>("/api/public/baseball/espn/today"),
  espnLive: () => get<Record<string, unknown>[]>("/api/public/baseball/espn/live"),
  espnGameDetail: (espnGameId: string) => get<Record<string, unknown>>(`/api/public/baseball/espn/game/${espnGameId}`),
};

// ---------------------------------------------------------------------------
// PUBLIC — MMA
// ---------------------------------------------------------------------------

export const publicMma = {
  getAll: () => get<Record<string, unknown>>("/api/public/mma/matches"),
  upcoming: () => get<Record<string, unknown>[]>("/api/public/mma/matches/upcoming"),
  live: () => get<Record<string, unknown>[]>("/api/public/mma/matches/live"),
  results: (limit = 20) => get<Match[]>(`/api/public/mma/matches/results${qs({ limit })}`),
  featured: () => get<Match[]>("/api/public/mma/matches/featured"),
  withOdds: () => get<Record<string, unknown>>("/api/public/mma/matches/with-odds"),
  getById: (id: string) => get<Match>(`/api/public/mma/matches/${id}`),
  odds: (id: string) => get<Record<string, unknown>[]>(`/api/public/mma/matches/${id}/odds`),
  oddsAll: (id: string) => get<Odds[]>(`/api/public/mma/matches/${id}/odds/all`),
  score: (id: string) => get<Record<string, unknown>>(`/api/public/mma/matches/${id}/score`),
  detail: (id: string) => get<Record<string, unknown>>(`/api/public/mma/matches/${id}/detail`),
  events: (id: string) => get<Record<string, unknown>>(`/api/public/mma/matches/${id}/events`),
  fullDetail: (id: string) => get<Record<string, unknown>>(`/api/public/mma/matches/${id}/full`),
  fightCard: (id: string) => get<Record<string, unknown>[]>(`/api/public/mma/matches/${id}/fight-card`),
  fighter: (athleteId: string) => get<Record<string, unknown>>(`/api/public/mma/fighters/${athleteId}`),
  espnEvents: () => get<Record<string, unknown>[]>("/api/public/mma/espn/events"),
  espnUpcoming: () => get<Record<string, unknown>[]>("/api/public/mma/espn/events/upcoming"),
  espnLive: () => get<Record<string, unknown>[]>("/api/public/mma/espn/events/live"),
  espnFinished: () => get<Record<string, unknown>[]>("/api/public/mma/espn/events/finished"),
};

// ---------------------------------------------------------------------------
// PUBLIC — TENNIS
// ---------------------------------------------------------------------------

export const publicTennis = {
  getAll: () => get<Record<string, unknown>>("/api/public/tennis/matches"),
  upcoming: () => get<Record<string, unknown>[]>("/api/public/tennis/matches/upcoming"),
  live: () => get<Record<string, unknown>[]>("/api/public/tennis/matches/live"),
  results: (limit = 20) => get<Match[]>(`/api/public/tennis/matches/results${qs({ limit })}`),
  featured: () => get<Match[]>("/api/public/tennis/matches/featured"),
  withOdds: () => get<Record<string, unknown>>("/api/public/tennis/matches/with-odds"),
  getById: (id: string) => get<Match>(`/api/public/tennis/matches/${id}`),
  odds: (id: string) => get<Record<string, unknown>[]>(`/api/public/tennis/matches/${id}/odds`),
  score: (id: string) => get<Record<string, unknown>>(`/api/public/tennis/matches/${id}/score`),
  events: (id: string) => get<Record<string, unknown>>(`/api/public/tennis/matches/${id}/events`),
  detail: (id: string) => get<Record<string, unknown>>(`/api/public/tennis/matches/${id}/detail`),
  atpMatches: () => get<Record<string, unknown>[]>("/api/public/tennis/atp/matches"),
  atpLive: () => get<Record<string, unknown>[]>("/api/public/tennis/atp/live"),
  atpUpcoming: () => get<Record<string, unknown>[]>("/api/public/tennis/atp/upcoming"),
  atpTournaments: () => get<Record<string, unknown>[]>("/api/public/tennis/atp/tournaments"),
  atpRankings: () => get<Record<string, unknown>>("/api/public/tennis/atp/rankings"),
  wtaMatches: () => get<Record<string, unknown>[]>("/api/public/tennis/wta/matches"),
  wtaLive: () => get<Record<string, unknown>[]>("/api/public/tennis/wta/live"),
  wtaUpcoming: () => get<Record<string, unknown>[]>("/api/public/tennis/wta/upcoming"),
  wtaTournaments: () => get<Record<string, unknown>[]>("/api/public/tennis/wta/tournaments"),
  wtaRankings: () => get<Record<string, unknown>>("/api/public/tennis/wta/rankings"),
  tourUpcoming: (tour: string) => get<Record<string, unknown>[]>(`/api/public/tennis/tours/${tour}/upcoming`),
  tourLive: (tour: string) => get<Record<string, unknown>[]>(`/api/public/tennis/tours/${tour}/live`),
};

// ---------------------------------------------------------------------------
// PUBLIC — ADMIN-CREATED SPECIAL MATCHES
// ---------------------------------------------------------------------------

export const publicAdminMatches = {
  getAll: () => get<Match[]>("/api/public/admin-matches"),
  upcoming: () => get<Match[]>("/api/public/admin-matches/upcoming"),
  live: () => get<Match[]>("/api/public/admin-matches/live"),
  getById: (id: string) => get<Match>(`/api/public/admin-matches/${id}`),
  odds: (id: string) => get<Odds[]>(`/api/public/admin-matches/${id}/odds`),
  oddsAll: (id: string) => get<Record<string, unknown>>(`/api/public/admin-matches/${id}/odds/all`),
};

// ---------------------------------------------------------------------------
// PUBLIC — CONFIG & PREDICTIONS
// ---------------------------------------------------------------------------

export const publicConfig = {
  get: () => get<Record<string, unknown>>("/api/public/config"),
};

export const publicPredictions = {
  feed: (page = 0, size = 20) => get<PageResponse<Record<string, unknown>>>(`/api/predictions/public${qs({ page, size })}`),
  getTip: (id: string) => get<Record<string, unknown>>(`/api/tip/${id}`),
};

// ---------------------------------------------------------------------------
// AFFILIATE
// ---------------------------------------------------------------------------

export const affiliate = {
  getStats: () => get<Record<string, unknown>>("/api/affiliate/stats"),
  getBalance: () => get<Record<string, unknown>>("/api/affiliate/balance"),
  getReferredUsers: () => get<Record<string, unknown>[]>("/api/affiliate/referred-users"),
  getLinks: () => get<Record<string, unknown>[]>("/api/affiliate/links"),
  createLink: (body: { label?: string; expiresAt?: string }) => post<Record<string, unknown>>("/api/affiliate/links", body),
  getWithdrawals: (page = 0, size = 20) => get<PageResponse<Record<string, unknown>>>(`/api/affiliate/withdrawals${qs({ page, size })}`),
  requestWithdrawal: (body: Record<string, unknown>) => post<Record<string, unknown>>("/api/affiliate/withdraw", body),
};

// ---------------------------------------------------------------------------
// SUPPORT
// ---------------------------------------------------------------------------

export const support = {
  getMessages: (chatId: string) => get<Record<string, unknown>[]>(`/api/upgrade-chats/${chatId}/messages`),
  sendMessage: (chatId: string, content: string) => post<Record<string, unknown>>(`/api/upgrade-chats/${chatId}/messages`, { content }),
};

export const upgradeChats = {
  getMessages: (chatId: string) => get<Record<string, unknown>[]>(`/api/upgrade-chats/${chatId}/messages`),
  sendMessage: (chatId: string, body: { content: string }) => post<Record<string, unknown>>(`/api/upgrade-chats/${chatId}/messages`, body),
};

export const adminUpgrade = {
  initPaystack: () => post<Record<string, unknown>>("/api/user/upgrade-to-admin/paystack/init"),
};

// ---------------------------------------------------------------------------
// AUTHENTICATED — FOOTBALL MATCHES
// ---------------------------------------------------------------------------

export const matches = {
  getById: (id: string) => get<Match>(`/api/matches/${id}`),
  upcoming: () => get<Match[]>("/api/matches/upcoming"),
  today: () => get<Match[]>("/api/matches/today"),
  live: () => get<Match[]>("/api/matches/live"),
  future: () => get<Match[]>("/api/matches/future"),
  results: (limit = 20) => get<Match[]>(`/api/matches/results${qs({ limit })}`),
  top6Upcoming: () => get<Record<string, unknown>[]>("/api/matches/top6/upcoming"),
  top6Today: () => get<Record<string, unknown>[]>("/api/matches/top6/today"),
  top6Live: () => get<Record<string, unknown>[]>("/api/matches/top6/live"),
  cupsUpcoming: () => get<Record<string, unknown>[]>("/api/matches/cups/upcoming"),
  cupsToday: () => get<Record<string, unknown>[]>("/api/matches/cups/today"),
  cupsLive: () => get<Record<string, unknown>[]>("/api/matches/cups/live"),
  allCupsUpcoming: () => get<Record<string, unknown>[]>("/api/matches/all-cups/upcoming"),
  allCupsToday: () => get<Record<string, unknown>[]>("/api/matches/all-cups/today"),
  allCupsLive: () => get<Record<string, unknown>[]>("/api/matches/all-cups/live"),
  stats: (id: string) => get<Record<string, unknown>>(`/api/matches/${id}/stats`),
  prediction: (id: string) => get<Record<string, unknown>>(`/api/matches/${id}/prediction`),
  odds: (id: string) => get<Odds[]>(`/api/matches/${id}/odds`),
  oddsLive: (id: string) => get<Record<string, unknown>[]>(`/api/matches/${id}/odds/live`),
  oddsAll: (id: string) => get<Record<string, unknown>>(`/api/matches/${id}/odds/all`),
  oddsHandicap: (id: string) => get<Record<string, unknown>[]>(`/api/matches/${id}/odds/handicap`),
  oddsHalfTime: (id: string) => get<Record<string, unknown>[]>(`/api/matches/${id}/odds/half-time`),
  oddsCorrectScore: (id: string) => get<Record<string, unknown>[]>(`/api/matches/${id}/odds/correct-score`),
  lineups: (id: string) => get<Record<string, unknown>>(`/api/matches/${id}/lineups`),
  h2h: (id: string) => get<Record<string, unknown>>(`/api/matches/${id}/h2h`),
  events: (id: string) => get<Record<string, unknown>>(`/api/matches/${id}/events`),
  detail: (id: string) => get<Record<string, unknown>>(`/api/matches/${id}/detail`),
};

// ---------------------------------------------------------------------------
// AUTHENTICATED — LIVESCORE
// ---------------------------------------------------------------------------

export const livescore = {
  live: () => get<Record<string, unknown>[]>("/api/livescore/live"),
  today: () => get<Record<string, unknown>[]>("/api/livescore/today"),
  fixtures: () => get<Record<string, unknown>[]>("/api/livescore/fixtures"),
  top6Live: () => get<Record<string, unknown>[]>("/api/livescore/top6/live"),
  top6Fixtures: () => get<Record<string, unknown>[]>("/api/livescore/top6/fixtures"),
  top6AllFixtures: () => get<Record<string, unknown>[]>("/api/livescore/top6/all-fixtures"),
  top6LeagueLive: (league: string) => get<Record<string, unknown>[]>(`/api/livescore/leagues/top6/${league}/live`),
  top6LeagueFixtures: (league: string) => get<Record<string, unknown>[]>(`/api/livescore/leagues/top6/${league}/fixtures`),
  cupsLive: () => get<Record<string, unknown>[]>("/api/livescore/cups/live"),
  cupsFixtures: () => get<Record<string, unknown>[]>("/api/livescore/cups/fixtures"),
  cupLive: (cup: string) => get<Record<string, unknown>[]>(`/api/livescore/cups/${cup}/live`),
  cupFixtures: (cup: string) => get<Record<string, unknown>[]>(`/api/livescore/cups/${cup}/fixtures`),
};

// ---------------------------------------------------------------------------
// AUTHENTICATED — STANDINGS / SCORERS / TEAMS / LEAGUES / CUPS
// ---------------------------------------------------------------------------

export const standings = {
  byCompetition: (competitionId: number) => get<Record<string, unknown>>(`/api/standings/${competitionId}`),
  top6: () => get<Record<string, Record<string, unknown>>>("/api/standings/top6"),
  byLeague: (league: string) => get<Record<string, unknown>>(`/api/standings/leagues/${league}`),
  top6ByLeague: (league: string) => get<Record<string, unknown>>(`/api/standings/leagues/top6/${league}`),
  byCup: (cup: string) => get<Record<string, unknown>>(`/api/standings/cups/${cup}`),
};

export const scorers = {
  byCompetition: (competitionId: number) => get<Record<string, unknown>>(`/api/scorers/${competitionId}`),
  byLeague: (league: string) => get<Record<string, unknown>>(`/api/scorers/leagues/${league}`),
  top6ByLeague: (league: string) => get<Record<string, unknown>>(`/api/scorers/leagues/top6/${league}`),
};

export const teams = {
  upcoming: (team: string) => get<Record<string, unknown>[]>(`/api/teams/name/${team}/upcoming`),
  results: (team: string) => get<Match[]>(`/api/teams/name/${team}/results`),
  live: (team: string) => get<Record<string, unknown>[]>(`/api/teams/name/${team}/live`),
  matchesById: (teamId: number) => get<Record<string, unknown>>(`/api/teams/id/${teamId}/matches`),
  liveById: (teamId: number) => get<Record<string, unknown>[]>(`/api/teams/id/${teamId}/live`),
  fixturesById: (teamId: number) => get<Record<string, unknown>[]>(`/api/teams/id/${teamId}/fixtures`),
};

export const leagues = {
  upcoming: (league: string) => get<Record<string, unknown>[]>(`/api/leagues/${league}/upcoming`),
  today: (league: string) => get<Record<string, unknown>[]>(`/api/leagues/${league}/today`),
  live: (league: string) => get<Record<string, unknown>[]>(`/api/leagues/${league}/live`),
  top6Upcoming: (league: string) => get<Record<string, unknown>[]>(`/api/leagues/top6/${league}/upcoming`),
  top6Today: (league: string) => get<Record<string, unknown>[]>(`/api/leagues/top6/${league}/today`),
  top6Live: (league: string) => get<Record<string, unknown>[]>(`/api/leagues/top6/${league}/live`),
};

export const cups = {
  upcoming: (cup: string) => get<Record<string, unknown>[]>(`/api/cups/${cup}/upcoming`),
  today: (cup: string) => get<Record<string, unknown>[]>(`/api/cups/${cup}/today`),
  live: (cup: string) => get<Record<string, unknown>[]>(`/api/cups/${cup}/live`),
};

// ---------------------------------------------------------------------------
// AUTHENTICATED — NBA / BASKETBALL
// ---------------------------------------------------------------------------

export const nba = {
  upcoming: () => get<Match[]>("/api/nba/matches/upcoming"),
  today: () => get<Match[]>("/api/nba/matches/today"),
  live: () => get<Match[]>("/api/nba/matches/live"),
  future: () => get<Match[]>("/api/nba/matches/future"),
  results: (limit = 20) => get<Match[]>(`/api/nba/matches/results${qs({ limit })}`),
  getById: (id: string) => get<Match>(`/api/nba/matches/${id}`),
  odds: (id: string) => get<Odds[]>(`/api/nba/matches/${id}/odds`),
  oddsAll: (id: string) => get<Record<string, unknown>>(`/api/nba/matches/${id}/odds/all`),
  oddsMoneyline: (id: string) => get<Record<string, unknown>[]>(`/api/nba/matches/${id}/odds/moneyline`),
  oddsSpread: (id: string) => get<Record<string, unknown>[]>(`/api/nba/matches/${id}/odds/spread`),
  oddsTotal: (id: string) => get<Record<string, unknown>[]>(`/api/nba/matches/${id}/odds/total`),
  oddsQuarters: (id: string) => get<Record<string, unknown>[]>(`/api/nba/matches/${id}/odds/quarters`),
  oddsMargin: (id: string) => get<Record<string, unknown>[]>(`/api/nba/matches/${id}/odds/margin`),
  score: (id: string) => get<Record<string, unknown>>(`/api/nba/matches/${id}/score`),
  stats: (id: string) => get<Record<string, unknown>>(`/api/nba/matches/${id}/stats`),
  lineups: (id: string) => get<Record<string, unknown>>(`/api/nba/matches/${id}/lineups`),
  h2h: (id: string) => get<Record<string, unknown>>(`/api/nba/matches/${id}/h2h`),
  events: (id: string) => get<Record<string, unknown>>(`/api/nba/matches/${id}/events`),
  detail: (id: string) => get<Record<string, unknown>>(`/api/nba/matches/${id}/detail`),
  detailFull: (id: string) => get<Record<string, unknown>>(`/api/nba/matches/${id}/detail/full`),
  standings: () => get<Record<string, unknown>>("/api/nba/standings"),
  teams: () => get<Record<string, unknown>>("/api/nba/teams"),
  teamUpcoming: (team: string) => get<Record<string, unknown>[]>(`/api/nba/teams/${team}/upcoming`),
  teamResults: (team: string) => get<Match[]>(`/api/nba/teams/${team}/results`),
  teamLive: (team: string) => get<Record<string, unknown>[]>(`/api/nba/teams/${team}/live`),
  teamSchedule: (teamId: string) => get<Record<string, unknown>>(`/api/nba/teams/${teamId}/schedule`),
  teamRoster: (teamId: string) => get<Record<string, unknown>>(`/api/nba/teams/${teamId}/roster`),
  teamInfo: (teamId: string) => get<Record<string, unknown>>(`/api/nba/teams/${teamId}/info`),
  espnUpcoming: () => get<Record<string, unknown>[]>("/api/nba/espn/upcoming"),
  espnToday: () => get<Record<string, unknown>[]>("/api/nba/espn/today"),
  espnLive: () => get<Record<string, unknown>[]>("/api/nba/espn/live"),
  espnGameDetail: (espnGameId: string) => get<Record<string, unknown>>(`/api/nba/espn/game/${espnGameId}`),
};

// ---------------------------------------------------------------------------
// AUTHENTICATED — NFL
// ---------------------------------------------------------------------------

export const nfl = {
  upcoming: () => get<Match[]>("/api/nfl/matches/upcoming"),
  today: () => get<Match[]>("/api/nfl/matches/today"),
  live: () => get<Match[]>("/api/nfl/matches/live"),
  results: () => get<Match[]>("/api/nfl/matches/results"),
  getById: (id: string) => get<Match>(`/api/nfl/matches/${id}`),
  odds: (id: string) => get<Record<string, unknown>[]>(`/api/nfl/matches/${id}/odds`),
  oddsDb: (id: string) => get<Odds[]>(`/api/nfl/matches/${id}/odds/db`),
  oddsAll: (id: string) => get<Record<string, unknown>>(`/api/nfl/matches/${id}/odds/all`),
  score: (id: string) => get<Record<string, unknown>>(`/api/nfl/matches/${id}/score`),
  detail: (id: string) => get<Record<string, unknown>>(`/api/nfl/matches/${id}/detail`),
  espnFullGame: (espnGameId: string) => get<Record<string, unknown>>(`/api/nfl/matches/espn/${espnGameId}/full`),
  standings: () => get<Record<string, unknown>>("/api/nfl/standings"),
  teams: () => get<Record<string, unknown>>("/api/nfl/teams"),
  teamInfo: (teamId: string) => get<Record<string, unknown>>(`/api/nfl/teams/${teamId}`),
  teamSchedule: (teamId: string) => get<Record<string, unknown>>(`/api/nfl/teams/${teamId}/schedule`),
  teamRoster: (teamId: string) => get<Record<string, unknown>>(`/api/nfl/teams/${teamId}/roster`),
  espnCurrentWeek: () => get<Record<string, unknown>[]>("/api/nfl/espn/week"),
  espnByWeek: (week: number, seasonType = 2) => get<Record<string, unknown>[]>(`/api/nfl/espn/week/${week}${qs({ seasonType })}`),
  espnUpcoming: () => get<Record<string, unknown>[]>("/api/nfl/espn/upcoming"),
  espnLive: () => get<Record<string, unknown>[]>("/api/nfl/espn/live"),
  espnFinished: () => get<Record<string, unknown>[]>("/api/nfl/espn/finished"),
  espnByDate: (date: string) => get<Record<string, unknown>[]>(`/api/nfl/espn/date/${date}`),
};

// ---------------------------------------------------------------------------
// AUTHENTICATED — BASEBALL
// ---------------------------------------------------------------------------

export const baseball = {
  upcoming: () => get<Match[]>("/api/baseball/matches/upcoming"),
  today: () => get<Match[]>("/api/baseball/matches/today"),
  live: () => get<Match[]>("/api/baseball/matches/live"),
  results: (limit = 20) => get<Match[]>(`/api/baseball/matches/results${qs({ limit })}`),
  getById: (id: string) => get<Match>(`/api/baseball/matches/${id}`),
  odds: (id: string) => get<Record<string, unknown>[]>(`/api/baseball/matches/${id}/odds`),
  oddsDb: (id: string) => get<Odds[]>(`/api/baseball/matches/${id}/odds/persisted`),
  score: (id: string) => get<Record<string, unknown>>(`/api/baseball/matches/${id}/score`),
  detail: (id: string) => get<Record<string, unknown>>(`/api/baseball/matches/${id}/detail`),
  standings: () => get<Record<string, unknown>>("/api/baseball/standings"),
  teamUpcoming: (team: string) => get<Match[]>(`/api/baseball/teams/${team}/upcoming`),
  teamResults: (team: string) => get<Match[]>(`/api/baseball/teams/${team}/results`),
  teamLive: (team: string) => get<Match[]>(`/api/baseball/teams/${team}/live`),
  espnUpcoming: () => get<Record<string, unknown>[]>("/api/baseball/espn/upcoming"),
  espnToday: () => get<Record<string, unknown>[]>("/api/baseball/espn/today"),
  espnLive: () => get<Record<string, unknown>[]>("/api/baseball/espn/live"),
  espnGameDetail: (espnGameId: string) => get<Record<string, unknown>>(`/api/baseball/espn/game/${espnGameId}`),
};

// ---------------------------------------------------------------------------
// AUTHENTICATED — MMA / TENNIS
// ---------------------------------------------------------------------------

export const mma = {
  upcoming: () => get<Match[]>("/api/mma/matches/upcoming"),
  live: () => get<Match[]>("/api/mma/matches/live"),
  results: (limit = 20) => get<Match[]>(`/api/mma/matches/results${qs({ limit })}`),
  featured: () => get<Match[]>("/api/mma/matches/featured"),
  getById: (id: string) => get<Match>(`/api/mma/matches/${id}`),
  odds: (id: string) => get<Record<string, unknown>[]>(`/api/mma/matches/${id}/odds`),
  oddsAll: (id: string) => get<Odds[]>(`/api/mma/matches/${id}/odds/all`),
  score: (id: string) => get<Record<string, unknown>>(`/api/mma/matches/${id}/score`),
  detail: (id: string) => get<Record<string, unknown>>(`/api/mma/matches/${id}/detail`),
  events: (id: string) => get<Record<string, unknown>>(`/api/mma/matches/${id}/events`),
  fullDetail: (id: string) => get<Record<string, unknown>>(`/api/mma/matches/${id}/full`),
  fightCard: (id: string) => get<Record<string, unknown>[]>(`/api/mma/matches/${id}/fight-card`),
  fighter: (athleteId: string) => get<Record<string, unknown>>(`/api/mma/fighters/${athleteId}`),
  espnEvents: () => get<Record<string, unknown>[]>("/api/mma/espn/events"),
  espnUpcoming: () => get<Record<string, unknown>[]>("/api/mma/espn/events/upcoming"),
  espnLive: () => get<Record<string, unknown>[]>("/api/mma/espn/events/live"),
  espnFinished: () => get<Record<string, unknown>[]>("/api/mma/espn/events/finished"),
};

export const tennis = {
  upcoming: () => get<Record<string, unknown>[]>("/api/tennis/matches/upcoming"),
  live: () => get<Record<string, unknown>[]>("/api/tennis/matches/live"),
  results: (limit = 20) => get<Match[]>(`/api/tennis/matches/results${qs({ limit })}`),
  featured: () => get<Match[]>("/api/tennis/matches/featured"),
  getById: (id: string) => get<Match>(`/api/tennis/matches/${id}`),
  odds: (id: string) => get<Record<string, unknown>[]>(`/api/tennis/matches/${id}/odds`),
  oddsDb: (id: string) => get<Odds[]>(`/api/tennis/matches/${id}/odds/db`),
  score: (id: string) => get<Record<string, unknown>>(`/api/tennis/matches/${id}/score`),
  events: (id: string) => get<Record<string, unknown>>(`/api/tennis/matches/${id}/events`),
  detail: (id: string) => get<Record<string, unknown>>(`/api/tennis/matches/${id}/detail`),
  fullDetail: (id: string) => get<Record<string, unknown>>(`/api/tennis/matches/${id}/full-detail`),
  atpMatches: () => get<Record<string, unknown>[]>("/api/tennis/atp/matches"),
  atpLive: () => get<Record<string, unknown>[]>("/api/tennis/atp/live"),
  atpUpcoming: () => get<Record<string, unknown>[]>("/api/tennis/atp/upcoming"),
  atpTournaments: () => get<Record<string, unknown>[]>("/api/tennis/atp/tournaments"),
  atpRankings: () => get<Record<string, unknown>>("/api/tennis/atp/rankings"),
  wtaMatches: () => get<Record<string, unknown>[]>("/api/tennis/wta/matches"),
  wtaLive: () => get<Record<string, unknown>[]>("/api/tennis/wta/live"),
  wtaUpcoming: () => get<Record<string, unknown>[]>("/api/tennis/wta/upcoming"),
  wtaTournaments: () => get<Record<string, unknown>[]>("/api/tennis/wta/tournaments"),
  wtaRankings: () => get<Record<string, unknown>>("/api/tennis/wta/rankings"),
  tourUpcoming: (tour: string) => get<Record<string, unknown>[]>(`/api/tennis/tours/${tour}/upcoming`),
  tourLive: (tour: string) => get<Record<string, unknown>[]>(`/api/tennis/tours/${tour}/live`),
};

// ---------------------------------------------------------------------------
// ADMIN
// ---------------------------------------------------------------------------

export const adminMatches = {
  list: () => get<Match[]>("/api/admin/matches"),
  create: (body: Record<string, unknown>) => post<Match>("/api/admin/matches", body),
  getById: (id: string) => get<Match>(`/api/admin/matches/${id}`),
  updateStatus: (id: string, body: { status: string }) => patch<Match>(`/api/admin/matches/${id}/status`, body),
  updateScore: (id: string, body: { scoreHome: number; scoreAway: number; minutePlayed?: number }) => patch<Match>(`/api/admin/matches/${id}/score`, body),
};

export interface AutoMatchScheduleRequest {
  homeTeam: string; awayTeam: string; league?: string; sport?: string;
  homeLogo?: string; awayLogo?: string; leagueLogo?: string; featured?: boolean;
  kickoffAt: string; finalScoreHome: number; finalScoreAway: number;
}

export interface AutoMatchSchedule {
  matchId?: string; kickoffAt?: string; halfTimeAt?: string; secondHalfAt?: string;
  finishAt?: string; goals?: Record<string, unknown>[]; [key: string]: unknown;
}

export const adminMatchSchedule = {
  // Scheduler route follows the reference admin backend contract (no /api prefix).
  create: (body: AutoMatchScheduleRequest) => post<Match>("/admin/matches/auto", body),
  getSchedule: (matchId: string) => get<AutoMatchSchedule>(`/admin/matches/auto/${matchId}`),
  cancel: (matchId: string) => request<{ matchId: string; jobsCancelled: number }>("DELETE", `/admin/matches/auto/${matchId}`),
};

export const adminPredictions = {
  list: (page = 0, size = 20) => get<PageResponse<Record<string, unknown>>>(`/api/admin/predictions${qs({ page, size })}`),
  run: (body: Record<string, string>) => post<Record<string, unknown>>("/api/admin/predictions/run", body),
  share: (id: string) => post<Record<string, unknown>>(`/api/admin/predictions/${id}/share`),
  unpublish: (id: string) => post<Record<string, unknown>>(`/api/admin/predictions/${id}/unpublish`),
};

export const adminCrash = {
  schedule: (game: string, limit = 10) => get<Record<string, unknown>[]>(`/api/admin/crash/schedule/${game}${qs({ limit })}`),
  generate: (game: string) => post<void>(`/api/admin/crash/schedule/${game}/generate`),
  override: (id: string, body: Record<string, unknown>) => patch<Record<string, unknown>>(`/api/admin/crash/schedule/${id}/override`, body),
  history: (game: string, page = 0, size = 50) => get<PageResponse<Record<string, unknown>>>(`/api/admin/crash/history/${game}${qs({ page, size })}`),
};

export const adminAffiliate = {
  getStats: () => get<Record<string, unknown>>("/api/admin/affiliate/stats"),
  getReferredUsers: () => get<Record<string, unknown>[]>("/api/admin/affiliate/referred-users"),
  getLinks: () => get<Record<string, unknown>[]>("/api/admin/affiliate/links"),
  createLink: (body: { label?: string; expiresAt?: string }) => post<Record<string, unknown>>("/api/admin/affiliate/links", body),
  getPayoutWindow: () => get<Record<string, boolean>>("/api/admin/affiliate/payout-window"),
  requestPayout: () => post<Record<string, unknown>>("/api/admin/affiliate/payout-request"),
  getPayoutHistory: (page = 0, size = 20) => get<PageResponse<Record<string, unknown>>>(`/api/admin/affiliate/payout-requests${qs({ page, size })}`),
};

export const adminAffiliateInsights = {
  commissionDaily: (days = 30) => get<unknown>(`/api/admin/affiliate/commission/daily${qs({ days })}`),
  commissionWeekly: (weeks = 12) => get<unknown>(`/api/admin/affiliate/commission/weekly${qs({ weeks })}`),
  commissionMonthly: (months = 12) => get<unknown>(`/api/admin/affiliate/commission/monthly${qs({ months })}`),
  depositsDaily: (days = 30) => get<unknown>(`/api/admin/affiliate/deposits/by-country/daily${qs({ days })}`),
  depositsWeekly: (weeks = 12) => get<unknown>(`/api/admin/affiliate/deposits/by-country/weekly${qs({ weeks })}`),
  depositsMonthly: (months = 12) => get<unknown>(`/api/admin/affiliate/deposits/by-country/monthly${qs({ months })}`),
  depositsTotals: (days = 365) => get<unknown>(`/api/admin/affiliate/deposits/by-country/totals${qs({ days })}`),
};

export const adminReferralLinks = {
  list: () => get<Record<string, unknown>[]>("/api/admin/referral-links"),
  create: (body: Record<string, unknown>) => post<Record<string, unknown>>("/api/admin/referral-links", body),
  getReferredUsers: () => get<Record<string, unknown>[]>("/api/admin/referred-users"),
};

export const adminAnalytics = {
  get: (range = "7d") => get<Record<string, unknown>>(`/api/admin/analytics${qs({ range })}`),
  auditLog: (page = 0, size = 50) => get<PageResponse<Record<string, unknown>>>(`/api/admin/audit-log${qs({ page, size })}`),
};

// ---------------------------------------------------------------------------
// SUPER ADMIN
// ---------------------------------------------------------------------------

export const superAdminUpgradeChats = {
  getAll: () => get<Record<string, unknown>[]>("/api/super-admin/upgrade-chats"),
  getPending: () => get<Record<string, unknown>[]>("/api/super-admin/upgrade-chats/pending"),
  getMessages: (chatId: string) => get<Record<string, unknown>[]>(`/api/super-admin/upgrade-chats/${chatId}/messages`),
  sendMessage: (chatId: string, body: { content: string }) => post<Record<string, unknown>>(`/api/super-admin/upgrade-chats/${chatId}/messages`, body),
  setCommission: (chatId: string, body: { commissionRate: number }) => post<Record<string, unknown>>(`/api/super-admin/upgrade-chats/${chatId}/set-commission`, body),
};

export const superAdminPayouts = {
  getPending: () => get<Record<string, unknown>[]>("/api/super-admin/payout-requests"),
  approve: (id: string) => post<Record<string, unknown>>(`/api/super-admin/payout-requests/${id}/approve`),
  reject: (id: string, body: Record<string, string>) => post<Record<string, unknown>>(`/api/super-admin/payout-requests/${id}/reject`, body),
  markPaid: (id: string) => post<Record<string, unknown>>(`/api/super-admin/payout-requests/${id}/mark-paid`),
};

export const superAdminAffiliateWithdrawals = {
  getPending: () => get<Record<string, unknown>[]>("/api/super-admin/affiliate-withdrawals/pending"),
  list: (page = 0, size = 20, status?: string) => get<PageResponse<Record<string, unknown>>>(`/api/super-admin/affiliate-withdrawals${qs({ page, size, status })}`),
  process: (id: string) => post<Record<string, unknown>>(`/api/super-admin/affiliate-withdrawals/${id}/process`),
  reject: (id: string, body: Record<string, string>) => post<Record<string, unknown>>(`/api/super-admin/affiliate-withdrawals/${id}/reject`, body),
};

export const superAdmin = {
  listAdmins: () => get<Record<string, unknown>[]>("/api/super-admin/admins"),
  listAdminsWithCommission: async () => {
    try {
      return await get<Record<string, unknown>[]>("/api/super-admin/admins/with-commission");
    } catch {
      // Older deployments expose the base administrators list but not the
      // optional commission projection. Keep the Admins tab usable and let
      // the detail/rate actions use their dedicated endpoints.
      return get<Record<string, unknown>[]>("/api/super-admin/admins");
    }
  },
  createAdmin: (body: Record<string, string>) => post<Record<string, unknown>>("/api/super-admin/admins", body),
  getAdminDetail: (adminId: string) => get<Record<string, unknown>>(`/api/super-admin/admins/${adminId}`),
  setAdminCommissionRate: (adminId: string, body: { commissionRate: number }) => patch<Record<string, unknown>>(`/api/super-admin/admins/${adminId}/commission-rate`, body),
  addFundsToAdmin: (adminId: string, body: { amount: number; currency?: string; reason?: string }) => post<Record<string, unknown>>(`/api/super-admin/admins/${adminId}/add-funds`, body),
  listUsers: (page = 0, size = 20, search?: string, role?: string) => get<PageResponse<Record<string, unknown>>>(`/api/super-admin/users${qs({ page, size, search, role })}`),
  getUserDetail: (userId: string) => get<Record<string, unknown>>(`/api/super-admin/users/${userId}`),
  addFundsToUser: (userId: string, body: { amount: number; currency?: string; reason?: string }) => post<Record<string, unknown>>(`/api/super-admin/users/${userId}/add-funds`, body),
  userDeposits: (userId: string, page = 0, size = 50) => get<PageResponse<Record<string, unknown>>>(`/api/super-admin/users/${encodeURIComponent(userId)}/deposits${qs({ page, size })}`),
  setUserStatus: (userId: string, action: "activate" | "deactivate" | "toggle-status") => post<Record<string, unknown>>(`/api/v1/super-admin/users/${encodeURIComponent(userId)}/${action}`),
  metrics: () => get<Record<string, unknown>>("/api/super-admin/metrics"),
  depositMetrics: () => get<Record<string, unknown>>("/api/super-admin/metrics/deposits"),
  listTransactions: (page = 0, size = 50, kind?: string, status?: string, walletId?: string, from?: string, to?: string) =>
    get<PageResponse<Record<string, unknown>>>(`/api/super-admin/transactions${qs({ page, size, kind, status, walletId, from, to })}`),
  auditLog: (page = 0, size = 50) => get<PageResponse<Record<string, unknown>>>(`/api/super-admin/audit-log${qs({ page, size })}`),
  predictions: (page = 0, size = 50) => get<PageResponse<Record<string, unknown>>>(`/api/super-admin/predictions${qs({ page, size })}`),
  commissionDaily: (days = 30) => get<unknown>(`/api/super-admin/commission/country-report/daily${qs({ days })}`),
  commissionWeekly: (weeks = 12) => get<unknown>(`/api/super-admin/commission/country-report/weekly${qs({ weeks })}`),
};

export const superAdminDeposits = {
  binance: (page = 0, size = 50, pending = false) => get<PageResponse<Record<string, unknown>>>(`/api/admin/binance-deposits${pending ? "/pending" : ""}${qs({ page, size })}`),
  bank: (page = 0, size = 50, pending = false) => get<PageResponse<Record<string, unknown>>>(`/api/admin/bank-deposits${pending ? "/pending" : ""}${qs({ page, size, sort: "createdAt,desc" })}`),
  simple: (page = 0, size = 50, pending = false) => get<PageResponse<Record<string, unknown>>>(`/api/admin/simple-deposits${pending ? "/pending" : ""}${qs({ page, size })}`),
  approve: (kind: "binance" | "bank" | "simple", id: string) => post<Record<string, unknown>>(`/api/admin/${kind === "binance" ? "binance" : kind}-deposits/${encodeURIComponent(id)}/approve`),
  reject: (kind: "binance" | "bank" | "simple", id: string, body: { reason?: string }) => post<Record<string, unknown>>(`/api/admin/${kind === "binance" ? "binance" : kind}-deposits/${encodeURIComponent(id)}/reject`, body),
};

export const superAdminWithdrawals = {
  list: (page = 0, size = 50) => get<PageResponse<Record<string, unknown>>>(`/api/wallet/withdrawals/admin/all${qs({ page, size })}`),
  approve: (id: string) => post<Record<string, unknown>>(`/api/wallet/withdrawals/admin/${encodeURIComponent(id)}/approve`),
  approveAsSuperAdmin: (id: string) => post<Record<string, unknown>>(`/api/wallet/withdrawals/super-admin/${encodeURIComponent(id)}/approve`),
  reject: (id: string, body: { reason?: string }) => post<Record<string, unknown>>(`/api/wallet/withdrawals/admin/${encodeURIComponent(id)}/reject`, body),
  settle: (id: string) => post<Record<string, unknown>>(`/api/wallet/withdrawals/super-admin/${encodeURIComponent(id)}/settle`),
  markFailed: (id: string, body: { reason?: string }) => post<Record<string, unknown>>(`/api/wallet/withdrawals/super-admin/${encodeURIComponent(id)}/mark-failed`, body),
};

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------

const api = {
  baseUrl: BASE_URL,
  auth,
  user,
  wallet,
  withdrawals,
  deposits,
  webhooks,
  bets,
  games,
  booking,
  adminBooking,
  geo,
  publicFootball,
  publicFootballLeagues,
  publicFootballCups,
  publicFootballTeams,
  publicFootballStandings,
  publicFootballScorers,
  publicFootballLivescore,
  publicBasketball,
  publicNfl,
  publicBaseball,
  publicMma,
  publicTennis,
  publicAdminMatches,
  publicConfig,
  publicPredictions,
  matches,
  livescore,
  standings,
  scorers,
  teams,
  leagues,
  cups,
  nba,
  nfl,
  baseball,
  mma,
  tennis,
  affiliate,
  adminMatches,
  adminMatchSchedule,
  adminPredictions,
  adminCrash,
  adminAffiliate,
  adminAffiliateInsights,
  adminReferralLinks,
  adminAnalytics,
  support,
  upgradeChats,
  adminUpgrade,
  superAdminUpgradeChats,
  superAdminPayouts,
  superAdminAffiliateWithdrawals,
  superAdmin,
  superAdminDeposits,
  superAdminWithdrawals,
};

export default api;
