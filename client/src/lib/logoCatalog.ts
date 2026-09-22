// 60 verified open football-logo catalog assets: 30 home and 30 away, all distinct.
export const HOME_ADMIN_CRESTS = [
  "/admin-logos/catalog/crest-01.png",
  "/admin-logos/catalog/crest-02.png",
  "/admin-logos/catalog/crest-03.png",
  "/admin-logos/catalog/crest-04.png",
  "/admin-logos/catalog/crest-05.png",
  "/admin-logos/catalog/crest-06.png",
  "/admin-logos/catalog/crest-07.png",
  "/admin-logos/catalog/crest-08.png",
  "/admin-logos/catalog/crest-09.png",
  "/admin-logos/catalog/crest-10.png",
  "/admin-logos/catalog/crest-11.png",
  "/admin-logos/catalog/crest-12.png",
  "/admin-logos/catalog/crest-13.png",
  "/admin-logos/catalog/crest-14.png",
  "/admin-logos/catalog/crest-15.png",
  "/admin-logos/catalog/crest-16.png",
  "/admin-logos/catalog/crest-17.png",
  "/admin-logos/catalog/crest-18.png",
  "/admin-logos/catalog/crest-19.png",
  "/admin-logos/catalog/crest-20.png",
  "/admin-logos/catalog/crest-21.png",
  "/admin-logos/catalog/crest-22.png",
  "/admin-logos/catalog/crest-23.png",
  "/admin-logos/catalog/crest-24.png",
  "/admin-logos/catalog/crest-25.png",
  "/admin-logos/catalog/crest-26.png",
  "/admin-logos/catalog/crest-27.png",
  "/admin-logos/catalog/crest-28.png",
  "/admin-logos/catalog/crest-29.png",
  "/admin-logos/catalog/crest-30.png"
] as const;
export const AWAY_ADMIN_CRESTS = [
  "/admin-logos/catalog/crest-31.png",
  "/admin-logos/catalog/crest-32.png",
  "/admin-logos/catalog/crest-33.png",
  "/admin-logos/catalog/crest-34.png",
  "/admin-logos/catalog/crest-35.png",
  "/admin-logos/catalog/crest-36.png",
  "/admin-logos/catalog/crest-37.png",
  "/admin-logos/catalog/crest-38.png",
  "/admin-logos/catalog/crest-39.png",
  "/admin-logos/catalog/crest-40.png",
  "/admin-logos/catalog/crest-41.png",
  "/admin-logos/catalog/crest-42.png",
  "/admin-logos/catalog/crest-43.png",
  "/admin-logos/catalog/crest-44.png",
  "/admin-logos/catalog/crest-45.png",
  "/admin-logos/catalog/crest-46.png",
  "/admin-logos/catalog/crest-47.png",
  "/admin-logos/catalog/crest-48.png",
  "/admin-logos/catalog/crest-49.png",
  "/admin-logos/catalog/crest-50.png",
  "/admin-logos/catalog/crest-51.png",
  "/admin-logos/catalog/crest-52.png",
  "/admin-logos/catalog/crest-53.png",
  "/admin-logos/catalog/crest-54.png",
  "/admin-logos/catalog/crest-55.png",
  "/admin-logos/catalog/crest-56.png",
  "/admin-logos/catalog/crest-57.png",
  "/admin-logos/catalog/crest-58.png",
  "/admin-logos/catalog/crest-59.png",
  "/admin-logos/catalog/crest-60.png"
] as const;
export function adminCrestFor(team: unknown, side: "home" | "away"): string {
  const value = String(team ?? "admin-team").trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  const catalog = side === "home" ? HOME_ADMIN_CRESTS : AWAY_ADMIN_CRESTS;
  return catalog[hash % catalog.length];
}
