import { useEffect, useRef, useState } from "react";
import api, { type Bet } from "@/lib/api";
import TrophyCelebration from "./TrophyCelebration";

const POLL_MS = 15_000;

/** Mounted once above the router so a newly settled win is visible on every route. */
export default function WinCelebrationModal() {
  const [queue, setQueue] = useState<Bet[]>([]);
  const processed = useRef<Set<string>>(new Set());
  const queued = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const checkForWins = async () => {
      const token = localStorage.getItem("accessToken") || sessionStorage.getItem("accessToken");
      if (!token || cancelled) return;
      try {
        const unseen = await api.bets.getUnseenWins();
        if (cancelled) return;
        const fresh = unseen.filter((bet) => {
          const id = bet.id;
          if (!id || processed.current.has(id) || queued.current.has(id)) return false;
          queued.current.add(id);
          processed.current.add(id);
          return true;
        });
        if (fresh.length) setQueue((current) => [...current, ...fresh]);
      } catch { /* a temporary polling failure should not interrupt the app */ }
    };
    void checkForWins();
    const timer = window.setInterval(checkForWins, POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const close = async () => {
    const bet = queue[0];
    if (!bet) return;
    try { await api.bets.dismissWin(bet.id); } catch { /* local queue still advances */ }
    queued.current.delete(bet.id);
    setQueue((current) => current.slice(1));
  };

  const bet = queue[0];
  return bet ? <TrophyCelebration key={bet.id} bet={bet} onClose={close} /> : null;
}
