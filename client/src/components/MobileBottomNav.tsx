import { Link, useLocation } from "wouter";

// Option 1 "SportyBet mirror" bottom nav (owner pick, 2026-10-22): white bar,
// five items — Home · Sports · Betslip · My Bets · Account — clean line icons,
// active tab in SportyBet green (#00A651), and the betslip item carries the
// live selection-count badge. Icons are the exact stroke paths from the
// approved sample (~/workspace/.pb-verify/navsamples/nav1-sporty.html).

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

const BetslipIcon = () => (
  <NavSvg>
    <path d="M4 8a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 000-4z" />
    <path d="M13 7v2M13 11v2M13 15v2" />
  </NavSvg>
);

const MyBetsIcon = () => (
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

export default function MobileBottomNav({ count = 0 }: { count?: number }) {
  const [location] = useLocation();
  const items = [
    { key: "home", href: "/", label: "Home", Icon: HomeIcon, match: (l: string) => l === "/" },
    { key: "sports", href: "/sports", label: "Sports", Icon: SportsIcon, match: (l: string) => l === "/sports" || l === "/live" },
    { key: "betslip", href: "/betslip", label: "Betslip", Icon: BetslipIcon, match: (l: string) => l === "/betslip" },
    { key: "mybets", href: "/bets", label: "My Bets", Icon: MyBetsIcon, match: (l: string) => l === "/bets" || l === "/open-bets" || l.startsWith("/bets/") },
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
              {item.key === "betslip" && count > 0 && (
                <span className="mbn-count" aria-label={`${count} selection${count === 1 ? "" : "s"} in betslip`}>
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </span>
            <span className="mbn-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
