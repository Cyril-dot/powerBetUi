import { useState } from "react";
import { useLocation } from "wouter";
import { Share2, Ticket, Trophy, X } from "lucide-react";
import type { Bet } from "@/lib/api";
import { markBetWon } from "@/lib/withdrawalGate";
import { pickUserField, useSession } from "@/lib/session";

const TROPHY_SRC = "/playbet-victory-trophy.png";
const CONFETTI_COLORS = ["#F6D67C", "#D4AF37", "#FFF3C4", "#B8860B", "#F6D67C", "#00E85F"];

function Confetti() {
  return <div className="wc-confetti" aria-hidden="true">{Array.from({ length: 34 }).map((_, i) => <span key={i} style={{ left: `${(i * 17) % 100}%`, background: CONFETTI_COLORS[i % CONFETTI_COLORS.length], animationDelay: `${(i % 8) * 0.16}s`, animationDuration: `${2.2 + (i % 4) * 0.3}s` }} />)}</div>;
}

export function verifyCode(bet: Bet): string {
  const raw = bet.id.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return `GH${raw.slice(0, 4)}${raw.slice(-6)}`;
}

export default function TrophyCelebration({ bet, onClose, showConfetti = true }: { bet: Bet; onClose: () => void; showConfetti?: boolean }) {
  const [, setLocation] = useLocation();
  const { user } = useSession();
  const [trophyFailed, setTrophyFailed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const handleClose = () => {
    const userId = pickUserField(user, "id", "userId", "accountId");
    const rawCountry = pickUserField(user, "country", "countryCode", "country_code");
    if (userId) markBetWon(userId, rawCountry.toUpperCase().startsWith("NG") ? "NG" : "GH");
    onClose();
  };
  const showOff = async () => {
    setGenerating(true);
    const text = `I just won GHS ${bet.potentialReturn.toFixed(2)} on PlayBet!`;
    try { if (navigator.share) await navigator.share({ text }); else await navigator.clipboard.writeText(text); } catch { /* optional */ } finally { setGenerating(false); }
  };
  const viewTicket = () => { handleClose(); setLocation(`/bets/${bet.id}`); };
  return <div className="wc-overlay" role="dialog" aria-modal="true" aria-label="Winning bet"><TrophyCelebrationStyles />{showConfetti && <Confetti />}
    <button className="wc-close" type="button" onPointerDown={(event) => { event.stopPropagation(); handleClose(); }} onClick={(event) => { event.stopPropagation(); handleClose(); }} aria-label="Close"><X size={20} /></button>
    <div className="wc-stage">
      <div className="wc-brand" aria-hidden="true"><span className="wc-brand-tri" /><span className="wc-brand-word">Play<em>Bet</em></span></div>
      <div className="wc-headline"><h1 className="wc-shimmer">YOU WON</h1></div>
      <div className="wc-amount"><span>AMOUNT WON</span><strong>GHS {bet.potentialReturn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
      <div className="wc-trophy-stage"><div className="wc-sparkles" aria-hidden="true"><i>✦</i><i>✧</i><i>✦</i><i>✧</i><i>✦</i></div><div className={trophyFailed ? "wc-trophy wc-trophy-fallback" : "wc-trophy"}>{trophyFailed ? <Trophy size={76} /> : <><span className="wc-shine" /><img src={TROPHY_SRC} alt="PlayBet victory trophy" onError={() => setTrophyFailed(true)} /></>}</div></div>
      <div className="wc-bottom">
        <button type="button" className="wc-view-ticket" onClick={viewTicket}><Ticket size={14} /> View ticket details</button>
        <div className="wc-actions"><button type="button" className="wc-details" onClick={handleClose}>Close</button><button type="button" className="wc-showoff" onClick={showOff} disabled={generating}><Share2 size={14} /> {generating ? "Sharing…" : "Show Off"}</button></div>
      </div>
    </div>
  </div>;
}

export function TrophyCelebrationStyles() {
  return <style>{`
    .wc-overlay{position:fixed;inset:0;z-index:200;overflow:hidden;background:rgba(3,4,9,.88);backdrop-filter:blur(3px);display:flex;flex-direction:column;align-items:center;justify-content:center;padding-top:max(8px,env(safe-area-inset-top));padding-bottom:max(8px,env(safe-area-inset-bottom));pointer-events:none}
    .wc-close{position:absolute;top:10px;right:10px;z-index:20;width:30px;height:30px;display:flex;align-items:center;justify-content:center;background:rgba(24,19,6,.88);border:1px solid rgba(246,214,124,.5);border-radius:50%;color:#F6D67C;cursor:pointer;pointer-events:auto}
    .wc-stage{position:relative;z-index:1;width:100%;max-width:420px;flex:0 0 auto;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 14px;pointer-events:none}
    .wc-brand{display:flex;align-items:center;gap:7px;margin-bottom:10px;animation:wc-rise .45s ease-out both}
    .wc-brand-tri{width:0;height:0;border-top:7px solid transparent;border-bottom:7px solid transparent;border-left:11px solid #00E85F}
    .wc-brand-word{font:italic 800 16px 'Roboto',sans-serif;letter-spacing:.05em;color:#fff}
    .wc-brand-word em{font-style:italic;color:#00E85F}
    .wc-headline{flex-shrink:0;text-align:center;animation:wc-rise .45s .05s ease-out both}
    .wc-shimmer{margin:0;font:800 34px/1.05 'Roboto',sans-serif;letter-spacing:.03em;background:linear-gradient(90deg,#A8741A 0%,#D4AF37 30%,#FFF3C4 50%,#D4AF37 70%,#A8741A 100%);background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:wc-shimmer 2.4s linear infinite}
    .wc-amount{flex-shrink:0;margin-top:8px;text-align:center;letter-spacing:-.01em;animation:wc-rise .45s .12s ease-out both}
    .wc-amount span{display:block;margin-bottom:3px;color:#D6BC72;font-size:.6rem;font-weight:700;letter-spacing:.18em}
    .wc-amount strong{display:block;font:800 27px/1.1 'Roboto',sans-serif;color:#FFF8E1}
    .wc-trophy-stage{position:relative;flex:0 0 clamp(190px,32vh,252px);min-height:0;width:100%;display:flex;align-items:center;justify-content:center;margin:2px 0 clamp(22px,4vh,34px)}
    .wc-trophy-stage::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse 68% 58% at 50% 55%,rgba(212,175,55,.30),rgba(212,175,55,.06) 55%,transparent 72%);pointer-events:none}
    .wc-trophy{position:relative;width:min(216px,52vw);height:min(216px,52vw);display:flex;align-items:center;justify-content:center;animation:wc-trophy-in .55s ease-out both}
    .wc-trophy img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 16px 24px rgba(0,0,0,.55))}
    .wc-trophy-fallback{color:#D4AF37}
    .wc-shine{position:absolute;z-index:2;width:18px;height:78%;transform:skewX(-22deg) translateX(-90px);background:linear-gradient(90deg,transparent,rgba(255,243,196,.85),transparent);animation:wc-shine 1s .25s ease-out both;pointer-events:none}
    .wc-sparkles{position:absolute;width:min(245px,60vw);height:min(210px,52vw);pointer-events:none}
    .wc-sparkles i{position:absolute;color:#F6D67C;font-style:normal;font-size:15px;opacity:0;animation:wc-sparkle .85s ease-out both}
    .wc-sparkles i:nth-child(1){left:8%;top:30%;animation-delay:.05s}.wc-sparkles i:nth-child(2){left:24%;top:12%;animation-delay:.18s}.wc-sparkles i:nth-child(3){right:10%;top:28%;animation-delay:.3s}.wc-sparkles i:nth-child(4){right:22%;top:70%;animation-delay:.42s}.wc-sparkles i:nth-child(5){left:12%;top:72%;animation-delay:.54s}
    .wc-bottom{flex-shrink:0;width:100%;text-align:center;pointer-events:auto;animation:wc-rise .45s .2s ease-out both}
    .wc-view-ticket{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;max-width:360px;margin:0 auto 10px;min-height:42px;padding:8px 10px;background:linear-gradient(135deg,#F2CE6B,#D4AF37 55%,#A8741A);border:0;border-radius:10px;box-shadow:0 8px 18px rgba(0,0,0,.35);color:#221806;font:700 .76rem 'Roboto',sans-serif;letter-spacing:.01em;cursor:pointer;transition:transform .2s ease,filter .2s ease}
    .wc-view-ticket:hover{filter:brightness(1.07);transform:translateY(-1px)}
    .wc-actions{display:flex;gap:10px;max-width:360px;margin:0 auto}
    .wc-details,.wc-showoff{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:9px 12px;border-radius:10px;font:700 .74rem 'Roboto',sans-serif;cursor:pointer;transition:transform .2s ease,background .2s ease,filter .2s ease}
    .wc-details{background:rgba(255,255,255,.07);border:1px solid rgba(246,214,124,.35);color:#fff}
    .wc-details:hover{background:rgba(255,255,255,.14);transform:translateY(-1px)}
    .wc-showoff{background:rgba(212,175,55,.14);border:1px solid rgba(246,214,124,.6);color:#F6D67C}
    .wc-showoff:hover{transform:translateY(-1px);filter:brightness(1.12)}
    .wc-showoff:disabled{opacity:.6;cursor:default}
    .wc-confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}
    .wc-confetti span{position:absolute;top:-12px;width:5px;height:9px;opacity:.75;animation:wc-fall linear 1;animation-iteration-count:1}
    @keyframes wc-fall{0%{transform:translateY(-12px) rotate(0deg);opacity:1}100%{transform:translateY(120vh) rotate(420deg);opacity:0}}
    @keyframes wc-shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
    @keyframes wc-trophy-in{from{opacity:0;transform:scale(.86) translateY(10px)}to{opacity:1;transform:none}}
    @keyframes wc-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    @keyframes wc-shine{from{opacity:0;transform:skewX(-22deg) translateX(-90px)}30%{opacity:1}to{opacity:0;transform:skewX(-22deg) translateX(90px)}}
    @keyframes wc-sparkle{0%{opacity:0;transform:scale(.4) translateY(4px)}40%{opacity:1}100%{opacity:0;transform:scale(1) translateY(-7px)}}
    @media(prefers-reduced-motion:reduce){.wc-shimmer,.wc-trophy,.wc-confetti span,.wc-shine,.wc-sparkles i,.wc-brand,.wc-headline,.wc-amount,.wc-bottom{animation:none}.wc-confetti,.wc-shine,.wc-sparkles{display:none}}
    @media(max-width:380px){.wc-shimmer{font-size:29px}.wc-amount strong{font-size:23px}.wc-trophy-stage{flex-basis:172px}.wc-trophy{width:min(182px,50vw);height:min(182px,50vw)}}
  `}</style>;
}
