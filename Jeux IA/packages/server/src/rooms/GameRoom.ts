import { Room } from "@colyseus/core";
import type { Client } from "@colyseus/core";
import { randomUUID } from "node:crypto";
import {
  ClientMessage,
  ServerMessage,
  DEFAULT_CONFIG,
  DEV_MIN_PLAYERS,
  DUO_MIN_PLAYERS,
  MAX_PLAYERS,
  ROLE_LABELS,
  ANON_IDENTITIES,
  THEMES,
  type GameConfig,
  type GameMode,
  type Role,
  type RolePayload,
} from "@aip/shared";
import { GameState, Player, ChatMessage } from "./schema/GameState.js";
import { AIPlayer, typingDelay, type SpeakContext, type RosterEntry } from "../ai/AIPlayer.js";

interface JoinOptions {
  code?: string;
  name?: string;
  avatar?: string;
}

const MAX_MESSAGES = 200;
const RECONNECT_WINDOW = 30; // secondes
const REVEAL_MS = 5000; // durée de la phase de révélation
const AI_NAME = "Intelligence Artificielle";

export class GameRoom extends Room<GameState> {
  maxClients = MAX_PLAYERS;

  // Données secrètes / non synchronisées
  private config: GameConfig = { ...DEFAULT_CONFIG };
  private roles = new Map<string, Role>();
  private realNames = new Map<string, string>(); // id -> pseudo réel (caché en partie)
  private timer?: NodeJS.Timeout; // timer de phase
  private turnTimer?: NodeJS.Timeout; // timer du tour de parole courant
  private aiTimers = new Set<NodeJS.Timeout>(); // actions IA différées
  private turnToken = 0;

  // IA
  private ai?: AIPlayer;
  private aiId = "";

  // Tour de parole
  private speakingOrder: string[] = [];
  private speakIndex = 0;

  onCreate(options: JoinOptions) {
    this.setState(new GameState());
    this.state.code = (options.code ?? "").toUpperCase();
    this.setMetadata({ code: this.state.code });

    this.onMessage(ClientMessage.Chat, (client, payload: { text?: string }) => {
      this.handleChat(client, payload?.text ?? "");
    });

    this.onMessage(ClientMessage.Ready, (client, payload: { ready?: boolean }) => {
      const p = this.state.players.get(client.sessionId);
      if (p && this.state.phase === "lobby") p.ready = !!payload?.ready;
    });

    this.onMessage(ClientMessage.SetConfig, (client, payload: Partial<GameConfig>) => {
      if (client.sessionId !== this.state.hostId || this.state.phase !== "lobby") return;
      this.config = { ...this.config, ...this.sanitizeConfig(payload) };
      this.state.gameMode = this.config.gameMode;
    });

    this.onMessage(ClientMessage.Start, (client) => this.handleStart(client));

    this.onMessage(ClientMessage.Vote, (client, payload: { targetId?: string }) => {
      this.handleVote(client, payload?.targetId ?? "");
    });

    this.state.gameMode = this.config.gameMode;
  }

  onJoin(client: Client, options: JoinOptions) {
    const player = new Player();
    player.id = client.sessionId;
    player.name = (options.name?.trim() || "Joueur").slice(0, 20);
    player.avatar = options.avatar || "🙂";
    this.state.players.set(client.sessionId, player);

    if (!this.state.hostId) this.state.hostId = client.sessionId;
    this.system(`${player.name} a rejoint la partie`);
  }

  async onLeave(client: Client, consented: boolean) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;

    if (!consented && this.state.phase !== "end") {
      try {
        await this.allowReconnection(client, RECONNECT_WINDOW);
        if (player) player.connected = true;
        return;
      } catch {
        // fenêtre expirée -> on retire le joueur
      }
    }

    const leftName = player?.displayName || player?.name || "Un joueur";
    this.state.players.delete(client.sessionId);
    this.state.votes.delete(client.sessionId);
    this.roles.delete(client.sessionId);
    this.realNames.delete(client.sessionId);

    if (this.state.phase === "lobby" || this.state.phase === "end") {
      this.system(`${leftName} a quitté la partie`);
    } else {
      this.system(`👋 ${leftName} a quitté la partie`);
    }

    if (this.state.hostId === client.sessionId) {
      this.state.hostId = this.firstHumanId();
    }

