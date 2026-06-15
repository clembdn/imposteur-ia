import { useGameStore } from "./store";
import { Home } from "./components/Home";
import { Lobby } from "./components/Lobby";
import { GameView } from "./components/GameView";

export default function App() {
  const snap = useGameStore((s) => s.snap);
  const room = useGameStore((s) => s.room);

  let screen = <Home />;
  if (room && snap) {
    screen = snap.phase === "lobby" ? <Lobby /> : <GameView />;
  }

  return (
    <div className="scanlines min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-6">
        <header className="mb-6 text-center">
          <h1 className="font-display text-4xl tracking-wider text-neon-yellow drop-shadow-[3px_3px_0_rgba(0,0,0,0.6)] md:text-5xl">
            AI <span className="text-neon-pink">IMPOSTOR</span>{" "}
            <span className="text-neon-cyan">PARTY</span>
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Tout le monde est anonyme… une IA se cache parmi vous. Démasquez-la ! 🤖
          </p>
        </header>

        <main className="flex flex-1 flex-col">{screen}</main>
      </div>
    </div>
  );
}
