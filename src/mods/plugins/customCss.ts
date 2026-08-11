import type { Plugin } from "../core/types";

/**
 * Plugin de validation : injecte un CSS minimal et visible pour confirmer
 * que le pipeline d'injection fonctionne de bout en bout (preload -> main
 * world -> DOM). Sert de gabarit pour les futurs plugins CSS/thèmes.
 *
 * À terme ce plugin lira un fichier de thème custom choisi par l'utilisateur
 * plutôt que ce CSS de test en dur.
 */
export const customCssPlugin: Plugin = {
  id: "custom-css",
  name: "CSS Custom",
  description:
    "Permet d'injecter du CSS personnalisé dans le client (thèmes custom).",

  setup(ctx) {
    ctx.log("activation du plugin CSS custom");

    // CSS de validation : un léger liseré coloré en haut de la fenêtre,
    // visible et inoffensif, pour confirmer visuellement que l'injection
    // a réussi une fois l'app lancée.
    ctx.injectCSS(`
      body::before {
        content: "";
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, #ff6b6b, #ffd93d, #6bcB77, #4d96ff);
        z-index: 999999;
        pointer-events: none;
      }
    `);
  },
};
