import { Client, Room } from "colyseus.js";
import {
  ROOM_NAME,
  ServerMessage,
  type Role,
  type RolePayload,
  type StateSnap,
} from "@aip/shared";
import { useGameStore } from "../store";

/** URL WebSocket du serveur — auto-détectée sur le LAN si VITE_SERVER_URL est vide. */
export function getServerUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL?.trim();
  if (fromEnv) return fromEnv;

  const port = import.meta.env.VITE_SERVER_PORT || "2567";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:${port}`;
}

export const client = new Client(getServerUrl());

interface Profile {
  name: string;
  avatar: string;
  code: string;
}

function snapshot(state: any): StateSnap {
  const players: StateSnap["players"] = [];
  state.players.forEach((p: any) => {
    players.push({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      displayName: p.displayName,
      colorKey: p.colorKey,
      ready: p.ready,
      alive: p.alive,
      connected: p.connected,
      isAI: p.isAI,
    });
  });

  const messages: StateSnap["messages"] = [];
  state.messages.forEach((m: any) => {
    messages.push({
      id: m.id,
      senderId: m.senderId,
      senderName: m.senderName,
      colorKey: m.colorKey,
      text: m.text,
      system: m.system,
      ts: m.ts,
    });
  });

  const votes: Record<string, string> = {};
  state.votes.forEach((target: string, voter: string) => {
    votes[voter] = target;
  });

  const roleReveal: Record<string, Role> = {};
  state.roleReveal.forEach((role: Role, id: string) => {
    roleReveal[id] = role;
  });

  const nameReveal: Record<string, string> = {};
  state.nameReveal.forEach((name: string, id: string) => {
    nameReveal[id] = name;
  });

  return {
    code: state.code,
    phase: state.phase,
    gameMode: state.gameMode,
    round: state.round,
    hostId: state.hostId,
    phaseEndsAt: state.phaseEndsAt,
    currentSpeakerId: state.currentSpeakerId,
    typingId: state.typingId,
    theme: state.theme,
    winner: state.winner,
    lastEliminatedId: state.lastEliminatedId,
    players,
    messages,
    votes,
    roleReveal,
    nameReveal,
  };
}

function bind(room: Room) {
  useGameStore.getState().setRoom(room);

  room.onStateChange((state: any) => {
    useGameStore.getState().setSnap(snapshot(state));
  });

  room.onMessage(ServerMessage.Role, (payload: RolePayload) => {
    useGameStore.getState().setRoleInfo(payload);
  });

  room.onMessage(ServerMessage.Error, (payload: { message: string }) => {
    useGameStore.getState().setError(payload.message);
  });

  room.onLeave(() => {
    useGameStore.getState().reset();
  });
}

export async function createGame(profile: Profile) {
  const room = await client.joinOrCreate(ROOM_NAME, {
    code: profile.code.toUpperCase(),
    name: profile.name,
    avatar: profile.avatar,
  });
  bind(room);
  return room;
}

export async function joinGame(profile: Profile) {
  const room = await client.join(ROOM_NAME, {
    code: profile.code.toUpperCase(),
    name: profile.name,
    avatar: profile.avatar,
  });
  bind(room);
  return room;
}

export function leaveGame() {
  useGameStore.getState().room?.leave();
  useGameStore.getState().reset();
}
