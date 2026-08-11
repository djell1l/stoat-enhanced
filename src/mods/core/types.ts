/**
 * Contrat que chaque plugin reçoit lors de son activation.
 * Volontairement minimal pour l'instant : on l'étoffera (accès storage,
 * accès à notre metadata layer distante, hooks réseau) au fur et à mesure
 * des besoins réels des plugins, plutôt que de deviner une API complète
 * à l'avance.
 */
export interface PluginContext {
  /** Injecte du CSS scoppé à ce plugin dans la page. Rappeler écrase le CSS précédent. */
  injectCSS(css: string): void;

  /** Log préfixé avec le nom du plugin, pour debug. */
  log(...args: unknown[]): void;
}

export interface Plugin {
  /** Identifiant unique, court, en kebab-case (ex: "custom-themes"). */
  id: string;

  /** Nom affichable. */
  name: string;

  /** Description courte de ce que fait le plugin. */
  description: string;

  /** Appelé une fois au démarrage, après que le bootstrap soit injecté. */
  setup(ctx: PluginContext): void;
}