    // Un départ peut clôturer la partie, le vote, ou le tour de parole en cours.
    if (this.state.phase !== "lobby" && this.state.phase !== "end") {
      const winner = this.checkWin();
      if (winner) {
        this.endGame(winner);
      } else if (this.state.phase === "vote" && this.allAliveVoted()) {
        this.endVote();
      } else if (this.state.phase === "discussion" && this.state.currentSpeakerId === client.sessionId) {
        this.advanceTurn();
      }
    }
  }

  onDispose() {
    this.clearAllTimers();
  }

  // ---------------------------------------------------------------- messages

  private handleChat(client: Client, raw: string) {
    const player = this.state.players.get(client.sessionId);
    const text = raw.trim().slice(0, 300);
    if (!player || !text) return;

    const phase = this.state.phase;
    // Lobby / fin : chat libre.
    if (phase === "lobby" || phase === "end") {
      this.pushFrom(player, text);
      return;
    }
    if (!player.alive) return; // les éliminés n'écrivent plus

    if (phase === "discussion") {
      // Tour de parole : seul le joueur actif peut parler.
      if (this.state.currentSpeakerId !== client.sessionId) {
        client.send(ServerMessage.Error, { message: "Ce n'est pas ton tour de parler." });
        return;
      }
      this.pushFrom(player, text);
      this.advanceTurn();
      return;
    }
    // Vote : débat libre autorisé.
    this.pushFrom(player, text);
  }

  private handleStart(client: Client) {
    if (client.sessionId !== this.state.hostId || this.state.phase !== "lobby") return;

    const humanCount = this.state.players.size;
    if (humanCount < DEV_MIN_PLAYERS) {
      client.send(ServerMessage.Error, {
        message: `Il faut au moins ${DEV_MIN_PLAYERS} joueurs pour lancer.`,
      });
      return;
    }

    // Mode Duo : besoin d'assez d'humains, sinon on retombe en Solo.
    let mode: GameMode = this.config.gameMode;
    if (mode === "duo" && humanCount < DUO_MIN_PLAYERS) {
      mode = "solo";
      this.system(`⚠️ Pas assez de joueurs pour le mode Duo (min. ${DUO_MIN_PLAYERS}). Passage en Solo.`);
    }
    this.state.gameMode = mode;

    this.assignRoles(mode);
    this.state.round = 0;
    this.state.winner = "";
    this.lock();
    this.beginDiscussion();
  }

  private handleVote(client: Client, target: string) {
    if (this.state.phase !== "vote") return;
    const voter = this.state.players.get(client.sessionId);
    if (!voter || !voter.alive) return;

    if (target && target !== "skip") {
      const tp = this.state.players.get(target);
      if (!tp || !tp.alive) return;
    }

    this.state.votes.set(client.sessionId, target || "skip");
    if (this.allAliveVoted()) this.endVote();
  }

  // -------------------------------------------------------- rôles & anonymat

  private assignRoles(mode: GameMode) {
    this.roles.clear();
    this.realNames.clear();
    this.state.roleReveal.clear();
    this.state.nameReveal.clear();
    this.state.messages.clear();

    // 1) Crée le joueur IA virtuel et l'ajoute au salon.
    this.aiId = `ai_${randomUUID()}`;
    // Persona TOUJOURS aléatoire (jamais affiché/configurable) pour ne pas se faire griller.
    this.ai = new AIPlayer(this.aiId, "", "random");
    const aiPlayer = new Player();
    aiPlayer.id = this.aiId;
    aiPlayer.name = AI_NAME;
    aiPlayer.avatar = "🤖";
    aiPlayer.isAI = true;
    this.state.players.set(this.aiId, aiPlayer);

    const ids = [...this.state.players.keys()];

    // 2) Anonymise tout le monde (couleurs mélangées).
    const palette = shuffle([...ANON_IDENTITIES]);
    ids.forEach((id, i) => {
      const ident = palette[i % palette.length];
      const p = this.state.players.get(id)!;
      this.realNames.set(id, p.name);
      p.displayName = ident.label;
      p.colorKey = ident.key;
      p.name = ""; // pseudo réel caché pendant la partie
      p.alive = true;
      if (id === this.aiId) this.ai!.identity = ident.label;
    });

    // 3) Attribue les rôles.
    const humanIds = ids.filter((id) => id !== this.aiId);
    this.roles.set(this.aiId, "ai");

    let impostorId = "";
    if (mode === "duo" && humanIds.length > 0) {
      impostorId = humanIds[Math.floor(Math.random() * humanIds.length)];
      this.roles.set(impostorId, "impostor");
    }
    for (const id of humanIds) {
      if (!this.roles.has(id)) this.roles.set(id, "crewmate");
    }

    // 4) Notifie chaque humain de son rôle (+ allié pour l'imposteur).
    const aiIdentity = this.state.players.get(this.aiId)!.displayName;
    for (const id of humanIds) {
      const role = this.roles.get(id)!;
      const p = this.state.players.get(id)!;
      const payload: RolePayload = { role, identity: p.displayName };
      if (role === "impostor") {
        payload.allyIdentity = aiIdentity;
        payload.allyRole = "ai";
      }
      const target = this.clients.find((c) => c.sessionId === id);
      target?.send(ServerMessage.Role, payload);
    }

    const modeLabel = mode === "duo" ? "Duo (1 IA + 1 imposteur)" : "Solo (1 IA)";
    this.system(`🎭 Identités mélangées et secrètes. Mode : ${modeLabel}. Démasquez l'IA !`);
  }

  // ------------------------------------------------------------------- phases

  private beginDiscussion() {
    this.clearAllTimers();
    this.state.round += 1;
    this.state.phase = "discussion";
    this.state.votes.clear();
    this.state.lastEliminatedId = "";
    this.state.theme = THEMES[Math.floor(Math.random() * THEMES.length)];

    // Ordre de parole : chaque vivant prend la parole `turnsPerPlayer` fois,
    // l'ordre est remélangé à chaque tour de table.
    const alive = [...this.state.players.values()].filter((p) => p.alive).map((p) => p.id);
    this.speakingOrder = [];
    for (let lap = 0; lap < this.config.turnsPerPlayer; lap++) {
      this.speakingOrder.push(...shuffle([...alive]));
    }
    this.speakIndex = 0;

    this.system(`🗣️ Round ${this.state.round} — Thème : « ${this.state.theme} »`);
    this.advanceTurn();
  }

  /** Passe au prochain orateur, ou lance le vote si le tour de table est fini. */
  private advanceTurn() {
    this.clearTurnTimer();
    if (this.state.phase !== "discussion") return;

    // Saute les joueurs morts / partis.
    let next: Player | undefined;
    while (this.speakIndex < this.speakingOrder.length) {
      const id = this.speakingOrder[this.speakIndex++];
      const p = this.state.players.get(id);
      if (p && p.alive) {
        next = p;
        break;
      }
    }

    if (!next) {
      this.beginVote();
      return;
    }

    this.state.currentSpeakerId = next.id;
    // L'orateur courant (humain OU IA) est affiché "en train d'écrire" aux autres,
    // pour que l'IA ne soit jamais la seule à montrer cet indicateur.
    this.state.typingId = next.id;
    const token = ++this.turnToken;
    this.state.phaseEndsAt = Date.now() + this.config.turnSeconds * 1000;

    if (next.isAI) {
      void this.runAITurn(token);
    } else {
      this.turnTimer = setTimeout(() => {
        if (token !== this.turnToken) return;
        this.system(`⌛ ${next!.displayName} n'a rien dit à temps.`);
        this.advanceTurn();
      }, this.config.turnSeconds * 1000);
    }
  }

  /** L'IA réfléchit (indicateur de frappe + délai) puis poste son message. */
  private async runAITurn(token: number) {
    const ai = this.ai;
    if (!ai) return this.advanceTurn();

    this.state.typingId = ai.id;
    let text = "";
    try {
      text = await ai.speak(this.buildContext());
    } catch {
      text = "";
    }
    if (token !== this.turnToken || this.state.phase !== "discussion") {
      if (this.state.typingId === ai.id) this.state.typingId = "";
      return;
    }

    const finalText = text || "jsais pas trop quoi dire la";
    const t = setTimeout(() => {
      this.aiTimers.delete(t);
      if (token !== this.turnToken || this.state.phase !== "discussion") return;
      this.state.typingId = "";
      const aiP = this.state.players.get(ai.id);
      if (aiP) this.pushFrom(aiP, finalText);
      this.advanceTurn();
    }, typingDelay(finalText));
    this.aiTimers.add(t);
  }

  private beginVote() {
    this.clearAllTimers();
    this.state.phase = "vote";
    this.state.currentSpeakerId = "";
    this.state.typingId = "";
    this.state.votes.clear();
    this.state.phaseEndsAt = Date.now() + this.config.voteSeconds * 1000;
    this.system(`🗳️ Vote ! (${this.config.voteSeconds}s) — Qui est l'IA ?`);
    this.timer = setTimeout(() => this.endVote(), this.config.voteSeconds * 1000);

    this.scheduleAIVote();
  }

  /** L'IA glisse une phrase de défense puis vote (pour un humain). */
  private scheduleAIVote() {
    const ai = this.ai;
    const aiP = ai && this.state.players.get(ai.id);
    if (!ai || !aiP || !aiP.alive) return;

    // Petite phrase de défense au début du vote.
    const t1 = setTimeout(async () => {
      this.aiTimers.delete(t1);
      if (this.state.phase !== "vote") return;
      this.state.typingId = ai.id;
      let line = "";
      try {
        line = await ai.speak({ ...this.buildContext(), defending: true });
      } catch {
        line = "";
      }
      this.state.typingId = "";
      if (this.state.phase === "vote" && line) this.pushFrom(aiP, line);
    }, 1500 + Math.random() * 1500);
    this.aiTimers.add(t1);

    // Vote de l'IA un peu après.
    const t2 = setTimeout(async () => {
      this.aiTimers.delete(t2);
      if (this.state.phase !== "vote" || !aiP.alive) return;
      let targetId = "";
      try {
        targetId = (await ai.vote(this.buildContext())).targetId;
      } catch {
        targetId = "";
      }
      if (this.state.phase !== "vote") return;
      const tp = targetId && this.state.players.get(targetId);
      if (!tp || !tp.alive) {
        const candidates = [...this.state.players.values()].filter(
          (p) => p.alive && p.id !== ai.id && this.roles.get(p.id) !== "impostor",
        );
        targetId = candidates.length
          ? candidates[Math.floor(Math.random() * candidates.length)].id
          : "skip";
      }
      this.state.votes.set(ai.id, targetId);
      if (this.allAliveVoted()) this.endVote();
    }, 4000 + Math.random() * 3000);
    this.aiTimers.add(t2);
  }

  private endVote() {
    if (this.state.phase !== "vote") return;
    this.clearAllTimers();
    this.state.phase = "reveal";
    this.state.typingId = "";
    this.state.phaseEndsAt = Date.now() + REVEAL_MS;

    const eliminatedId = this.tallyVotes();
    if (eliminatedId) {
      const p = this.state.players.get(eliminatedId);
      if (p) {
        p.alive = false;
        const role = this.roles.get(eliminatedId) ?? "crewmate";
        this.state.roleReveal.set(eliminatedId, role);
        this.state.lastEliminatedId = eliminatedId;
        const flavor = role === "ai" ? "c'était l'IA ! 🤖" : `c'était ${ROLE_LABELS[role]}.`;
        this.system(`☠️ ${p.displayName} a été éliminé… ${flavor}`);
      }
    } else {
      this.system("🤷 Personne n'a été éliminé (égalité ou abstention).");
    }

    const winner = this.checkWin();
    this.timer = setTimeout(() => {
      if (winner) {
        this.endGame(winner);
      } else if (this.state.round >= this.config.rounds) {
        // rounds épuisés : les infiltrés (IA/imposteur) survivants l'emportent.
        const aiAlive = [...this.state.players.values()].some(
          (p) => p.alive && this.roles.get(p.id) === "ai",
        );
        this.endGame(aiAlive ? "ai" : "impostors");
      } else {
        this.beginDiscussion();
      }
    }, REVEAL_MS);
  }

  private endGame(winner: string) {
    this.clearAllTimers();
    this.state.phase = "end";
    this.state.winner = winner;
    this.state.phaseEndsAt = 0;
    this.state.currentSpeakerId = "";
    this.state.typingId = "";

    // On révèle tous les rôles ET les vrais pseudos sur l'écran de fin.
    this.roles.forEach((role, id) => this.state.roleReveal.set(id, role));
    this.realNames.forEach((name, id) => this.state.nameReveal.set(id, name));

    const label =
      winner === "crewmates" ? "L'Équipage" : winner === "ai" ? "L'IA" : "Les Infiltrés";
    this.system(`🏁 Partie terminée — ${label} l'emporte !`);
  }

  // -------------------------------------------------------------- contexte IA

  private buildContext(): SpeakContext {
    const roster: RosterEntry[] = [...this.state.players.values()].map((p) => ({
      id: p.id,
      identity: p.displayName,
      realName: this.realNames.get(p.id),
      isSelf: p.id === this.aiId,
      isAlly: this.roles.get(p.id) === "impostor",
      alive: p.alive,
    }));

    const transcript = this.state.messages
      .filter((m) => !m.system)
      .slice(-14)
      .map((m) => ({ identity: m.senderName, text: m.text }));

    return { theme: this.state.theme, roster, transcript };
  }

  // -------------------------------------------------------------------- utils

  /** Renvoie l'id du joueur le plus voté, ou "" si égalité / abstention. */
  private tallyVotes(): string {
    const counts = new Map<string, number>();
    this.state.votes.forEach((target) => {
      if (target === "skip") return;
      counts.set(target, (counts.get(target) ?? 0) + 1);
    });

    let eliminatedId = "";
    let max = 0;
    let tie = false;
    counts.forEach((count, id) => {
      if (count > max) {
        max = count;
        eliminatedId = id;
        tie = false;
      } else if (count === max) {
        tie = true;
      }
    });

    return max > 0 && !tie ? eliminatedId : "";
  }

  private checkWin(): string | null {
    let impostors = 0;
    let ai = 0;
    let others = 0;
    this.state.players.forEach((p) => {
      if (!p.alive) return;
      const role = this.roles.get(p.id);
      if (role === "impostor") impostors++;
      else if (role === "ai") ai++;
      else others++;
    });

    // Plus aucun imposteur ni IA vivant -> l'équipage gagne.
    if (impostors === 0 && ai === 0) return "crewmates";
    // Parité atteinte -> le camp infiltré gagne.
    if (impostors + ai >= others) return ai > impostors ? "ai" : "impostors";
    return null;
  }

  private allAliveVoted(): boolean {
    let aliveCount = 0;
    let voted = true;
    this.state.players.forEach((p) => {
      if (!p.alive) return;
      aliveCount++;
      if (!this.state.votes.has(p.id)) voted = false;
    });
    return aliveCount > 0 && voted;
  }

  private firstHumanId(): string {
    for (const p of this.state.players.values()) {
      if (!p.isAI && p.connected) return p.id;
    }
    for (const p of this.state.players.values()) {
      if (!p.isAI) return p.id;
    }
    return "";
  }

  private sanitizeConfig(payload: Partial<GameConfig>): Partial<GameConfig> {
    const out: Partial<GameConfig> = {};
    if (payload.gameMode === "solo" || payload.gameMode === "duo") out.gameMode = payload.gameMode;
    if (typeof payload.rounds === "number") out.rounds = clamp(payload.rounds, 1, 10);
    if (typeof payload.turnsPerPlayer === "number")
      out.turnsPerPlayer = clamp(payload.turnsPerPlayer, 1, 4);
    if (typeof payload.turnSeconds === "number")
      out.turnSeconds = clamp(payload.turnSeconds, 15, 90);
    if (typeof payload.voteSeconds === "number")
      out.voteSeconds = clamp(payload.voteSeconds, 10, 120);
    if (payload.aiPersona) out.aiPersona = payload.aiPersona;
    return out;
  }

  private clearTurnTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = undefined;
    }
  }

  private clearAllTimers() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.clearTurnTimer();
    this.aiTimers.forEach((t) => clearTimeout(t));
    this.aiTimers.clear();
    this.turnToken++; // invalide tout tour de parole en attente
  }

  private system(text: string) {
    const msg = new ChatMessage();
    msg.id = randomUUID();
    msg.senderId = "system";
    msg.senderName = "Système";
    msg.colorKey = "";
    msg.text = text;
    msg.system = true;
    msg.ts = Date.now();
    this.appendMessage(msg);
  }

  private pushFrom(player: Player, text: string) {
    const msg = new ChatMessage();
    msg.id = randomUUID();
    msg.senderId = player.id;
    // Pendant la partie on n'expose que l'identité anonyme.
    msg.senderName = player.displayName || player.name;
    msg.colorKey = player.colorKey;
    msg.text = text;
    msg.system = false;
    msg.ts = Date.now();
    this.appendMessage(msg);
  }

  private appendMessage(msg: ChatMessage) {
    this.state.messages.push(msg);
    while (this.state.messages.length > MAX_MESSAGES) {
      this.state.messages.shift();
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
