// Super UI / Black Gold Fieldhouse: reference-faithful sportsbook terminal, sharp information density, purposeful motion, green live/action accents.
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Link, Route, Switch, useLocation, useSearch } from "wouter";
import api, { ApiError } from "./lib/api";
import { isBettableMatchId } from "./lib/sportsbook";
import { adminCrestFor } from "./lib/logoCatalog";
import Sportsbook, { SPORT_TABS, type Pick } from "./components/Sportsbook";
import PlayBetHome from "./components/PlayBetHome";
import "./playbet.css";
import { fetchAdminMatches, formatKickoff, isMatchLive, type EnrichedMatch, type SportKey } from "./lib/sportsbook";
const WalletCenter = lazy(() => import("./components/WalletCenter"));
const DepositCenter = lazy(() => import("./components/DepositCenter"));
const SupportCenter = lazy(() => import("./components/SupportCenter"));
const TermsAndConditionsPage = lazy(() => import("./components/LegalPolicyPages").then((m) => ({ default: m.TermsAndConditionsPage })));
const RefundPolicyPage = lazy(() => import("./components/LegalPolicyPages").then((m) => ({ default: m.RefundPolicyPage })));
const BetslipPage = lazy(() => import("./components/BetslipPage"));
const AffiliatePage = lazy(() => import("./components/AffiliatePage"));
const AccountCenter = lazy(() => import("./components/AccountCenter"));
const ProfileCenter = lazy(() => import("./components/ProfileCenter"));
import MobileBottomNav from "./components/MobileBottomNav";
const SportsPage = lazy(() => import("./components/SportsPage"));
const MatchDetailsPage = lazy(() => import("./components/MatchDetailsPage"));
const TransactionsPage = lazy(() => import("./components/TransactionsPage"));
const BetsCenter = lazy(() => import("./components/BetsCenter"));
const TicketDetailsPage = lazy(() => import("./components/TicketDetailsPage"));
import WinCelebrationModal from "./components/WinCelebrationModal";
const NotificationsPage = lazy(() => import("./components/NotificationsPage"));
const FavoritesPage = lazy(() => import("./components/FavoritesPage"));
const SettingsPage = lazy(() => import("./components/SettingsPage"));
const SecurityPage = lazy(() => import("./components/SecurityPage"));
const ResponsibleGamingPage = lazy(() => import("./components/ResponsibleGamingPage"));
const SearchPage = lazy(() => import("./components/SearchPage"));
const BookingCodePage = lazy(() => import("./components/BookingCodePage"));
const AdminPanelPage = lazy(() => import("./pages/AdminPanelPage"));
const AdminEntryGuidePage = lazy(() => import("./pages/AdminEntryGuidePage"));
const SuperAdminPage = lazy(() => import("./pages/SuperAdminPage"));
import { SessionProvider, useSession, pickUserField } from "./lib/session";
import { flagForCountry, codeLabel, flagImageUrl, COUNTRY_OPTIONS } from "./lib/countries";
const NotFound = lazy(() => import("./pages/NotFound"));
import { Bell, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clock3, Copy, CreditCard, Eye, EyeOff, Flame, Gamepad2, Gift, Headphones, Info, Layers3, LayoutGrid, Minus, MoreHorizontal, Play, Plus, Radio, ScanBarcode, Search, ShieldCheck, Sparkles, Ticket, Trophy, UserRound, WalletCards, X, Zap } from "lucide-react";

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
const mark = "/playbet/logo.png";

const nav = [["Sports", "/"], ["Live", "/live"], ["Casino", "/casino"], ["Promos", "/promos"], ["Affiliate", "/affiliate"]];

