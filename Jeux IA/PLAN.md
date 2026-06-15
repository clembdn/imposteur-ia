# 🎭 AI Impostor Party — Plan complet (V1)

> Jeu social de déduction type *Among Us / Loup-Garou*, avec un twist : un **joueur IA** caché se fait passer pour un humain. Les joueurs doivent démasquer l'imposteur **et** l'IA.

---

## 1. Concept

Partie de **5 à 10 joueurs** dans un salon privé. Parmi eux :
- des **Humains** (Équipage),
- **1 imposteur** (un humain avec un objectif caché),
- **1 IA** déguisée en joueur humain.

**Double objectif** : trouver l'imposteur **et** repérer l'IA.

### Conditions de victoire (V1)
- **Humains** : gagnent s'ils éliminent l'IA **et** l'imposteur.
- **IA** : gagne si elle survit jusqu'à ≤ 2 joueurs sans être votée.
- **Imposteur** : gagne s'il survit ou atteint la parité.

---

## 2. Boucle de jeu

```
LOBBY → ASSIGN → [ DISCUSSION → VOTE → REVEAL ] (xN rounds) → END
```
1. **Lobby** : host crée un salon, code à 6 lettres, les joueurs rejoignent.
2. **Attribution** : rôles tirés en secret côté serveur + persona IA.
3. **Round** : discussion (chat) → vote (élimination) → révélation.
4. **Fin** : conditions de victoire, écran résultats, replay.

---

## 3. Fonctionnalités V1 (MVP)

### Salon & connexion
- [x] Pseudo + avatar (session anonyme)
- [x] Créer un salon privé → code à 6 caractères
- [x] Rejoindre via code, liste joueurs temps réel, statut « prêt »
- [x] Config par le host : rounds, durées (persona IA / imposteurs à venir)

### Cœur de jeu
- [x] Attribution secrète des rôles côté serveur (autoritaire, anti-triche)
- [x] Chat temps réel
- [x] Vote temps réel + timer + comptage live
- [x] Élimination + révélation, détection de fin
- [x] Reconnexion (fenêtre 30 s)

### L'IA joueur (Phase 3) ✅
- [x] IA virtuelle ajoutée au lancement, cachée parmi des joueurs **anonymisés** (couleurs)
- [x] 2 modes : **Solo** (1 IA) · **Duo** (1 IA + 1 imposteur humain allié, qui connaît l'IA)
- [x] **Tour de parole** : thème par manche, chacun répond à son tour, l'IA rebondit
- [x] Lit le chat et répond comme un humain (latence ∝ longueur + fautes simulées + minuscules)
- [x] 4 personnalités + Aléatoire : Manipulateur, Timide, Agressif, Drôle
- [x] Vote (JSON `{identity, reason}`), accuse, se défend pendant le vote
- [x] Anti-détection : messages courts, délai de frappe, langage relâché, fautes
- [x] L'IA a accès aux vrais pseudos côté serveur (intel) — jamais exposés aux joueurs

### Après-partie (Phase 4+)
- [ ] Écran de résultats (fait) + persistance
- [ ] Historique des parties
- [ ] Replay round par round

---

## 4. L'IA — crédibilité (Phase 3)

| Sujet | Décision |
|---|---|
| **Modèle** | **DeepSeek** (clé fournie) via couche provider-agnostique. Alternatives rapides/pas chères : Gemini Flash-Lite, GPT-5-mini. |
| **Personnalités** | 4 system-prompts + tic de langage aléatoire. |
| **Anti-détection** | Messages courts, minuscules, fautes occasionnelles, délai de frappe ∝ longueur. |
| **Stratégie** | Injection des suspicions/votes/éliminés → adaptation. |
| **Vote** | Sortie JSON `{ targetId, reason }`. |
| **Coût** | ~1–2 c€/partie. |

---

## 5. Stack technique

| Couche | Techno |
|---|---|
| Langage | TypeScript (front + back) |
| Frontend | React + Vite + Tailwind + Zustand + Framer Motion |
| Temps réel / serveur | **Colyseus** (Node) |
| IA | Module `AIPlayer` (provider-agnostique, défaut DeepSeek) |
| BDD | PostgreSQL + Prisma (Supabase) — Phase 4 |
| Hébergement | Vercel (front) · Railway/Fly (serveur) · Supabase (DB) |

### Structure
```
ai-impostor-party/
├── packages/
│   ├── shared/   # types & constantes partagés
│   ├── server/   # Colyseus GameRoom (FSM), AIPlayer, (Prisma)
│   └── client/   # React + Vite + Tailwind
└── package.json  # workspaces
```

---

## 6. Modèle de données (Phase 4)
```
Game(id, code, status, config, createdAt)
Player(id, gameId, name, avatar, role, isAI, persona, alive)
Message(id, gameId, round, playerId, text, createdAt)
Vote(id, gameId, round, voterId, targetId)
RoundResult(id, gameId, round, eliminatedId)
```

---

## 7. Direction Artistique (finalisée)

**Référence** : Jackbox. **Style** : cartoon rétro / arcade, persos humanoïdes (têtes rondes, gros yeux). **Cible** : desktop-first.

- **Palette** : fond nuit `#0E0B1F`/`#161229` ; néons magenta `#FF2E97`, cyan `#22E0FF`, jaune `#FFD23F`, vert `#39FF88`.
- **Typo** : titres *Luckiest Guy* (display), corps *Outfit*.
- **Détails** : scanlines CRT légères, ombres dures, bordures épaisses, animations punchy (Framer Motion).
- **Nom** : **AI Impostor Party**.

---

## 8. Roadmap
1. [x] **Phase 0** — Setup monorepo, Colyseus + Vite.
2. [x] **Phase 1** — Lobby (code, joueurs, ready, config host).
3. [x] **Phase 2** — Boucle rounds (timers, vote, élimination, victoire, écran de fin).
4. [x] **Phase 3** — Joueur IA (DeepSeek, 4 personas, anti-détection, modes Solo/Duo, tour de parole anonymisé).
5. [ ] **Phase 4** — Persistance & écran résultats avancé.
6. [ ] **Phase 5** — Historique & Replay.
7. [ ] **Phase 6** — Polish DA, sons, responsive mobile.

---

## 9. Coûts
- Dev/hébergement : tiers gratuits pour démarrer.
- IA : ~1–2 c€/partie (modèle Flash/mini).

## 10. Risques & parades
- IA grillée trop vite → prompt « humain bridé » + délais de frappe.
- IA trop lente → modèle rapide + streaming + timeout.
- Triche → serveur autoritaire (rôles secrets jamais synchronisés).
