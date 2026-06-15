# 🎭 AI Impostor Party

Jeu social de déduction (type *Among Us / Loup-Garou*) avec un **joueur IA caché** qui se fait passer pour un humain. Les joueurs doivent démasquer l'imposteur **et** l'IA.

> Plan produit complet : voir [`PLAN.md`](./PLAN.md).

## 🧱 Stack
- **Monorepo** npm workspaces · TypeScript partout
- **packages/shared** — types & constantes partagés
- **packages/server** — serveur de jeu temps réel **Colyseus** (Node)
- **packages/client** — **React + Vite + Tailwind** (style cartoon rétro/arcade) + Framer Motion

## 🚀 Démarrage (Windows / PowerShell recommandé)

> ⚠️ Si tu utilises un Node "portable" (ex. `C:\Users\c.boudon\node-v24.14.1-win-x64`)
> et que `npm` plante (`Cannot find module ...npm-cli.js`), c'est un souci de PATH.
> Ouvre **PowerShell** (pas Git Bash) et mets Node en tête du PATH pour la session :
>
> ```powershell
> $env:Path = "C:\Users\c.boudon\node-v24.14.1-win-x64;$env:Path"
> ```

### 1. Installer les dépendances (à la racine)
```powershell
cd "C:\Users\c.boudon\Jeux IA"
npm install
```

### 2. Configurer l'environnement
Le fichier `.env` existe déjà à la racine. Colle ta clé DeepSeek (utilisée à partir de la Phase 3) :
```env
DEEPSEEK_API_KEY=ta_cle_ici
```
> La V1 actuelle (lobby + rounds + votes) fonctionne **sans** clé.

### 3. Lancer en dev (serveur + client)
```powershell
npm run dev
```
- Client : http://localhost:5173
- Serveur : ws://localhost:2567 (health : http://localhost:2567/health)

> Séparément : `npm run dev:server` et `npm run dev:client`.

## 🎮 Tester
1. Ouvre http://localhost:5173, choisis pseudo + avatar, **Créer une partie**.
2. Copie le **code**, ouvre 2 autres onglets et **Rejoindre** avec ce code.
3. Avec **3+ joueurs**, l'hôte **lance la partie**.
4. Déroulé : **Discussion** (chat) → **Vote** (clique un joueur ou « Passer ») → **Révélation** → round suivant → **écran de fin** avec tous les rôles.

## 🗺️ Avancement (cf. PLAN.md)
- [x] **Phase 0** — Setup monorepo (shared / server / client), Colyseus + Vite
- [x] **Phase 1** — Lobby : créer/rejoindre par code, liste joueurs, ready, config host
- [x] **Phase 2** — Boucle de rounds : timers, **vote temps réel**, élimination, révélation, conditions de victoire, écran de fin
- [ ] **Phase 3** — Joueur IA (DeepSeek, 4 personas, anti-détection)
- [ ] **Phase 4+** — Persistance (Postgres/Prisma), historique, replay, polish DA

## 🔒 Anti-triche
Les rôles secrets ne sont **jamais** dans l'état synchronisé : le serveur les stocke en privé et n'envoie à chaque client que **son** rôle. Les rôles des autres ne sont révélés qu'à l'élimination (et à la fin).
