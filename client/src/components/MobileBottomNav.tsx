import { Link, useLocation } from "wouter";

// Option 1 "SportyBet mirror" bottom nav (owner pick, 2026-10-22): white bar,
// clean line icons, active tab in SportyBet green (#00A651). Four items since
// 2026-10-23 (owner): Betslip and My Bets were merged into ONE "Bets" item
// pointing at /bets — both old items landed on the bets pages anyway. The
// current slip itself stays reachable from the Account menu and from the
// booking-code flow's landing on /betslip (the floating icon's flow is
// unchanged). There is deliberately NO selection-count badge here — the
// count lives only on the floating icon. Icons are the exact stroke
// paths from the approved sample (~/workspace/.pb-verify/navsamples/nav1-sporty.html).

function NavSvg({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={23}
      height={23}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const HomeIcon = () => (
  <NavSvg>
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h14V10" />
  </NavSvg>
);

const SportsIcon = () => (
  <NavSvg>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7l2.5 3.6L13 15h-2l-1.5-4.4zM3.5 10h5M15.5 10h5M8 20l2.5-3.8M16 20l-2.5-3.8" />
  </NavSvg>
);

const BetsIcon = () => (
  <NavSvg>
    <path d="M6 3h12v18l-3-2.2L12 21l-3-2.2L6 21z" />
    <path d="M9 8h6M9 12h6" />
  </NavSvg>
);

const AccountIcon = () => (
  <NavSvg>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 5-5.5 8-5.5s6.5 1.5 8 5.5" />
  </NavSvg>
);

export default function MobileBottomNav() {
  const [location] = useLocation();
  const items = [
    { key: "home", href: "/", label: "Home", Icon: HomeIcon, match: (l: string) => l === "/" },
    { key: "sports", href: "/sports", label: "Sports", Icon: SportsIcon, match: (l: string) => l === "/sports" || l === "/live" },
    { key: "bets", href: "/bets", label: "Bets", Icon: BetsIcon, match: (l: string) => l === "/bets" || l === "/open-bets" || l.startsWith("/bets/") || l === "/betslip" },
    { key: "account", href: "/account", label: "Account", Icon: AccountIcon, match: (l: string) => l === "/account" || l === "/profile" },
  ];
  return (
    <nav className="mobile-bottom-nav" aria-label="Primary mobile navigation">
      {items.map((item) => {
        const active = item.match(location);
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`mbn-item${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="mbn-icon-wrap">
              <item.Icon />
            </span>
            <span className="mbn-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
