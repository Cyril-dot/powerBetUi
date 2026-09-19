import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Bookmark, ChevronRight, Clock3, RefreshCw, Share2, TrendingUp } from "lucide-react";
import api, { ApiError, type Bet } from "@/lib/api";

/**
 * "Recommended Football Codes" — the popular-code rail shown on the empty
 * Open Bets state (reference: sportybet.com "Open Bets" tab). These are
 * curated booking codes an operator publishes for people with no bets yet;
 * redeeming one loads its selections into the live betslip via
 * api.booking.redeem, exactly like typing the code in manually.
 *
 * The match/odds copy below is illustrative placeholder content — swap in
 * whatever codes the admin/booking-codes endpoint is actually publishing
 * once that feed is wired up, or fetch them from an endpoint if/when one
 * exists (there isn't a "list published codes" route in api.ts today).
 */
interface RecommendedCode {
  code: string;
  folds: number;
  odds: number;
  legs: { market: string; label: string; odd: number }[];
}

const RECOMMENDED_CODES: RecommendedCode[] = [
  {
    code: "CFDJN8", folds: 9, odds: 82.44,
    legs: [
      { market: "SC Pisa vs Empoli", label: "Home or Draw · Double Chance", odd: 1.31 },
      { market: "Sassuolo vs Cesena FC", label: "Home or Draw · Double Chance", odd: 1.21 },
      { market: "Estudiantes vs Atletico T.", label: "Over 0.5 · Over/Under", odd: 1.14 },
    ],
  },
  {
    code: "C5BEGS", folds: 19, odds: 485.40,
    legs: [
      { market: "Mohun B. vs Jamshedpur", label: "Home · 1X2", odd: 1.61 },
    ],
  },
];

function RecommendedCodeCard({ code, onRedeem, redeeming }: { code: RecommendedCode; onRedeem: (c: string) => void; redeeming: boolean }) {
  return (
    <div className="rc-card">
      <div className="rc-card-head">
        <span className="rc-code"><Bookmark size={12} /> {code.code}</span>
        <span className="rc-meta">Folds: <b>{code.folds}</b></span>
        <span className="rc-meta">Odds: <b>{code.odds.toFixed(2)}</b></span>
      </div>
      <div className="rc-reward"><TrendingUp size={12} /> 1UP or 2UP rewards you early when your team leads!</div>
      <div className="rc-legs">
        {code.legs.slice(0, 3).map((leg, i) => (
          <div className="rc-leg" key={i}>
            <div>
              <b>{leg.label}</b>
              <small>{leg.market}</small>
            </div>
            <span>{leg.odd.toFixed(2)}</span>
          </div>
        ))}
        {code.legs.length > 3 && <small className="rc-more">…and {code.legs.length - 3} other match{code.legs.length - 3 > 1 ? "es" : ""}</small>}
      </div>
      <div className="rc-actions">
        <button
          type="button" className="rc-share"
          onClick={() => { navigator.clipboard?.writeText(code.code).catch(() => undefined); }}
        >
          <Share2 size={13} /> Share
        </button>
        <button type="button" className="rc-add" disabled={redeeming} onClick={() => onRedeem(code.code)}>
          {redeeming ? "Adding…" : "Add to Betslip"}
        </button>
      </div>
    </div>
  );
}

