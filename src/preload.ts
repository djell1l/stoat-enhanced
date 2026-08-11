import "./world/config";
import "./world/window";

// --- Injecteur (mods custom) ---
// Chargé après le preload officiel de Stoat, sans toucher à son code.
// Voir src/mods/core/loader.ts pour le détail.
import "./mods/core/loader";
