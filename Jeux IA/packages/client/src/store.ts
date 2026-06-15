import { create } from "zustand";
import type { Room } from "colyseus.js";
import type { Role, StateSnap } from "@aip/shared";

interface GameStore {
  room: Room | null;
  snap: StateSnap | null;
  myId: string | null;
  myRole: Role | null;
  error: string | null;
  connecting: boolean;

  setRoom: (room: Room) => void;
  setSnap: (snap: StateSnap) => void;
  setRole: (role: Role) => void;
  setError: (error: string | null) => void;
  setConnecting: (v: boolean) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  room: null,
  snap: null,
  myId: null,
  myRole: null,
  error: null,
  connecting: false,

  setRoom: (room) => set({ room, myId: room.sessionId, error: null }),
  setSnap: (snap) => set({ snap }),
  setRole: (myRole) => set({ myRole }),
  setError: (error) => set({ error }),
  setConnecting: (connecting) => set({ connecting }),
  reset: () => set({ room: null, snap: null, myId: null, myRole: null }),
}));