export default function OpenBetsPage() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [redeemingCode, setRedeemingCode] = useState("");
  const [redeemNotice, setRedeemNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const page = await api.bets.getMine(0, 50);
      setBets((page.content ?? []).filter((b) => b.status === "PENDING"));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? "Sign in to view your open bets." : "Open bets are temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const redeemCode = async (code: string) => {
    setRedeemingCode(code);
    setRedeemNotice(null);
    try {
      await api.booking.redeem({ code });
      setRedeemNotice({ type: "success", text: `Code ${code} added — head to your betslip to place it.` });
    } catch (e) {
      setRedeemNotice({ type: "error", text: e instanceof ApiError ? e.message : "That code could not be added right now." });
    } finally {
      setRedeemingCode("");
    }
  };

  return (
    <main className="wrap support-page">
      <OpenBetsStyles />
      <div className="bp-header">
        <div><span className="eyebrow">Active</span><h1 style={{ fontSize: 40 }}>Open Bets</h1></div>
        <button className="text-action" onClick={load} type="button"><RefreshCw size={12} /> Refresh</button>
      </div>

      <section className="panel simple-card" style={{ gridColumn: "1 / -1" }}>
        {loading ? (
          <p className="muted">Loading open bets…</p>
        ) : error ? (
          <>
            <Clock3 size={24} />
            <p className="muted">{error}</p>
            <Link href="/login" className="gold-button" style={{ marginTop: 12, display: "inline-flex" }}>Sign in</Link>
          </>
        ) : bets.length === 0 ? (
          <div className="ob-empty">
            <span className="ob-empty-emoji">🎟️⚽</span>
            <h3>No bets? No problem!</h3>
            <p>Get started with popular codes!</p>
          </div>
        ) : (
          bets.map((bet) => (
            <div className="activity-row" key={bet.id} style={{ alignItems: "flex-start" }}>
              <span className="activity-icon"><Clock3 size={14} /></span>
              <div style={{ flex: 1 }}>
                {bet.selections.map((s, i) => (
                  <div key={s.id ?? i} style={{ marginBottom: 4 }}>
                    <b>{s.homeTeam ?? "Home"} v {s.awayTeam ?? "Away"}</b>
                    <small style={{ marginLeft: 8 }}>{s.market} · {s.selection} @ {s.oddsLocked?.toFixed(2)}</small>
                  </div>
                ))}
                <small>Placed {new Date(bet.placedAt).toLocaleString()} · Stake GHS {bet.stake.toFixed(2)}</small>
              </div>
              <strong style={{ color: "var(--gold-hi)" }}>GHS {bet.potentialReturn.toFixed(2)}</strong>
            </div>
          ))
        )}
      </section>

      {bets.length === 0 && !loading && !error && (
        <section className="panel simple-card rc-section" style={{ gridColumn: "1 / -1" }}>
          <div className="module-title">
            <h3><Bookmark size={15} /> Recommended Football Codes</h3>
          </div>
          {redeemNotice && (
            <small className={redeemNotice.type === "error" ? "auth-notice" : "auth-notice bp-success"} style={{ display: "block", marginBottom: 10 }}>
              {redeemNotice.text}
            </small>
          )}
          <div className="rc-list">
            {RECOMMENDED_CODES.map((c) => (
              <RecommendedCodeCard key={c.code} code={c} onRedeem={redeemCode} redeeming={redeemingCode === c.code} />
            ))}
          </div>
          <Link href="/" className="text-action" style={{ marginTop: 14 }}>Browse more matches <ChevronRight size={12} /></Link>
        </section>
      )}
    </main>
  );
}

function OpenBetsStyles() {
  return (
    <style>{`
      .ob-empty{ display:flex; flex-direction:column; align-items:center; text-align:center; padding:34px 20px 26px; }
      .ob-empty-emoji{ font-size:44px; line-height:1; margin-bottom:14px; }
      .ob-empty h3{ font:800 20px 'DM Sans',sans-serif; color:#F4F1F0; margin:0; }
      .ob-empty p{ margin:6px 0 0; color:#8b8b8b; font-size:.85rem; }

      .rc-section .module-title h3{ display:flex; align-items:center; gap:7px; }
      .rc-list{ display:flex; flex-direction:column; gap:12px; margin-top:14px; }
      .rc-card{ border:1px solid var(--line); border-radius:12px; padding:14px 16px; background:#141414; }
      .rc-card-head{ display:flex; align-items:center; gap:14px; flex-wrap:wrap; margin-bottom:8px; }
      .rc-code{ display:inline-flex; align-items:center; gap:5px; font-weight:800; color:var(--nature); font-size:.86rem; }
      .rc-meta{ font-size:.72rem; color:#8b8b8b; }
      .rc-meta b{ color:#F4F1F0; }
      .rc-reward{
        display:flex; align-items:center; gap:6px; font-size:.7rem; color:var(--nature);
        background:rgba(13,166,83,.09); border-radius:7px; padding:6px 9px; margin-bottom:10px;
      }
      .rc-legs{ display:flex; flex-direction:column; gap:7px; }
      .rc-leg{ display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:.78rem; padding:6px 0; border-top:1px solid var(--line); }
      .rc-leg:first-child{ border-top:none; }
      .rc-leg b{ display:block; color:#F4F1F0; }
      .rc-leg small{ color:#8b8b8b; font-size:.68rem; }
      .rc-leg span{ font-weight:800; color:var(--gold-hi); flex-shrink:0; }
      .rc-more{ color:#8b8b8b; padding-top:2px; }
      .rc-actions{ display:flex; gap:8px; margin-top:12px; }
      .rc-share{
        display:flex; align-items:center; gap:6px; padding:9px 14px; border-radius:8px; background:#232323;
        color:#9a9a9a; font-size:.74rem; font-weight:700; cursor:pointer;
      }
      .rc-add{
        flex:1; display:flex; align-items:center; justify-content:center; padding:9px 14px; border-radius:8px;
        background:var(--nature); color:#fff; font-size:.78rem; font-weight:800; cursor:pointer;
      }
      .rc-add:disabled{ opacity:.6; cursor:default; }
    `}</style>
  );
}
