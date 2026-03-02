# Claude Code Dashboard — Backlog

## Vision

Dashboard web local permettant de lancer, monitorer et interagir avec plusieurs instances Claude Code en parallèle, chacune attachée à un projet/worktree local.

Stack : Node.js backend + node-pty + socket.io + React frontend + xterm.js

---

## Phase 1 — Foundation & Project Scanner

### US-1 : Initialisation du projet

- [ ] Init monorepo avec structure `packages/backend` + `packages/frontend`
- [ ] Setup TypeScript pour backend et frontend
- [ ] Backend : Express + socket.io server, port configurable via env (défaut 3200)
- [ ] Frontend : React (Vite), Tailwind CSS
- [ ] Script `dev` qui lance backend + frontend en parallèle (concurrently)
- [ ] Fichier `CLAUDE.md` à la racine avec les conventions du projet

### US-2 : Configuration utilisateur

- [ ] Fichier de config `~/.claude-dashboard/config.json` créé au premier lancement
- [ ] La config contient : liste des répertoires racines à scanner (ex: `~/projects`, `~/work`)
- [ ] La config contient : extensions de détection projet (`.git`, `CLAUDE.md`, `package.json`, `Cargo.toml`, `go.mod`, etc.)
- [ ] La config contient : profondeur max de scan (défaut 3)
- [ ] La config contient : port du serveur
- [ ] Endpoint REST `GET /api/config` pour lire la config
- [ ] Endpoint REST `PUT /api/config` pour modifier la config

### US-3 : Scanner de projets

- [ ] Service `ProjectScanner` qui parcourt les répertoires configurés
- [ ] Détection des projets via la présence de fichiers marqueurs (`.git`, `CLAUDE.md`, etc.)
- [ ] Détection des Git worktrees : lire `.git/worktrees/` pour trouver les worktrees liés
- [ ] Pour chaque projet détecté, extraire : nom, chemin absolu, branche Git active, présence de `CLAUDE.md`, dernière modification
- [ ] Endpoint REST `GET /api/projects` retournant la liste des projets détectés
- [ ] Endpoint REST `POST /api/projects/refresh` pour relancer un scan
- [ ] Cache du scan en mémoire, invalidé au refresh ou toutes les 5 minutes

---

## Phase 2 — Process Manager & PTY

### US-4 : Spawn d'instances Claude Code

- [ ] Service `ProcessManager` gérant le cycle de vie des instances
- [ ] Chaque instance est un process `claude` spawné via `node-pty` dans le working directory du projet choisi
- [ ] Stocker pour chaque instance : id (uuid), projectPath, pid, statut, timestamp de création
- [ ] Endpoint REST `POST /api/instances` avec body `{ projectPath }` → spawn une instance, retourne l'id
- [ ] Endpoint REST `DELETE /api/instances/:id` → kill proprement le process (SIGTERM, puis SIGKILL après 5s)
- [ ] Endpoint REST `GET /api/instances` → liste toutes les instances actives avec leur statut
- [ ] Gestion du cleanup : quand un process PTY se termine (exit), mettre à jour le statut et notifier le frontend

### US-5 : Streaming terminal via WebSocket

- [ ] Namespace socket.io `/terminal` pour la communication temps réel
- [ ] Event `terminal:attach` (clientId, instanceId) → commence à streamer l'output PTY vers ce client
- [ ] Event `terminal:input` (instanceId, data) → forward l'input clavier vers le PTY
- [ ] Event `terminal:resize` (instanceId, cols, rows) → resize le PTY
- [ ] Event `terminal:detach` (instanceId) → arrête le streaming sans kill le process
- [ ] Buffer des dernières 5000 lignes par instance pour que le client puisse récupérer l'historique au attach

### US-6 : Détection de statut des instances

