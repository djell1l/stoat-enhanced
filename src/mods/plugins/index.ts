import type { Plugin } from "../core/types";

import { customCssPlugin } from "./customCss";
import { richPresencePlugin } from "./richPresence";
// Mis de côté temporairement : le matching DOM (username -> badge) est
// fonctionnel mais nécessitait un debug plus poussé du fetch batch en
// conditions réelles. On y reviendra. Le backend (écriture/lecture) lui
// est bien validé et fonctionnel.
// import { richPresenceBadgePlugin } from "./richPresenceBadge";
// Remplacé par settingsIntegration : même fonctionnalité (thèmes), mais
// intégrée dans le panneau Paramètres natif au lieu d'un bouton flottant.
// import { themePanelPlugin } from "./themePanel";
import { settingsIntegrationPlugin } from "./settingsIntegration";

/**
 * Liste des plugins actifs. Pour désactiver un plugin, commente sa ligne
 * ici -- pas besoin de supprimer son fichier.
 */
export const PLUGIN_REGISTRY: Plugin[] = [
  customCssPlugin,
  richPresencePlugin,
  settingsIntegrationPlugin,
];
