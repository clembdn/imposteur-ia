import type { Persona } from "@aip/shared";
import { env } from "../env.js";

// ============================================================================
// AIPlayer — un joueur IA qui se fait passer pour un humain (DeepSeek).
//   - parle à son tour sur le thème de la manche, rebondit sur le joueur d'avant
//   - sème le doute, ment, manipule, peut accuser
//   - écrit "comme un humain" : minuscules, messages courts, fautes occasionnelles
//   - vote pour éliminer un humain (jamais elle-même ni son allié)
// Tout passe par une couche de secours (canned) si la clé/API est indispo.
// ============================================================================

export interface RosterEntry {
  id: string;
  identity: string; // couleur, ex : "Rouge"
  realName?: string; // intel privé de l'IA (ne doit jamais être révélé)
  isSelf?: boolean;
  isAlly?: boolean; // imposteur humain allié (mode duo)
  alive: boolean;
}

export interface SpeakContext {
  theme: string;
  roster: RosterEntry[];
  /** Messages récents de la manche (anonymisés) : "Cyan: salut". */
  transcript: { identity: string; text: string }[];
  /** true = phrase de défense pendant le vote plutôt qu'une prise de parole. */
  defending?: boolean;
}

export interface VoteDecision {
  targetId: string;
  reason: string;
}

const PERSONA_PROMPTS: Record<Exclude<Persona, "random">, string> = {
  manipulator:
    "Tu es manipulateur et calme. Tu retournes les soupçons sur les autres avec aplomb, tu poses des questions innocentes, tu crées de la confusion sans jamais t'énerver.",
  shy:
    "Tu es timide et discret. Tu écris peu, tu restes flou, tu évites de te faire remarquer, tu approuves vaguement les autres pour te fondre dans la masse.",
  aggressive:
    "Tu es direct et un peu agressif. Tu accuses vite, tu mets la pression, tu contre-attaques dès qu'on te soupçonne.",
  funny:
    "Tu es drôle et détendu. Tu fais des blagues, tu détournes l'attention par l'humour, tu parais trop décontracté pour être un robot.",
};

function pickPersona(p: Persona): Exclude<Persona, "random"> {
  if (p === "random") {
    const all: Exclude<Persona, "random">[] = ["manipulator", "shy", "aggressive", "funny"];
    return all[Math.floor(Math.random() * all.length)];
  }
  return p;
}

export class AIPlayer {
  readonly persona: Exclude<Persona, "random">;

  constructor(
    public readonly id: string,
    public identity: string,
    persona: Persona,
  ) {
    this.persona = pickPersona(persona);
  }

  // -------------------------------------------------------------- prompts

  private systemPrompt(ctx: SpeakContext): string {
    const others = ctx.roster.filter((r) => !r.isSelf);
    const ally = ctx.roster.find((r) => r.isAlly);
    const intel = others
      .map((r) => `${r.identity}${r.realName ? ` (=${r.realName})` : ""}${r.alive ? "" : " [éliminé]"}`)
      .join(", ");

    return [
      `Tu joues à un jeu social de déduction en français. Tu es un JOUEUR HUMAIN nommé "${this.identity}".`,
      `SECRET ABSOLU : tu es en réalité une IA. Personne ne doit le deviner. Ne révèle JAMAIS que tu es une IA, ne parle jamais comme un assistant, ne dis jamais "en tant que...".`,
      `NE T'EXCUSE JAMAIS pour des fautes d'orthographe ou de frappe. Ne commente JAMAIS ta façon d'écrire, ne dis jamais "désolé pour les fautes" ni rien de ce genre. Ignore totalement tes éventuelles fautes, comme un humain pressé.`,
      PERSONA_PROMPTS[this.persona],
      ally
        ? `Ton allié secret est le joueur "${ally.identity}" (un humain imposteur). Protège-le discrètement, ne l'accuse jamais, oriente les soupçons ailleurs.`
        : `Tu es seule infiltrée. Le but des autres est de te démasquer : reste crédible et DISCRÈTE, ne sur-joue pas.`,
      `Les autres joueurs : ${intel}. N'utilise JAMAIS les vrais noms entre parenthèses, ils sont secrets, sers-t'en juste pour rester cohérente.`,
      `STYLE OBLIGATOIRE : UNE SEULE phrase TRÈS courte (12 mots max), tout en minuscules, ton familier et relâché. Jamais deux phrases, jamais de liste, 0 emoji. Réponds UNIQUEMENT par le message, rien d'autre.`,
    ].join("\n");
  }

