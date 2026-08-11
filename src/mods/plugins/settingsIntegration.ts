import type { Plugin } from "../core/types";

/**
 * Intégration dans le panneau Settings natif de Stoat, façon
 * Vencord/BetterDiscord ("catégorie StoatModded" dans les paramètres).
 *
 * Contrainte technique (rappel) : Stoat est en Solid.js, chargé depuis
 * une URL distante (stoat.chat/app), pas un bundle local qu'on peut
 * patcher au build comme Vencord le fait avec les modules Webpack de
 * Discord. On ne peut donc pas injecter une vraie entrée dans le tableau
 * `entries` du composant Settings (SettingsList) -- cette structure est
 * interne au state Solid.js, invisible depuis l'extérieur.
 *
 * Solution retenue : DOM injection ciblée sur des classes stables trouvées
 * dans le code source de for-web (contrairement aux classes Panda CSS
 * générées à chaque build, ces classes-ci sont écrites en dur dans le
 * JSX -- `settings_sidebar`, `settings_cont`, `button`) :
 *   1. On observe l'apparition de `.settings_sidebar` dans le DOM (= le
 *      panneau Settings vient de s'ouvrir).
 *   2. On y insère notre propre catégorie "StoatModded", visuellement
 *      identique aux vraies (même classes `button`, mêmes styles inline
 *      de fallback si les classes venaient à disparaître).
 *   3. Au clic sur une de nos entrées, on masque le contenu natif
 *      (`.settings_cont`) et on affiche notre propre panneau à la place,
 *      dans le même espace visuel -- sans jamais toucher au composant
 *      Solid.js natif lui-même.
 *
 * Risque connu : si Stoat renomme ces classes stables dans une future
 * version, cette intégration cassera silencieusement (on retombera juste
 * sur "pas d'entrée visible" plutôt qu'une erreur bruyante). Le bouton
 * flottant de l'ancienne version reste un fallback possible si besoin.
 */

