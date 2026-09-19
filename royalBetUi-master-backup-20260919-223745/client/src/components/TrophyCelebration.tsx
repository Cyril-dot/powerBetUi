import { useState } from "react";
import { useLocation } from "wouter";
import { Share2, Ticket, Trophy, X } from "lucide-react";
import type { Bet } from "@/lib/api";
import { markBetWon } from "@/lib/withdrawalGate";
import { pickUserField, useSession } from "@/lib/session";

const TROPHY_SRC = "/superbet-victory-trophy.png";
const CONFETTI_COLORS = ["#1e6bff", "#1246a8", "#ffffff", "#2FB8F0", "#0b2e70"];

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
    const text = `I just won GHS ${bet.potentialReturn.toFixed(2)} on Super Bet!`;
    try { if (navigator.share) await navigator.share({ text }); else await navigator.clipboard.writeText(text); } catch { /* optional */ } finally { setGenerating(false); }
  };
  const viewTicket = () => { handleClose(); setLocation(`/bets/${bet.id}`); };
  return <div className="wc-overlay" role="dialog" aria-modal="true" aria-label="Winning bet"><TrophyCelebrationStyles />{showConfetti && <Confetti />}
    <button className="wc-close" type="button" onClick={handleClose} aria-label="Close"><X size={20} /></button>
    <div className="wc-stage"><div className="wc-headline"><h1 className="wc-shimmer">YOU WON</h1></div>
      <div className="wc-amount"><span>AMOUNT WON</span><strong>GHS {bet.potentialReturn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
      <div className="wc-trophy-stage"><div className="wc-sparkles" aria-hidden="true"><i>✦</i><i>✧</i><i>✦</i><i>✧</i><i>✦</i></div><div className={trophyFailed ? "wc-trophy wc-trophy-fallback" : "wc-trophy"}>{trophyFailed ? <Trophy size={76} /> : <><span className="wc-shine" /><img src={TROPHY_SRC} alt="Super Bet S trophy" onError={() => setTrophyFailed(true)} /></>}</div></div>
      <div className="wc-bottom">
        <button type="button" className="wc-view-ticket" onClick={viewTicket}><Ticket size={14} /> View ticket details</button>
        <div className="wc-actions"><button type="button" className="wc-details" onClick={handleClose}>Close</button><button type="button" className="wc-showoff" onClick={showOff} disabled={generating}><Share2 size={14} /> {generating ? "Sharing…" : "Show Off"}</button></div>
      </div>
    </div>
  </div>;
}