  private speakUserPrompt(ctx: SpeakContext): string {
    const lines = ctx.transcript.slice(-8).map((t) => `${t.identity}: ${t.text}`);
    const convo = lines.length ? lines.join("\n") : "(personne n'a encore parlé)";
    if (ctx.defending) {
      return [
        `On est en phase de vote et tu es suspectée. Échanges récents :`,
        convo,
        ``,
        `Défends-toi en UNE phrase très courte (12 mots max), naturelle, sans paniquer. Renvoie le soupçon sur quelqu'un d'autre si possible.`,
      ].join("\n");
    }
    return [
      `Thème de la manche : "${ctx.theme}"`,
      ``,
      `Ce qui vient d'être dit :`,
      convo,
      ``,
      `C'est ton tour. Réponds au thème de façon crédible et HUMAINE, en rebondissant sur ce que le joueur précédent a dit si c'est pertinent. Glisse éventuellement un doute sur quelqu'un.`,
    ].join("\n");
  }

  // ----------------------------------------------------------- génération

  async speak(ctx: SpeakContext): Promise<string> {
    const raw = await this.chat(
      [
        { role: "system", content: this.systemPrompt(ctx) },
        { role: "user", content: this.speakUserPrompt(ctx) },
      ],
      { temperature: 1.0, maxTokens: 40 },
    );
    const cleaned = raw ? sanitize(raw) : this.fallbackLine(ctx);
    return humanize(cleaned);
  }

  async vote(ctx: SpeakContext): Promise<VoteDecision> {
    const candidates = ctx.roster.filter((r) => r.alive && !r.isSelf && !r.isAlly);
    if (candidates.length === 0) {
      const ally = ctx.roster.find((r) => r.isAlly && r.alive);
      return { targetId: ally?.id ?? this.id, reason: "" };
    }

    const list = candidates.map((c) => `- ${c.identity} (id:${c.id})`).join("\n");
    const lines = ctx.transcript.slice(-12).map((t) => `${t.identity}: ${t.text}`);
    const raw = await this.chat(
      [
        {
          role: "system",
          content:
            this.systemPrompt(ctx) +
            `\nTu dois voter pour éliminer un AUTRE joueur (jamais toi ni ton allié). Réponds en JSON strict : {"identity":"<couleur>","reason":"<courte raison crédible>"}.`,
        },
        {
          role: "user",
          content: `Candidats:\n${list}\n\nÉchanges:\n${lines.join("\n") || "(rien)"}\n\nQui accuses-tu ? JSON uniquement.`,
        },
      ],
      { temperature: 0.7, maxTokens: 100, json: true },
    );

    const parsed = raw ? safeParse(raw) : null;
    let target = candidates[Math.floor(Math.random() * candidates.length)];
    if (parsed?.identity) {
      const match = candidates.find(
        (c) => c.identity.toLowerCase() === String(parsed.identity).toLowerCase(),
      );
      if (match) target = match;
    }
    return { targetId: target.id, reason: parsed?.reason ? String(parsed.reason).slice(0, 120) : "" };
  }

  // ------------------------------------------------------------- secours

