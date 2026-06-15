import { env, hasAI } from "./env.js";
import { createServer } from "node:http";
import os from "node:os";
import express from "express";
import cors from "cors";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME } from "@aip/shared";
import { GameRoom } from "./rooms/GameRoom.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, ai: hasAI() });
});

const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Les salons sont filtrés par "code" -> joinOrCreate/join regroupent par code.
gameServer.define(ROOM_NAME, GameRoom).filterBy(["code"]);

function localIPv4Addresses(): string[] {
  const addresses: string[] = [];
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      const isIPv4 = net.family === "IPv4" || net.family === 4;
      if (isIPv4 && !net.internal) addresses.push(net.address);
    }
  }
  return addresses;
}

await gameServer.listen(env.port, env.host);

console.log(`🎭 AI Impostor Party — serveur lancé`);
console.log(`   Local  : ws://localhost:${env.port}`);
for (const ip of localIPv4Addresses()) {
  console.log(`   Réseau : ws://${ip}:${env.port}`);
}
console.log(`   IA DeepSeek : ${hasAI() ? "clé détectée ✅" : "pas de clé (mode sans IA) ⚠️"}`);
