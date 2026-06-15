import { useEffect, useMemo, useRef, useState } from "react";
import { ClientMessage, COLOR_BY_KEY } from "@aip/shared";
import { useGameStore } from "../store";

export function Chat() {
  const [text, setText] = useState("");
  const room = useGameStore((s) => s.room);
  const snap = useGameStore((s) => s.snap);
  const myId = useGameStore((s) => s.myId);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = useMemo(() => snap?.messages ?? [], [snap]);
  const me = snap?.players.find((p) => p.id === myId);
  const phase = snap?.phase;

  // Pendant la discussion : on ne peut parler QUE pendant son tour.
  const myTurn = phase === "discussion" && snap?.currentSpeakerId === myId;
  const canChat =
    !!me &&
    (phase === "lobby" ||
      phase === "end" ||
      (me.alive && (phase === "vote" || myTurn)));

  const typingPlayer =
    snap?.typingId && snap.typingId !== myId
      ? snap.players.find((p) => p.id === snap.typingId)
      : undefined;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, typingPlayer?.id]);

  function send() {
    const value = text.trim();
    if (!value || !room || !canChat) return;
    room.send(ClientMessage.Chat, { text: value });
    setText("");
  }

  function placeholder(): string {
    if (!me?.alive && phase !== "lobby" && phase !== "end") return "tu es éliminé 👻";
    if (phase === "discussion" && !myTurn) return "attends ton tour… 🤫";
    if (myTurn) return "à toi de parler ! réponds au thème…";
    return "écris un message…";
  }

  return (
    <div className="arcade-card flex h-full min-h-0 flex-col">
      <div className="border-b-2 border-night-600 px-4 py-2 font-display text-sm tracking-wide text-neon-yellow">
        Chat
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {messages.map((m) => {
          if (m.system) {
            return (
              <p key={m.id} className="text-center text-xs italic text-white/40">
                {m.text}
              </p>
            );
          }
          const mine = m.senderId === myId;
          const color = COLOR_BY_KEY[m.colorKey] || "#FF2E97";
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  mine ? "bg-neon-cyan/20 text-white" : "bg-night-700 text-white/90"
                }`}
              >
                {!mine && (
                  <span
                    className="mb-0.5 block text-xs font-semibold"
                    style={{ color }}
                  >
                    {m.senderName}
                  </span>
                )}
                {m.text}
              </div>
            </div>
          );
        })}
        {typingPlayer && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-night-700 px-3 py-2 text-sm text-white/60">
              <span
                className="font-semibold"
                style={{ color: COLOR_BY_KEY[typingPlayer.colorKey] || "#FF2E97" }}
              >
                {typingPlayer.displayName || typingPlayer.name}
              </span>{" "}
              écrit<span className="animate-pulse">…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t-2 border-night-600 p-3">
        <input
          className="arcade-input w-full"
          placeholder={placeholder()}
          value={text}
          maxLength={300}
          disabled={!canChat}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button
          onClick={send}
          disabled={!canChat}
          className="arcade-btn bg-neon-green text-night-900"
        >
          Envoyer
        </button>
      </div>
    </div>
  );
}
