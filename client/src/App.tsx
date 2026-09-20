// Super UI / Black Gold Fieldhouse: reference-faithful sportsbook terminal, sharp information density, purposeful motion, green live/action accents.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, Route, Switch, useLocation, useSearch } from "wouter";
import api, { ApiError } from "./lib/api";
import { isBettableMatchId } from "./lib/sportsbook";
import Sportsbook, { type Pick } from "./components/Sportsbook";
import { fetchAdminMatches, formatKickoff, isMatchLive, type EnrichedMatch } from "./lib/sportsbook";
import WalletCenter from "./components/WalletCenter";
import DepositCenter from "./components/DepositCenter";
import SupportCenter from "./components/SupportCenter";
import BetslipPage from "./components/BetslipPage";
import AccountCenter from "./components/AccountCenter";
import ProfileCenter from "./components/ProfileCenter";
import MobileBottomNav from "./components/MobileBottomNav";
import SportsPage from "./components/SportsPage";
import MatchDetailsPage from "./components/MatchDetailsPage";
import TransactionsPage from "./components/TransactionsPage";
import BetsCenter from "./components/BetsCenter";
import TicketDetailsPage from "./components/TicketDetailsPage";
import WinCelebrationModal from "./components/WinCelebrationModal";
import NotificationsPage from "./components/NotificationsPage";
import FavoritesPage from "./components/FavoritesPage";
import SettingsPage from "./components/SettingsPage";
import SecurityPage from "./components/SecurityPage";
import ResponsibleGamingPage from "./components/ResponsibleGamingPage";
import SearchPage from "./components/SearchPage";
import BookingCodePage from "./components/BookingCodePage";
import AdminPanelPage from "./pages/AdminPanelPage";
import AdminEntryGuidePage from "./pages/AdminEntryGuidePage";
import SuperAdminPage from "./pages/SuperAdminPage";
import { SessionProvider, useSession, pickUserField } from "./lib/session";
import { flagForCountry, codeLabel, flagImageUrl, COUNTRY_OPTIONS } from "./lib/countries";
import NotFound from "./pages/NotFound";
import { Bell, ChevronDown, ChevronRight, CircleHelp, Clock3, Copy, CreditCard, Flame, Gamepad2, Gift, Headphones, Info, Layers3, LayoutGrid, Minus, MoreHorizontal, Play, Plus, Radio, ScanBarcode, Search, ShieldCheck, Sparkles, Ticket, Trophy, UserRound, WalletCards, X, Zap } from "lucide-react";

const hero = "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=1600&auto=format&fit=crop";

// The match list already knows exactly which sport a match belongs to (and
// whether it's an admin-created special) since it came straight off that
// sport's own fetch. Passing that through as a query param means the detail
// page can go directly to the right backend endpoint instead of guessing by
// trying every sport's endpoint in turn — which previously could land a
// perfectly ordinary football match on the admin endpoint and mislabel it as
// a "Power Special" if football's own /matches/:id lookup 404'd for it (e.g.
// a match only indexed in bulk/list endpoints, not individually).
function MatchDetailsRoute({ id, picks, onPick }: { id: string; picks: Pick[]; onPick: (p: Pick) => void }) {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const sportHint = params.get("sport") ?? undefined;
  const adminHint = params.get("admin") === "1";
  return <MatchDetailsPage id={id} picks={picks} onPick={onPick} sportHint={sportHint} adminHint={adminHint} />;
}

const virtualBanner = "https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?q=80&w=1600&auto=format&fit=crop";
const casinoFeature = "https://images.unsplash.com/photo-1596838132731-3301c3fd4317?q=80&w=1200&auto=format&fit=crop";
const mark = "/superbet-logo.png";

const nav = [["Sports", "/"], ["Live", "/live"], ["Casino", "/casino"], ["Promos", "/promos"], ["Affiliate", "/affiliate"]];

