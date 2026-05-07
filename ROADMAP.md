# Claude Dashboard — Roadmap

Version courante : **v0.36.0**

---

## v0.30+ — Prochaines priorites

### IDE integration (suite du Stage B1 livre en v0.29.0)

Phase 1 livree en v0.29.0 : serveur MCP WebSocket par instance terminal, lockfile `~/.claude/ide/<port>.lock`, env vars `CLAUDE_CODE_SSE_PORT` + `ENABLE_IDE_INTEGRATION`, notifications `selection_changed` au bon format LSP, tools `getOpenEditors` / `getCurrentSelection` / `getLatestSelection` / `getWorkspaceFolders` / `openFile` / `close_tab`, highlight violet persistant dans `FileViewer`.

Stage B2 livre en v0.36.0 : `ide:at_mentioned` socket emit branche dans `App.tsx` selon `selectedInstance.mode` (terminal → notif MCP, chat → `setCodeSelection`), toast confirme l'envoi.

Stage 3 UI livre en v0.36.0 : callout flottant ancre sur le dernier `getClientRects()` du `Range` (rect par ligne, pas la bounding box union qui couvrait toute la largeur). Rendu dans le scroll container, scrolle avec le contenu. `onMouseDown preventDefault` empeche le clic de collapser la selection avant `onClick`.

**Stage B3 — `openDiff` UI avec Accept/Reject** (~1j, terminal uniquement)
- Claude appelle `mcp__ide__openDiff` quand il veut montrer un diff d'edit et *attend* que l'utilisateur accepte ou rejette. Aujourd'hui on retourne `{ accepted: false, error: ... }` → Claude fallback sur l'affichage terminal standard.
- Implementer un mini-diff viewer modal (inspire de ChangesView) avec boutons Accept / Reject qui renvoient la reponse au tool call.
- Amene la parite avec le chat mode qui a deja des diffs inline via `ToolDetailView`.

### Open Pull Requests

Phase 1 livree en v0.25.0 : labels colores, `reviewDecision`, CI rollup, badge `conflicts`, highlight age >7j, migration complete vers GitHub GraphQL (regle au passage les 2 dettes techniques : pagination search API et reviewers manquants).

**Phase 2 — Filtres & tri**
- Filtre "A reviewer par moi" (`reviewRequests` contient l'utilisateur courant)
- Filtres additionnels : drafts on/off, avec conflits, par label
- Tri configurable : age, nombre d'approvals manquants, auteur
- Recherche texte (titre + auteur)
- Groupements alternatifs : "waiting on me" / "waiting on others" / "mine"

**Phase 3 — Actions directes**
- Approve / Request changes / Comment via `gh pr review` (a debattre : casse le modele read-only actuel)
- Checkout rapide de la branche dans une instance existante
- (Deja partiel : "Check out remote branch into worktree" livre en v0.23.0 couvre le "Open in worktree" initialement prevu ici)

### ChatView
- Branching de conversation (revenir en arriere, re-prompter)
- Favoris/bookmarks sur des messages specifiques
- Image support : drag & drop screenshots (vision API)

### Git workflow
- Auto-commit intelligent (detection fin de travail Claude + message genere)
- Conflict resolution UI (diff 3-way inline)
- Branch cleanup automatique (worktrees/branches mergees apres X jours)
- Stash management depuis l'UI (au-dela de l'auto-stash au switch livre en v0.24.0)

### Recherche et navigation
- Go to definition basique (click symbole -> occurrences)
- Historique de navigation (back/forward fichiers consultes)
- Filtres dans CodeSearch : par type de fichier, par dossier, regex toggle

### Notifications & budget
- Integration Slack : envoyer un message quand une tache est terminee
- Budget alert : notification si le cout journalier depasse un seuil

---

## v1.0 — Features ambitieuses

### Mode "Review" collaboratif
- Ouvrir une PR et lancer Claude en mode review
- Commentaires inline sur le diff dans PullRequestView
- Discussion avec le reviewer sur chaque commentaire