function Header({ onMenu }: { onMenu: () => void }) {
  const [location] = useLocation();
  const { balance, token } = useSession();
  void onMenu;
  return (
    <header className="pb-hdr1 pb-root">
      <div className="pb-hdr1-in">
        <Link href="/" className="pb-hdr1-logo" aria-label="PlayBet home"><img src={mark} alt="PlayBet" /></Link>
        <nav id="primary-navigation" className="pb-hdr1-nav">
          {nav.map(([label, href]) => <Link key={href} href={href} className={location === href ? "pb-on" : ""} onClick={() => document.body.classList.remove("menu-open")}>{label}</Link>)}
        </nav>
        <div className="pb-hdr1-right">
          <button className="pb-hdr1-search" aria-label="Search" onClick={() => { window.location.href = "/search"; }}><Search size={19} /></button>
          {token ? <>
            <Link href="/deposit" className="pb-bal-pill" aria-label="Wallet balance — tap to deposit"><span className="pb-bal-label">Balance</span> <b>{balance !== null ? `GHS ${balance.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "GHS 0.00"}</b><span className="pb-bal-plus" aria-hidden="true"><Plus size={13} strokeWidth={3.2} /></span></Link>
            <Link href="/account" className="pb-hdr1-account" aria-label="My account"><UserRound size={19} /></Link>
          </> : <>
            <Link href="/login" className="pb-btn-login-h">Login</Link>
            <Link href="/register" className="pb-btn-signup-h">Sign Up</Link>
          </>}
        </div>
      </div>
    </header>
  );
}
function Footer() {
  return (
    <footer className="pb-ftr pb-root">
      <div className="pb-ftr-in">
        <div className="pb-ftr-brand">
          <img className="pb-logo-img" src={mark} alt="PlayBet" />
          <p className="pb-ftr-tag">Ghana's home of bold odds. Bet live, win big, cash out fast.</p>
          <div className="pb-ftr-social">
            <a href="/support" aria-label="X"><svg viewBox="0 0 24 24"><path d="M18 2h4l-8 9 9 11h-7l-5-7-6 7H1l8-9L1 2h7l5 6z" fill="currentColor" /></svg></a>
            <a href="/support" aria-label="Instagram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" /></svg></a>
            <a href="/support" aria-label="Facebook"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 8h3V5h-3c-2 0-3 1-3 3v2H8v3h3v9h3v-9h3l1-3h-4V8z" /></svg></a>
            <a href="/support" aria-label="Telegram"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 4L3 11l6 2 2 7 4-5 6 2z" /></svg></a>
          </div>
        </div>
        <div className="pb-ftr-cols">
          <div><h4>Sports</h4><Link href="/">Football</Link><Link href="/live">Live Betting</Link><Link href="/sports">Basketball</Link><Link href="/sports">Tennis</Link></div>
          <div><h4>Company</h4><Link href="/">About Us</Link><Link href="/promos">Promotions</Link><Link href="/support">FAQ</Link><Link href="/support">Contact</Link></div>
          <div><h4>Support</h4><Link href="/support">Help Centre</Link><Link href="/booking-code">Verify Bet</Link><Link href="/responsible-gaming">Responsible Gaming</Link><Link href="/terms-and-conditions">Terms</Link></div>
        </div>
      </div>
      <div className="pb-ftr-pay">
        <span>We accept</span>
        <div className="pb-pay-grid"><span className="pb-pay">MTN MoMo</span><span className="pb-pay">Telecel</span><span className="pb-pay">AirtelTigo</span><span className="pb-pay">VISA</span><span className="pb-pay">Mastercard</span></div>
      </div>
      <div className="pb-ftr-legal">
        <div className="pb-ftr-18">18+</div>
        <p>Age 18 and above only. Play responsibly. Betting can be addictive — know your limits.</p>
        <p>© 2026 PlayBet · Licensed by the Gaming Commission of Ghana</p>
      </div>
    </footer>
  );
}

type AuthForm = { identifier: string; password: string; confirm: string; firstName: string; lastName: string; phone: string; referral: string; country: string };

function AuthField({ label, value, onChange, type = "text", placeholder = "" }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return <label className="auth-field"><span>{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} type={type} placeholder={placeholder} /></label>;
}

function AuthPasswordField({ confirm = false, value, onChange, visible, onToggleVisible, password, passwordStrong }: { confirm?: boolean; value: string; onChange: (v: string) => void; visible: boolean; onToggleVisible: () => void; password?: string; passwordStrong?: boolean }) {
  return <label className="auth-field"><span>{confirm ? "Confirm password" : "Password"}</span><div className="auth-input-wrap"><input value={value} onChange={(e) => onChange(e.target.value)} type={visible ? "text" : "password"} placeholder={confirm ? "Repeat your password" : "At least 8 characters"} /><button type="button" onClick={onToggleVisible} aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>{!confirm && password && <small className={passwordStrong ? "valid-text" : "error-text"}>{passwordStrong ? "Strong password" : "Use 8+ characters with a letter and number"}</small>}</label>;
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
  return <><Header onMenu={() => document.body.classList.toggle("menu-open")} /><main className="auth-page"><div className="auth-intro"><span className="eyebrow">{isLogin ? "Welcome back" : "Account setup"}</span><h1>{isLogin ? <>Bet smarter.<br/><em>Stay ahead.</em></> : <>Your next win<br/><em>starts here.</em></>}</h1><p>{isLogin ? "Access your balance, betslip, live markets, and PlayBet rewards." : "Create your PlayBet account in under two minutes and make every market count."}</p><div className="auth-benefits"><span><ShieldCheck size={16}/> Secure account</span><span><Zap size={16}/> Fast markets</span><span><Gift size={16}/> Exclusive offers</span></div></div><section className="panel auth-card auth-card-premium"><div className="auth-card-head"><div className="auth-crown"><Zap size={20}/></div><div><span className="eyebrow">PlayBet Ghana</span><h2>{isLogin ? "Log in" : step === 1 ? "Create your account" : "Complete your profile"}</h2></div></div>{!isLogin && <div className="auth-steps"><span className={step === 1 ? "active" : "done"}>1 <small>Account</small></span><i className={step === 2 ? "active" : ""}/><span className={step === 2 ? "active" : ""}>2 <small>Profile</small></span></div>}<form onSubmit={submit}>{isLogin && <><AuthField label="Phone or email" value={form.identifier} onChange={(v) => update("identifier", v)} placeholder="name@example.com" /><AuthPasswordField value={form.password} onChange={(v) => update("password", v)} visible={showPassword} onToggleVisible={() => setShowPassword(!showPassword)} password={form.password} passwordStrong={passwordStrong} /><div className="auth-row"><label className="check-row"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me</label><Link href="/help">Forgot password?</Link></div></>}{!isLogin && step === 1 && <><AuthField label="Email address" value={form.identifier} onChange={(v) => update("identifier", v)} type="email" placeholder="name@example.com" /><AuthPasswordField value={form.password} onChange={(v) => update("password", v)} visible={showPassword} onToggleVisible={() => setShowPassword(!showPassword)} password={form.password} passwordStrong={passwordStrong} /><AuthPasswordField confirm value={form.confirm} onChange={(v) => update("confirm", v)} visible={showConfirm} onToggleVisible={() => setShowConfirm(!showConfirm)} /></>}{!isLogin && step === 2 && <><div className="auth-two-col"><AuthField label="First name" value={form.firstName} onChange={(v) => update("firstName", v)} placeholder="Kwame" /><AuthField label="Last name" value={form.lastName} onChange={(v) => update("lastName", v)} placeholder="Mensah" /></div><AuthField label="Phone number" value={form.phone} onChange={(v) => update("phone", v)} type="tel" placeholder="+233 24 000 0000" /><label className="auth-field"><span>Country</span><select value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}>{COUNTRY_OPTIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label><AuthField label="Referral code" value={form.referral} onChange={(v) => update("referral", v)} placeholder="Optional" /><label className="check-row terms-row"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} /> I agree to the <Link href="/terms-and-conditions">terms and conditions</Link> and <Link href="/responsible-gaming">responsible gaming policy</Link></label></>}<button className="gold-button full auth-submit" type="submit" disabled={submitting}>{submitting ? "Connecting…" : isLogin ? "Log in to PlayBet" : step === 1 ? "Continue" : "Create account"}<ChevronRight size={16}/></button>{notice && <div className="auth-notice" role="alert">{notice}</div>}</form>{!isLogin && step === 2 && <button className="auth-back" type="button" onClick={() => setStep(1)}>Back to account details</button>}<p className="auth-switch">{isLogin ? "New to PlayBet?" : "Already have an account?"} <Link href={isLogin ? "/register" : "/login"}>{isLogin ? "Create an account" : "Log in"}</Link></p><div className="auth-safe"><ShieldCheck size={15}/> Your information is protected with secure account controls.</div></section></main><Footer /></>;
}

function Router(){ return <footer><div className="wrap footer-grid"><div><Link href="/" className="brand footer-brand"><img src={mark} alt="PlayBet" /></Link><p className="muted">The smarter way to follow the moment.</p><div className="partner-badge"><Trophy size={24}/><span>Official<br/>Sports Partner</span></div></div><div><h4>Bet with confidence</h4><Link href="/">About PlayBet</Link><Link href="/promos">Promotions</Link><Link href="/wallet">Responsible gaming</Link><Link href="/">Privacy policy</Link></div><div><h4>How to play</h4><Link href="/">FAQ</Link><Link href="/">Bet builder</Link><Link href="/live">Live betting</Link><Link href="/casino">Games</Link></div><div><h4>Connect with us</h4><Link href="/"> <Headphones size={14}/> Customer support</Link><Link href="/affiliate"><Copy size={14}/> Affiliate centre</Link><Link href="/login"><Bell size={14}/> Get notifications</Link></div></div><div className="footer-bottom wrap"><span>18+ &nbsp; Play responsibly. Gambling can be addictive.</span><span>© 2026 PlayBet. All rights reserved.</span></div></footer> }
function SideNav(){ const leagues:[[string,string],...Array<[string,string]>]=[["Premier League","/"],["UEFA Champions League","/live"],["La Liga","/"],["Serie A","/"],["Bundesliga","/"],["Ligue 1","/"],["Ghana Premier League","/"]]; return <aside className="side-nav panel"><div className="side-title"><Flame size={15}/> Top leagues</div>{leagues.map(([name,href])=><Link href={href} key={name}>{name}<ChevronRight size={14}/></Link>)}<div className="side-title spaced"><Gift size={15}/> Quick links</div>{[["Jackpot","/promos"],["Live TV","/live"],["Sports calendar","/"],["Bet builder","/live"]].map(([x,href])=><Link href={href} key={x}>{x}<ChevronRight size={14}/></Link>)}</aside> }

// ---------------------------------------------------------------------------
// Home quick-nav shell — promo carousel, icon quick-links, quick filter
// pills, feature tabs, and a league icon strip sitting above the match list,
// mirroring the layout pattern of the reference screenshot (promo cards →
// icon nav → filter pills → tabs → league strip → matches) but built from
// PlayBet's own existing features rather than a competitor's branding.
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
  { label: "Soccer", icon: Trophy, href: "/sports" },
  { label: "Today", icon: CalendarDays, href: "/" },
  { label: "Live", icon: Radio, href: "/live" },
  { label: "Games", icon: Gamepad2, href: "/casino" },
  { label: "Booking Codes", icon: Ticket, href: "/booking-code" },
  { label: "Promos", icon: Gift, href: "/promos" },
];

/** Icon quick-links for the homepage. The former Today/Football pill row is removed. */
function IconNavAndPills() {
  return (
    <nav className="qa-card" aria-label="Quick links">
      {ICON_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <Link key={item.label} href={item.href} className="qa-item">
            <span className="qa-icon"><Icon size={20} /></span>
            <span className="qa-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function HomeQuickNav() {
  return (
    <div className="home-quick-nav">
      <IconNavAndPills />
    </div>
  );
}

function TrustPanel(){ return <section className="panel simple-card" style={{padding:'20px 18px'}}><div className="side-title" style={{padding:'0 0 12px', border:'none'}}><ShieldCheck size={15}/> Why PlayBet</div><p className="muted" style={{fontSize:11, lineHeight:1.7}}>Real odds sourced live from our sports data feed. Matches without live pricing yet are clearly marked as estimated so you always know which prices are confirmed and which are a placeholder.</p></section> }
// ---------------------------------------------------------------------------
// HomeHero — MSport-style hero banner carousel (owner, 2026-10-09): a dark
// banner with a gold tag pill, big Barlow Condensed headline, gold CTA and
// carousel dots, auto-rotating. Slides point at real PlayBet pages only.
// ---------------------------------------------------------------------------
// Hero imagery (owner, 2026-10-09): ONE carousel of SEVEN slides, every
// slide a full background image with its own copy — and the LAST slide is
// the iPhone 16 prize slide, its photo as the background (no separate
// prize box). All image URLs verified live.
const HERO_SLIDES: { tag: string; title: React.ReactNode; sub: string; cta: string; href: string; image: string; pos?: string }[] = [
  { tag: "PlayBet Football", title: "Bet on the big leagues", sub: "Premier League, La Liga, Champions League — every big match with live odds.", cta: "Bet now", href: "/sports", image: "https://images.unsplash.com/photo-1522778119026-d647f0596c20?q=80&w=1200&auto=format&fit=crop" },
  { tag: "Live Betting", title: "Live odds, every minute", sub: "In-play markets update second by second as the action happens.", cta: "Go live", href: "/live", image: "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?q=80&w=1200&auto=format&fit=crop", pos: "center 30%" },
  { tag: "Premier League", title: "The Prem is home", sub: "Every Premier League match, every weekend — priced and ready to back.", cta: "See matches", href: "/", image: "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5a/Premier_League_Newcastle-Arsenal_2023-05-07_24.jpg/960px-Premier_League_Newcastle-Arsenal_2023-05-07_24.jpg", pos: "center 22%" },
  { tag: "Top 10 Leagues", title: "Europe's best, one board", sub: "Featured matches from the top 10 leagues, all in one place.", cta: "View featured", href: "/", image: "https://images.unsplash.com/photo-1553778263-73a83bab9b0c?q=80&w=1200&auto=format&fit=crop" },
  { tag: "Booking Codes", title: "Load a slip in seconds", sub: "Got a booking code? Load the full slip instantly and make it yours.", cta: "Enter a code", href: "/booking-code", image: "https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=1200&auto=format&fit=crop", pos: "center 25%" },
  { tag: "Promotions", title: "Boosts, free bets & rewards", sub: "Fresh offers land in the promotions centre — see what is live today.", cta: "View offers", href: "/promos", image: "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?q=80&w=1200&auto=format&fit=crop" },
  { tag: "PlayBet Rewards", title: <>Win an <span className="hh-gold">iPhone 16</span></>, sub: "Plus a PlayStation 5 and weekly cash prizes. Bet on the Premier League and the top leagues to enter.", cta: "Enter now", href: "/promos", image: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e2/IPhone_16_Pro_Max_Desert_Titanium_Rear.png/500px-IPhone_16_Pro_Max_Desert_Titanium_Rear.png", pos: "68% 32%" },
];
function HomeHero() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setIndex((i) => (i + 1) % HERO_SLIDES.length), 5000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <section className="hh" aria-label="Featured promotions">
      {HERO_SLIDES.map((s, i) => (
        <div key={s.tag} className={`hh-slide${i === index ? " active" : ""}`} aria-hidden={i !== index}>
          <img className="hh-bg" src={s.image} alt="" style={s.pos ? { objectPosition: s.pos } : undefined} loading={i === 0 ? "eager" : "lazy"} />
          <div className="hh-shade" />
          <div className="hh-copy">
            <span className="hh-tag">{s.tag}</span>
            <h2 className="hh-title">{s.title}</h2>
            <p className="hh-sub">{s.sub}</p>
            <Link href={s.href} className="hh-cta">{s.cta} <ChevronRight size={14} /></Link>
          </div>
        </div>
      ))}
      <div className="hh-dots">
        {HERO_SLIDES.map((s, i) => (
          <button key={s.tag} type="button" aria-label={`Show banner ${i + 1}`} className={`hh-dot${i === index ? " active" : ""}`} onClick={() => setIndex(i)} />
        ))}
      </div>
    </section>
  );
}
function BetSlip({ picks, setPicks, onPlace }: { picks: Pick[]; setPicks: (p: Pick[])=>void; onPlace: (stake: number)=>Promise<void> }){ const MIN_STAKE=100; const [stake,setStake]=useState(1); const [stakeEdited,setStakeEdited]=useState(false); const [placing,setPlacing]=useState(false); const [notice,setNotice]=useState(""); const [placedInfo,setPlacedInfo]=useState<{stake:number;total:number;count:number}|null>(null); const total=picks.reduce((a,b)=>a*b.odd,1); const place=async()=>{ setNotice(""); setPlacing(true); try { await onPlace(stake); const info={stake,total,count:picks.length}; setPicks([]); setPlacedInfo(info); } catch (error) { setNotice(error instanceof ApiError ? error.message : "We could not place this bet. Please try again."); } finally { setPlacing(false); } }; return <aside className="betslip panel"><div className="betslip-tabs"><span className="active">Betslip</span><span>Cashout</span></div>{picks.length===0?<div className="empty-slip"><WalletCards size={34}/><h3>Your betslip is empty</h3><p>{notice || "Click on the odds to add selections and build your bet."}</p><Link href="/" className="ghost-button">Browse matches</Link></div>:<><div className="slip-header"><span>Singles</span><button onClick={()=>setPicks([])}>Clear all</button></div>{picks.map(p=><div className="slip-pick" key={`${p.id}-${p.selection}`}><div><b>{p.match}</b><small>{p.market} · {p.selection}</small></div><strong>{p.odd.toFixed(2)}</strong><button onClick={()=>setPicks(picks.filter(x=>x!==p))}><X size={14}/></button></div>)}<div className="slip-summary"><div><span>Potential return</span><b>GHS {(stake*total).toFixed(2)}</b></div><label>Stake<input value={stake} onChange={e=>{setStakeEdited(true);setStake(Number(e.target.value)||0)}} type="number" min={MIN_STAKE}/><small>Minimum GHS {MIN_STAKE}</small></label><button className={`gold-button full${stake < MIN_STAKE ? " stake-button-disabled" : ""}`} onClick={place} disabled={placing || stake < MIN_STAKE}>{placing ? "Placing…" : "Place bet"} <Zap size={15}/></button>{stakeEdited && stake < MIN_STAKE && <small className="stake-error" role="alert">Deposit an additional GHS {Math.max(0, MIN_STAKE - stake).toFixed(2)} to place this bet.</small>}{notice&&<small className="auth-notice" role="alert">{notice}</small>}</div></>}{placedInfo&&<div className="pb-success-overlay" onClick={()=>setPlacedInfo(null)}><div className="pb-success-card" onClick={e=>e.stopPropagation()}><div className="pb-success-badge"><CheckCircle2 size={34}/></div><h3>Bet placed successfully</h3><p>Your bet is in. Good luck!</p><div className="pb-success-rows"><div><span>Selections</span><b>{placedInfo.count}</b></div><div><span>Stake</span><b>GHS {placedInfo.stake.toFixed(2)}</b></div><div><span>Total odds</span><b>{placedInfo.total.toFixed(2)}</b></div><div className="ret"><span>Potential return</span><b>GHS {(placedInfo.stake*placedInfo.total).toFixed(2)}</b></div></div><Link href="/open-bets" className="gold-button full">View my bets</Link><button className="ghost-button full" onClick={()=>setPlacedInfo(null)}>Done</button></div></div>}</aside> }
/**
 * Floating betslip button — the 7up flow (owner, 2026-10-22; spec update
 * 2026-10-23). A circular green button anchored bottom-right above the
 * bottom nav. It is ALWAYS visible (even with zero selections) on every
 * route; the white pill carries the live selection count when there is at
 * least one pick — the count lives here only, the bottom nav carries none.
 * A tap takes the user to the booking-code page. It can be dragged to a
 * new spot (the position persists across visits), and the stored offset
 * is clamped into the CURRENT viewport on load and on resize — a position
 * saved on a wider/taller screen must never leave it off-screen on a
 * phone (that was the "icon not showing" bug: the persisted offset was
 * trusted blindly, so the button rendered far outside a narrow viewport).
 */
const SLIP_FAB_POS_KEY = "pbSlipFabPos";
function BetslipFAB({ count }: { count: number }) {
  const [, setLocation] = useLocation();
  const clampOffset = (x: number, y: number) => ({
    x: Math.min(10, Math.max(-(window.innerWidth - 76), x)),
    y: Math.min(10, Math.max(-(window.innerHeight - 176), y)),
  });
  const [offset, setOffset] = useState<{ x: number; y: number }>(() => {
    try {
      const raw = window.localStorage.getItem(SLIP_FAB_POS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { x?: unknown; y?: unknown };
        if (typeof p.x === "number" && typeof p.y === "number") return clampOffset(p.x, p.y);
      }
    } catch { /* storage unavailable — stay at the anchor */ }
    return { x: 0, y: 0 };
  });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null);

  // Re-clamp on mount and whenever the viewport changes (rotation, browser
  // chrome showing/hiding, moving between devices) so the button can never
  // sit outside the visible screen; persist the corrected position.
  useEffect(() => {
    const reclamp = () => {
      setOffset((prev) => {
        const next = clampOffset(prev.x, prev.y);
        try {
          // Self-heal storage too: a poisoned saved position is replaced
          // by its clamped equivalent so it can never resurface.
          if (window.localStorage.getItem(SLIP_FAB_POS_KEY) !== JSON.stringify(next)) {
            window.localStorage.setItem(SLIP_FAB_POS_KEY, JSON.stringify(next));
          }
        } catch { /* ignore */ }
        return next;
      });
    };
    reclamp();
    window.addEventListener("resize", reclamp);
    return () => window.removeEventListener("resize", reclamp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 7) return;
    if (!d.moved) { d.moved = true; setDragging(true); }
    setOffset(clampOffset(d.baseX + dx, d.baseY + dy));
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!d) return;
    if (d.moved) {
      const clamped = clampOffset(offset.x, offset.y);
      try { window.localStorage.setItem(SLIP_FAB_POS_KEY, JSON.stringify(clamped)); } catch { /* ignore */ }
    } else {
      setLocation("/booking-code");
    }
  };
  const onPointerCancel = () => { dragRef.current = null; setDragging(false); };

  return (
    <button
      type="button"
      className={`pb-slip-fab${dragging ? " dragging" : ""}`}
      aria-label={count > 0 ? `Load a booking code — ${count} selection${count === 1 ? "" : "s"} in betslip` : "Load a booking code"}
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        animation: offset.x !== 0 || offset.y !== 0 ? "none" : undefined,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <Ticket size={26} strokeWidth={1.8} />
      {count > 0 && <span className="pb-slip-fab-n">{count > 99 ? "99+" : count}</span>}
    </button>
  );
}


function adminFeaturedLogo(team: unknown, side: "home" | "away"): string {
  return adminCrestFor(team, side);
}

function AdminGameCard({ match, picks, onPick, choose, hasDraw }: { match: EnrichedMatch; picks: Pick[]; onPick: (p: Pick) => void; choose: (m: EnrichedMatch, selection: "1" | "X" | "2", odd: number) => void; hasDraw: (m: EnrichedMatch) => boolean }) {
  const homeLogo = adminFeaturedLogo(match.homeTeam, "home");
  const awayLogo = adminFeaturedLogo(match.awayTeam, "away");
  const [homeReady, setHomeReady] = useState(false);
  const [awayReady, setAwayReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    let active = true;
    setHomeReady(false); setAwayReady(false); setBlocked(false);
    const preload = (src: string, ready: (value: boolean) => void) => {
      const image = new Image();
      image.onload = () => { if (active) ready(true); };
      image.onerror = () => { if (active) { setBlocked(true); ready(false); } };
      image.src = src;
    };
    preload(homeLogo, setHomeReady);
    preload(awayLogo, setAwayReady);
    return () => { active = false; };
  }, [homeLogo, awayLogo]);
  if (blocked || !homeReady || !awayReady) return null;
  const draw = hasDraw(match);
  const values: Array<["1" | "X" | "2", string, number]> = [["1", "HOME", match.oddsMap?.home ?? 0], ...(draw ? [["X", "DRAW", match.oddsMap?.draw ?? 0] as ["X", string, number]] : []), ["2", "AWAY", match.oddsMap?.away ?? 0]];
  return <article className="admin-game-card" key={match.id}><div className="admin-game-top"><span className="admin-game-league">{match.league || match.sport || "Admin special"}</span></div><Link href={`/match/${match.id}?sport=${encodeURIComponent(match.sport ?? "football")}&admin=1`} className="admin-game-fixture"><div className="admin-game-team"><img src={homeLogo} alt={`${match.homeTeam} logo`} loading="eager" onError={() => setBlocked(true)} /><b>{match.homeTeam}</b></div><div className="admin-game-mid"><strong>{isMatchLive(match) ? "LIVE" : "VS"}</strong><small>{formatKickoff(match.kickoffAt)}</small></div><div className="admin-game-team"><img src={awayLogo} alt={`${match.awayTeam} logo`} loading="eager" onError={() => setBlocked(true)} /><b>{match.awayTeam}</b></div></Link><div className="admin-game-odds">{values.map(([label, name, value]) => { const selected = picks.some((p) => p.id === match.id && p.market === "1X2" && p.selection === label); return <button type="button" key={label} className={`admin-game-odd${selected ? " selected" : ""}`} disabled={!value || value <= 0} onClick={() => choose(match, label, value)}><span>{name}</span>{value ? value.toFixed(2) : "—"}</button>; })}</div></article>;
}

function AdminFeaturedGames({ picks, onPick }: { picks: Pick[]; onPick: (p: Pick) => void }) {
  const [matches, setMatches] = useState<EnrichedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const load = () => fetchAdminMatches().then((rows) => {
      if (!active) return;
      const visible = rows.filter((m) => !["FINISHED", "ENDED", "COMPLETED", "CANCELLED", "POSTPONED"].includes(String(m.status ?? "").toUpperCase()));
      setMatches(visible);
    }).catch(() => { if (active) setMatches([]); }).finally(() => { if (active) setLoading(false); });
    load();
    const refresh = window.setInterval(load, 5_000);
    return () => { active = false; window.clearInterval(refresh); };
  }, []);
  if (loading) return null;
  if (matches.length === 0) return <section className="admin-featured-games admin-featured-empty"><div className="admin-featured-head"><div><div className="admin-featured-kicker"><Sparkles size={11}/> Featured matches</div><h2>Admin-created fixtures</h2><p>No active admin fixtures are available from the matches endpoint yet.</p></div></div></section>;
  const hasDraw = (m: EnrichedMatch) => !["basketball", "nfl", "baseball", "mma"].includes(String(m.sport ?? "").toLowerCase());
  const choose = (m: EnrichedMatch, selection: "1" | "X" | "2", odd: number) => {
    if (!odd || odd <= 0) return;
    onPick({ id: m.id, match: `${m.homeTeam} vs ${m.awayTeam}`, market: "1X2", selection, odd, league: m.league, homeTeam: m.homeTeam, awayTeam: m.awayTeam, kickoffAt: m.kickoffAt, isLive: isMatchLive(m), scoreHome: m.scoreHome, scoreAway: m.scoreAway });
  };
  return <section className="admin-featured-games"><style>{`.admin-featured-games{margin:16px 0 20px;border:1px solid rgba(109,228,157,.28);border-radius:14px;background:linear-gradient(135deg,rgba(12,31,27,.96),rgba(9,17,24,.98));overflow:hidden;box-shadow:0 10px 24px rgba(0,0,0,.14)}.admin-featured-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(112,226,157,.16)}.admin-featured-kicker{display:flex;align-items:center;gap:6px;color:#7fe8a5;font-size:8px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.admin-featured-head h2{margin:4px 0 0;color:#f3fff7;font-size:15px;line-height:1.1}.admin-featured-head p{margin:4px 0 0;color:#8da8a0;font-size:9px}.admin-featured-count{border:1px solid rgba(119,231,160,.42);background:#153a28;color:#b9f5c9;border-radius:999px;padding:5px 8px;font-size:8px;font-weight:900}.admin-featured-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:10px}.admin-game-card{position:relative;min-width:0;padding:10px;border:1px solid #263c43;border-radius:11px;background:linear-gradient(145deg,#111f27,#0c151b);transition:transform .18s,border-color .18s,box-shadow .18s}.admin-game-card:hover{transform:translateY(-1px);border-color:#62dd94;box-shadow:0 7px 16px rgba(33,168,91,.12)}.admin-game-top{display:flex;justify-content:space-between;align-items:flex-start;gap:6px}.admin-game-league{color:#8ca7a2;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.admin-game-tags{display:none}.admin-game-fixture{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:6px;margin:10px 0 8px}.admin-game-team{text-align:center;min-width:0}.admin-game-team img{width:34px;height:34px;object-fit:contain;display:block;margin:0 auto 4px;border-radius:9px}.admin-game-team b{display:block;color:#f0f7f2;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.admin-game-mid{text-align:center;color:#829c99;font-size:8px}.admin-game-mid strong{display:block;color:#b9f0c8;font-size:10px}.admin-game-mid small{display:block;margin-top:3px;font-size:8px}.admin-game-odds{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}.admin-game-odd{border:1px solid #2d4850;background:#14262d;color:#bdeed0;border-radius:6px;padding:5px 3px;cursor:pointer;font-size:9px;font-weight:900}.admin-game-odd span{display:none}.admin-game-odd:hover,.admin-game-odd.selected{background:#235d3b;border-color:#6ee6a0;color:#fff}.admin-game-odd:disabled{opacity:.45;cursor:not-allowed}.admin-game-special{display:none}@media(max-width:720px){.admin-featured-grid{grid-template-columns:1fr}.admin-featured-head{align-items:flex-start;flex-direction:column}}`}</style><div className="admin-featured-head"><div><div className="admin-featured-kicker"><Sparkles size={11}/> Featured matches</div><h2>Admin-created fixtures</h2><p>Exclusive fixtures created by the PlayBet operations team.</p></div><span className="admin-featured-count">{matches.length} active</span></div><div className="admin-featured-grid">{matches.map((m) => <AdminGameCard key={m.id} match={m} picks={picks} onPick={onPick} choose={choose} hasDraw={hasDraw} />)}</div></section>;
}

function Home({ onPick, picks, setPicks: _setPicks, onPlace: _onPlace }: {onPick:(p:Pick)=>void;picks:Pick[];setPicks:(p:Pick[])=>void;onPlace:(stake:number)=>Promise<void>}){
  void _setPicks; void _onPlace;
  return <><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><main><PlayBetHome picks={picks} onPick={onPick}/></main><Footer/></>
}
function Casino(){ return <><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><main className="wrap casino-page"><div className="casino-hero"><div className="hero-shapes"><span className="hero-shape hero-shape-a"/><span className="hero-shape hero-shape-b"/><span className="hero-dots"/></div><img src={casinoFeature}/><div><span className="eyebrow">PlayBet originals</span><h1>Casino games<br/><em>coming soon.</em></h1><p>We're building out real casino games backed by a live provider — no placeholder games shown here in the meantime.</p></div></div><section className="panel simple-card" style={{marginTop:24}}><Sparkles size={24}/><h3>Nothing to show yet, honestly</h3><p>Rather than fill this page with demo game tiles that don't actually work, we're leaving it empty until real casino games are integrated. Check back soon, or head to the <Link href="/" style={{color:'var(--gold-hi)',fontWeight:800}}>sportsbook</Link> in the meantime.</p></section></main><Footer/></> }

function SimplePage({title,kicker,children}:{title:string;kicker:string;children:any}){ return <><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><main className="wrap simple-page"><div className="simple-hero"><span className="eyebrow">{kicker}</span><h1>{title}</h1></div><div className="simple-grid">{children}</div></main><Footer/></> }
function WalletPage(){ return <><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><WalletCenter/><Footer/></> }
function DepositPage(){ return <><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><DepositCenter/><Footer/></> }
function BetsRoute({ tab, hideHeader = false }: { tab: "open" | "history"; hideHeader?: boolean }){ return <>{!hideHeader && <Header onMenu={()=>document.body.classList.toggle("menu-open")}/>}<BetsCenter defaultTab={tab}/><Footer/></> }
/**
 * Live page — 7up structure (owner, 2026-10-23): like 7UP BET's #/live,
 * the page header IS a tab bar — a "LIVE" title separated from a row of
 * sport switcher tabs — above the live board. The sport tabs drive the
 * shared Sportsbook (live-only) via its sport props; the betslip below
 * is unchanged. Flat chrome, no shadows (see the .spage block in
 * sporty.css).
 */
function LivePage({ picks, setPicks, onPick, onPlace }: { picks: Pick[]; setPicks: (p: Pick[]) => void; onPick: (p: Pick) => void; onPlace: (stake: number) => Promise<void> }){
  const [sport, setSport] = useState<SportKey>("football");
  return <>
    <Header onMenu={()=>document.body.classList.toggle("menu-open")}/>
    <main className="wrap spage spage-live">
      <div className="spage-livetabs" role="tablist" aria-label="Live sports">
        <span className="spage-live-title"><i className="spage-livedot" aria-hidden="true"/>LIVE</span>
        {SPORT_TABS.map((t)=>(
          <button key={t.key} type="button" role="tab" aria-selected={sport===t.key} className={`spage-stab${sport===t.key?" on":""}`} onClick={()=>setSport(t.key)}>{t.label}</button>
        ))}
      </div>
      <Sportsbook picks={picks} onPick={onPick} mode="live-only" sport={sport} onSportChange={setSport} />
      <div style={{marginTop:18}}><BetSlip picks={picks} setPicks={setPicks} onPlace={onPlace}/></div>
    </main>
    <Footer/>
  </>;
}
function TicketDetailsRoute({ id }: { id: string }){ return <TicketDetailsPage id={id}/> }

function AdminRoute(){ return <AdminPanelPage/>; }
function App(){ const [picks,setPicks]=useState<Pick[]>([]); const onPick=(p:Pick)=>setPicks(prev=>prev.some(x=>x.id===p.id&&x.selection===p.selection)?prev.filter(x=>!(x.id===p.id&&x.selection===p.selection)):[...prev,p]); const onPlace=async(stake:number)=>{ if(!window.localStorage.getItem("accessToken")){ window.location.href="/login"; return; } if(stake < 200){ throw new ApiError("You cannot stake below the minimum stake of GHS 200.",422); } if(picks.some((pick)=>!isBettableMatchId(pick.id))){ throw new ApiError("One selection is no longer available for betting. Remove it and choose a match with current odds.",422); } await api.bets.place({stake,currency:"GHS",selections:picks.map((pick)=>({matchId:pick.id,market:pick.market,selection:pick.selection,submittedOdds:pick.odd}))}); }; return <><WinCelebrationModal/><Suspense fallback={<div style={{ padding: "56px 20px", textAlign: "center", color: "#5b7186", fontWeight: 700 }}>Loading…</div>}><Switch><Route path="/admin-guide"><AdminEntryGuidePage/></Route><Route path="/admin"><AdminRoute/></Route><Route path="/super-admin"><SuperAdminPage/></Route><Route path="/casino"><Casino/></Route><Route path="/wallet"><WalletPage/></Route><Route path="/deposit"><DepositPage/></Route><Route path="/promos"><SimplePage title="Promotions" kicker="More value in every play"><section className="promo-card"><span className="eyebrow">Welcome offer</span><h2>Play the smart side of sport.</h2><p>Keep an eye on the latest boosts, free bets, and loyalty rewards.</p><Link href="/wallet" className="gold-button">View offers <ChevronRight size={15}/></Link></section></SimplePage></Route><Route path="/affiliate"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><AffiliatePage/><Footer/></></Route><Route path="/login"><AccountAuth mode="login" /></Route><Route path="/register"><AccountAuth mode="register" /></Route><Route path="/terms-and-conditions"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><TermsAndConditionsPage/><Footer/></></Route><Route path="/refund-policy"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><RefundPolicyPage/><Footer/></></Route><Route path="/support"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><main className="wrap support-page"><SupportCenter/></main><Footer/></></Route><Route path="/help"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><main className="wrap support-page"><SupportCenter/></main><Footer/></></Route><Route path="/bets"><BetsRoute tab="history" hideHeader/></Route><Route path="/betslip"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><BetslipPage picks={picks} setPicks={setPicks} onPlace={onPlace}/><Footer/></></Route><Route path="/account"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><AccountCenter/><Footer/></></Route><Route path="/profile"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><ProfileCenter/><Footer/></></Route><Route path="/sports"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><SportsPage picks={picks} onPick={onPick}/><Footer/></></Route><Route path="/match/:id">{(params)=><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><MatchDetailsRoute id={params.id ?? ""} picks={picks} onPick={onPick}/><Footer/></>}</Route><Route path="/transactions"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><TransactionsPage/><Footer/></></Route><Route path="/bets/:id">{(params)=><TicketDetailsRoute id={params.id ?? ""}/>}</Route><Route path="/open-bets"><BetsRoute tab="open"/></Route><Route path="/notifications"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><NotificationsPage/><Footer/></></Route><Route path="/favorites"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><FavoritesPage/><Footer/></></Route><Route path="/settings"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><SettingsPage/><Footer/></></Route><Route path="/security"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><SecurityPage/><Footer/></></Route><Route path="/responsible-gaming"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><ResponsibleGamingPage/><Footer/></></Route><Route path="/search"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><SearchPage/><Footer/></></Route><Route path="/booking-code"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><BookingCodePage picks={picks} setPicks={setPicks}/><Footer/></></Route><Route path="/live"><LivePage picks={picks} setPicks={setPicks} onPick={onPick} onPlace={onPlace}/></Route><Route path="/"><Home onPick={onPick} picks={picks} setPicks={setPicks} onPlace={onPlace}/></Route><Route><NotFound/></Route></Switch></Suspense><MobileBottomNav/><BetslipFAB count={picks.length}/></> }

export default function Root(){ return <SessionProvider><App/></SessionProvider> }
