// ─────────────────────────────────────────────────────────────────────────────
// AccountCenter — Super Bet account dashboard.
//
// A real account hub: balance you can act on immediately, quick shortcuts,
// then grouped navigation to every account area. Pulls identity/balance from
// the single shared session (useSession) — never fetches its own copy of the
// user, so it can never disagree with the header about who's logged in.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  BadgeCheck, Bell, ChevronRight, ClipboardList, Eye, EyeOff, Fingerprint, Gift, Heart, History, LifeBuoy,
  LogOut, Plus, Receipt, HeartHandshake, SlidersHorizontal, Ticket, TrendingUp, UserRound,
  WalletCards, Zap, ShieldCheck,
} from "lucide-react";
import { useSession, pickUserField, isAdminUser, isSuperAdminUser, userRole } from "@/lib/session";
import { emojiForSeed } from "@/lib/avatars";

interface MenuRow { icon: ReactNode; label: string; href: string; hint?: string; badge?: { text: string; tone: "blue" | "green" | "gold" } }
interface BentoItem { icon: ReactNode; label: string; href: string; tone: "blue" | "blue" | "green" | "gold" | "plain" }

function numeric(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : null;
  return n !== null && Number.isFinite(n) ? n : null;
}

function MenuGroup({ title, rows }: { title: string; rows: MenuRow[] }) {
  return (
    <section className="acct-group">
      <h2 className="acct-group-title">{title}</h2>
      <div className="acct-group-card">
        {rows.map((row) => (
          <Link key={row.href + row.label} href={row.href} className="acct-row">
            <span className="acct-row-icon">{row.icon}</span>
            <span className="acct-row-text">
              <span className="acct-row-label">{row.label}</span>
              {row.hint && <span className="acct-row-hint">{row.hint}</span>}
            </span>
            {row.badge && <span className={`acct-chip acct-chip-${row.badge.tone}`}>{row.badge.text}</span>}
            <ChevronRight size={16} className="acct-row-chevron" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function BentoGrid({ items }: { items: BentoItem[] }) {
  return (
    <div className="acct-bento">
      {items.map((it) => (
        <Link key={it.href + it.label} href={it.href} className={`acct-bento-tile acct-bento-${it.tone}`}>
          <span className="acct-bento-icon">{it.icon}</span>
          <span className="acct-bento-label">{it.label}</span>
        </Link>
      ))}
    </div>
  );
}

export default function AccountCenter() {
  const { user, balance, checked, logout, refresh } = useSession();
  const [showBalance, setShowBalance] = useState(true);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const role = userRole(user);
    const userId = pickUserField(user, "id", "userId", "accountId");
    const email = pickUserField(user, "email", "emailAddress", "username");

    console.group("%c[AccountCenter] User session", "color:#FFB020;font-weight:800;");
    console.log("role        :", role || "(none)");
    console.log("userId      :", userId ?? "(none)");
    console.log("email       :", email ?? "(none)");
    console.log("kycStatus   :", user.kycStatus ?? "(none)");
    console.log("emailVerif  :", user.emailVerified ?? "(none)");
    console.log("raw user obj:", user);
    console.groupEnd();
  }, [user]);

  const ICON = 18;

  if (!checked) {
    return (
      <div className="acct-page acct-page-empty">
        <AcctStyles />
        <div className="acct-loading">Loading your account…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="acct-page acct-page-empty">
        <AcctStyles />
        <section className="acct-signedout">
          <span className="acct-signedout-icon"><UserRound size={26} /></span>
          <h1>Sign in to your account</h1>
          <p>Access your wallet, betslip, bet history, and account settings.</p>
          <Link href="/login" className="gold-button" style={{ marginTop: 16 }}>Log in <ChevronRight size={15} /></Link>
        </section>
      </div>
    );
  }

  const first = pickUserField(user, "firstName", "first_name", "givenName");
  const last = pickUserField(user, "lastName", "last_name", "familyName");
  const email = pickUserField(user, "email", "emailAddress", "username");
  const userId = pickUserField(user, "id", "userId", "accountId");
  const fullName = [first, last].filter(Boolean).join(" ") || (email ? email.split("@")[0] : "");
  const avatarEmoji = emojiForSeed(userId || email || "guest");
  const verified = String(user.kycStatus ?? "").toLowerCase() === "verified" || user.emailVerified === true;
  const isAdmin = isAdminUser(user);
  const isSuperAdmin = isSuperAdminUser(user);
  const bonusBalance = numeric((user as Record<string, unknown>).bonusBalance);

  const money = (v: number | null) => (v === null ? "—" : showBalance ? `GHS ${v.toFixed(2)}` : "GHS ••••••");

  const doLogout = () => { logout(); window.location.href = "/"; };

  const bentoItems: BentoItem[] = [
    { icon: <Ticket size={20} />, label: "Betslip", href: "/betslip", tone: "blue" },
    { icon: <History size={20} />, label: "Bet History", href: "/bets", tone: "blue" },
    { icon: <ClipboardList size={20} />, label: "Open Bets", href: "/open-bets", tone: "gold" },
    { icon: <Heart size={20} />, label: "Favorites", href: "/favorites", tone: "green" },
    { icon: <Gift size={20} />, label: "Promotions", href: "/promos", tone: "blue" },
    { icon: <Receipt size={20} />, label: "Transactions", href: "/transactions", tone: "plain" },
  ];

  const accountMenu: MenuRow[] = [
    { icon: <UserRound size={ICON} />, label: "Profile", href: "/profile" },
    { icon: <Fingerprint size={ICON} />, label: "Security", href: "/security" },
    { icon: <Bell size={ICON} />, label: "Notifications", href: "/notifications" },
    { icon: <SlidersHorizontal size={ICON} />, label: "Settings", href: "/settings" },
    ...(isAdmin ? [{ icon: <ShieldCheck size={ICON} />, label: "Admin Centre", href: "/admin", hint: "Restricted operations" }] : []),
    ...(isSuperAdmin ? [{ icon: <ShieldCheck size={ICON} />, label: "Super Bet Super Admin", href: "/super-admin", hint: "SUPER_ADMIN only" }] : []),
  ];

  const safetyMenu: MenuRow[] = [
    { icon: <HeartHandshake size={ICON} />, label: "Responsible Gaming", href: "/responsible-gaming" },
    { icon: <LifeBuoy size={ICON} />, label: "Help & Support", href: "/support" },
  ];

  return (
    <div className="acct-page">
      <AcctStyles />

      <div className="acct-topbar">
        <div className="acct-avatar">
          <span className="acct-avatar-emoji">{avatarEmoji}</span>
          {verified && <span className="acct-avatar-tick"><BadgeCheck size={13} /></span>}
        </div>
        <div className="acct-id">
          <p className="acct-name">{fullName || "Account holder"}</p>
          <p className="acct-email">{email}</p>
        </div>
        {isAdmin && <span className="acct-admin-pill"><Zap size={13} /> Admin</span>}
        <Link href="/profile" className="acct-edit-link" aria-label="Edit profile"><ChevronRight size={17} /></Link>
      </div>

      <div className="acct-body">
        <section className="acct-balance-card">
          <div className="acct-balance-top">
            <span className="acct-balance-label">
              Wallet balance
              <button type="button" className="acct-eye" onClick={() => setShowBalance((v) => !v)} aria-label={showBalance ? "Hide balance" : "Show balance"}>
                {showBalance ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </span>
            {bonusBalance !== null && bonusBalance > 0 && (
              <span className="acct-bonus-pill"><TrendingUp size={12} /> Bonus {money(bonusBalance)}</span>
            )}
          </div>
          <p className="acct-balance-value">{money(balance)}</p>
          <div className="acct-balance-actions">
            <Link href="/deposit" className="acct-balance-btn acct-balance-btn-solid"><Plus size={17} /> Deposit</Link>
            <Link href="/wallet" className="acct-balance-btn acct-balance-btn-ghost"><WalletCards size={16} /> Withdraw</Link>
          </div>
        </section>

        <h2 className="acct-group-title acct-bento-title">Quick access</h2>
        <BentoGrid items={bentoItems} />

        <MenuGroup title="Account" rows={accountMenu} />
        <MenuGroup title="Safety & support" rows={safetyMenu} />

        <button onClick={doLogout} className="acct-logout" type="button">
          <LogOut size={18} /> Log out
        </button>

        <p className="acct-footnote">18+ · Play responsibly. Gambling can be addictive.</p>
      </div>
    </div>
  );
}

function AcctStyles() {
  return (
    <style>{`
      .acct-page{ background:#0A0A0A; min-height:60vh; }
      .acct-page-empty{ display:flex; align-items:center; justify-content:center; min-height:70vh; }
      .acct-loading{ color:#8b8b8b; font-size:13px; }

      .acct-signedout{
        display:flex; flex-direction:column; align-items:center; text-align:center;
        max-width:360px; padding:40px 26px; background:#141414; border:1px solid var(--line);
        box-shadow:var(--shadow); border-radius:18px;
      }
      .acct-signedout-icon{ display:grid; place-items:center; width:52px; height:52px; border-radius:50%; background:rgba(30,107,255); color:var(--blue); margin-bottom:14px; }
      .acct-signedout h1{ font:800 22px 'DM Sans',sans-serif; letter-spacing:-.01em; color:#F4F1F0; }
      .acct-signedout p{ margin-top:8px; font-size:12.5px; color:#8b8b8b; line-height:1.6; }

      .acct-topbar{
        display:flex; align-items:center; gap:13px; padding:18px 22px;
        background:#141414; border-bottom:1px solid var(--line);
      }
      .acct-avatar{
        position:relative; flex-shrink:0; width:48px; height:48px; border-radius:50%;
        display:flex; align-items:center; justify-content:center; font-size:1.3rem; font-weight:800;
        background:linear-gradient(135deg,var(--blue),#0b2e70); border:2px solid rgba(30,107,255);
        font-family:'DM Sans',sans-serif;
      }
      .acct-avatar-emoji{ font-size:1.4rem; line-height:1; }
      .acct-avatar-tick{ position:absolute; bottom:-2px; right:-2px; display:flex; border-radius:50%; background:var(--nature); color:#fff; border:2px solid #141414; padding:1px; }
      .acct-id{ min-width:0; flex:1; }
      .acct-name{ margin:0; font-size:1rem; font-weight:800; letter-spacing:-.01em; color:#F4F1F0; font-family:'DM Sans',sans-serif; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .acct-email{ margin:2px 0 0; font-size:.74rem; color:#8b8b8b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .acct-admin-pill{ flex-shrink:0; display:flex; align-items:center; gap:5px; padding:5px 10px; border-radius:999px; font-size:.68rem; font-weight:800; background:rgba(30,107,255); color:var(--blue); border:1px solid rgba(30,107,255); }
      .acct-edit-link{ flex-shrink:0; display:flex; padding:6px; color:#6e6e6e; border-radius:999px; }
      .acct-edit-link:hover{ color:var(--blue); background:rgba(30,107,255); }

      .acct-body{ padding:18px 22px 50px; max-width:760px; margin:0 auto; }

      .acct-balance-card{
        position:relative; overflow:hidden; padding:22px 20px; margin-bottom:24px;
        background:linear-gradient(135deg,var(--gold-hi) 0%,var(--blue) 65%,#0b2e70 130%); color:#fff;
        border-radius:20px; box-shadow:0 14px 32px rgba(30,107,255);
      }
      .acct-balance-card:before{
        content:""; position:absolute; inset:0; pointer-events:none;
        background:radial-gradient(circle at 90% -10%, rgba(255,255,255,.24), transparent 55%);
      }
      .acct-balance-top{ position:relative; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
      .acct-balance-label{
        display:flex; align-items:center; gap:8px; font-size:.68rem; font-weight:700;
        letter-spacing:.12em; text-transform:uppercase; color:rgba(255,255,255,.75);
      }
      .acct-eye{ display:flex; padding:2px; cursor:pointer; background:none; border:none; color:rgba(255,255,255,.7); }
      .acct-eye:hover{ color:#fff; }
      .acct-balance-value{
        position:relative; margin:6px 0 0; font-family:'DM Sans',sans-serif;
        font-size:clamp(2.1rem,9vw,2.7rem); font-weight:800; letter-spacing:.01em; line-height:1;
        font-variant-numeric:tabular-nums;
      }
      .acct-bonus-pill{
        display:inline-flex; align-items:center; gap:5px; padding:5px 11px;
        border-radius:999px; font-size:.7rem; font-weight:700; color:#fff;
        background:rgba(255,255,255,.16); border:1px solid rgba(255,255,255,.24);
      }
      .acct-balance-actions{ position:relative; display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:20px; }
      .acct-balance-btn{
        display:flex; align-items:center; justify-content:center; gap:7px;
        min-height:44px; border-radius:12px; font-size:.85rem; font-weight:800; letter-spacing:.01em;
        transition:transform .16s ease, box-shadow .2s ease, background .16s ease;
      }
      .acct-balance-btn-solid{ background:#141414; color:var(--blue); box-shadow:0 8px 20px rgba(0,0,0,.18); }
      .acct-balance-btn-solid:hover{ transform:translateY(-2px); }
      .acct-balance-btn-ghost{ background:rgba(255,255,255,.14); color:#fff; border:1px solid rgba(255,255,255,.32); }
      .acct-balance-btn-ghost:hover{ background:rgba(255,255,255,.22); }

      .acct-bento-title{ margin-bottom:11px; }
      .acct-bento{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:26px; }
      .acct-bento-tile{
        display:flex; flex-direction:column; align-items:center; gap:9px;
        padding:18px 6px; font-size:.72rem; font-weight:700; text-align:center; color:#F4F1F0;
        background:#141414; border:1px solid var(--line); box-shadow:var(--shadow); border-radius:16px;
        transition:transform .16s ease, box-shadow .2s ease, border-color .16s ease;
      }
      .acct-bento-tile:hover{ transform:translateY(-3px); border-color:rgba(30,107,255); }
      .acct-bento-icon{ display:flex; align-items:center; justify-content:center; width:44px; height:44px; border-radius:50%; background:#1B1B1B; color:#9a9a9a; }
      .acct-bento-blue .acct-bento-icon{ background:rgba(30,107,255); color:var(--blue); }
      .acct-bento-blue .acct-bento-icon{ background:rgba(47,184,240,.12); color:#2FB8F0; }
      .acct-bento-green .acct-bento-icon{ background:rgba(13,166,83,.12); color:var(--nature); }
      .acct-bento-gold .acct-bento-icon{ background:rgba(255,176,32,.14); color:#FFB020; }

      .acct-group{ margin-bottom:22px; }
      .acct-group-title{
        margin:0 0 9px; font-size:.68rem; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:#8b8b8b;
      }
      .acct-group-card{ background:#141414; border:1px solid var(--line); box-shadow:var(--shadow); overflow:hidden; border-radius:16px; }
      .acct-row{
        display:flex; align-items:center; gap:13px; padding:13px 15px;
        border-bottom:1px solid var(--line); transition:background-color .14s ease;
      }
      .acct-row:last-child{ border-bottom:none; }
      .acct-row:hover{ background:#1B1B1B; }
      .acct-row-icon{
        display:flex; align-items:center; justify-content:center; flex-shrink:0;
        width:38px; height:38px; border-radius:12px; background:rgba(31,138,76,.1); color:var(--nature);
      }
      .acct-row:hover .acct-row-icon{ background:rgba(30,107,255); color:var(--blue); }
      .acct-row-text{ flex:1; min-width:0; }
      .acct-row-label{ display:block; font-size:.87rem; font-weight:700; color:#F4F1F0; }
      .acct-row-hint{ display:block; margin-top:2px; font-size:.71rem; color:#8b8b8b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .acct-row-chevron{ flex-shrink:0; color:#6e6e6e; }
      .acct-chip{ flex-shrink:0; padding:3px 10px; border-radius:999px; font-size:.66rem; font-weight:800; }
      .acct-chip-blue{ background:rgba(30,107,255); color:var(--blue); }
      .acct-chip-green{ background:rgba(13,166,83,.12); color:var(--nature); }
      .acct-chip-gold{ background:rgba(255,176,32,.16); color:#FFB020; }

      .acct-logout{
        display:flex; align-items:center; justify-content:center; gap:9px; width:100%;
        padding:14px; cursor:pointer; font-family:inherit; font-size:.88rem; font-weight:800;
        background:#141414; color:var(--blue); border:1.5px solid rgba(30,107,255); border-radius:14px;
        transition:background-color .14s ease, color .14s ease;
      }
      .acct-logout:hover{ background:var(--blue); color:#fff; }

      .acct-footnote{ margin:18px 0 0; text-align:center; font-size:.7rem; color:#8b8b8b; }

      @media(max-width:560px){
        .acct-topbar{ padding:14px 16px; }
        .acct-body{ padding-left:12px; padding-right:12px; }
        .acct-balance-card{ padding:18px 16px; }
        .acct-balance-value{ font-size:2rem; }
        .acct-bento{ gap:7px; }
        .acct-bento-tile{ padding:14px 4px; font-size:.66rem; }
        .acct-bento-icon{ width:38px; height:38px; }
      }

      /* Final Account dashboard treatment: solid black, no glow, clear hierarchy. */
      body:has(.acct-page){ background:#050505 !important; }
      .acct-page{ min-height:calc(100vh - 150px); background:#050505 !important; color:#fff; }
      .acct-topbar{ max-width:760px; margin:0 auto; padding:22px 22px 18px; background:#050505; border-bottom:1px solid #242424; }
      .acct-avatar{ background:#111 !important; border:1px solid #1e6bff; box-shadow:none !important; }
      .acct-avatar-tick{ border-color:#050505; }
      .acct-edit-link{ color:#8e8e8e; background:#111; border:1px solid #292929; }
      .acct-edit-link:hover{ color:#fff; background:#1e6bff; border-color:#1e6bff; }
      .acct-body{ padding-top:24px; }
      .acct-balance-card{ background:#0b0b0b !important; border:1px solid #1e6bff; border-radius:14px; box-shadow:none !important; }
      .acct-balance-card:before{ display:none; }
      .acct-balance-card:after{ content:""; position:absolute; left:0; right:0; bottom:0; height:3px; background:#1e6bff; }
      .acct-balance-btn-solid{ background:#fff; color:#0a0a0a; box-shadow:none !important; }
      .acct-balance-btn-solid:hover{ background:#eaf2ff; transform:none; }
      .acct-balance-btn-ghost{ background:#111; border:1px solid #3a3a3a; color:#fff; }
      .acct-balance-btn-ghost:hover{ background:#1e6bff; border-color:#1e6bff; }
      .acct-bento-title,.acct-group-title{ color:#8e8e8e !important; }
      .acct-bento-tile{ background:#0b0b0b; border:1px solid #242424; box-shadow:none; border-radius:10px; }
      .acct-bento-tile:hover{ transform:none; border-color:#1e6bff; background:#101010; }
      .acct-bento-icon{ background:#151515; color:#fff; border-radius:10px; }
      .acct-bento-blue .acct-bento-icon,.acct-bento-green .acct-bento-icon,.acct-bento-gold .acct-bento-icon{ background:#151515; color:#fff; }
      .acct-group-card{ background:#0b0b0b; border:1px solid #242424; box-shadow:none; border-radius:10px; }
      .acct-row{ border-bottom:1px solid #242424; }
      .acct-row:hover{ background:#111; }
      .acct-row-icon{ background:#151515; color:#fff; border-radius:9px; }
      .acct-row:hover .acct-row-icon{ background:#1e6bff; color:#fff; }
      .acct-row-label{ color:#fff; }
      .acct-row-hint{ color:#8e8e8e; }
      .acct-row-chevron{ color:#707070; }
      .acct-chip-blue{ background:#162b52; color:#8db8ff; }
      .acct-chip-green{ background:#123322; color:#72d59a; }
      .acct-chip-gold{ background:#33270e; color:#ffd36b; }
      .acct-logout{ background:#0b0b0b; color:#fff; border:1px solid #383838; border-radius:10px; box-shadow:none; }
      .acct-logout:hover{ background:#1e6bff; border-color:#1e6bff; }
      .acct-footnote{ color:#707070; }

      /* Shared product palette: white surfaces, Super Bet blue accents, no glow. */
      body:has(.acct-page){ background:#eef0f4 !important; }
      .acct-page{ background:#eef0f4 !important; color:#102a43; }
      .acct-topbar{ background:#fff; border-bottom:1px solid #dbe8fb; }
      .acct-avatar{ background:#eaf2ff !important; border-color:#1e6bff; }
      .acct-avatar-tick{ border-color:#fff; }
      .acct-name{ color:#102a43 !important; }
      .acct-email{ color:#5f7489 !important; }
      .acct-edit-link{ color:#5f7489; background:#f7faff; border-color:#b7d0ff; }
      .acct-edit-link:hover{ color:#fff; background:#1e6bff; }
      .acct-balance-card{ background:#1e6bff !important; border-color:#1246a8; }
      .acct-balance-btn-solid{ background:#fff; color:#1246a8; }
      .acct-balance-btn-ghost{ background:#1246a8; border-color:#8db8ff; color:#fff; }
      .acct-bento-title,.acct-group-title{ color:#5f7489 !important; }
      .acct-bento-tile{ background:#fff; border-color:#dbe8fb; color:#102a43; box-shadow:0 6px 16px rgba(30,107,255,.08); }
      .acct-bento-tile:hover{ background:#f7faff; border-color:#1e6bff; }
      .acct-bento-icon{ background:#eaf2ff; color:#1e6bff; }
      .acct-bento-blue .acct-bento-icon,.acct-bento-green .acct-bento-icon,.acct-bento-gold .acct-bento-icon{ background:#eaf2ff; color:#1e6bff; }
      .acct-group-card{ background:#fff; border-color:#dbe8fb; box-shadow:0 6px 16px rgba(30,107,255,.08); }
      .acct-row{ border-bottom-color:#e5eefb; }
      .acct-row:hover{ background:#f7faff; }
      .acct-row-icon{ background:#eaf2ff; color:#1e6bff; }
      .acct-row:hover .acct-row-icon{ background:#1e6bff; color:#fff; }
      .acct-row-label{ color:#102a43; }
      .acct-row-hint{ color:#5f7489; }
      .acct-row-chevron{ color:#7a91a8; }
      .acct-logout{ background:#fff; color:#1246a8; border-color:#b7d0ff; }
      .acct-footnote{ color:#5f7489; }
    `}</style>
  );
}
