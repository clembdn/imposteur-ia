import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AVATARS, generateRoomCode } from "@aip/shared";
import { createGame, joinGame } from "../lib/colyseus";
import { useGameStore } from "../store";

export function Home() {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string>(AVATARS[0]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const error = useGameStore((s) => s.error);
  const setError = useGameStore((s) => s.setError);

  const canPlay = name.trim().length >= 2;

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("code");
    if (fromUrl) setCode(fromUrl.toUpperCase());
  }, []);

  async function handleCreate() {
    if (!canPlay || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createGame({ name, avatar, code: generateRoomCode() });
    } catch {
      setError("Impossible de créer la partie. Le serveur est-il lancé ?");
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    if (!canPlay || busy) return;
    if (code.trim().length < 4) {
      setError("Entre un code de salon valide.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await joinGame({ name, avatar, code });
    } catch {
      setError("Salon introuvable. Vérifie le code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="arcade-card mx-auto w-full max-w-md p-6"
    >
      <label className="mb-1 block font-display text-sm tracking-wide text-neon-cyan">
        Ton pseudo
      </label>
      <input
        className="arcade-input mb-4 w-full"
        placeholder="ex: Léa"
        maxLength={20}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <label className="mb-2 block font-display text-sm tracking-wide text-neon-cyan">
        Ton avatar
      </label>
      <div className="mb-5 grid grid-cols-5 gap-2">
        {AVATARS.map((a) => (
          <button
            key={a}
            onClick={() => setAvatar(a)}
            className={`rounded-xl border-2 py-2 text-2xl transition ${
              avatar === a
                ? "border-neon-pink bg-night-700 shadow-neon"
                : "border-night-600 bg-night-900/60"
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      <button
        onClick={handleCreate}
        disabled={!canPlay || busy}
        className="arcade-btn mb-4 w-full bg-neon-pink text-night-900"
      >
        Créer une partie
      </button>

      <div className="mb-3 flex items-center gap-3 text-white/40">
        <div className="h-px flex-1 bg-white/15" />
        <span className="text-xs">ou rejoindre</span>
        <div className="h-px flex-1 bg-white/15" />
      </div>

      <div className="flex gap-2">
        <input
          className="arcade-input w-full uppercase tracking-[0.3em]"
          placeholder="CODE"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button
          onClick={handleJoin}
          disabled={!canPlay || busy}
          className="arcade-btn whitespace-nowrap bg-neon-cyan text-night-900"
        >
          Rejoindre
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border-2 border-neon-pink/60 bg-neon-pink/10 px-3 py-2 text-sm text-neon-pink">
          {error}
        </p>
      )}
    </motion.div>
  );
}