function Header({ onMenu }: { onMenu: () => void }) {
  const [location] = useLocation();
  const { balance, token, user } = useSession();
  const userCountry = pickUserField(user, "country", "countryCode", "country_code");
  const flagCode = codeLabel(userCountry);
  const [flagImgFailed, setFlagImgFailed] = useState(false);
  useEffect(() => {
    const closeMenuOnScroll = () => document.body.classList.remove("menu-open");
    window.addEventListener("scroll", closeMenuOnScroll, { passive: true });
    return () => window.removeEventListener("scroll", closeMenuOnScroll);
  }, []);
  return <>
    <div className="utility"><div className="wrap utility-inner"><Link href="/" aria-label="Super Bet home" className="utility-brand">{flagImgFailed ? <span className="flag-emoji" aria-hidden>{flagForCountry(userCountry)}</span> : <img className="flag-img" src={flagImageUrl(userCountry)} alt={flagCode} onError={() => setFlagImgFailed(true)} />} Super Bet</Link><span className="utility-links"><Link href="/deposit">Deposit</Link><Link href="/support">Support</Link>{token ? <><Link href="/bets">Bet history</Link><Link href="/account">My account <ChevronDown size={12}/></Link></> : <><Link href="/login">Log in</Link><Link href="/register">Join now</Link></>}</span></div></div>
    <header className="header"><div className="wrap header-inner"><Link href="/" className="brand" aria-label="Super Bet home"><img src={mark} alt="Super Bet" /></Link><nav id="primary-navigation" className="main-nav">{nav.map(([label, href]) => <Link key={href} href={href} className={location === href ? "active" : ""} onClick={() => document.body.classList.remove("menu-open")}>{label}{label === "Live" && <i className="live-dot"/>}</Link>)}</nav><div className="header-actions"><button className="icon-button" aria-label="Search" onClick={()=>window.location.href="/search"}><Search size={17}/></button>{token ? <><Link href="/wallet" className="header-balance">{balance !== null ? `GHS ${balance.toFixed(2)}` : "GHS 0.00"}</Link><Link href="/account" className="login-link">My account</Link></> : <><Link href="/login" className="login-link">Log in</Link><Link href="/register" className="header-join-button">Join now</Link></>}</div></div></header>
  </>;
}
function Footer(){ return <footer><div className="wrap footer-grid"><div><Link href="/" className="brand footer-brand"><img src={mark} alt="Super Bet" /></Link><p className="muted">The smarter way to follow the moment.</p><div className="partner-badge"><Trophy size={24}/><span>Official<br/>Sports Partner</span></div></div><div><h4>Bet with confidence</h4><Link href="/">About Super Bet</Link><Link href="/promos">Promotions</Link><Link href="/wallet">Responsible gaming</Link><Link href="/">Privacy policy</Link></div><div><h4>How to play</h4><Link href="/">FAQ</Link><Link href="/live">Live betting</Link><Link href="/casino">Games</Link></div><div><h4>Connect with us</h4><Link href="/help"><Headphones size={14}/> Customer support</Link><Link href="/affiliate"><Copy size={14}/> Copy referral link</Link><Link href="/login"><Bell size={14}/> Get notifications</Link></div></div><div className="footer-bottom wrap"><span>18+ &nbsp; Play responsibly. Gambling can be addictive.</span><span>© 2026 Super Bet. All rights reserved.</span></div></footer> }

type AuthForm = { identifier: string; password: string; confirm: string; firstName: string; lastName: string; phone: string; referral: string; country: string };

function AuthField({ label, value, onChange, type = "text", placeholder = "" }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return <label className="auth-field"><span>{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} type={type} placeholder={placeholder} /></label>;
}

function AuthPasswordField({ confirm = false, value, onChange, visible, onToggleVisible, password, passwordStrong }: { confirm?: boolean; value: string; onChange: (v: string) => void; visible: boolean; onToggleVisible: () => void; password?: string; passwordStrong?: boolean }) {
  return <label className="auth-field"><span>{confirm ? "Confirm password" : "Password"}</span><div className="auth-input-wrap"><input value={value} onChange={(e) => onChange(e.target.value)} type={visible ? "text" : "password"} placeholder={confirm ? "Repeat your password" : "At least 8 characters"} /><button type="button" onClick={onToggleVisible}>{visible ? "Hide" : "Show"}</button></div>{!confirm && password && <small className={passwordStrong ? "valid-text" : "error-text"}>{passwordStrong ? "Strong password" : "Use 8+ characters with a letter and number"}</small>}</label>;
}

