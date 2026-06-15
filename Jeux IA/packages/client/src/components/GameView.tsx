import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ClientMessage,
  ROLE_LABELS,
  WINNER_LABELS,
  type Role,
} from "@aip/shared";
import { useGameStore } from "../store";
import { leaveGame } from "../lib/colyseus";
import { Chat } from "./Chat";

function useCountdown(endsAt: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

function roleColor(role?: Role) {
  if (role === "impostor") return "text-neon-pink";
  if (role === "ai") return "text-neon-cyan";
  return "text-neon-green";
}

export function GameView() {
  const snap = useGameStore((s) => s.snap)!;
  const myId = useGameStore((s) => s.myId);
  const myRole = useGameStore((s) => s.myRole);
  const room = useGameStore((s) => s.room);
  const remaining = useCountdown(snap.phaseEndsAt);

  const me = snap.players.find((p) => p.id === myId);
  const myVote = snap.votes[myId ?? ""];

  const voteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(snap.votes).forEach((target) => {
      if (target && target !== "skip") counts[target] = (counts[target] ?? 0) + 1;
    });
    return counts;
  }, [snap.votes]);

  function vote(targetId: string) {
    if (snap.phase !== "vote" || !me?.alive) return;
    room?.send(ClientMessage.Vote, { targetId });
  }

  if (snap.phase === "end") return <EndScreen />;

  const phaseLabel =
    snap.phase === "discussion" ? "Discussion" : snap.phase === "vote" ? "Vote" : "Révélation";

  return (
    <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-[1fr_1.4fr]">
      <div className="flex flex-col gap-4">
        <div className="arcade-card p-5 text-center">
          <p className="text-sm text-white/60">
            Round {snap.round} · {phaseLabel}
          </p>
          {snap.phase !== "reveal" && (
            <p className="mt-1 font-display text-4xl text-neon-yellow">
              {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
            </p>
          )}
          {myRole && (
            <p className="mt-2 text-sm">
              Ton rôle :{" "}
              <span className={`font-display tracking-wide ${roleColor(myRole)}`}>
                {ROLE_LABELS[myRole]}
              </span>
              {!me?.alive && <span className="text-white/40"> · éliminé 👻</span>}
            </p>
          )}
        </div>

        <div className="arcade-card flex-1 p-4">
          <h2 className="mb-3 font-display tracking-wide text-neon-yellow">
            {snap.phase === "vote" ? "Vote : qui éliminer ?" : "Joueurs"}
          </h2>
          <ul className="space-y-2">
            {snap.players.map((p) => {
              const revealed = snap.roleReveal[p.id];
              const count = voteCounts[p.id] ?? 0;
              const isMyVote = myVote === p.id;
              const clickable = snap.phase === "vote" && me?.alive && p.alive;
              return (
                <li
                  key={p.id}
                  className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2 transition ${
                    p.alive
                      ? "border-night-600 bg-night-900/50"
                      : "border-transparent bg-night-900/20 opacity-50"
                  } ${isMyVote ? "!border-neon-pink shadow-neon" : ""} ${
                    clickable ? "cursor-pointer hover:border-neon-cyan" : ""
                  }`}
                  onClick={() => clickable && vote(p.id)}
                >
                  <span className="text-2xl">{p.avatar}</span>
                  <span className={`flex-1 font-semibold ${!p.alive ? "line-through" : ""}`}>
                    {p.name}
                    {p.id === myId && <span className="text-white/40"> (toi)</span>}
                    {revealed && (
                      <span className={`ml-2 text-xs ${roleColor(revealed)}`}>
                        {ROLE_LABELS[revealed]}
                      </span>
                    )}
                  </span>
                  {snap.phase === "vote" && count > 0 && (
                    <span className="rounded-full bg-neon-pink/20 px-2 py-0.5 text-xs font-bold text-neon-pink">
                      {count} 🗳️
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          {snap.phase === "vote" && me?.alive && (
            <button
              onClick={() => vote("skip")}
              className={`arcade-btn mt-3 w-full text-sm ${
                myVote === "skip" ? "bg-neon-yellow text-night-900" : "bg-white/15 text-white"
              }`}
            >
              Passer mon tour
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-[420px] flex-col md:min-h-0">
        <Chat />
      </div>
    </div>
  );
}

function EndScreen() {
  const snap = useGameStore((s) => s.snap)!;
  const myId = useGameStore((s) => s.myId);
  const label = snap.winner ? WINNER_LABELS[snap.winner] : "";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mx-auto w-full max-w-lg"
    >
      <div className="arcade-card p-6 text-center">
        <p className="text-sm text-white/60">Partie terminée</p>
        <h2 className="mt-1 font-display text-3xl text-neon-yellow">{label} gagne ! 🏆</h2>

        <ul className="mt-5 space-y-2 text-left">
          {snap.players.map((p) => {
            const role = snap.roleReveal[p.id];
            return (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-xl border-2 border-night-600 bg-night-900/50 px-3 py-2"
              >
                <span className="text-2xl">{p.avatar}</span>
                <span className="flex-1 font-semibold">
                  {p.name}
                  {p.id === myId && <span className="text-white/40"> (toi)</span>}
                </span>
                <span className={`font-display text-sm ${roleColor(role)}`}>
                  {role ? ROLE_LABELS[role] : "?"}
                </span>
              </li>
            );
          })}
        </ul>

        <button
          onClick={leaveGame}
          className="arcade-btn mt-6 w-full bg-neon-cyan text-night-900"
        >
          Quitter le salon
        </button>
      </div>
    </motion.div>
  );
}
