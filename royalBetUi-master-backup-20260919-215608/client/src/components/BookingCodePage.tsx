import { useState } from "react";
import { useLocation } from "wouter";
import { Ticket, ChevronRight, Search, ArrowLeft, Loader2, CircleCheck, CircleX } from "lucide-react";
import api, { ApiError } from "../lib/api";
import { buildMatchLabel, extractOdds, selectionToPick } from "../lib/bookingCode";
import type { Pick } from "./Sportsbook";

export default function BookingCodePage({ picks, setPicks }: { picks: Pick[]; setPicks: (p: Pick[]) => void }) {
  const [, setLocation] = useLocation();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selections, setSelections] = useState<Record<string, unknown>[]>([]);
  const [bookingCode, setBookingCode] = useState("");
  const [totalOdd, setTotalOdd] = useState(0);
  const [added, setAdded] = useState(false);

  const handleLoad = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError("Please enter a booking code.");
      return;
    }
    setError("");
    setLoading(true);
    setSelections([]);
    setAdded(false);
    try {
      const result = await api.booking.redeem({ code: trimmed });
      const enriched = result.enrichedSelections ?? [];
      if (enriched.length === 0) {
        setError("That code has no valid selections right now.");
      } else {
        setSelections(enriched);
        setBookingCode(String(result.booking?.code ?? trimmed));
        setTotalOdd(result.currentTotalOdds ?? Number(result.booking?.totalOdds ?? 0) ?? enriched.reduce((a, s) => a * extractOdds(s), 1));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Booking code not found. Please check the code and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddToSlip = () => {
    const mapped = selections.map(selectionToPick);
    const existingKeys = new Set(picks.map((p) => `${p.id}-${p.market}-${p.selection}`));
    const fresh = mapped.filter((p) => !existingKeys.has(`${p.id}-${p.market}-${p.selection}`));
    if (fresh.length > 0) setPicks([...picks, ...fresh]);
    setAdded(true);
    setTimeout(() => setLocation("/betslip"), 700);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleLoad();
  };

  return (
    <main className="wrap simple-page" style={{ maxWidth: 560, margin: "0 auto", paddingTop: 24 }}>
      {/* Back button */}
      <button
        type="button"
        onClick={() => setLocation("/")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          color: "var(--muted)",
          fontSize: 13,
          cursor: "pointer",
          padding: "0 0 18px",
        }}
      >
        <ArrowLeft size={15} /> Back to home
      </button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <span
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "#1e6bff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Ticket size={20} color="#ffffff" />
        </span>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Load booking code</h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
            Enter a code shared by another user to copy their bet slip.
          </p>
        </div>
      </div>

      {/* Input card */}
      <section
        className="panel"
        style={{
          marginTop: 22,
          padding: "20px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Booking code
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              placeholder="e.g. RBGH12345"
              maxLength={20}
              style={{
                flex: 1,
                padding: "10px 13px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text)",
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: "0.1em",
                outline: "none",
              }}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={handleLoad}
              disabled={loading}
              className="gold-button"
              style={{ minWidth: 52, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }}
            >
              {loading ? <Loader2 size={17} style={{ animation: "spin 0.8s linear infinite" }} /> : <Search size={17} />}
            </button>
          </div>
        </label>

        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 13px",
              borderRadius: 8,
              background: "rgba(220,60,60,0.08)",
                      color: "#1246a8",
              fontSize: 13,
            }}
          >
            <CircleX size={15} />
            {error}
          </div>
        )}

        {/* Loaded selections preview */}
        {selections.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "var(--nature, #4caf50)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <CircleCheck size={15} />
              Booking code {bookingCode} loaded — {selections.length} selection{selections.length !== 1 ? "s" : ""}
            </div>

            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              {selections.map((s, i) => (
                <div
                  key={i}
                  style={{
                    padding: "11px 14px",
                    borderBottom: i < selections.length - 1 ? "1px solid var(--border)" : "none",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.4 }}>
                      {buildMatchLabel(s)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                      {String(s.market ?? "")} · <strong style={{ color: "var(--text)" }}>{String(s.selection ?? "")}</strong>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#1246a8",
                      flexShrink: 0,
                    }}
                  >
                    {extractOdds(s).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "var(--surface)",
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              <span style={{ color: "var(--muted)" }}>Total odds</span>
              <strong style={{ color: "#1246a8", fontSize: 15 }}>
                {totalOdd.toFixed(2)}
              </strong>
            </div>

            <button
              type="button"
              className="gold-button full"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              onClick={handleAddToSlip}
              disabled={added}
            >
              {added ? <><CircleCheck size={15} /> Added — opening betslip…</> : <>Add to betslip <ChevronRight size={15} /></>}
            </button>
          </div>
        )}
      </section>

      {/* Info tip */}
      {selections.length === 0 && (
        <p
          style={{
            fontSize: 12,
            color: "var(--muted)",
            textAlign: "center",
            marginTop: 20,
            lineHeight: 1.7,
          }}
        >
          Booking codes let you instantly load a pre-built bet shared by another user.
          <br />
          You can find them shared in chats or generated from your own betslip.
        </p>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </main>
  );
}