function AccountAuth({ mode }: { mode: "login" | "register" }) {
  const isLogin = mode === "login";
  const { refresh } = useSession();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<1 | 2>(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [remember, setRemember] = useState(true);
  const [terms, setTerms] = useState(false);
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<AuthForm>({ identifier: "", password: "", confirm: "", firstName: "", lastName: "", phone: "", referral: "", country: "GH" });
  const update = (key: keyof AuthForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  // Referral links point people at /register?ref=CODE — that query param was
  // never actually read anywhere, so anyone arriving via a shared referral
  // link had to notice, copy, and manually retype the code themselves (or,
  // realistically, never bothered — silently losing the attribution).
  useEffect(() => {
    if (isLogin) return;
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) setForm((current) => (current.referral ? current : { ...current, referral: ref.trim() }));
  }, [isLogin]);
  const passwordStrong = form.password.length >= 8 && /[A-Za-z]/.test(form.password) && /[0-9]/.test(form.password);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setNotice(""); if (isLogin) { if (!form.identifier || !form.password) return setNotice("Enter your email and password to continue."); setSubmitting(true); try { const result = await api.auth.login({ email: form.identifier, password: form.password }); window.localStorage.setItem("accessToken", result.accessToken); refresh(); setLocation("/"); } catch (error) { setNotice(error instanceof ApiError ? error.message : "We could not sign you in — check your connection and try again."); } finally { setSubmitting(false); } return; } if (step === 1) { if (!form.identifier || !passwordStrong || form.password !== form.confirm) return setNotice("Check your email, password, and confirmation before continuing."); setStep(2); return; } if (!form.firstName || !form.lastName || !form.phone || !terms) return setNotice("Complete your profile and accept the terms to create your account."); setSubmitting(true); try { const result = await api.auth.register({ email: form.identifier, password: form.password, firstName: form.firstName, lastName: form.lastName, phone: form.phone, country: form.country || "GH", ref: form.referral || undefined }); window.localStorage.setItem("accessToken", result.accessToken); refresh(); setLocation("/"); } catch (error) { setNotice(error instanceof ApiError ? error.message : "We could not create your account. Please try again."); } finally { setSubmitting(false); } };
  return <><Header onMenu={() => document.body.classList.toggle("menu-open")} /><main className="auth-page"><div className="auth-intro"><span className="eyebrow">{isLogin ? "Welcome back" : "Account setup"}</span><h1>{isLogin ? <>Bet smarter.<br/><em>Stay ahead.</em></> : <>Your next win<br/><em>starts here.</em></>}</h1><p>{isLogin ? "Access your balance, betslip, live markets, and Super Bet rewards." : "Create your Super Bet account in under two minutes and make every market count."}</p><div className="auth-benefits"><span><ShieldCheck size={16}/> Secure account</span><span><Zap size={16}/> Fast markets</span><span><Gift size={16}/> Exclusive offers</span></div></div><section className="panel auth-card auth-card-premium"><div className="auth-card-head"><div className="auth-crown"><Zap size={20}/></div><div><span className="eyebrow">Super Bet Ghana</span><h2>{isLogin ? "Log in" : step === 1 ? "Create your account" : "Complete your profile"}</h2></div></div>{!isLogin && <div className="auth-steps"><span className={step === 1 ? "active" : "done"}>1 <small>Account</small></span><i className={step === 2 ? "active" : ""}/><span className={step === 2 ? "active" : ""}>2 <small>Profile</small></span></div>}<form onSubmit={submit}>{isLogin && <><AuthField label="Phone or email" value={form.identifier} onChange={(v) => update("identifier", v)} placeholder="name@example.com" /><AuthPasswordField value={form.password} onChange={(v) => update("password", v)} visible={showPassword} onToggleVisible={() => setShowPassword(!showPassword)} password={form.password} passwordStrong={passwordStrong} /><div className="auth-row"><label className="check-row"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me</label><Link href="/help">Forgot password?</Link></div></>}{!isLogin && step === 1 && <><AuthField label="Email address" value={form.identifier} onChange={(v) => update("identifier", v)} type="email" placeholder="name@example.com" /><AuthPasswordField value={form.password} onChange={(v) => update("password", v)} visible={showPassword} onToggleVisible={() => setShowPassword(!showPassword)} password={form.password} passwordStrong={passwordStrong} /><AuthPasswordField confirm value={form.confirm} onChange={(v) => update("confirm", v)} visible={showConfirm} onToggleVisible={() => setShowConfirm(!showConfirm)} /></>}{!isLogin && step === 2 && <><div className="auth-two-col"><AuthField label="First name" value={form.firstName} onChange={(v) => update("firstName", v)} placeholder="Kwame" /><AuthField label="Last name" value={form.lastName} onChange={(v) => update("lastName", v)} placeholder="Mensah" /></div><AuthField label="Phone number" value={form.phone} onChange={(v) => update("phone", v)} type="tel" placeholder="+233 24 000 0000" /><label className="auth-field"><span>Country</span><select value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}>{COUNTRY_OPTIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label><AuthField label="Referral code" value={form.referral} onChange={(v) => update("referral", v)} placeholder="Optional" /><label className="check-row terms-row"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} /> I agree to the <Link href="/">terms and responsible gaming policy</Link></label></>}<button className="gold-button full auth-submit" type="submit" disabled={submitting}>{submitting ? "Connecting…" : isLogin ? "Log in to Super Bet" : step === 1 ? "Continue" : "Create account"}<ChevronRight size={16}/></button>{notice && <div className="auth-notice" role="alert">{notice}</div>}</form>{!isLogin && step === 2 && <button className="auth-back" type="button" onClick={() => setStep(1)}>Back to account details</button>}<p className="auth-switch">{isLogin ? "New to Super Bet?" : "Already have an account?"} <Link href={isLogin ? "/register" : "/login"}>{isLogin ? "Create an account" : "Log in"}</Link></p><div className="auth-safe"><ShieldCheck size={15}/> Your information is protected with secure account controls.</div></section></main><Footer /></>;
}

function Router(){ return <footer><div className="wrap footer-grid"><div><Link href="/" className="brand footer-brand"><img src={mark} alt="Super Bet" /></Link><p className="muted">The smarter way to follow the moment.</p><div className="partner-badge"><Trophy size={24}/><span>Official<br/>Sports Partner</span></div></div><div><h4>Bet with confidence</h4><Link href="/">About Super Bet</Link><Link href="/promos">Promotions</Link><Link href="/wallet">Responsible gaming</Link><Link href="/">Privacy policy</Link></div><div><h4>How to play</h4><Link href="/">FAQ</Link><Link href="/">Bet builder</Link><Link href="/live">Live betting</Link><Link href="/casino">Games</Link></div><div><h4>Connect with us</h4><Link href="/"> <Headphones size={14}/> Customer support</Link><Link href="/affiliate"><Copy size={14}/> Copy referral link</Link><Link href="/login"><Bell size={14}/> Get notifications</Link></div></div><div className="footer-bottom wrap"><span>18+ &nbsp; Play responsibly. Gambling can be addictive.</span><span>© 2026 Super Bet. All rights reserved.</span></div></footer> }
function SideNav(){ const leagues:[[string,string],...Array<[string,string]>]=[["Premier League","/"],["UEFA Champions League","/live"],["La Liga","/"],["Serie A","/"],["Bundesliga","/"],["Ligue 1","/"],["Ghana Premier League","/"]]; return <aside className="side-nav panel"><div className="side-title"><Flame size={15}/> Top leagues</div>{leagues.map(([name,href])=><Link href={href} key={name}>{name}<ChevronRight size={14}/></Link>)}<div className="side-title spaced"><Gift size={15}/> Quick links</div>{[["Jackpot","/promos"],["Live TV","/live"],["Sports calendar","/"],["Bet builder","/live"]].map(([x,href])=><Link href={href} key={x}>{x}<ChevronRight size={14}/></Link>)}</aside> }

