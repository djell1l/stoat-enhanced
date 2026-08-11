# Stoat Modded — squelette de l'injecteur

Fork de `stoatchat/for-desktop` avec un système de plugins injecté au niveau
du preload Electron. Voir `src/mods/` pour le code de l'injecteur.

## Pour démarrer sur ton Mac

### 1. Prérequis
- Node.js 20+ (vérifie avec `node --version`)
- pnpm : `npm install -g pnpm`

### 2. Récupérer les vraies icônes (submodule assets)

Ce zip contient des icônes **placeholder** (1x1 px transparent) dans
`assets/desktop/`, juste pour que le build passe. Sur ta machine, remplace-les
par les vraies :

```bash
git init
git submodule add https://github.com/stoatchat/assets assets
```

Ou plus simple : télécharge juste le dossier `desktop/` depuis
https://github.com/stoatchat/assets et écrase `assets/desktop/`.

### 3. Installer les dépendances

```bash
pnpm install
```

### 4. Lancer en mode dev

```bash
pnpm start
```

Ça doit ouvrir la fenêtre Stoat habituelle, connectée à `stoat.chat`, mais
avec un **liseré coloré en haut de la fenêtre** (rouge → jaune → vert → bleu).
Si tu vois ce liseré, l'injection fonctionne de bout en bout.

Regarde aussi la console DevTools (Cmd+Option+I une fois l'app lancée) : tu
dois voir dans les logs :
```
[StoatModded] Injecteur chargé (v0.0.1), 1 plugin(s) actif(s).
[StoatModded/custom-css] activation du plugin CSS custom
```

### 5. Où toucher pour la suite

- `src/mods/core/loader.ts` — le point d'entrée de l'injecteur, appelé depuis
  `src/preload.ts`. C'est ici que sont activés tous les plugins.
- `src/mods/core/types.ts` — le contrat `Plugin` / `PluginContext` que chaque
  plugin doit respecter.
- `src/mods/plugins/` — un fichier par plugin. `customCss.ts` sert de gabarit
  minimal à copier pour le prochain plugin.
- `src/mods/plugins/index.ts` — le registre : ajoute ton nouveau plugin dans
  le tableau `PLUGIN_REGISTRY` pour l'activer.

### 6. Builder un vrai exécutable .app (macOS)

```bash
pnpm run make
```

Le `.dmg`/`.app` sortira dans `out/make/`. Comme prévu, on ne patche jamais
le binaire officiel Stoat : on build notre propre exécutable à partir de ce
fork, donc pas de souci avec la vérification d'intégrité `.asar` de l'app
officielle.

## Rappel de l'architecture (pourquoi c'est fait comme ça)

- Le client desktop est un simple **shell Electron** qui charge
  `https://stoat.chat/app` (voir `BUILD_URL` dans `src/native/window.ts`) —
  il n'embarque pas le code web en local.
- Notre injecteur vit dans le **preload** (`src/preload.ts` →
  `src/mods/core/loader.ts`), qui a accès à Node.js mais tourne dans un
  contexte isolé de la page web.
- Pour toucher le DOM de la page (qui vit dans le "main world"), le loader
  injecte une balise `<script>` classique — c'est la méthode standard et
  robuste pour ce cas de figure avec `contextIsolation` activé.
- Chaque plugin ne fait, pour l'instant, qu'injecter du CSS scoppé (`ctx.injectCSS`).
  On étoffera l'API (accès à des metadata custom, hooks réseau, etc.) au fur
  et à mesure des besoins des prochains plugins.
