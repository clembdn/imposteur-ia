import { Room } from "@colyseus/core";
import type { Client } from "@colyseus/core";
import { randomUUID } from "node:crypto";
import {
  ClientMessage,
  ServerMessage,
  DEFAULT_CONFIG,
  DEV_MIN_PLAYERS,
  MAX_PLAYERS,
  ROLE_LABELS,
  type GameConfig,
  type Role,
} from "@aip/shared";
import { GameState, Player, ChatMessage } from "./schema/GameState.js";

interface JoinOptions {
  code?: string;
  name?: string;
  avatar?: string;
}

const MAX_MESSAGES = 200;
const RECONNECT_WINDOW = 30; // secondes
const REVEAL_MS = 5000; // durée de la phase de révélation

export class GameRoom extends Room<GameState> {
  maxClients = MAX_PLAYERS;

  // Données secrètes / non synchronisées
  private config: GameConfig = { ...DEFAULT_CONFIG };
  private roles = new Map<string, Role>();
  private timer?: NodeJS.Timeout;

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
      this.config = {
        ...this.config,
        ...this.sanitizeConfig(payload),
      };
    });

    this.onMessage(ClientMessage.Start, (client) => this.handleStart(client));

    this.onMessage(ClientMessage.Vote, (client, payload: { targetId?: string }) => {
      this.handleVote(client, payload?.targetId ?? "");
    });
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

    if (player) this.system(`${player.name} a quitté la partie`);
    this.state.players.delete(client.sessionId);
    this.state.votes.delete(client.sessionId);

    if (this.state.hostId === client.sessionId) {
      const next = this.state.players.keys().next().value;
      this.state.hostId = next ?? "";
    }

    // Un départ peut clôturer la partie ou le vote en cours.
    if (this.state.phase !== "lobby" && this.state.phase !== "end") {
      const winner = this.checkWin();
      if (winner) {
        this.endGame(winner);
      } else if (this.state.phase === "vote" && this.allAliveVoted()) {
        this.endVote();
      }
    }
  }

  onDispose() {
    this.clearTimer();
  }

  // ---------------------------------------------------------------- messages

  private handleChat(client: Client, raw: string) {
    const player = this.state.players.get(client.sessionId);
    const text = raw.trim().slice(0, 300);
    if (!player || !text) return;
    // Les joueurs éliminés ne parlent plus pendant la partie.
    if (!player.alive && this.state.phase !== "lobby" && this.state.phase !== "end") return;

    this.pushMessage({
      senderId: client.sessionId,
      senderName: player.name,
      text,
      system: false,
    });
  }

  private handleStart(client: Client) {
    if (client.sessionId !== this.state.hostId || this.state.phase !== "lobby") return;

    if (this.state.players.size < DEV_MIN_PLAYERS) {
      client.send(ServerMessage.Error, {
        message: `Il faut au moins ${DEV_MIN_PLAYERS} joueurs pour lancer.`,
      });
      return;
    }

    this.assignRoles();
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

    if (this.allAliveVoted()) {
      this.endVote();
    }
  }

  // ------------------------------------------------------------------- phases

  private beginDiscussion() {
    this.clearTimer();
    this.state.round += 1;
    this.state.phase = "discussion";
    this.state.votes.clear();
    this.state.lastEliminatedId = "";
    this.state.phaseEndsAt = Date.now() + this.config.discussionSeconds * 1000;
    this.system(`🗣️ Round ${this.state.round} — Discussion (${this.config.discussionSeconds}s)`);
    this.timer = setTimeout(() => this.beginVote(), this.config.discussionSeconds * 1000);
  }

  private beginVote() {
    if (this.state.phase !== "discussion") return;
    this.clearTimer();
    this.state.phase = "vote";
    this.state.votes.clear();
    this.state.phaseEndsAt = Date.now() + this.config.voteSeconds * 1000;
    this.system(`🗳️ Vote ! (${this.config.voteSeconds}s) — Qui éliminer ?`);
    this.timer = setTimeout(() => this.endVote(), this.config.voteSeconds * 1000);
  }

  private endVote() {
    if (this.state.phase !== "vote") return;
    this.clearTimer();
    this.state.phase = "reveal";
    this.state.phaseEndsAt = Date.now() + REVEAL_MS;

    const eliminatedId = this.tallyVotes();
    if (eliminatedId) {
      const p = this.state.players.get(eliminatedId);
      if (p) {
        p.alive = false;
        const role = this.roles.get(eliminatedId) ?? "crewmate";
        this.state.roleReveal.set(eliminatedId, role);
        this.state.lastEliminatedId = eliminatedId;
        this.system(`☠️ ${p.name} a été éliminé… c'était ${ROLE_LABELS[role]} !`);
      }
    } else {
      this.system("🤷 Personne n'a été éliminé (égalité ou abstention).");
    }

    const winner = this.checkWin();
    this.timer = setTimeout(() => {
      if (winner) {
        this.endGame(winner);
      } else if (this.state.round >= this.config.rounds) {
        // rounds épuisés : les imposteurs/IA survivants l'emportent
        this.endGame("impostors");
      } else {
        this.beginDiscussion();
      }
    }, REVEAL_MS);
  }

  private endGame(winner: string) {
    this.clearTimer();
    this.state.phase = "end";
    this.state.winner = winner;
    this.state.phaseEndsAt = 0;

    // On révèle tous les rôles sur l'écran de fin.
    this.roles.forEach((role, id) => this.state.roleReveal.set(id, role));

    const label =
      winner === "crewmates" ? "L'Équipage" : winner === "ai" ? "L'IA" : "Les Imposteurs";
    this.system(`🏁 Partie terminée — ${label} l'emporte !`);
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

    // Plus aucun imposteur ni IA vivant -> les humains gagnent.
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

  private assignRoles() {
    const ids = [...this.state.players.keys()];
    this.roles.clear();
    this.state.roleReveal.clear();
    this.state.players.forEach((p) => (p.alive = true));

    const impostorId = ids[Math.floor(Math.random() * ids.length)];
    for (const id of ids) {
      const role: Role = id === impostorId ? "impostor" : "crewmate";
      this.roles.set(id, role);
      const target = this.clients.find((c) => c.sessionId === id);
      target?.send(ServerMessage.Role, { role });
    }
  }

  private sanitizeConfig(payload: Partial<GameConfig>): Partial<GameConfig> {
    const out: Partial<GameConfig> = {};
    if (typeof payload.rounds === "number") out.rounds = clamp(payload.rounds, 1, 10);
    if (typeof payload.discussionSeconds === "number")
      out.discussionSeconds = clamp(payload.discussionSeconds, 15, 300);
    if (typeof payload.voteSeconds === "number")
      out.voteSeconds = clamp(payload.voteSeconds, 10, 120);
    if (typeof payload.impostors === "number") out.impostors = clamp(payload.impostors, 1, 3);
    if (payload.aiPersona) out.aiPersona = payload.aiPersona;
    return out;
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private system(text: string) {
    this.pushMessage({ senderId: "system", senderName: "Système", text, system: true });
  }

  private pushMessage(data: {
    senderId: string;
    senderName: string;
    text: string;
    system: boolean;
  }) {
    const msg = new ChatMessage();
    msg.id = randomUUID();
    msg.senderId = data.senderId;
    msg.senderName = data.senderName;
    msg.text = data.text;
    msg.system = data.system;
    msg.ts = Date.now();
    this.state.messages.push(msg);

    while (this.state.messages.length > MAX_MESSAGES) {
      this.state.messages.shift();
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}
