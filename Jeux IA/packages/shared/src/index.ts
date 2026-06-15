// ============================================================================
// Types & constantes partagés entre le serveur (Colyseus) et le client (React)
// ============================================================================

export type Role = "crewmate" | "impostor" | "ai";

export type Phase =
  | "lobby"
  | "assign"
  | "discussion"
  | "vote"
  | "reveal"
  | "end";

export type Persona = "manipulator" | "shy" | "aggressive" | "funny";

export type Winner = "" | "crewmates" | "impostors" | "ai";

// --- Réseau ---
export const ROOM_NAME = "game";

// Joueurs (règles du jeu vs minimum technique pour tester en dev)
export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 10;
/** Minimum pour lancer une partie (tests / petits groupes). */
export const DEV_MIN_PLAYERS = 2;

// --- Configuration d'une partie ---
export interface GameConfig {
  rounds: number;
  discussionSeconds: number;
  voteSeconds: number;
  impostors: number;
  aiPersona: Persona;
}

export const DEFAULT_CONFIG: GameConfig = {
  rounds: 3,
  discussionSeconds: 120,
  voteSeconds: 30,
  impostors: 1,
  aiPersona: "manipulator",
};

export const PERSONA_LABELS: Record<Persona, string> = {
  manipulator: "Manipulateur",
  shy: "Timide",
  aggressive: "Agressif",
  funny: "Drôle",
};

export const ROLE_LABELS: Record<Role, string> = {
  crewmate: "Équipage",
  impostor: "Imposteur",
  ai: "IA",
};

export const WINNER_LABELS: Record<Exclude<Winner, "">, string> = {
  crewmates: "L'Équipage",
  impostors: "Les Imposteurs",
  ai: "L'IA",
};

// --- Messages client -> serveur ---
export const ClientMessage = {
  Chat: "chat",
  Ready: "ready",
  Start: "start",
  Vote: "vote",
  SetConfig: "setConfig",
} as const;

// --- Messages serveur -> client ---
export const ServerMessage = {
  Role: "role",
  Error: "error",
} as const;

// ============================================================================
// Snapshots : représentation "plain object" de l'état Colyseus, côté client
// ============================================================================

export interface PlayerSnap {
  id: string;
  name: string;
  avatar: string;
  ready: boolean;
  alive: boolean;
  connected: boolean;
  isAI: boolean;
}

export interface MessageSnap {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  system: boolean;
  ts: number;
}

export interface StateSnap {
  code: string;
  phase: Phase;
  round: number;
  hostId: string;
  phaseEndsAt: number;
  winner: Winner;
  lastEliminatedId: string;
  players: PlayerSnap[];
  messages: MessageSnap[];
  votes: Record<string, string>;
  roleReveal: Record<string, Role>;
}

// ============================================================================
// Utilitaires
// ============================================================================

/** Génère un code de salon lisible (sans caractères ambigus). */
export function generateRoomCode(len = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}

export const AVATARS = [
  "🦊", "🐱", "🐼", "🐸", "🐵", "🐙", "🦉", "🐯", "🐧", "🦄",
] as const;
