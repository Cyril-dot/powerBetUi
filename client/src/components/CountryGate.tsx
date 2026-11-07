import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useSession } from "@/lib/session";
import { COUNTRY_LIST, normalizeCountry, type CountryCode } from "@/lib/country";

/**
 * Enforced country setup. Accounts created before signup collected a
 * country have none on their server record — when such a user enters,
 * this gate appears and CANNOT be dismissed: they pick a country, it is
 * saved to the account (PATCH /api/users/me), and the whole app
 * (currency, deposit rail) follows it. Only a POSITIVE read of an
 * empty country triggers the gate — if the profile can't be read we
 * never lock anyone out on a guess.
 */
let gateChecked = false;
let gateNeeded = false;
const listeners = new Set<() => void>();
function notify() { listeners.forEach((fn) => fn()); }

async function checkGate() {
  if (gateChecked) return;
  gateChecked = true;
  if (!window.localStorage.getItem("accessToken")) return;
  try {
    const me = await api.user.me();
    const raw = (me as { country?: unknown })?.country ??
      (me as { user?: { country?: unknown } })?.user?.country;
    if (raw == null || String(raw).trim() === "") {
      gateNeeded = true;
      notify();
    }
  } catch {
    gateChecked = false; // unverified — allow retry on a later mount, never gate blind
  }
}

export default function CountryGate() {
  const { refresh } = useSession();
  const [, setTick] = useState(0);
  const [selected, setSelected] = useState<CountryCode | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const needed = gateNeeded;

  useEffect(() => {
    const fn = () => setTick((x) => x + 1);
    listeners.add(fn);
    void checkGate();
    return () => { listeners.delete(fn); };
  }, []);

  // The gate owns the screen while it is up.
  useEffect(() => {
    if (!needed) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [needed]);

  if (!needed) return null;

  async function save() {
    if (!selected || saving) return;
    setSaving(true);
    setError("");
    try {
      await api.user.update({ country: selected });
      gateNeeded = false;
      notify();
      refresh();
    } catch {
      setError("Could not save that — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-country-gate" role="dialog" aria-modal="true" aria-label="Choose your country">
      <div className="pb-country-gate-card">
        <span className="pb-country-gate-eyebrow">One quick step</span>
        <h2>Where are you playing from?</h2>
        <p>Your country decides your currency and how you deposit — Ghana pays with MoMo, Nigeria pays with Flutterwave. Pick once and it sticks to your account.</p>
        <div className="pb-country-gate-choices" role="group" aria-label="Country">
          {COUNTRY_LIST.map((c) => (
            <button
              key={c.code}
              type="button"
              className={selected === c.code ? "selected" : ""}
              onClick={() => setSelected(c.code)}
              aria-pressed={selected === c.code}
            >
              <span className="pb-country-gate-flag" aria-hidden="true">{c.flag}</span>
              <b>{c.name}</b>
              <small>{c.currency} · {c.code === "GH" ? "MoMo" : "Flutterwave"}</small>
            </button>
          ))}
        </div>
        {error && <div className="pb-country-gate-error" role="alert">{error}</div>}
        <button type="button" className="gold-button full pb-country-gate-save" onClick={save} disabled={!selected || saving}>
          {saving ? "Saving…" : "Save my country"}
        </button>
        <small className="pb-country-gate-note">You can’t skip this — deposits and your balance need to know your country first.</small>
      </div>
      <style>{`
        .pb-country-gate{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(6,18,38,.82);backdrop-filter:blur(3px)}
        .pb-country-gate-card{width:min(420px,100%);padding:28px 24px 22px;text-align:center;border-radius:18px;background:#fff;color:#20242d;box-shadow:0 24px 60px rgba(0,0,0,.45)}
        .pb-country-gate-eyebrow{display:block;margin-bottom:8px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#00a651}
        .pb-country-gate-card h2{margin:0 0 8px;font-size:22px;line-height:1.2;font-weight:900;letter-spacing:-.02em}
        .pb-country-gate-card p{margin:0 auto 20px;max-width:330px;font-size:14px;line-height:1.5;color:#5b6470}
        .pb-country-gate-choices{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
        .pb-country-gate-choices button{display:flex;flex-direction:column;align-items:center;gap:2px;padding:16px 10px 14px;border:2px solid #e3e3ef;border-radius:14px;background:#fff;color:#20242d;cursor:pointer;font-family:inherit}
        .pb-country-gate-choices button.selected{border-color:#00a651;background:#eafaf0}
        .pb-country-gate-flag{font-size:30px;line-height:1}
        .pb-country-gate-choices b{font-size:15px}
        .pb-country-gate-choices small{font-size:12px;color:#6b7280}
        .pb-country-gate-error{margin:0 0 12px;padding:10px 12px;border-radius:10px;background:#fdecec;color:#b3261e;font-size:13px;font-weight:600}
        .pb-country-gate-save{margin-bottom:12px}
        .pb-country-gate-save:disabled{opacity:.55;cursor:not-allowed}
        .pb-country-gate-note{display:block;font-size:12px;line-height:1.45;color:#8a94a0}
      `}</style>
    </div>
  );
}
