import type { Plugin } from "../core/types";

/**
 * Badge visuel pour le plugin Rich Presence.
 *
 * Contrainte découverte en explorant `for-web` : Stoat n'expose aucun
 * attribut DOM stable (pas de data-user-id, pas d'aria-label) sur les
 * éléments de pseudo -- les classes sont générées par Panda CSS et
 * changent à chaque build. On ne peut donc pas cibler un membre par
 * sélecteur CSS de façon fiable.
 *
 * Stratégie retenue à la place :
 *   1. On récupère la liste des membres du serveur courant via l'API
 *      Stoat elle-même (authentifiée avec le token de session), ce qui
 *      nous donne un mapping fiable username -> user_id (bien plus
 *      robuste que scraper une URL d'avatar ou une classe CSS).
 *   2. Pour chaque user_id, on interroge notre backend d'activité.
 *   3. Un MutationObserver scanne le DOM à la recherche de nœuds de texte
 *      correspondant exactement à un username connu ayant une activité,
 *      et insère un badge juste après.
 *
 * Limite connue : si deux membres du serveur ont le même display name
 * (pseudos non-uniques dans Stoat), on ne peut pas les distinguer par le
 * texte seul -- on badge alors la première occurrence trouvée. Acceptable
 * pour un v0 ; une vraie solution demanderait de patcher le renderer
 * Solid.js directement, plus fragile et hors scope pour l'instant.
 */

const BACKEND_URL = "https://stoat-modded-presence.stoattest123.workers.dev";

