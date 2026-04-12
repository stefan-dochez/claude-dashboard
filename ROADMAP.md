# Claude Dashboard — Roadmap

## v0.5–v0.11 (Complete)

### 1. ~~Command Palette (Cmd+K)~~ (done — v0.5.5)
- ~~Launcher universel a la VS Code~~
- ~~Recherche fuzzy : fichiers, instances, projets, commandes, raccourcis~~
- ~~Actions rapides : lancer instance, kill, switch tab, toggle panels~~
- ~~Extensible : chaque composant peut enregistrer ses propres commandes~~

### 2. ~~Templates de prompts reutilisables~~ (done — v0.5.6)
- ~~Bibliotheque de prompts sauvegardes par projet ou globalement~~
- ~~Variables dans les templates : `{{file}}`, `{{branch}}`, `{{selection}}`~~
- ~~Import/export de templates (partage en equipe)~~
- ~~Historique des prompts les plus utilises avec auto-suggestion~~

### 3. ~~Notifications systeme~~ (done — v0.6.0)
- ~~Notifications macOS/Windows quand une instance passe en `waiting_input` hors focus~~
- ~~Son optionnel (configurable) pour les evenements importants~~
- ~~Badge sur l'icone Electron avec le nombre d'instances en attente~~
- ~~Integration Slack : envoyer un message quand une tache est terminee~~ → deplace en v0.12+

### 4. ~~Split terminal~~ (done — v0.8.0–v0.11.0)
- ~~Afficher 2-4 instances cote a cote (grid layout)~~
- ~~Broadcast mode : envoyer le meme input a plusieurs instances simultanement~~
- ~~Recherche dans le terminal (Cmd+F dans le buffer xterm)~~
- ~~Export de session : sauvegarder le contenu complet en `.md` ou `.txt`~~

### 5. ~~Dashboard de couts et analytics~~ (done — v0.6.0)
- ~~Cout par jour/semaine/mois (graphique)~~
- ~~Cout par projet~~
- ~~Repartition input/output tokens~~
- ~~Comparaison Opus vs Sonnet vs Haiku (cout/efficacite)~~
- ~~Budget alert : notification si le cout journalier depasse un seuil~~ → deplace en v0.12+

---

## v0.12+ (Prochaines priorites)

### Restes de v0.5–v0.11
- Integration Slack : envoyer un message quand une tache est terminee
- Budget alert : notification si le cout journalier depasse un seuil

### ChatView
- Branching de conversation (revenir en arriere, re-prompter)
- Favoris/bookmarks sur des messages specifiques
- ~~Copier des blocs de code en un clic~~ (done — v0.6.1)
- Image support : drag & drop screenshots (vision API)
- Resume automatique des longues conversations
- ~~**Execution de skills via le chat**~~ (done — v0.6.1) : ~~permettre de lancer des slash commands (`/commit`, `/review-pr`, `/ship`, etc.) directement depuis l'input du chat. Autocompletion des skills disponibles avec `/`, description inline, et execution transparente comme si on etait dans le terminal Claude Code~~

### Git workflow
- Auto-commit intelligent (detection fin de travail Claude + message genere)
- Conflict resolution UI (diff 3-way inline)
- Branch cleanup automatique (worktrees/branches mergees apres X jours)
- Stash management depuis l'UI

### Recherche et navigation
- Go to definition basique (click symbole -> occurrences)
- Historique de navigation (back/forward fichiers consultes)
- Filtres dans CodeSearch : par type de fichier, par dossier, regex toggle

---

## v1.0 (Features ambitieuses)

### Multi-instance orchestration
- Lancer N instances en parallele sur un meme projet avec des taches differentes
- Plan d'execution : decrire un objectif global, le dashboard le decoupe en sous-taches
- Vue Kanban/timeline pour visualiser l'avancement
- Merge automatique des worktrees quand toutes les sous-taches sont terminees

### Mode "Review" collaboratif
- Ouvrir une PR et lancer Claude en mode review
- Commentaires inline sur le diff dans PullRequestView
- Discussion avec le reviewer sur chaque commentaire

### Mode "Watch" / CI local
- Surveiller un repertoire, relancer Claude quand des fichiers changent
- Integration resultats de tests : si `npm test` echoue, lancer Claude pour fixer
- Pipeline configurable : lint -> test -> Claude fix -> re-test -> commit si vert

### Plugins / Extensions
- Architecture de plugins avec interface standard (package npm)
- Exemples : Jira, Sentry, Docker
- Chaque plugin etend le dashboard avec des modules custom

### Collaboration multi-utilisateur
- Mode serveur partage : plusieurs devs connectes au meme dashboard
- Visibilite des instances des autres (read-only ou full access)
- Chat entre utilisateurs dans le contexte d'une instance

### Snapshots / Checkpoints
- Snapshot git automatique avant chaque action destructive de Claude
- Timeline visuelle des checkpoints avec preview du diff
- Restore en un clic
- Comparaison entre deux checkpoints

---

## Quick wins (a integrer au fil de l'eau)

| Amelioration | Effort | Impact |
|---|---|---|
| ~~Dark/Light theme toggle~~ (done — v0.7.0) | Faible | Moyen |
| Drag & drop pour reordonner les favoris | Faible | Faible |
| Indicateur de sante des instances (CPU/RAM via pidusage) | Faible | Moyen |
| ~~Auto-scroll lock/unlock dans le terminal~~ (done — v0.7.0) | Faible | Moyen |
| Zoom in/out sur le terminal (font size) | Faible | Faible |
| ~~Persistence des onglets ouverts entre sessions~~ (done — v0.7.0) | Faible | Moyen |
| ~~Raccourci Cmd+W pour fermer une instance~~ (done — v0.7.0) | Faible | Faible |
| Status bar en bas (connexion, instances actives, cout cumule) | Moyen | Eleve |
| Accessibilite : aria-labels complets, navigation clavier | Moyen | Moyen |