### Ecosysteme plugins
Plugins manager livre en v0.18.0. Manque une librairie d'exemples officiels (Jira, Sentry, Docker) et une doc d'ecriture de plugins tiers.

---

## Quick wins (a integrer au fil de l'eau)

| Amelioration | Effort | Impact |
|---|---|---|
| Indicateur de sante des instances (CPU/RAM via `pidusage`) | Faible | Moyen |
| Zoom in/out sur le terminal (font size) | Faible | Faible |
| Status bar en bas (connexion, instances actives, cout cumule) | Moyen | Eleve |
| Accessibilite : aria-labels restants, navigation clavier avancee | Moyen | Moyen |

---

## Livre (archive)

### v0.5.0 et avant — Coeur dashboard
Electron app, unified sidebar, tab system, chat mode (Agent SDK), 2-column layout, context panel, file explorer, file viewer, code search modal, @-mention autocomplete, diff views, context attachments, code selection to chat, session history + resume, auto-generated session titles, rate limit countdown, git workflow (Changes + PR view), branch prefix selector, meta-projects, worktrees (detach, resume, undo delete), favorite projects, scan paths editor, tree/flat toggle, pull/update repos, Windows support, design token system, syntax highlighting, keyboard shortcuts.

### v0.5.5–v0.11 — Productivite
- **v0.5.5** : Command Palette (Cmd+K)
- **v0.5.7** : Prompt Templates
- **v0.6.0** : System Notifications, Cost & Analytics Dashboard
- **v0.6.2** : Copy code blocks, slash command autocomplete
- **v0.7.0** : Dark/Light theme toggle, auto-scroll lock, Cmd+W close instance, tab persistence
- **v0.8.0** : Terminal search (Cmd+F)
- **v0.9.0** : Export terminal session
- **v0.10.0** : Split terminal view
- **v0.11.0** : Broadcast mode, markdown rendering

### v0.12–v0.36
- **v0.12** : Open in IDE
- **v0.13** : Aggregated PR view, PR count badge, Mine/All filter
- **v0.14** : Dependency health check, configurable session titles, configurable terminal theme
- **v0.16** : Custom start point for new worktree
- **v0.17** : Update available banner
- **v0.18** : Plugins manager
- **v0.19** : In-app auto-updater
- **v0.20** : "What's new" modal apres update, periodic update check
- **v0.21** : GitHub Actions status dans la sidebar, hidden files toggle dans File Explorer
- **v0.22** : Session picker au clic d'un worktree, power icon pour close (trash reserve a delete)
- **v0.23** : Checkout remote branch into worktree (couvre le "Open in worktree" de PR Phase 3)
- **v0.24** : Switch to default branch button, auto-stash confirm modal, hover-pause toasts
- **v0.25** : Open PRs Phase 1 (labels, review state, CI, conflicts, age highlight, migration GraphQL)
- **v0.26** : Search Everywhere modal (Cmd+T, tabs All/Files/Text), jump-to-line dans FileViewer, fusion CodeSearchModal -> SearchEverywhere
- **v0.27** : Push layout — chat/terminal reste visible a cote de Changes/PR/FileViewer (panneau lateral redimensionnable, toggles dans la top bar)
- **v0.28** : Multi-file tabs dans le workspace panel (openFiles[] + activeFilePath, tabs internes fermables, persistence localStorage)
- **v0.29** : IDE integration Phase 1 — serveur MCP WebSocket par instance terminal (lockfile ~/.claude/ide/<port>.lock, env vars CLAUDE_CODE_SSE_PORT + ENABLE_IDE_INTEGRATION, tools getOpenEditors/getCurrentSelection/openFile/close_tab/getWorkspaceFolders + stubs pour diagnostics/dirty/save/diff/executeCode, notifications selection_changed au format LSP half-open, highlight violet persistant dans FileViewer)
- **v0.36** : IDE integration Stage B2 + Stage 3 UI — `at_mentioned` actif en mode terminal (parite avec chat mode), callout flottant remplace le bouton de toolbar et s'ancre sur le dernier rect du `Range` (multi-line OK)