function buildMainWorldScript(): string {
  return `
    (function () {
      if (window.__stoatModddedBadgeRunning) return;
      window.__stoatModddedBadgeRunning = true;

      const BACKEND_URL = ${JSON.stringify(BACKEND_URL)};

      // Cache local : username -> { userId, activity } le temps de la session.
      // Réduit le nombre d'appels réseau lors du scan répété du DOM.
      const usernameToActivity = new Map();
      const knownUserIds = new Set();

      function getStoredSession() {
        return new Promise((resolve) => {
          const req = indexedDB.open("localforage");
          req.onerror = () => resolve(null);
          req.onsuccess = () => {
            const db = req.result;
            try {
              const tx = db.transaction("keyvaluepairs", "readonly");
              const getReq = tx.objectStore("keyvaluepairs").get("auth");
              getReq.onsuccess = () => resolve(getReq.result?.session ?? null);
              getReq.onerror = () => resolve(null);
            } catch (e) {
              resolve(null);
            }
          };
        });
      }

      // Trouve le serveur actuellement affiché à partir de l'URL Stoat,
      // qui suit le format /server/:id/channel/:id (ou similaire).
      function getCurrentServerId() {
        const match = window.location.pathname.match(/\\/server\\/([A-Z0-9]+)/i);
        return match ? match[1] : null;
      }

      async function refreshServerMembers() {
        const session = await getStoredSession();
        const serverId = getCurrentServerId();
        if (!session?.token || !serverId) return;

        try {
          const res = await fetch(
            \`https://api.stoat.chat/servers/\${serverId}/members\`,
            { headers: { "x-session-token": session.token } }
          );
          if (!res.ok) return;
          const data = await res.json();

          const users = data.users || [];
          const newUserIds = users
            .map((u) => u._id)
            .filter((id) => !knownUserIds.has(id));

          if (newUserIds.length === 0) return;
          newUserIds.forEach((id) => knownUserIds.add(id));

          // Un seul appel batch plutôt qu'une requête par membre --
          // testé en pratique sur un serveur de ~2200 membres où l'ancienne
          // approche (une requête par membre en parallèle) faisait planter
          // le client avec net::ERR_INSUFFICIENT_RESOURCES.
          const batchRes = await fetch(BACKEND_URL + "/presence/batch", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ userIds: newUserIds }),
          });
          const batchData = await batchRes.json();
          const activities = batchData.activities || {};

          const byId = new Map(users.map((u) => [u._id, u]));
          for (const [userId, activity] of Object.entries(activities)) {
            const u = byId.get(userId);
            if (!u) continue;
            // Le DOM affiche le display_name s'il existe, sinon le
            // username brut (avec discriminant #XXXX) -- on indexe
            // sous les deux pour matcher quel que soit le cas.
            const displayed = u.display_name || u.username;
            usernameToActivity.set(displayed, activity);
            if (u.display_name) {
              usernameToActivity.set(u.username, activity);
            }
          }

          console.log("[StoatModded/rich-presence-badge] refresh terminé, " + usernameToActivity.size + " entrée(s) dans la map");
        } catch (e) {
          console.log("[StoatModded/rich-presence-badge] erreur fetch membres:", e);
        }
      }

      function injectBadge(textNode, activity) {
        const parent = textNode.parentElement;
        if (!parent) return;
        // On ne marque comme "badged" qu'une fois le badge réellement
        // injecté -- sinon un scan lancé avant que usernameToActivity soit
        // peuplée pourrait marquer le parent sans jamais poser de badge,
        // et les scans suivants l'ignoreraient pour toujours (race condition).
        if (parent.dataset.stoatModddedBadged) return;
        parent.dataset.stoatModddedBadged = "1";

        const badge = document.createElement("span");
        badge.textContent = " · " + activity.label + " " + activity.detail;
        badge.style.opacity = "0.7";
        badge.style.fontSize = "0.85em";
        badge.style.marginLeft = "4px";
        badge.style.whiteSpace = "nowrap";
        parent.appendChild(badge);
        console.log("[StoatModded/rich-presence-badge] badge injecté pour", textNode.textContent);
      }

      function scanDom() {
        if (usernameToActivity.size === 0) return;

        // TreeWalker sur les nœuds texte : plus robuste qu'un sélecteur
        // CSS puisqu'on matche le contenu, pas une classe qui peut changer.
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
        );

        let node;
        let matches = 0;
        while ((node = walker.nextNode())) {
          const text = node.textContent?.trim();
          if (text && usernameToActivity.has(text)) {
            matches++;
            injectBadge(node, usernameToActivity.get(text));
          }
        }
        console.log("[StoatModded/rich-presence-badge] scan terminé, " + matches + " correspondance(s), " + usernameToActivity.size + " activité(s) connue(s)");
      }

      // Scan initial + à chaque changement de DOM (navigation entre
      // channels, ouverture de la liste de membres, etc.)
      const observer = new MutationObserver(() => {
        clearTimeout(window.__stoatModddedScanDebounce);
        window.__stoatModddedScanDebounce = setTimeout(scanDom, 300);
      });
      observer.observe(document.body, { childList: true, subtree: true });

      // Rafraîchit la liste des membres + activités toutes les 30s, et à
      // chaque changement de page (changement de serveur).
      refreshServerMembers().then(scanDom);
      setInterval(() => refreshServerMembers().then(scanDom), 30000);

      let lastPath = window.location.pathname;
      let hasSucceededOnce = false;

      setInterval(() => {
        const pathChanged = window.location.pathname !== lastPath;
        // On retente aussi si on n'a encore jamais réussi -- couvre le cas
        // où le plugin s'est chargé avant que la navigation vers /server/...
        // soit terminée (écran de chargement au démarrage de l'app).
        if (pathChanged || !hasSucceededOnce) {
          lastPath = window.location.pathname;
          const serverId = getCurrentServerId();
          if (serverId) {
            if (pathChanged) {
              knownUserIds.clear();
              usernameToActivity.clear();
            }
            refreshServerMembers().then(() => {
              hasSucceededOnce = true;
              scanDom();
            });
          }
        }
      }, 1000);

      console.log("[StoatModded/rich-presence-badge] observer actif");
    })();
  `;
}

export const richPresenceBadgePlugin: Plugin = {
  id: "rich-presence-badge",
  name: "Rich Presence Badge",
  description:
    "Affiche automatiquement l'activité des autres utilisateurs du plugin sous leur pseudo.",

  setup(ctx) {
    ctx.log("activation du plugin Rich Presence Badge");

    const script = document.createElement("script");
    script.textContent = buildMainWorldScript();
    document.documentElement.appendChild(script);
    script.remove();
  },
};
