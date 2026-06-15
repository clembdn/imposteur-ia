import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

// NB : les rôles secrets (impostor / ai) ne sont JAMAIS dans le schéma synchronisé.
// Ils sont stockés côté serveur uniquement et envoyés en privé à chaque client.
// `roleReveal` n'est rempli QU'À l'élimination d'un joueur (et à la fin de partie).

export class Player extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("string") avatar = "";
  @type("boolean") ready = false;
  @type("boolean") alive = true;
  @type("boolean") connected = true;
  @type("boolean") isAI = false;
}

export class ChatMessage extends Schema {
  @type("string") id = "";
  @type("string") senderId = "";
  @type("string") senderName = "";
  @type("string") text = "";
  @type("boolean") system = false;
  @type("number") ts = 0;
}

export class GameState extends Schema {
  @type("string") code = "";
  @type("string") phase = "lobby";
  @type("number") round = 0;
  @type("string") hostId = "";
  @type("number") phaseEndsAt = 0;

  @type("string") winner = "";
  @type("string") lastEliminatedId = "";

  @type({ map: Player }) players = new MapSchema<Player>();
  @type([ChatMessage]) messages = new ArraySchema<ChatMessage>();

  // voterId -> targetId ("skip" pour passer)
  @type({ map: "string" }) votes = new MapSchema<string>();
  // playerId -> role (rempli à l'élimination, puis tout à la fin)
  @type({ map: "string" }) roleReveal = new MapSchema<string>();
}
