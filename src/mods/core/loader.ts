/**
 * Loader principal de l'injecteur.
 *
 * Contexte : ce fichier tourne dans le preload d'Electron (contextIsolation activé).
 * Il n'a PAS accès direct au DOM de la page (stoat.chat), qui vit dans un monde JS
 * séparé pour des raisons de sécurité. On utilise donc `contextBridge` pour exposer
 * une API, et on injecte notre script "monde principal" une fois le DOM prêt.
 *
 * Stratégie : on n'essaie pas de patcher les modules internes de Solid.js (fragile,
 * demande de connaître l'implémentation exacte du bundler à chaque version). On
 * injecte à la place :
 *   1. Du CSS custom (thèmes, mise en forme de features ajoutées)
 *   2. Un observer DOM (MutationObserver) qui détecte les éléments cibles et les
 *      enrichit (ex: badges, indicateurs de plugin, overlays)
 *   3. Des patches ciblés sur `fetch`/`WebSocket` quand un plugin a besoin de lire
 *      ou d'enrichir les données réseau (ex: notre metadata layer custom)
 *
 * Chaque plugin déclare ce dont il a besoin via l'API `registerPlugin`.
 */

import { contextBridge, webFrame } from "electron";

import { PLUGIN_REGISTRY } from "../plugins";
import type { PluginContext } from "./types";

const INJECTOR_NAME = "StoatModded";
const INJECTOR_VERSION = "0.0.1";

/**
 * Construit le script qui sera exécuté dans le "monde principal" (isolated world 0),
 * c'est-à-dire le même contexte JS que la page stoat.chat elle-même.
 * On ne peut pas juste faire `document.x` depuis le preload car contextIsolation
 * nous place dans un monde séparé — executeJavaScript dans le main world résout ça.
 */
function buildMainWorldBootstrap(): string {
  // Le bootstrap est volontairement minimal : il crée juste le namespace global
  // et un bus d'événements. Chaque plugin s'enregistre ensuite dedans.
  return `
    (function () {
      if (window.__stoatModded) return; // évite double injection
      window.__stoatModded = {
        name: ${JSON.stringify(INJECTOR_NAME)},
        version: ${JSON.stringify(INJECTOR_VERSION)},
        plugins: {},
        css: new Map(),
        injectCSS(id, css) {
          let styleEl = document.getElementById('stoat-modded-css-' + id);
          if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'stoat-modded-css-' + id;
            document.head.appendChild(styleEl);
          }
          styleEl.textContent = css;
        },
        removeCSS(id) {
          const el = document.getElementById('stoat-modded-css-' + id);
          if (el) el.remove();
        },
      };
      window.dispatchEvent(new CustomEvent('stoat-modded-ready'));
    })();
  `;
}

/**
 * Point d'entrée. Attend que la fenêtre soit prête puis injecte le bootstrap
 * et active les plugins un par un.
 */
async function init() {
  // On attend le DOMContentLoaded du côté preload (qui lui tourne dans son
  // propre cycle de vie, séparé du main world, mais synchronisé sur le
  // même document).
  if (document.readyState === "loading") {
    await new Promise<void>((resolve) =>
      document.addEventListener("DOMContentLoaded", () => resolve(), {
        once: true,
      }),
    );
  }

  // Injecte le bootstrap dans le monde principal de la page.
  // webFrame.executeJavaScript exécute dans le renderer, mais toujours
  // dans le contexte isolé du preload par défaut ; pour toucher le main
  // world de la page on passe par une balise <script> classique, ce qui
  // est la méthode standard et robuste pour ce cas de figure.
  const script = document.createElement("script");
  script.textContent = buildMainWorldBootstrap();
  document.documentElement.appendChild(script);
  script.remove(); // le code s'est déjà exécuté, on peut nettoyer le tag

  // Expose une API minimale côté Node (fichiers, config locale) pour les
  // plugins qui en ont besoin, via contextBridge -- séparé du main world
  // pour garder une frontière de sécurité claire.
  contextBridge.exposeInMainWorld("stoatModdedNative", {
    version: INJECTOR_VERSION,
  });

  // Active chaque plugin déclaré dans le registre.
  for (const plugin of PLUGIN_REGISTRY) {
    try {
      const ctx: PluginContext = {
        injectCSS: (css: string) => {
          const escaped = JSON.stringify(css);
          const injectScript = document.createElement("script");
          injectScript.textContent = `window.__stoatModded.injectCSS(${JSON.stringify(
            plugin.id,
          )}, ${escaped});`;
          document.documentElement.appendChild(injectScript);
          injectScript.remove();
        },
        log: (...args: unknown[]) =>
          console.log(`[StoatModded/${plugin.id}]`, ...args),
      };

      plugin.setup(ctx);
    } catch (err) {
      console.error(
        `[StoatModded] Échec du chargement du plugin "${plugin.id}":`,
        err,
      );
    }
  }

  console.log(
    `[StoatModded] Injecteur chargé (v${INJECTOR_VERSION}), ${PLUGIN_REGISTRY.length} plugin(s) actif(s).`,
  );
}

init();
