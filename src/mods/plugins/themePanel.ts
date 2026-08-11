import type { Plugin } from "../core/types";

/**
 * Panneau de thèmes custom pour StoatModded.
 *
 * Format de thème retenu (inspiré de BetterDiscord, simple à partager comme
 * un fichier texte, lisible sans outil spécial) :
 *
 *   /**
 *    * @name Mon Thème
 *    * @author PseudoQuelconque
 *    * @description Un thème sombre avec des accents violets
 *    * @version 1.0.0
 *    *\/
 *   :root {
 *     --my-accent: #a78bfa;
 *   }
 *   ...css...
 *
 * Les métadonnées sont extraites du commentaire d'en-tête, le reste du
 * fichier est injecté tel quel comme CSS. Ce format permet à n'importe qui
 * de partager un thème comme un simple fichier .css, sans JSON séparé à
 * synchroniser -- exactement le méchanisme qu'utilise déjà BetterDiscord,
 * ce qui facilite aussi la portabilité de thèmes existants dans cet
 * écosystème si quelqu'un veut les adapter.
 *
 * Stockage : les thèmes importés sont sauvegardés dans localStorage (côté
 * main world de la page), pas dans notre backend -- un thème est purement
 * local à la personne qui l'installe, pas une donnée à synchroniser entre
 * utilisateurs comme le Rich Presence.
 */

const STORAGE_KEY = "stoatModded:themes";
const ACTIVE_KEY = "stoatModded:activeTheme";