- [ ] Enum de statuts : `launching`, `processing`, `waiting_input`, `idle`, `exited`
- [ ] Détection `waiting_input` : parser l'output PTY pour détecter le prompt Claude Code (pattern matching sur les dernières lignes du buffer)
- [ ] Détection `processing` : activité récente sur stdout (< 2s depuis dernier output)
- [ ] Détection `idle` : prompt visible + aucune activité depuis > 30s
- [ ] Détection `exited` : event exit du process PTY
- [ ] Monitoring CPU/mémoire du process via `pidusage` comme signal complémentaire
- [ ] Event socket.io `instance:status` émis à chaque changement de statut
- [ ] Les patterns de détection du prompt doivent être configurables (la TUI de Claude Code peut évoluer)

---

## Phase 3 — Frontend Dashboard

### US-7 : Layout principal du dashboard

- [ ] Layout responsive : sidebar à gauche (liste projets + instances), zone principale (terminal actif)
- [ ] Header avec titre, nombre d'instances actives, bouton refresh projets
- [ ] La sidebar affiche deux sections : "Projects" (disponibles) et "Active Instances" (en cours)
- [ ] Thème sombre par défaut (cohérent avec un usage terminal)
- [ ] Design moderne et propre, pas de look "admin template générique"

### US-8 : Liste des projets

- [ ] Afficher tous les projets détectés dans la sidebar
- [ ] Pour chaque projet : nom, branche git, badge si `CLAUDE.md` présent
- [ ] Barre de recherche / filtre en haut de la liste
- [ ] Bouton "Launch" sur chaque projet pour spawner une instance Claude Code
- [ ] Groupement optionnel par répertoire racine
- [ ] Indicateur si une instance est déjà active sur ce projet

### US-9 : Liste des instances actives

- [ ] Afficher toutes les instances dans la sidebar avec indicateur de statut coloré
- [ ] Pastille de couleur par statut : vert (waiting_input), bleu (processing), gris (idle), rouge (exited)
- [ ] Clic sur une instance → affiche le terminal dans la zone principale
- [ ] Bouton stop/kill sur chaque instance
- [ ] Badge notification sur les instances en `waiting_input` pour attirer l'attention
- [ ] Tri par statut (waiting_input en premier) puis par date de création

### US-10 : Terminal embarqué (xterm.js)

- [ ] Composant React wrappant xterm.js
- [ ] Au montage, se connecte au WebSocket et attach à l'instance sélectionnée
- [ ] Récupère le buffer historique pour afficher le contexte
- [ ] Input clavier forwardé au backend via WebSocket
- [ ] Resize automatique quand la zone change de taille (xterm fit addon)
- [ ] Support du copier/coller
- [ ] Rendu fidèle de la TUI de Claude Code (couleurs, styles, etc.)

### US-11 : Multi-panneaux (split view)

- [ ] Possibilité de splitter la zone principale en 2 ou 4 terminaux côte à côte
- [ ] Drag & drop des instances depuis la sidebar vers un panneau
- [ ] Bouton pour passer en mode "single" / "split-2" / "split-4"
- [ ] Chaque panneau a son propre xterm.js indépendant

---

## Phase 4 — Quality of Life

### US-12 : Raccourcis clavier