function buildMainWorldScript(): string {
  return `
    (function () {
      if (window.__stoatModddedSettingsIntegration) return;
      window.__stoatModddedSettingsIntegration = true;

      // --- Réutilise le même système de stockage/logique de thèmes que
      // l'ancien panneau flottant, pour ne rien casser côté données. ---
      const STORAGE_KEY = "stoatModded:themes";
      const ACTIVE_KEY = "stoatModded:activeTheme";

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
        } catch (e) { return []; }
      }
      function saveThemes(themes) { localStorage.setItem(STORAGE_KEY, JSON.stringify(themes)); }
      function getActiveThemeId() { return localStorage.getItem(ACTIVE_KEY); }

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
        // originalCss est figé au moment de l'import et jamais modifié
        // ensuite -- c'est ce qui permet le bouton "revenir à l'état avant
        // modification" même après plusieurs éditions successives.
        themes.push({ id, css, originalCss: css, ...meta });
        saveThemes(themes);
        return id;
      }

      function updateThemeCss(themeId, newCss) {
        const themes = loadThemes();
        const theme = themes.find((t) => t.id === themeId);
        if (!theme) return;
        theme.css = newCss;
        // Les métadonnées peuvent changer si l'utilisateur édite le
        // commentaire d'en-tête -- on les re-parse à chaque sauvegarde.
        Object.assign(theme, parseThemeMeta(newCss));
        saveThemes(themes);
        // Si ce thème est actuellement actif, applique immédiatement le
        // changement pour un retour visuel instantané.
        if (getActiveThemeId() === themeId) applyTheme(themeId);
      }

      function resetTheme(themeId) {
        const themes = loadThemes();
        const theme = themes.find((t) => t.id === themeId);
        if (!theme || theme.originalCss === undefined) return;
        theme.css = theme.originalCss;
        Object.assign(theme, parseThemeMeta(theme.originalCss));
        saveThemes(themes);
        if (getActiveThemeId() === themeId) applyTheme(themeId);
      }

      function removeTheme(themeId) {
        const themes = loadThemes().filter((t) => t.id !== themeId);
        saveThemes(themes);
        if (getActiveThemeId() === themeId) applyTheme(null);
      }

      // Applique le thème sauvegardé au démarrage.
      const savedActive = getActiveThemeId();
      if (savedActive) applyTheme(savedActive);

      // --- Rendu du contenu de notre page "Thèmes" (remplace .settings_cont) ---

      function renderThemesPage(container) {
        container.innerHTML = "";
        container.style.cssText = "padding: 24px; overflow-y: auto; height: 100%; box-sizing: border-box;";

        const title = document.createElement("h2");
        title.textContent = "Thèmes";
        title.style.cssText = "margin: 0 0 4px 0; font-size: 22px;";
        container.appendChild(title);

        const subtitle = document.createElement("p");
        subtitle.textContent = "Importe et gère tes thèmes CSS personnalisés.";
        subtitle.style.cssText = "opacity: 0.6; font-size: 14px; margin: 0 0 20px 0;";
        container.appendChild(subtitle);

        const importBtn = document.createElement("button");
        importBtn.textContent = "+ Importer un thème (.css)";
        importBtn.style.cssText = \`
          padding: 10px 16px; margin-bottom: 12px; margin-right: 8px; border-radius: 8px;
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
              renderThemesPage(container);
            };
            reader.readAsText(file);
          };
          input.click();
        };
        container.appendChild(importBtn);

        const newBtn = document.createElement("button");
        newBtn.textContent = "+ Nouveau thème vide";
        newBtn.style.cssText = \`
          padding: 10px 16px; margin-bottom: 20px; border-radius: 8px;
          border: 1px solid #444; background: transparent; color: #eee; cursor: pointer; font-size: 14px;
        \`;
        newBtn.onclick = () => {
          const blankCss = "/**\\n * @name Nouveau thème\\n * @author Toi\\n * @description \\n * @version 1.0.0\\n */\\n\\n";
          const id = addTheme(blankCss);
          renderEditor(container, id);
        };
        container.appendChild(newBtn);
        container.appendChild(document.createElement("br"));

        function themeRow(id, name, author, version, description, isActive, isNone) {
          const row = document.createElement("div");
          row.style.cssText = \`
            padding: 12px 14px; border-radius: 8px; margin-bottom: 8px;
            background: \${isActive ? "rgba(88,101,242,0.15)" : "rgba(255,255,255,0.04)"};
            border: 1px solid \${isActive ? "#5865f2" : "transparent"};
            display: flex; align-items: center; justify-content: space-between;
          \`;

          const info = document.createElement("div");
          info.innerHTML = \`
            <div style="font-weight: 600; font-size: 14px;">\${name}</div>
            <div style="font-size: 12px; opacity: 0.6; margin-top: 2px;">\${isNone ? "" : "par " + author + " · v" + version}</div>
            \${description ? '<div style="font-size: 12px; opacity: 0.75; margin-top: 4px;">' + description + "</div>" : ""}
          \`;
          row.appendChild(info);

          const btnGroup = document.createElement("div");
          btnGroup.style.cssText = "display: flex; gap: 6px; flex-shrink: 0;";

          const activateBtn = document.createElement("button");
          activateBtn.textContent = isActive ? "Actif" : "Activer";
          activateBtn.disabled = isActive;
          activateBtn.style.cssText = \`
            padding: 6px 14px; border-radius: 6px; border: none; cursor: \${isActive ? "default" : "pointer"};
            background: \${isActive ? "#3a3a3a" : "#5865f2"}; color: white; font-size: 13px;
          \`;
          activateBtn.onclick = () => { applyTheme(isNone ? null : id); renderThemesPage(container); };
          btnGroup.appendChild(activateBtn);

          if (!isNone) {
            const editBtn = document.createElement("button");
            editBtn.textContent = "Éditer";
            editBtn.style.cssText = "padding: 6px 14px; border-radius: 6px; border: 1px solid #555; background: transparent; color: #eee; cursor: pointer; font-size: 13px;";
            editBtn.onclick = () => renderEditor(container, id);
            btnGroup.appendChild(editBtn);

            const removeBtn = document.createElement("button");
            removeBtn.textContent = "Suppr";
            removeBtn.style.cssText = "padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; background: #802020; color: white; font-size: 13px;";
            removeBtn.onclick = () => { removeTheme(id); renderThemesPage(container); };
            btnGroup.appendChild(removeBtn);
          }

          row.appendChild(btnGroup);
          return row;
        }

        const activeId = getActiveThemeId();
        container.appendChild(themeRow(null, "Aucun thème (défaut Stoat)", "", "", "", !activeId, true));

        const themes = loadThemes();
        if (themes.length === 0) {
          const empty = document.createElement("p");
          empty.textContent = "Aucun thème importé pour l'instant.";
          empty.style.cssText = "opacity: 0.5; font-size: 13px; margin-top: 12px;";
          container.appendChild(empty);
        } else {
          themes.forEach((theme) => {
            container.appendChild(
              themeRow(theme.id, theme.name, theme.author, theme.version, theme.description, activeId === theme.id, false)
            );
          });
        }
      }

      // --- Éditeur de CSS intégré ---
      //
      // Textarea simple plutôt qu'un vrai éditeur type CodeMirror : suffit
      // largement pour éditer du CSS, et évite d'ajouter une dépendance
      // externe volumineuse juste pour de la coloration syntaxique.

      function renderEditor(container, themeId) {
        const themes = loadThemes();
        const theme = themes.find((t) => t.id === themeId);
        if (!theme) { renderThemesPage(container); return; }

        container.innerHTML = "";
        container.style.cssText = "padding: 24px; height: 100%; box-sizing: border-box; display: flex; flex-direction: column;";

        const header = document.createElement("div");
        header.style.cssText = "display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;";

        const title = document.createElement("h2");
        title.textContent = "Éditer : " + theme.name;
        title.style.cssText = "margin: 0; font-size: 20px;";
        header.appendChild(title);

        const backBtn = document.createElement("button");
        backBtn.textContent = "← Retour à la liste";
        backBtn.style.cssText = "padding: 6px 14px; border-radius: 6px; border: 1px solid #444; background: transparent; color: #eee; cursor: pointer; font-size: 13px;";
        backBtn.onclick = () => renderThemesPage(container);
        header.appendChild(backBtn);

        container.appendChild(header);

        const hint = document.createElement("p");
        hint.textContent = "Le bloc de commentaire /** @name ... */ en haut définit les métadonnées du thème.";
        hint.style.cssText = "opacity: 0.55; font-size: 12px; margin: 0 0 10px 0;";
        container.appendChild(hint);

        const textarea = document.createElement("textarea");
        textarea.value = theme.css;
        textarea.spellcheck = false;
        textarea.style.cssText = \`
          flex: 1; width: 100%; box-sizing: border-box; resize: none;
          background: #141414; color: #d4d4d4; border: 1px solid #333; border-radius: 8px;
          padding: 12px; font-family: "Cascadia Code", "Consolas", monospace; font-size: 13px;
          line-height: 1.5; tab-size: 2;
        \`;
        // Indentation avec Tab au lieu de changer de focus, plus naturel
        // pour éditer du code.
        textarea.addEventListener("keydown", (e) => {
          if (e.key === "Tab") {
            e.preventDefault();
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            textarea.value = textarea.value.slice(0, start) + "  " + textarea.value.slice(end);
            textarea.selectionStart = textarea.selectionEnd = start + 2;
          }
        });
        container.appendChild(textarea);

        const footer = document.createElement("div");
        footer.style.cssText = "display: flex; gap: 8px; margin-top: 12px; align-items: center;";

        const status = document.createElement("span");
        status.style.cssText = "font-size: 12px; opacity: 0.6; margin-right: auto;";
        const hasChanges = () => theme.originalCss !== undefined && textarea.value !== theme.originalCss;
        function refreshStatus() {
          status.textContent = hasChanges() ? "Modifié depuis l'import" : "";
        }
        refreshStatus();
        textarea.addEventListener("input", refreshStatus);
        footer.appendChild(status);

        if (theme.originalCss !== undefined) {
          const resetBtn = document.createElement("button");
          resetBtn.textContent = "↺ Revenir à l'original";
          resetBtn.style.cssText = "padding: 8px 14px; border-radius: 6px; border: 1px solid #555; background: transparent; color: #eee; cursor: pointer; font-size: 13px;";
          resetBtn.onclick = () => {
            resetTheme(themeId);
            textarea.value = theme.originalCss;
            refreshStatus();
          };
          footer.appendChild(resetBtn);
        }

        const saveBtn = document.createElement("button");
        saveBtn.textContent = "Enregistrer";
        saveBtn.style.cssText = "padding: 8px 18px; border-radius: 6px; border: none; background: #5865f2; color: white; cursor: pointer; font-size: 13px; font-weight: 600;";
        saveBtn.onclick = () => {
          updateThemeCss(themeId, textarea.value);
          saveBtn.textContent = "Enregistré ✓";
          setTimeout(() => { saveBtn.textContent = "Enregistrer"; }, 1200);
          refreshStatus();
        };
        footer.appendChild(saveBtn);

        container.appendChild(footer);
      }

      // --- Injection de la catégorie dans la sidebar ---

      function buildCategoryTitle() {
        const el = document.createElement("div");
        el.textContent = "StoatModded";
        el.style.cssText = "font-size: 12px; font-weight: 600; opacity: 0.5; text-transform: uppercase; padding: 8px 8px 4px 8px; letter-spacing: 0.02em;";
        return el;
      }

      function buildEntryButton(label, onClick) {
        const btn = document.createElement("a");
        btn.className = "button stoat-modded-settings-entry";
        btn.textContent = "🎨  " + label;
        btn.style.cssText = \`
          position: relative; min-width: 0; display: flex; align-items: center;
          padding: 6px 8px; border-radius: 8px; font-weight: 500;
          margin-inline-end: 12px; font-size: 15px; user-select: none;
          cursor: pointer; margin-bottom: 2px;
        \`;
        btn.onmouseenter = () => { btn.style.background = "rgba(255,255,255,0.06)"; };
        btn.onmouseleave = () => { btn.style.background = "transparent"; };
        btn.onclick = (e) => { e.preventDefault(); onClick(); };
        return btn;
      }

      function injectSidebarCategory() {
        const sidebar = document.querySelector(".settings_sidebar .content");
        if (!sidebar || sidebar.querySelector(".stoat-modded-settings-entry")) return;

        const wrapper = document.createElement("div");
        wrapper.appendChild(buildCategoryTitle());
        wrapper.appendChild(buildEntryButton("Thèmes", () => {
          const content = document.querySelector(".settings_cont");
          if (!content) return;

          if (!content.dataset.stoatModddedOriginal) {
            // Sauvegarde le vrai contenu natif pour pouvoir le restaurer.
            const holder = document.createElement("div");
            while (content.firstChild) holder.appendChild(content.firstChild);
            content._stoatModddedOriginalContent = holder;
            content.dataset.stoatModddedOriginal = "1";
          } else if (content._stoatModddedOriginalContent) {
            // Un autre onglet StoatModded a peut-être déjà remplacé le
            // contenu -- rien à sauvegarder de plus, on écrase juste.
          }

          content.innerHTML = "";
          renderThemesPage(content);
        }));

        sidebar.appendChild(wrapper);
      }

      // Quand on quitte notre page (clic sur une vraie entrée Stoat), il
      // faut restaurer le contenu natif -- on détecte ça en observant les
      // clics sur les vrais boutons de la sidebar.
      document.addEventListener("click", (e) => {
        const target = e.target.closest(".button:not(.stoat-modded-settings-entry)");
        if (!target) return;
        const content = document.querySelector(".settings_cont");
        if (content && content.dataset.stoatModddedOriginal && content._stoatModddedOriginalContent) {
          // Laisse Stoat re-render naturellement son propre contenu au
          // prochain cycle -- on nettoie juste notre marqueur pour ne pas
          // interférer avec le prochain rendu natif.
          delete content.dataset.stoatModddedOriginal;
          delete content._stoatModddedOriginalContent;
        }
      }, true);

      const observer = new MutationObserver(() => {
        if (document.querySelector(".settings_sidebar")) {
          injectSidebarCategory();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      console.log("[StoatModded/settings-integration] prêt -- cherche la catégorie StoatModded dans les Paramètres");
    })();
  `;
}

export const settingsIntegrationPlugin: Plugin = {
  id: "settings-integration",
  name: "Intégration Settings",
  description:
    "Ajoute une catégorie StoatModded dans le panneau Paramètres natif, façon Vencord/BetterDiscord.",

  setup(ctx) {
    ctx.log("activation du plugin Intégration Settings");

    const script = document.createElement("script");
    script.textContent = buildMainWorldScript();
    document.documentElement.appendChild(script);
    script.remove();
  },
};
