import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

// NB : les rôles secrets (impostor / ai) ne sont JAMAIS dans le schéma synchronisé.
// Ils sont stockés côté serveur uniquement et envoyés en privé à chaque client.
// Les VRAIS pseudos sont également cachés pendant la partie : `name` est vidé au
// lancement (stocké côté serveur) et seules les identités anonymes (`displayName`,
// `colorKey`) sont synchronisées. `roleReveal` / `nameReveal` ne sont remplis qu'à
// l'élimination d'un joueur (et à la fin de partie).

export class Player extends Schema {
  @type("string") id = "";
  @type("string") name = ""; // pseudo réel (vidé pendant la partie)
  @type("string") avatar = "";
  @type("string") displayName = ""; // identité anonyme (ex : "Rouge")
  @type("string") colorKey = "";
  @type("boolean") ready = false;
  @type("boolean") alive = true;
  @type("boolean") connected = true;
  @type("boolean") isAI = false;
}

export class ChatMessage extends Schema {
  @type("string") id = "";
  @type("string") senderId = "";
  @type("string") senderName = "";
  @type("string") colorKey = "";
  @type("string") text = "";
  @type("boolean") system = false;
  @type("number") ts = 0;
}

export class GameState extends Schema {
  @type("string") code = "";
  @type("string") phase = "lobby";
  @type("string") gameMode = "solo";
  @type("number") round = 0;
  @type("string") hostId = "";
  @type("number") phaseEndsAt = 0;

  @type("string") currentSpeakerId = "";
  @type("string") typingId = "";
  @type("string") theme = "";

  @type("string") winner = "";
  @type("string") lastEliminatedId = "";

  @type({ map: Player }) players = new MapSchema<Player>();
  @type([ChatMessage]) messages = new ArraySchema<ChatMessage>();

  // voterId -> targetId ("skip" pour passer)
  @type({ map: "string" }) votes = new MapSchema<string>();
  // playerId -> role (rempli à l'élimination, puis tout à la fin)
  @type({ map: "string" }) roleReveal = new MapSchema<string>();
  // playerId -> pseudo réel (rempli à la fin de partie)
  @type({ map: "string" }) nameReveal = new MapSchema<string>();
}