// ---------------------------------------------------------------------------
// Home quick-nav shell — promo carousel, icon quick-links, quick filter
// pills, feature tabs, and a league icon strip sitting above the match list,
// mirroring the layout pattern of the reference screenshot (promo cards →
// icon nav → filter pills → tabs → league strip → matches) but built from
// Super Bet's own existing features rather than a competitor's branding.
// ---------------------------------------------------------------------------

// A generated coin/jackpot motif, embedded directly as an SVG data URI —
// works immediately with no external file needed, standing in for a real
// photo until one is supplied. Every other card still uses the plain
// gradient placeholder; this one specifically now has a real background
// graphic per request.
const JACKPOT_BG_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="220" height="156" viewBox="0 0 220 156">
  <defs>
    <radialGradient id="g" cx="30%" cy="20%" r="90%">
      <stop offset="0%" stop-color="#07182b"/>
      <stop offset="100%" stop-color="#0a0a0a"/>
    </radialGradient>
    <linearGradient id="coin" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#5b9bff"/>
      <stop offset="100%" stop-color="#1e6bff"/>
    </linearGradient>
  </defs>
  <rect width="220" height="156" fill="url(#g)"/>
  <circle cx="180" cy="30" r="34" fill="url(#coin)" opacity="0.9"/>
  <circle cx="180" cy="30" r="34" fill="none" stroke="#0b2e70" stroke-width="2"/>
  <text x="180" y="38" font-family="Georgia,serif" font-size="26" font-weight="700" fill="#0b2e70" text-anchor="middle">$</text>
  <circle cx="150" cy="70" r="24" fill="url(#coin)" opacity="0.85"/>
  <circle cx="150" cy="70" r="24" fill="none" stroke="#0b2e70" stroke-width="1.5"/>
  <circle cx="196" cy="88" r="18" fill="url(#coin)" opacity="0.75"/>
  <circle cx="196" cy="88" r="18" fill="none" stroke="#0b2e70" stroke-width="1.5"/>
  <circle cx="30" cy="120" r="60" fill="none" stroke="#1e6bff" stroke-width="1" opacity="0.25"/>
  <circle cx="30" cy="120" r="80" fill="none" stroke="#1e6bff" stroke-width="1" opacity="0.15"/>
</svg>
`)}`;

const PROMO_CARDS: { label: string; tag?: string; icon: typeof Flame; href: string; accent: string; image?: string }[] = [
  // `image` is left unset for the rest of these for now — waiting on the
  // actual banner photos to be supplied. Once provided, set e.g.
  // image: "/promos/2h-football.jpg" and PromoCarousel below will render it
  // as the card's background photo instead of the gradient placeholder,
  // exactly like the Jackpot card below already does with its generated
  // background.
  { label: "2H Football", tag: "LIVE", icon: Radio, href: "/live", accent: "var(--nature)" , image: "https://imgs.search.brave.com/DRgPFtUTx092DB-ffcvqreE4mCo8u1AQOvGODBP-9No/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9tZWRp/YS5pc3RvY2twaG90/by5jb20vaWQvMjIy/MDg0OTYyMy92ZWN0/b3Ivc3BvcnRzLWdy/b3VwLW9mLXNwb3J0/cy1hdGhsZXRlcy1z/ZXQtb2YtYWN0aXZl/LXBlb3BsZS1wbGF5/ZXJzLWlzb2xhdGVk/LXZlY3Rvci1zaWxo/b3VldHRlcy5qcGc_/cz02MTJ4NjEyJnc9/MCZrPTIwJmM9STJl/UFU5ZWNiZXRXd0tj/UVAyQld6RVFuc3o0/SmVTN2RpaHN5OXVr/ZjJuUT0"},
  { label: "Jackpot", tag: "HOT", icon: Trophy, href: "/promos", accent: "var(--gold-hi)", image: "https://imgs.search.brave.com/qjDCvl93wqiTrVQRHiE7YR6ZMLJXwXqoCRkQVtSoBRc/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9tZWRp/YS5pc3RvY2twaG90/by5jb20vaWQvMTI3/MjgzOTg2My92ZWN0/b3IvamFja3BvdC13/aW5uZXItY29pbnMt/cGxheS12ZWdhcy1j/YXNpbm8tZ2FtZS1i/YW5uZXItdmVjdG9y/LmpwZz9zPTYxMng2/MTImdz0wJms9MjAm/Yz11R3RseUJtWkJt/YnN4a2dfNVRiTUF1/a25pNHplTmxZam1r/TUxvSjZUcUhzPQ" },
  { label: "Aviator", tag: "HOT", icon: Play, href: "/casino", accent: "var(--gold-hi)", image: "https://imgs.search.brave.com/uw56ovWiO0ZF8LataEaQx-0W7GMr8Amct7TP-BQrBIc/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9hdmlh/dG9yLXNwb3J0eWJl/dC5jb20vd3AtY29u/dGVudC91cGxvYWRz/LzIwMjQvMTIvYXZp/YXRvci1wbGFuZS53/ZWJw" },
  { label: "Gifts", icon: Gift, href: "/promos", accent: "var(--nature)" , image : "https://imgs.search.brave.com/O7qNPrzqbpPLfxXjN8DmKiOQDezJ2pAi-g6ia4lx-vo/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9tZWRp/YS50aGVldmVyeW1v/bS5jb20vd3AtY29u/dGVudC91cGxvYWRz/LzIwMjQvMTAvMDcw/OTExNTcvdGhlLWV2/ZXJ5bW9tLWZlYXR1/cmUtYmVzdC1zcG9y/dHMtZ2lmdHMuanBn"},
  { label: "Promotions", icon: Sparkles, href: "/promos", accent: "var(--gold-hi)" , image : "https://imgs.search.brave.com/Gw7usgFPh3xn1HokVRP7Ct2KnNgy2X9awhUKmXo9DAY/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9iYWd3/ZWxscHJvbW90aW9u/cy5jb20vd3AtY29u/dGVudC91cGxvYWRz/LzIwMTQvMDMvc3Bv/cnRzLmpwZw"},
  { label: "iBot AI", tag: "NEW", icon: Zap, href: "/promos", accent: "var(--nature)", image : "https://imgs.search.brave.com/pr5ceCZvgQeizjDG5rM0z46YogA2m49oNoKvLrhdlSA/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9maXZl/cnItcmVzLmNsb3Vk/aW5hcnkuY29tL3Rf/Z2lnX2NhcmRzX3dl/YixxX2F1dG8sZl9h/dXRvL2dpZ3MvNDgw/NzkxODg1L29yaWdp/bmFsLzQxMDhmOWUx/ZGQ4NGUwN2FiNDA2/YWY0MzRhODI4M2Y2/N2E0ZGU0NDgucG5n" },
  { label: "sFootball", icon: Gamepad2, href: "/casino", accent: "var(--gold-hi)", image : "https://imgs.search.brave.com/zkK1oCBSlA5bGvFCXN32Ot2TxeFw47168JObfSeFUUU/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9wbGF5/LWxoLmdvb2dsZXVz/ZXJjb250ZW50LmNv/bS9vLWlzY0YwdTl1/QW05amFlbXMyNW5O/VXczY0lneHJ6SUVM/VlR5LURQS2IzQ3hO/MF9ITEJjYVdvZWV0/WmNhX0JCT3BfdV9O/WGV5UUt6MG5Ka1hp/Rk1rQT13MjQwLWg0/ODAtcnc" },
  { label: "Virtual", icon: Layers3, href: "/casino", accent: "var(--nature)", image : "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSl8Yw3V1VMyxXFsR3qBU580V6w85t22IdvCXSObdpB5g&s" },
];