export function TrophyCelebrationStyles() {
  return <style>{`
    .wc-overlay{position:fixed;inset:0;z-index:200;overflow:hidden;background:rgba(2,7,18,.84);backdrop-filter:blur(3px);display:flex;flex-direction:column;align-items:center;padding-top:max(8px,env(safe-area-inset-top));padding-bottom:max(8px,env(safe-area-inset-bottom));pointer-events:none}.wc-close{position:absolute;top:10px;right:10px;z-index:20;width:30px;height:30px;display:flex;align-items:center;justify-content:center;background:rgba(8,31,76,.92);border:1px solid rgba(255,255,255,.35);border-radius:50%;color:#fff;cursor:pointer;pointer-events:auto}.wc-stage{position:relative;z-index:1;width:100%;max-width:420px;flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;padding:0 14px;pointer-events:none}.wc-headline{flex-shrink:0;margin-top:18px;text-align:center}.wc-shimmer{margin:0;font:900 32px/1 'Barlow Condensed',sans-serif;letter-spacing:.04em;background:linear-gradient(90deg,#2fb8f0 0%,#fff 35%,#1e6bff 55%,#75a9ff 100%);background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:wc-shimmer 2.4s linear infinite}.wc-amount{flex-shrink:0;margin-top:5px;text-align:center;color:#fff;letter-spacing:-.01em}.wc-amount span{display:block;margin-bottom:2px;color:#8ecfff;font-size:.58rem;font-weight:800;letter-spacing:.15em}.wc-amount strong{display:block;font:900 22px/1.1 'DM Sans',sans-serif;color:#fff}.wc-trophy-stage{position:relative;flex:0 0 clamp(178px,30vh,238px);min-height:0;width:100%;display:flex;align-items:center;justify-content:center;margin:2px 0 0}.wc-trophy{position:relative;width:min(210px,50vw);height:min(210px,50vw);display:flex;align-items:center;justify-content:center;animation:wc-trophy-in .5s ease-out both}.wc-trophy img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 10px 18px rgba(0,0,0,.42))}.wc-trophy-fallback{color:#2fb8f0}.wc-shine{position:absolute;z-index:2;width:18px;height:78%;transform:skewX(-22deg) translateX(-90px);background:linear-gradient(90deg,transparent,rgba(255,255,255,.9),transparent);animation:wc-shine 1s .25s ease-out both;pointer-events:none}.wc-sparkles{position:absolute;width:min(245px,60vw);height:min(210px,52vw);pointer-events:none}.wc-sparkles i{position:absolute;color:#7edbff;font-style:normal;font-size:15px;opacity:0;animation:wc-sparkle .85s ease-out both}.wc-sparkles i:nth-child(1){left:8%;top:30%;animation-delay:.05s}.wc-sparkles i:nth-child(2){left:24%;top:12%;animation-delay:.18s}.wc-sparkles i:nth-child(3){right:10%;top:28%;animation-delay:.3s}.wc-sparkles i:nth-child(4){right:22%;top:70%;animation-delay:.42s}.wc-sparkles i:nth-child(5){left:12%;top:72%;animation-delay:.54s}.wc-bottom{flex-shrink:0;width:100%;padding-bottom:0;text-align:center;pointer-events:auto}.wc-percentile{margin:0 0 5px;color:#2fb8f0;font-size:.68rem;font-weight:700}.wc-code{color:rgba(255,255,255,.72);font-size:.64rem;line-height:1.35;margin-bottom:6px}.wc-code b{color:#fff;letter-spacing:.03em}.wc-view-ticket{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-bottom:6px;padding:8px 10px;background:#1e6bff;border:1px solid #2fb8f0;color:#fff;font-size:.7rem;font-weight:800;cursor:pointer}.wc-actions{display:flex;gap:7px}.wc-details,.wc-showoff{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;font-size:.7rem;font-weight:800;cursor:pointer}.wc-details{background:rgba(8,31,76,.72);border:1px solid rgba(255,255,255,.4);color:#fff}.wc-showoff{background:linear-gradient(135deg,#1e6bff,#1246a8);color:#fff;border:none}.wc-showoff:disabled{opacity:.6;cursor:default}.wc-confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}.wc-confetti span{position:absolute;top:-12px;width:5px;height:9px;opacity:.7;animation:wc-fall linear 1;animation-iteration-count:1}@keyframes wc-fall{0%{transform:translateY(-12px) rotate(0deg);opacity:1}100%{transform:translateY(120vh) rotate(420deg);opacity:0}}@keyframes wc-shimmer{0%{background-position:-200% center}100%{background-position:200% center}}@keyframes wc-trophy-in{from{opacity:0;transform:scale(.86) translateY(10px)}to{opacity:1;transform:none}}@keyframes wc-shine{from{opacity:0;transform:skewX(-22deg) translateX(-90px)}30%{opacity:1}to{opacity:0;transform:skewX(-22deg) translateX(90px)}}@keyframes wc-sparkle{0%{opacity:0;transform:scale(.4) translateY(4px)}40%{opacity:1}100%{opacity:0;transform:scale(1) translateY(-7px)}}@media(prefers-reduced-motion:reduce){.wc-shimmer,.wc-trophy,.wc-confetti span,.wc-shine,.wc-sparkles i{animation:none}.wc-confetti,.wc-shine,.wc-sparkles{display:none}}@media(max-width:380px){.wc-shimmer{font-size:28px}.wc-amount strong{font-size:20px}.wc-trophy-stage{flex-basis:160px}.wc-trophy{width:min(176px,48vw);height:min(176px,48vw)}}
    .wc-overlay{justify-content:center}.wc-stage{flex:0 0 auto;justify-content:center}.wc-headline{margin-top:0}.wc-trophy-stage{margin:0 0 clamp(22px,4vh,34px)}.wc-bottom{margin-top:0}.wc-view-ticket{border:0;border-radius:10px;margin:0 auto 10px;min-height:42px;background:linear-gradient(135deg,#2fb8f0,#1e6bff 55%,#1246a8);box-shadow:0 8px 18px rgba(0,0,0,.24);font-size:.76rem;letter-spacing:.01em;transition:transform .2s ease,filter .2s ease}.wc-view-ticket:hover{filter:brightness(1.08);transform:translateY(-1px)}.wc-actions{max-width:360px;margin:0 auto;gap:10px}.wc-details,.wc-showoff{min-height:40px;border-radius:10px;padding:9px 12px;font-size:.74rem;transition:transform .2s ease,background .2s ease}.wc-details{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.36);color:#fff}.wc-details:hover{background:rgba(255,255,255,.18);transform:translateY(-1px)}.wc-showoff{border:1px solid rgba(126,219,255,.55);background:linear-gradient(135deg,#1e6bff,#1246a8);box-shadow:0 6px 14px rgba(0,0,0,.2)}.wc-showoff:hover{transform:translateY(-1px);filter:brightness(1.08)}
  `}</style>;
}
