import { useEffect, useMemo, useRef, useState } from "react";
import { ClientMessage } from "@aip/shared";
import { useGameStore } from "../store";

export function Chat() {
  const [text, setText] = useState("");
  const room = useGameStore((s) => s.room);
  const snap = useGameStore((s) => s.snap);
  const myId = useGameStore((s) => s.myId);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = useMemo(() => snap?.messages ?? [], [snap]);
  const me = snap?.players.find((p) => p.id === myId);
  const canChat = !!me && (me.alive || snap?.phase === "lobby" || snap?.phase === "end");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function send() {
    const value = text.trim();
    if (!value || !room || !canChat) return;
    room.send(ClientMessage.Chat, { text: value });
    setText("");
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
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  mine ? "bg-neon-cyan/20 text-white" : "bg-night-700 text-white/90"
                }`}
              >
                {!mine && (
                  <span className="mb-0.5 block text-xs font-semibold text-neon-pink">
                    {m.senderName}
                  </span>
                )}
                {m.text}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t-2 border-night-600 p-3">
        <input
          className="arcade-input w-full"
          placeholder={canChat ? "écris un message…" : "tu es éliminé 👻"}
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