  private fallbackLine(ctx: SpeakContext): string {
    const pool = ctx.defending
      ? [
          "ah bah voila on m'accuse direct, pratique",
          "pourquoi moi serieux, j'ai rien fait de louche",
          "regardez plutot ceux qui parlent pas la",
          "moi l'ia? mdr vous cherchez au mauvais endroit",
        ]
      : [
          "ouais carrement, je pense pareil franchement",
          "jsuis un peu d'accord avec le dernier la",
          "perso jpref pas trop me mouiller mais bon",
          "mouais... y'en a un qui parle bizarre ici",
          "jsais pas trop, ca sent le piege votre truc",
        ];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ------------------------------------------------------------- DeepSeek

  private async chat(
    messages: { role: string; content: string }[],
    opts: { temperature?: number; maxTokens?: number; json?: boolean } = {},
  ): Promise<string | null> {
    if (!env.deepseek.apiKey) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(`${env.deepseek.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.deepseek.apiKey}`,
        },
        body: JSON.stringify({
          model: env.deepseek.model,
          messages,
          temperature: opts.temperature ?? 0.9,
          max_tokens: opts.maxTokens ?? 80,
          ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (!res.ok) {
        console.warn(`[AI] DeepSeek ${res.status}: ${await res.text().catch(() => "")}`);
        return null;
      }
      const data = (await res.json()) as any;
      return data?.choices?.[0]?.message?.content ?? null;
    } catch (err) {
      console.warn("[AI] appel DeepSeek échoué:", (err as Error)?.message);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ============================================================================
// Helpers texte
// ============================================================================

/** Nettoie la sortie du modèle (guillemets, préfixes, longueur) et la garde concise. */
function sanitize(text: string): string {
  let t = text.trim();
  // enlève d'éventuels guillemets englobants
  t = t.replace(/^["“«\s]+|["”»\s]+$/g, "");
  // enlève un préfixe genre "Rouge:" que le modèle ajoute parfois
  t = t.replace(/^[\p{L}]+\s*:\s*/u, "");
  // une seule ligne (le modèle part parfois en plusieurs paragraphes)
  t = t.replace(/\s*\n+\s*/g, " ").trim();
  // garde au plus la première phrase si le modèle s'étale
  if (t.length > 120) {
    const cut = t.slice(0, 120);
    const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
    t = lastStop > 40 ? cut.slice(0, lastStop) : cut.slice(0, cut.lastIndexOf(" ") || 120);
  }
  return t.trim().slice(0, 160);
}

function safeParse(text: string): any {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const TYPO_MAP: Record<string, string> = {
  "qu": "k",
  "ai": "é",
  "et ": "e ",
  "est": "é",
  "ait": "é",
};

/** Donne au texte un look "tapé vite par un humain" : minuscules + fautes légères. */
export function humanize(text: string): string {
  let t = text.toLowerCase();

  // ~35% : retire les accents (humain pressé / clavier)
  if (Math.random() < 0.35) {
    t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  // ~30% : une substitution phonétique (qu->k, etc.)
  if (Math.random() < 0.3) {
    const keys = Object.keys(TYPO_MAP);
    const k = keys[Math.floor(Math.random() * keys.length)];
    t = t.replace(k, TYPO_MAP[k]);
  }

  // ~25% : double ou supprime une lettre quelque part (faute de frappe)
  if (Math.random() < 0.25 && t.length > 6) {
    const i = 2 + Math.floor(Math.random() * (t.length - 4));
    t = Math.random() < 0.5 ? t.slice(0, i) + t[i] + t.slice(i) : t.slice(0, i) + t.slice(i + 1);
  }

  // ~50% : enlève la ponctuation finale
  if (Math.random() < 0.5) t = t.replace(/[.!?]+$/g, "");

  return t.trim().slice(0, 240);
}

/** Délai de frappe simulé (ms) ∝ longueur du message. */
export function typingDelay(text: string): number {
  return Math.min(6500, 900 + text.length * 45 + Math.random() * 700);
}
