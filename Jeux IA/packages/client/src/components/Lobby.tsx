import { useState } from "react";
import { motion } from "framer-motion";
import {
  ClientMessage,
  DEV_MIN_PLAYERS,
  DUO_MIN_PLAYERS,
  MAX_PLAYERS,
  type GameMode,
} from "@aip/shared";
import { useGameStore } from "../store";
import { Chat } from "./Chat";

function inviteLink(code: string): string {
  const url = new URL(window.location.origin);
  url.searchParams.set("code", code);
  return url.toString();
}

export function Lobby() {
  const room = useGameStore((s) => s.room);
  const snap = useGameStore((s) => s.snap)!;
  const myId = useGameStore((s) => s.myId);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const me = snap.players.find((p) => p.id === myId);
  const isHost = snap.hostId === myId;
  const enoughPlayers = snap.players.length >= DEV_MIN_PLAYERS;
  const shareUrl = inviteLink(snap.code);

  function toggleReady() {
    room?.send(ClientMessage.Ready, { ready: !me?.ready });
  }

  function start() {
    room?.send(ClientMessage.Start, {});
  }

  async function copyCode() {
    await navigator.clipboard?.writeText(snap.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1500);
  }

  async function copyInviteLink() {
    await navigator.clipboard?.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1500);
  }

  return (
    <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-[1fr_1.2fr]">
      <div className="flex flex-col gap-4">
        <div className="arcade-card p-5 text-center">
          <p className="text-sm text-white/60">Code du salon</p>
          <button
            onClick={copyCode}
            className="mt-1 font-display text-4xl tracking-[0.4em] text-neon-cyan hover:text-neon-yellow"
            title="Cliquer pour copier"
          >
            {snap.code}
          </button>
          <p className="mt-1 text-xs text-white/40">
            {copiedCode ? "Code copié ✅" : "Clique pour copier le code"}
          </p>
          <button
            onClick={copyInviteLink}
            className="mt-3 w-full rounded-xl border-2 border-neon-cyan/40 bg-neon-cyan/10 px-3 py-2 text-left text-xs text-white/80 hover:border-neon-cyan"
            title="Copier le lien d'invitation"
          >
            <span className="block font-display text-neon-cyan">Lien réseau</span>
            <span className="mt-1 block truncate font-mono text-[11px] text-white/60">
              {shareUrl}
            </span>
            <span className="mt-1 block text-white/40">
              {copiedLink ? "Lien copié ✅" : "Clique pour copier — envoie-le à tes amis sur le même Wi‑Fi"}
            </span>
          </button>
        </div>

        {isHost && <HostConfig />}

        <div className="arcade-card flex-1 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display tracking-wide text-neon-yellow">Joueurs</h2>
            <span className="text-sm text-white/50">
              {snap.players.length}/{MAX_PLAYERS}
            </span>
          </div>
          <ul className="space-y-2">
            {snap.players.map((p) => (
              <motion.li
                key={p.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 rounded-xl border-2 border-night-600 bg-night-900/50 px-3 py-2"
              >
                <span className="text-2xl">{p.avatar}</span>
                <span className="flex-1 font-semibold">
                  {p.name}
                  {p.id === myId && <span className="text-white/40"> (toi)</span>}
                  {p.id === snap.hostId && (
                    <span className="ml-2 rounded bg-neon-yellow/20 px-1.5 py-0.5 text-xs text-neon-yellow">
                      host
                    </span>
                  )}
                </span>
                {!p.connected && <span className="text-xs text-white/40">déconnecté…</span>}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    p.ready ? "bg-neon-green/20 text-neon-green" : "bg-white/10 text-white/50"
                  }`}
                >
                  {p.ready ? "prêt" : "en attente"}
                </span>
              </motion.li>
            ))}
          </ul>
        </div>

        <div className="flex gap-3">
          <button
            onClick={toggleReady}
            className={`arcade-btn flex-1 ${
              me?.ready ? "bg-white/20 text-white" : "bg-neon-green text-night-900"
            }`}
          >
            {me?.ready ? "Pas prêt" : "Je suis prêt"}
          </button>
          {isHost && (
            <button
              onClick={start}
              disabled={!enoughPlayers}
              className="arcade-btn flex-1 bg-neon-pink text-night-900"
            >
              Lancer la partie
            </button>
          )}
        </div>
        {isHost && !enoughPlayers && (
          <p className="text-center text-xs text-white/50">
            Il faut au moins {DEV_MIN_PLAYERS} joueurs pour lancer.
          </p>
        )}
      </div>

      <div className="flex min-h-[420px] flex-col md:min-h-0">
        <Chat />
      </div>
    </div>
  );
}

function HostConfig() {
  const room = useGameStore((s) => s.room);
  const snap = useGameStore((s) => s.snap)!;
  const [gameMode, setGameMode] = useState<GameMode>("solo");
  const [rounds, setRounds] = useState(2);
  const [turnsPerPlayer, setTurns] = useState(2);
  const [turnSeconds, setTurnSeconds] = useState(30);
  const [voteSeconds, setVote] = useState(30);

  const enoughForDuo = snap.players.length >= DUO_MIN_PLAYERS;

  function update(patch: Record<string, number | string>) {
    room?.send(ClientMessage.SetConfig, patch);
  }

  const numFields: Array<{
    label: string;
    value: number;
    set: (n: number) => void;
    key: string;
    min: number;
    max: number;
    step: number;
  }> = [
    { label: "Rounds", value: rounds, set: setRounds, key: "rounds", min: 1, max: 10, step: 1 },
    { label: "Prises de parole", value: turnsPerPlayer, set: setTurns, key: "turnsPerPlayer", min: 1, max: 4, step: 1 },
    { label: "Tour (s)", value: turnSeconds, set: setTurnSeconds, key: "turnSeconds", min: 15, max: 90, step: 5 },
    { label: "Vote (s)", value: voteSeconds, set: setVote, key: "voteSeconds", min: 10, max: 120, step: 5 },
  ];

  return (
    <div className="arcade-card p-4">
      <h2 className="mb-3 font-display tracking-wide text-neon-yellow">Réglages (host)</h2>

      <p className="mb-1 text-xs text-white/60">Mode de jeu</p>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {(["solo", "duo"] as GameMode[]).map((m) => {
          const disabled = m === "duo" && !enoughForDuo;
          return (
            <button
              key={m}
              disabled={disabled}
              onClick={() => {
                setGameMode(m);
                update({ gameMode: m });
              }}
              className={`rounded-xl border-2 px-2 py-2 text-xs font-semibold transition ${
                gameMode === m
                  ? "border-neon-pink bg-neon-pink/20 text-white"
                  : "border-night-600 bg-night-900/40 text-white/60"
              } ${disabled ? "cursor-not-allowed opacity-40" : "hover:border-neon-cyan"}`}
            >
              {m === "solo" ? "Solo · 1 IA" : `Duo · IA + imposteur`}
              {disabled && <span className="block text-[10px]">min. {DUO_MIN_PLAYERS} joueurs</span>}
            </button>
          );
        })}
      </div>

      <p className="mb-3 text-[11px] italic text-white/40">
        🎲 La personnalité de l'IA est tirée au hasard à chaque partie (pour rester indevinable).
      </p>

      <div className="grid grid-cols-4 gap-2">
        {numFields.map((f) => (
          <label key={f.key} className="text-center text-xs text-white/60">
            {f.label}
            <input
              type="number"
              className="arcade-input mt-1 w-full px-1 py-1 text-center text-base"
              value={f.value}
              min={f.min}
              max={f.max}
              step={f.step}
              onChange={(e) => {
                const n = Number(e.target.value);
                f.set(n);
                update({ [f.key]: n });
              }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