function buildMainWorldScript(): string {
  return `
    (function () {
      if (window.__stoatModddedThemePanel) return;
      window.__stoatModddedThemePanel = true;

      const STORAGE_KEY = ${JSON.stringify(STORAGE_KEY)};
      const ACTIVE_KEY = ${JSON.stringify(ACTIVE_KEY)};

      function parseThemeMeta(css) {
        const match = css.match(/\\/\\*\\*([\\s\\S]*?)\\*\\//);
        const meta = { name: "Thème sans nom", author: "Inconnu", description: "", version: "1.0.0" };
        if (!match) return meta;

        const block = match[1];
        const nameMatch = block.match(/@name\\s+(.+)/);
        const authorMatch = block.match(/@author\\s+(.+)/);
        const descMatch = block.match(/@description\\s+(.+)/);
        const versionMatch = block.match(/@version\\s+(.+)/);

        if (nameMatch) meta.name = nameMatch[1].trim();
        if (authorMatch) meta.author = authorMatch[1].trim();
        if (descMatch) meta.description = descMatch[1].trim();
        if (versionMatch) meta.version = versionMatch[1].trim();

        return meta;
      }

      function loadThemes() {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          return raw ? JSON.parse(raw) : [];
        } catch (e) {
          return [];
        }
      }

      function saveThemes(themes) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(themes));
      }

      function getActiveThemeId() {
        return localStorage.getItem(ACTIVE_KEY);
      }

      function applyTheme(themeId) {
        const styleId = "stoat-modded-active-theme";
        let styleEl = document.getElementById(styleId);

        if (!themeId) {
          if (styleEl) styleEl.remove();
          localStorage.removeItem(ACTIVE_KEY);
          return;
        }

        const themes = loadThemes();
        const theme = themes.find((t) => t.id === themeId);
        if (!theme) return;

        if (!styleEl) {
          styleEl = document.createElement("style");
          styleEl.id = styleId;
          document.head.appendChild(styleEl);
        }
        styleEl.textContent = theme.css;
        localStorage.setItem(ACTIVE_KEY, themeId);
      }

      function addTheme(css) {
        const meta = parseThemeMeta(css);
        const themes = loadThemes();
        const id = "theme_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
        themes.push({ id, css, ...meta });
        saveThemes(themes);
        return id;
      }

      function removeTheme(themeId) {
        const themes = loadThemes().filter((t) => t.id !== themeId);
        saveThemes(themes);
        if (getActiveThemeId() === themeId) applyTheme(null);
      }

      // --- UI ---

      function buildPanel() {
        const overlay = document.createElement("div");
        overlay.id = "stoat-modded-theme-overlay";
        overlay.style.cssText = \`
          position: fixed; inset: 0; background: rgba(0,0,0,0.6);
          z-index: 999998; display: flex; align-items: center; justify-content: center;
        \`;

        const panel = document.createElement("div");
        panel.style.cssText = \`
          background: #1e1e1e; color: #eee; border-radius: 12px; padding: 24px;
          width: 420px; max-height: 70vh; overflow-y: auto;
          font-family: system-ui, sans-serif; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        \`;

        function render() {
          panel.innerHTML = "";

          const title = document.createElement("h2");
          title.textContent = "Thèmes StoatModded";
          title.style.cssText = "margin: 0 0 16px 0; font-size: 18px;";
          panel.appendChild(title);

          const importBtn = document.createElement("button");
          importBtn.textContent = "+ Importer un thème (.css)";
          importBtn.style.cssText = \`
            width: 100%; padding: 10px; margin-bottom: 16px; border-radius: 8px;
            border: none; background: #5865f2; color: white; cursor: pointer; font-size: 14px;
          \`;
          importBtn.onclick = () => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".css,.theme.css,text/css";
            input.onchange = () => {
              const file = input.files && input.files[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                addTheme(String(reader.result));
                render();
              };
              reader.readAsText(file);
            };
            input.click();
          };
          panel.appendChild(importBtn);

          const noneRow = document.createElement("div");
          noneRow.style.cssText = \`
            display: flex; align-items: center; justify-content: space-between;
            padding: 10px; border-radius: 8px; margin-bottom: 8px;
            background: \${!getActiveThemeId() ? "#2d3348" : "#2a2a2a"};
          \`;
          noneRow.innerHTML = \`<span>Aucun thème (défaut Stoat)</span>\`;
          const noneBtn = document.createElement("button");
          noneBtn.textContent = !getActiveThemeId() ? "Actif" : "Activer";
          noneBtn.disabled = !getActiveThemeId();
          noneBtn.style.cssText = "padding: 4px 10px; border-radius: 6px; border: none; cursor: pointer;";
          noneBtn.onclick = () => { applyTheme(null); render(); };
          noneRow.appendChild(noneBtn);
          panel.appendChild(noneRow);

          const themes = loadThemes();
          const activeId = getActiveThemeId();

          if (themes.length === 0) {
            const empty = document.createElement("p");
            empty.textContent = "Aucun thème importé pour l'instant.";
            empty.style.cssText = "opacity: 0.6; font-size: 13px; margin-top: 16px;";
            panel.appendChild(empty);
          }

          themes.forEach((theme) => {
            const row = document.createElement("div");
            row.style.cssText = \`
              padding: 10px; border-radius: 8px; margin-bottom: 8px;
              background: \${activeId === theme.id ? "#2d3348" : "#2a2a2a"};
            \`;

            const header = document.createElement("div");
            header.style.cssText = "display: flex; align-items: center; justify-content: space-between;";
            header.innerHTML = \`
              <div>
                <div style="font-weight: 600;">\${theme.name}</div>
                <div style="font-size: 12px; opacity: 0.6;">par \${theme.author} · v\${theme.version}</div>
              </div>
            \`;

            const btnGroup = document.createElement("div");
            btnGroup.style.cssText = "display: flex; gap: 6px;";

            const activateBtn = document.createElement("button");
            activateBtn.textContent = activeId === theme.id ? "Actif" : "Activer";
            activateBtn.disabled = activeId === theme.id;
            activateBtn.style.cssText = "padding: 4px 10px; border-radius: 6px; border: none; cursor: pointer;";
            activateBtn.onclick = () => { applyTheme(theme.id); render(); };

            const removeBtn = document.createElement("button");
            removeBtn.textContent = "Suppr";
            removeBtn.style.cssText = "padding: 4px 10px; border-radius: 6px; border: none; cursor: pointer; background: #802020; color: white;";
            removeBtn.onclick = () => { removeTheme(theme.id); render(); };

            btnGroup.appendChild(activateBtn);
            btnGroup.appendChild(removeBtn);
            header.appendChild(btnGroup);
            row.appendChild(header);

            if (theme.description) {
              const desc = document.createElement("div");
              desc.textContent = theme.description;
              desc.style.cssText = "font-size: 12px; opacity: 0.7; margin-top: 6px;";
              row.appendChild(desc);
            }

            panel.appendChild(row);
          });

          const closeBtn = document.createElement("button");
          closeBtn.textContent = "Fermer";
          closeBtn.style.cssText = \`
            width: 100%; padding: 10px; margin-top: 16px; border-radius: 8px;
            border: 1px solid #444; background: transparent; color: #eee; cursor: pointer;
          \`;
          closeBtn.onclick = () => overlay.remove();
          panel.appendChild(closeBtn);
        }

        render();
        overlay.appendChild(panel);
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        document.body.appendChild(overlay);
      }

      // Bouton flottant, toujours visible, indépendant du DOM de Stoat --
      // plus robuste que de s'insérer dans les settings natifs (classes
      // CSS hashées, pas d'ancrage stable disponible).
      const fab = document.createElement("button");
      fab.textContent = "🎨";
      fab.title = "Thèmes StoatModded";
      fab.style.cssText = \`
        position: fixed; bottom: 20px; right: 20px; z-index: 999997;
        width: 48px; height: 48px; border-radius: 50%; border: none;
        background: #5865f2; color: white; font-size: 20px; cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      \`;
      fab.onclick = buildPanel;
      document.body.appendChild(fab);

      // Applique le thème sauvegardé au démarrage, s'il y en a un.
      const activeId = getActiveThemeId();
      if (activeId) applyTheme(activeId);

      console.log("[StoatModded/theme-panel] prêt -- bouton 🎨 en bas à droite");
    })();
  `;
}

export const themePanelPlugin: Plugin = {
  id: "theme-panel",
  name: "Panneau de thèmes",
  description:
    "Ajoute un bouton flottant pour importer et activer des thèmes CSS custom.",

  setup(ctx) {
    ctx.log("activation du plugin Panneau de thèmes");

    const script = document.createElement("script");
    script.textContent = buildMainWorldScript();
    document.documentElement.appendChild(script);
    script.remove();
  },
};