function PromoCarousel() {
  return (
    <div className="promo-carousel">
      {PROMO_CARDS.map((p) => {
        const Icon = p.icon;
        const style: CSSProperties & Record<string, string> = { ["--accent"]: p.accent };
        if (p.image) { style.backgroundImage = `url("${p.image}")`; style.backgroundSize = "cover"; style.backgroundPosition = "center"; }
        return (
          <Link key={p.label} href={p.href} className="promo-card-chip" style={style}>
            {p.tag && <span className="promo-tag">{p.tag}</span>}
            {!p.image && <span className="promo-icon-wrap"><Icon size={12} /></span>}
            <span className="promo-label">{p.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

const ICON_NAV_ITEMS: { label: string; icon: typeof Flame; href: string }[] = [
  { label: "All Sports", icon: LayoutGrid, href: "/sports" },
  { label: "Live", icon: Radio, href: "/live" },
  { label: "Booking", icon: ScanBarcode, href: "/booking-code" },
  { label: "Casino", icon: Gamepad2, href: "/casino" },
  { label: "Promos", icon: Gift, href: "/promos" },
  { label: "More", icon: MoreHorizontal, href: "/account" },
];

/** Icon quick-links for the homepage. The former Today/Football pill row is removed. */
function IconNavAndPills() {
  return (
    <div className="joined-nav-block">
      <nav className="icon-nav-row" aria-label="Quick links">
        {ICON_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} href={item.href} className="icon-nav-item">
              <span className="icon-nav-icon"><Icon size={19} /></span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function HomeQuickNav() {
  return (
    <div className="home-quick-nav">
      <PromoCarousel />
      <IconNavAndPills />
    </div>
  );
}

function TrustPanel(){ return <section className="panel simple-card" style={{padding:'20px 18px'}}><div className="side-title" style={{padding:'0 0 12px', border:'none'}}><ShieldCheck size={15}/> Why Super Bet</div><p className="muted" style={{fontSize:11, lineHeight:1.7}}>Real odds sourced live from our sports data feed. Matches without live pricing yet are clearly marked as estimated so you always know which prices are confirmed and which are a placeholder.</p></section> }
function Hero(){
  return <>
    <section className="hero">
      <div className="hero-shapes" aria-hidden="true">
        <span className="hero-shape hero-shape-a"/>
        <span className="hero-shape hero-shape-b"/>
        <span className="hero-dots"/>
      </div>
      <div className="hero-photo-mask"><img src={hero}/></div>
      <div className="hero-sheen"/>
      <div className="hero-shimmer"/>
      <span className="hero-live-chip"><i className="live-dot"/> Live markets updating now</span>
      <div className="hero-copy">
        <h1>Build your<br/><span className="hero-mark"><em>winning</em></span> slip.</h1>
        <p className="hero-subtext">Live odds. Smarter bets. Better wins.</p>
        <Link href="/sports" className="hero-bet-now">Bet now <ChevronRight size={15}/></Link>
        <div className="hero-stats">
          <span><Radio size={13}/> Live odds, every match</span>
          <span><Zap size={13}/> Instant bet placement</span>
          <span><ShieldCheck size={13}/> Secure & licensed</span>
        </div>
      </div>
      <div className="hero-progress"><span className="active"/><span/><span/></div>
    </section>
    <img className="wide-banner" src={virtualBanner}/>
  </>
}
function BetSlip({ picks, setPicks, onPlace }: { picks: Pick[]; setPicks: (p: Pick[])=>void; onPlace: (stake: number)=>Promise<void> }){ const [stake,setStake]=useState(10); const [placing,setPlacing]=useState(false); const [notice,setNotice]=useState(""); const total=picks.reduce((a,b)=>a*b.odd,1); const place=async()=>{ setNotice(""); setPlacing(true); try { await onPlace(stake); setPicks([]); setNotice("Bet placed successfully."); } catch (error) { setNotice(error instanceof ApiError ? error.message : "We could not place this bet. Please try again."); } finally { setPlacing(false); } }; return <aside className="betslip panel"><div className="betslip-tabs"><span className="active">Betslip</span><span>Cashout</span></div>{picks.length===0?<div className="empty-slip"><WalletCards size={34}/><h3>Your betslip is empty</h3><p>{notice || "Click on the odds to add selections and build your bet."}</p><Link href="/" className="ghost-button">Browse matches</Link></div>:<><div className="slip-header"><span>Singles</span><button onClick={()=>setPicks([])}>Clear all</button></div>{picks.map(p=><div className="slip-pick" key={`${p.id}-${p.selection}`}><div><b>{p.match}</b><small>{p.market} · {p.selection}</small></div><strong>{p.odd.toFixed(2)}</strong><button onClick={()=>setPicks(picks.filter(x=>x!==p))}><X size={14}/></button></div>)}<div className="slip-summary"><div><span>Potential return</span><b>GHS {(stake*total).toFixed(2)}</b></div><label>Stake<input value={stake} onChange={e=>setStake(Number(e.target.value)||0)} type="number" min="1"/></label><button className="gold-button full" onClick={place} disabled={placing}>{placing ? "Placing…" : "Place bet"} <Zap size={15}/></button>{notice&&<small className="auth-notice" role="alert">{notice}</small>}</div></>}</aside> }
/**
 * Floating betslip shortcut — hidden until there's at least one selection,
 * then jumps straight to the betslip page. Kept deliberately simple: one
 * icon, one count badge, no label clutter.
 */
function BetslipFAB({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Link
      href="/betslip"
      aria-label={`Open betslip, ${count} selection${count === 1 ? "" : "s"}`}
      style={{
        position: "fixed",
        bottom: "calc(64px + 16px)",
        right: 18,
        zIndex: 120,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 54,
        height: 54,
        borderRadius: "50%",
        background: "linear-gradient(135deg, var(--gold-hi, #1e6bff), #1246a8)",
        boxShadow: "0 8px 22px rgba(30,107,255,0.4)",
        color: "#fff",
        textDecoration: "none",
        transition: "transform 0.15s ease",
        animation: "fab-pop .22s ease",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1.08)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
    >
      <span
        style={{
          position: "absolute", top: -4, right: -4, minWidth: 20, height: 20, padding: "0 4px",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "#141414", color: "#fff", fontSize: 10, fontWeight: 900,
          border: "2px solid #fff", borderRadius: 999,
        }}
      >
        {count > 99 ? "99+" : count}
      </span>
      <Ticket size={22} strokeWidth={2.2} />
    </Link>
  );
}


function AdminFeaturedGames({ picks, onPick }: { picks: Pick[]; onPick: (p: Pick) => void }) {
  const [matches, setMatches] = useState<EnrichedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    fetchAdminMatches().then((rows) => {
      if (!active) return;
      const visible = rows.filter((m) => !["FINISHED", "ENDED", "COMPLETED", "CANCELLED", "POSTPONED"].includes(String(m.status ?? "").toUpperCase()));
      setMatches(visible);
    }).catch(() => { if (active) setMatches([]); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  if (loading || matches.length === 0) return null;
  const hasDraw = (m: EnrichedMatch) => !["basketball", "nfl", "baseball", "mma"].includes(String(m.sport ?? "").toLowerCase());
  const choose = (m: EnrichedMatch, selection: "1" | "X" | "2", odd: number) => {
    if (!odd || odd <= 0) return;
    onPick({ id: m.id, match: `${m.homeTeam} vs ${m.awayTeam}`, market: "1X2", selection, odd, league: m.league, homeTeam: m.homeTeam, awayTeam: m.awayTeam, kickoffAt: m.kickoffAt, isLive: isMatchLive(m), scoreHome: m.scoreHome, scoreAway: m.scoreAway });
  };
  return <section className="admin-featured-games"><style>{`.admin-featured-games{margin:22px 0 26px;border:1px solid rgba(109,228,157,.28);border-radius:18px;background:linear-gradient(135deg,rgba(12,31,27,.96),rgba(9,17,24,.98));overflow:hidden;box-shadow:0 14px 34px rgba(0,0,0,.18)}.admin-featured-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:17px 19px;border-bottom:1px solid rgba(112,226,157,.16)}.admin-featured-kicker{display:flex;align-items:center;gap:7px;color:#7fe8a5;font-size:10px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.admin-featured-head h2{margin:5px 0 0;color:#f3fff7;font-size:20px;line-height:1.1}.admin-featured-head p{margin:6px 0 0;color:#8da8a0;font-size:11px}.admin-featured-count{border:1px solid rgba(119,231,160,.42);background:#153a28;color:#b9f5c9;border-radius:999px;padding:7px 10px;font-size:10px;font-weight:900}.admin-featured-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:13px}.admin-game-card{position:relative;min-width:0;padding:14px;border:1px solid #263c43;border-radius:14px;background:linear-gradient(145deg,#111f27,#0c151b);transition:transform .18s,border-color .18s,box-shadow .18s}.admin-game-card:hover{transform:translateY(-2px);border-color:#62dd94;box-shadow:0 10px 22px rgba(33,168,91,.14)}.admin-game-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}.admin-game-league{color:#8ca7a2;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.admin-game-tags{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}.admin-game-tag{font-size:8px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;padding:4px 6px;border-radius:5px;line-height:1}.admin-game-tag.hot{color:#ffd3a0;background:#5a2d16;border:1px solid #d17737}.admin-game-tag.boom{color:#c8dcff;background:#202f62;border:1px solid #6584e6}.admin-game-tag.win{color:#baf6c9;background:#174c31;border:1px solid #5cd88d}.admin-game-fixture{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;margin:14px 0 12px}.admin-game-team{text-align:center;min-width:0}.admin-game-team img{width:43px;height:43px;object-fit:contain;display:block;margin:0 auto 7px;border-radius:12px}.admin-game-team b{display:block;color:#f0f7f2;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.admin-game-mid{text-align:center;color:#829c99;font-size:10px}.admin-game-mid strong{display:block;color:#b9f0c8;font-size:11px}.admin-game-mid small{display:block;margin-top:4px;font-size:9px}.admin-game-odds{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.admin-game-odd{border:1px solid #2d4850;background:#14262d;color:#bdeed0;border-radius:7px;padding:7px 4px;cursor:pointer;font-size:10px;font-weight:900}.admin-game-odd:hover,.admin-game-odd.selected{background:#235d3b;border-color:#6ee6a0;color:#fff}.admin-game-odd:disabled{opacity:.45;cursor:not-allowed}.admin-game-odd span{display:block;color:#79958e;font-size:8px;margin-bottom:2px}.admin-game-odd:hover span,.admin-game-odd.selected span{color:#bceecb}.admin-game-special{display:inline-flex;align-items:center;gap:4px;margin-top:10px;color:#78dfa0;font-size:9px;font-weight:800}.admin-featured-empty{padding:18px;color:#91a7a0;font-size:11px}@media(max-width:720px){.admin-featured-grid{grid-template-columns:1fr}.admin-featured-head{align-items:flex-start;flex-direction:column}}`}</style><div className="admin-featured-head"><div><div className="admin-featured-kicker"><Sparkles size={13}/> Admin-created games</div><h2>Featured specials</h2><p>Exclusive fixtures created by the Super Bet operations team.</p></div><span className="admin-featured-count">{matches.length} active</span></div><div className="admin-featured-grid">{matches.map((m) => { const draw = hasDraw(m); const values: Array<["1"|"X"|"2", string, number]> = [["1", "HOME", m.oddsMap?.home ?? 0], ...(draw ? [["X", "DRAW", m.oddsMap?.draw ?? 0] as ["X", string, number]] : []), ["2", "AWAY", m.oddsMap?.away ?? 0]]; return <article className="admin-game-card" key={m.id}><div className="admin-game-top"><span className="admin-game-league">{m.league || m.sport || "Admin special"}</span><div className="admin-game-tags"><span className="admin-game-tag hot">HOT</span><span className="admin-game-tag boom">BOOM</span><span className="admin-game-tag win">WIN</span></div></div><Link href={`/match/${m.id}?sport=${encodeURIComponent(m.sport ?? "football")}&admin=1`} className="admin-game-fixture"><div className="admin-game-team"><img src={m.displayHomeLogo} alt="" loading="lazy"/><b>{m.homeTeam}</b></div><div className="admin-game-mid"><strong>{isMatchLive(m) ? "LIVE" : "VS"}</strong><small>{formatKickoff(m.kickoffAt)}</small></div><div className="admin-game-team"><img src={m.displayAwayLogo} alt="" loading="lazy"/><b>{m.awayTeam}</b></div></Link><div className="admin-game-odds">{values.map(([label, name, value]) => { const selected = picks.some((p) => p.id === m.id && p.market === "1X2" && p.selection === label); return <button type="button" key={label} className={`admin-game-odd${selected ? " selected" : ""}`} disabled={!value || value <= 0} onClick={() => choose(m, label, value)}><span>{name}</span>{value ? value.toFixed(2) : "—"}</button>; })}</div><span className="admin-game-special"><Zap size={11}/> Admin special</span></article>; })}</div></section>;
}

function Home({ onPick, picks, setPicks, onPlace }: {onPick:(p:Pick)=>void;picks:Pick[];setPicks:(p:Pick[])=>void;onPlace:(stake:number)=>Promise<void>}){
  return <><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><main className="wrap page-grid"><SideNav/><div className="main-column"><Hero/><HomeQuickNav/><AdminFeaturedGames picks={picks} onPick={onPick}/><Sportsbook picks={picks} onPick={onPick} /></div><div className="right-column"><BetSlip picks={picks} setPicks={setPicks} onPlace={onPlace}/><TrustPanel/></div></main><Footer/></>
}
function Casino(){ return <><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><main className="wrap casino-page"><div className="casino-hero"><div className="hero-shapes"><span className="hero-shape hero-shape-a"/><span className="hero-shape hero-shape-b"/><span className="hero-dots"/></div><img src={casinoFeature}/><div><span className="eyebrow">Super Bet originals</span><h1>Casino games<br/><em>coming soon.</em></h1><p>We're building out real casino games backed by a live provider — no placeholder games shown here in the meantime.</p></div></div><section className="panel simple-card" style={{marginTop:24}}><Sparkles size={24}/><h3>Nothing to show yet, honestly</h3><p>Rather than fill this page with demo game tiles that don't actually work, we're leaving it empty until real casino games are integrated. Check back soon, or head to the <Link href="/" style={{color:'var(--gold-hi)',fontWeight:800}}>sportsbook</Link> in the meantime.</p></section></main><Footer/></> }

function SimplePage({title,kicker,children}:{title:string;kicker:string;children:any}){ return <><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><main className="wrap simple-page"><div className="simple-hero"><span className="eyebrow">{kicker}</span><h1>{title}</h1></div><div className="simple-grid">{children}</div></main><Footer/></> }
function WalletPage(){ return <><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><WalletCenter/><Footer/></> }
function DepositPage(){ return <><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><DepositCenter/><Footer/></> }
function BetsRoute({ tab, hideHeader = false }: { tab: "open" | "history"; hideHeader?: boolean }){ return <>{!hideHeader && <Header onMenu={()=>document.body.classList.toggle("menu-open")}/>}<BetsCenter defaultTab={tab}/><Footer/></> }
function TicketDetailsRoute({ id }: { id: string }){ return <TicketDetailsPage id={id}/> }

function AdminRoute(){ return <AdminPanelPage/>; }
function App(){ const [picks,setPicks]=useState<Pick[]>([]); const onPick=(p:Pick)=>setPicks(prev=>prev.some(x=>x.id===p.id&&x.selection===p.selection)?prev.filter(x=>!(x.id===p.id&&x.selection===p.selection)):[...prev,p]); const onPlace=async(stake:number)=>{ if(!window.localStorage.getItem("accessToken")){ window.location.href="/login"; return; } if(picks.some((pick)=>!isBettableMatchId(pick.id))){ throw new ApiError("One selection is no longer available for betting. Remove it and choose a match with current odds.",422); } await api.bets.place({stake,currency:"GHS",selections:picks.map((pick)=>({matchId:pick.id,market:pick.market,selection:pick.selection,submittedOdds:pick.odd}))}); }; return <><WinCelebrationModal/><Switch><Route path="/admin-guide"><AdminEntryGuidePage/></Route><Route path="/admin"><AdminRoute/></Route><Route path="/super-admin"><SuperAdminPage/></Route><Route path="/casino"><Casino/></Route><Route path="/wallet"><WalletPage/></Route><Route path="/deposit"><DepositPage/></Route><Route path="/promos"><SimplePage title="Promotions" kicker="More value in every play"><section className="promo-card"><span className="eyebrow">Welcome offer</span><h2>Play the smart side of sport.</h2><p>Keep an eye on the latest boosts, free bets, and loyalty rewards.</p><Link href="/wallet" className="gold-button">View offers <ChevronRight size={15}/></Link></section></SimplePage></Route><Route path="/affiliate"><SimplePage title="Affiliate centre" kicker="Grow with Super Bet"><section className="panel simple-card"><Layers3 size={24}/><h2>Your referral toolkit</h2><p>Invite friends, track activity, and request affiliate payouts from one clear workspace.</p></section></SimplePage></Route><Route path="/login"><AccountAuth mode="login" /></Route><Route path="/register"><AccountAuth mode="register" /></Route><Route path="/support"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><main className="wrap support-page"><SupportCenter/></main><Footer/></></Route><Route path="/help"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><main className="wrap support-page"><SupportCenter/></main><Footer/></></Route><Route path="/bets"><BetsRoute tab="history" hideHeader/></Route><Route path="/betslip"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><BetslipPage picks={picks} setPicks={setPicks} onPlace={onPlace}/><Footer/></></Route><Route path="/account"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><AccountCenter/><Footer/></></Route><Route path="/profile"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><ProfileCenter/><Footer/></></Route><Route path="/sports"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><SportsPage picks={picks} onPick={onPick}/><Footer/></></Route><Route path="/match/:id">{(params)=><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><MatchDetailsRoute id={params.id ?? ""} picks={picks} onPick={onPick}/><Footer/></>}</Route><Route path="/transactions"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><TransactionsPage/><Footer/></></Route><Route path="/bets/:id">{(params)=><TicketDetailsRoute id={params.id ?? ""}/>}</Route><Route path="/open-bets"><BetsRoute tab="open"/></Route><Route path="/notifications"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><NotificationsPage/><Footer/></></Route><Route path="/favorites"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><FavoritesPage/><Footer/></></Route><Route path="/settings"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><SettingsPage/><Footer/></></Route><Route path="/security"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><SecurityPage/><Footer/></></Route><Route path="/responsible-gaming"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><ResponsibleGamingPage/><Footer/></></Route><Route path="/search"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><SearchPage/><Footer/></></Route><Route path="/booking-code"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><BookingCodePage picks={picks} setPicks={setPicks}/><Footer/></></Route><Route path="/live"><SimplePage title="Live betting" kicker="Follow the moment"><div className="main-column" style={{gridColumn:"1 / -1"}}><Sportsbook picks={picks} onPick={onPick} mode="live-only" /></div><div style={{gridColumn:"1 / -1"}}><BetSlip picks={picks} setPicks={setPicks} onPlace={onPlace}/></div></SimplePage></Route><Route path="/"><Home onPick={onPick} picks={picks} setPicks={setPicks} onPlace={onPlace}/></Route><Route><NotFound/></Route></Switch><MobileBottomNav/><BetslipFAB count={picks.length}/></> }

export default function Root(){ return <SessionProvider><App/></SessionProvider> }