- [ ] `Ctrl+N` : nouvelle instance (ouvre le sélecteur de projet)
- [ ] `Ctrl+W` : fermer/kill l'instance active
- [ ] `Ctrl+Tab` / `Ctrl+Shift+Tab` : naviguer entre instances
- [ ] `Ctrl+1..9` : switch rapide vers instance N
- [ ] `Ctrl+\` : toggle sidebar
- [ ] Afficher un panneau d'aide des raccourcis avec `?`

### US-13 : Notifications

- [ ] Notification dans le titre de l'onglet navigateur quand une instance passe en `waiting_input` et qu'elle n'est pas la vue active (ex: "(2) Claude Dashboard" pour 2 instances en attente)
- [ ] Notification sonore optionnelle (configurable)
- [ ] Notification desktop (Notification API) quand une instance attend un input depuis > 30s

### US-14 : Persistance des sessions

- [ ] Au shutdown du serveur, sauvegarder la liste des instances actives et leur projectPath
- [ ] Au démarrage, proposer de restaurer les instances précédentes
- [ ] Sauvegarder le layout (split view, quelles instances dans quels panneaux) dans la config

### US-15 : Page de settings

- [ ] UI pour éditer la config (répertoires à scanner, port, profondeur de scan)
- [ ] Section pour gérer les patterns de détection de statut
- [ ] Toggle pour les notifications sonores/desktop
- [ ] Bouton pour tester le scan de projets et voir les résultats

---

## Phase 5 — Advanced Features

### US-16 : Quick commands / Presets

- [ ] Pouvoir définir des commandes prédéfinies par projet (ex: "review PR", "fix tests", "refactor module X")
- [ ] Les presets sont stockés dans la config ou dans le `CLAUDE.md` du projet
- [ ] Menu rapide pour envoyer un preset à une instance active
- [ ] Support de variables dans les presets (ex: `{branch}`, `{file}`)

### US-17 : Métriques et historique

- [ ] Logger les sessions : projet, durée, nombre de tokens estimé (si parsable depuis l'output)
- [ ] Dashboard de métriques : temps passé par projet, nombre de sessions par jour
- [ ] Historique des sessions terminées consultable

### US-18 : CLI compagnon

- [ ] Commande `claude-dashboard start` pour lancer le serveur
- [ ] Commande `claude-dashboard open` pour ouvrir le navigateur sur le dashboard
- [ ] Commande `claude-dashboard launch <project-name>` pour spawner une instance depuis le terminal
- [ ] Commande `claude-dashboard status` pour voir les instances actives en CLI

---

## Notes techniques pour Claude Code

### Dépendances clés

- **Backend** : express, socket.io, node-pty, pidusage, uuid, chokidar (watch config), simple-git
- **Frontend** : react, @xterm/xterm, @xterm/addon-fit, @xterm/addon-web-links, socket.io-client, tailwindcss, lucide-react

### Contraintes

- macOS uniquement en cible primaire (node-pty compile bien sur Mac avec Xcode CLI tools)
- Le binaire `claude` doit être dans le PATH du système
- Chaque PTY consomme un file descriptor — prévoir une limite raisonnable (max 10 instances simultanées par défaut)
- Le frontend doit fonctionner sur Chrome et Safari récents

### Structure de fichiers cible

```
claude-dashboard/
├── CLAUDE.md
├── package.json              # workspace root
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── index.ts              # entry point
│   │   │   ├── config.ts             # gestion config
│   │   │   ├── scanner.ts            # ProjectScanner
│   │   │   ├── process-manager.ts    # ProcessManager + PTY
│   │   │   ├── status-monitor.ts     # détection de statut
│   │   │   ├── routes.ts             # REST endpoints
│   │   │   └── socket.ts             # WebSocket handlers
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── frontend/
│       ├── src/
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── Sidebar.tsx
│       │   │   ├── ProjectList.tsx
│       │   │   ├── InstanceList.tsx
│       │   │   ├── TerminalView.tsx
│       │   │   ├── SplitLayout.tsx
│       │   │   └── Settings.tsx
│       │   ├── hooks/
│       │   │   ├── useSocket.ts
│       │   │   └── useInstances.ts
│       │   └── types.ts
│       ├── tsconfig.json
│       └── package.json
└── README.md
```

### Ordre d'implémentation recommandé

1. **US-1** → setup monorepo, on veut que `npm run dev` fonctionne
2. **US-2 + US-3** → config + scanner, vérifiable via les endpoints REST
3. **US-4 + US-5** → PTY + WebSocket, testable avec un client socket.io minimal
4. **US-10** → terminal xterm.js, c'est le moment "ça marche" visuellement
5. **US-7 + US-8 + US-9** → layout complet du dashboard
6. **US-6** → détection de statut (itératif, à affiner)
7. **US-11 + US-12** → split view + raccourcis
8. Le reste en V2
