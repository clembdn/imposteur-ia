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

export type Persona = "manipulator" | "shy" | "aggressive" | "funny" | "random";

export type Winner = "" | "crewmates" | "impostors" | "ai";

/** Modes de jeu : Solo = 1 IA cachée. Duo = 1 IA + 1 imposteur humain allié. */
export type GameMode = "solo" | "duo";

// --- Réseau ---
export const ROOM_NAME = "game";

// Joueurs (règles du jeu vs minimum technique pour tester en dev)
export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 10;
/** Minimum de joueurs HUMAINS pour lancer une partie (tests / petits groupes). */
export const DEV_MIN_PLAYERS = 2;
/** Minimum de joueurs HUMAINS pour activer le mode Duo (IA + imposteur). */
export const DUO_MIN_PLAYERS = 4;

// --- Configuration d'une partie ---
export interface GameConfig {
  gameMode: GameMode;
  rounds: number;
  /** Nombre de prises de parole par joueur dans une manche de discussion. */
  turnsPerPlayer: number;
  /** Durée d'un tour de parole (secondes). */
  turnSeconds: number;
  voteSeconds: number;
  aiPersona: Persona;
}

export const DEFAULT_CONFIG: GameConfig = {
  gameMode: "solo",
  rounds: 2,
  turnsPerPlayer: 2,
  turnSeconds: 30,
  voteSeconds: 30,
  aiPersona: "random",
};

export const PERSONA_LABELS: Record<Persona, string> = {
  manipulator: "Manipulateur",
  shy: "Timide",
  aggressive: "Agressif",
  funny: "Drôle",
  random: "Aléatoire",
};

export const GAME_MODE_LABELS: Record<GameMode, string> = {
  solo: "Solo · 1 IA cachée",
  duo: "Duo · IA + imposteur humain",
};

export const ROLE_LABELS: Record<Role, string> = {
  crewmate: "Équipage",
  impostor: "Imposteur",
  ai: "IA",
};

export const WINNER_LABELS: Record<Exclude<Winner, "">, string> = {
  crewmates: "L'Équipage",
  impostors: "Les Infiltrés",
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

/** Payload envoyé en privé à chaque joueur au début de partie. */
export interface RolePayload {
  role: Role;
  /** Ton identité anonyme (couleur) pendant la partie. */
  identity: string;
  /** En mode Duo : l'identité (couleur) de ton allié, vue côté imposteur uniquement. */
  allyIdentity?: string;
  allyRole?: Role;
}

// ============================================================================
// Identités anonymes (couleurs) — les vrais pseudos sont cachés pendant la partie
// ============================================================================

export interface AnonIdentity {
  key: string;
  label: string;
  color: string;
}

export const ANON_IDENTITIES: AnonIdentity[] = [
  { key: "rouge", label: "Rouge", color: "#FF2E97" },
  { key: "cyan", label: "Cyan", color: "#22E0FF" },
  { key: "jaune", label: "Jaune", color: "#FFD23F" },
  { key: "vert", label: "Vert", color: "#39FF88" },
  { key: "violet", label: "Violet", color: "#A78BFA" },
  { key: "orange", label: "Orange", color: "#FB923C" },
  { key: "rose", label: "Rose", color: "#F9A8D4" },
  { key: "bleu", label: "Bleu", color: "#60A5FA" },
  { key: "blanc", label: "Blanc", color: "#E5E7EB" },
  { key: "citron", label: "Citron", color: "#BEF264" },
  { key: "turquoise", label: "Turquoise", color: "#2DD4BF" },
  { key: "corail", label: "Corail", color: "#FB7185" },
];

export const COLOR_BY_KEY: Record<string, string> = Object.fromEntries(
  ANON_IDENTITIES.map((i) => [i.key, i.color]),
);

// ============================================================================
// Thèmes de discussion (une question par manche)
// ============================================================================

export const THEMES: string[] = [
  "C'est quoi ton pire souvenir d'école ?",
  "Si tu étais un objet du quotidien, lequel et pourquoi ?",
  "Raconte la dernière fois que tu as menti.",
  "Pizza ananas : pour ou contre, défends ton avis.",
  "Quel est ton talent inutile préféré ?",
  "Décris ton dimanche idéal.",
  "Quelle est la pire mode que t'as suivie ?",
  "Un truc que tout le monde aime mais que tu détestes ?",
  "Ta plus grosse peur irrationnelle ?",
  "Si tu gagnais au loto demain, premier achat ?",
  "Le film que t'as vu trop de fois ?",
  "Raconte un moment gênant en public.",
];

// ============================================================================
// Snapshots : représentation "plain object" de l'état Colyseus, côté client
// ============================================================================

export interface PlayerSnap {
  id: string;
  /** Pseudo réel — vide pendant la partie (anonymat), rempli en lobby et à la fin. */
  name: string;
  avatar: string;
  /** Identité anonyme affichée pendant la partie (ex : "Rouge"). */
  displayName: string;
  /** Clé couleur de l'identité anonyme. */
  colorKey: string;
  ready: boolean;
  alive: boolean;
  connected: boolean;
  isAI: boolean;
}

export interface MessageSnap {
  id: string;
  senderId: string;
  senderName: string;
  /** Clé couleur de l'expéditeur (pour colorer le chat pendant la partie). */
  colorKey: string;
  text: string;
  system: boolean;
  ts: number;
}

export interface StateSnap {
  code: string;
  phase: Phase;
  gameMode: GameMode;
  round: number;
  hostId: string;
  phaseEndsAt: number;
  /** Joueur dont c'est le tour de parler (phase discussion). */
  currentSpeakerId: string;
  /** Joueur en train d'écrire (indicateur de frappe, surtout pour l'IA). */
  typingId: string;
  /** Thème/question de la manche en cours. */
  theme: string;
  winner: Winner;
  lastEliminatedId: string;
  players: PlayerSnap[];
  messages: MessageSnap[];
  votes: Record<string, string>;
  roleReveal: Record<string, Role>;
  /** Pseudos réels révélés (rempli à la fin de partie). */
  nameReveal: Record<string, string>;
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
