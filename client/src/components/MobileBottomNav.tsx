import { Link, useLocation } from "wouter";
import { Home, LayoutList, Radio, Ticket, UserRound, ScanBarcode } from "lucide-react";

export default function MobileBottomNav() {
  const [location] = useLocation();
  const items = [
    { href: "/", label: "Home", icon: Home, match: (l: string) => l === "/" },
    { href: "/sports", label: "Sports", icon: LayoutList, match: (l: string) => l === "/sports" },
    { href: "/booking-code", label: "Load Code", icon: ScanBarcode, match: (l: string) => l === "/booking-code" },
    { href: "/bets", label: "Bets", icon: Ticket, match: (l: string) => l === "/bets" || l === "/open-bets" || l.startsWith("/bets/") },
    { href: "/account", label: "Account", icon: UserRound, match: (l: string) => l === "/account" || l === "/profile" },
  ];
  return (
    <nav className="mobile-bottom-nav" aria-label="Primary mobile navigation">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.match(location);
        return (
          <Link key={item.href} href={item.href} className={`mbn-item${item.href === "/booking-code" ? " mbn-booking" : ""}${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
            <span className="mbn-icon-wrap">
              <Icon size={20} />
            </span>
            <span className="mbn-label">{item.href === "/booking-code" ? "" : item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
