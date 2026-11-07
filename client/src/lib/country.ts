import { pickUserField, useSession } from "./session";

/**
 * Account country — the single source of truth for which money the player
 * sees. The backend user record carries a `country` (RegisterRequest /
 * UserDto / PATCH /api/users/me all support it); signup collects it, and
 * the CountryGate popup backfills it for accounts created before that.
 * GH → GHS / MoMo (ShinobiPay). NG → NGN / Flutterwave. Every Ghana
 * amount in the player flow has a Nigerian counterpart in the same unit
 * count — the wallet is one balance, shown in the account's currency —
 * and cedis and naira are never added together anywhere.
 */
export type CountryCode = "GH" | "NG";

export interface CountryProfile {
  code: CountryCode;
  name: string;
  currency: string;
  symbol: string;
  flag: string;
}

export const COUNTRY_PROFILES: Record<CountryCode, CountryProfile> = {
  GH: { code: "GH", name: "Ghana", currency: "GHS", symbol: "GH₵", flag: "🇬🇭" },
  NG: { code: "NG", name: "Nigeria", currency: "NGN", symbol: "₦", flag: "🇳🇬" },
};

export const COUNTRY_LIST: CountryProfile[] = [COUNTRY_PROFILES.GH, COUNTRY_PROFILES.NG];

/** Normalises any country spelling to GH/NG, or "" when it is not set. */
export function normalizeCountry(raw: unknown): CountryCode | "" {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "NG" || v === "NGN" || v === "NGA" || v === "NIGERIA") return "NG";
  if (v === "GH" || v === "GHS" || v === "GHA" || v === "GHANA") return "GH";
  return "";
}

/** The account country off a session user record, "" when it is not set. */
export function accountCountry(user: unknown): CountryCode | "" {
  return normalizeCountry(pickUserField(user, "country", "countryCode", "country_code"));
}

/** The signed-in account's country from the session, "" when not set. */
export function useAccountCountry(): CountryCode | "" {
  const { user } = useSession();
  return accountCountry(user);
}

export function currencyCode(code: CountryCode | ""): "GHS" | "NGN" {
  return code === "NG" ? "NGN" : "GHS";
}

export function countrySymbol(code: CountryCode | ""): string {
  return code === "NG" ? "₦" : "GH₵";
}

/** Formats a wallet-unit amount in the account's currency: GH₵1,000.00 / ₦10,000.00. */
export function formatMoney(value: unknown, code: CountryCode | ""): string {
  const n = Number(value);
  const shown = Number.isFinite(n)
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";
  return `${countrySymbol(code)}${shown}`;
}

/**
 * Stake limits in wallet units, per account country. Ghana: GH₵200 min,
 * GH₵20,000 max. Nigeria: ₦30,000 min (owner order 2026-11-07) — the max
 * scales by the same 150× the min implies (₦3,000,000), so the range
 * stays valid instead of min > max.
 */
export function stakeLimits(code: CountryCode | ""): { min: number; max: number } {
  return code === "NG" ? { min: 30000, max: 3000000 } : { min: 200, max: 20000 };
}
