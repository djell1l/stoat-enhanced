import type { Plugin } from "../core/types";

/**
 * Rich Presence custom pour Stoat.
 *
 * Stoat n'a pas de champ "activité" natif (contrairement à Discord) --
 * confirmé en lisant `enum Presence` côté backend Stoat, qui ne contient
 * que 5 statuts simples (online/idle/focus/busy/invisible), rien de plus.
 *
 * On simule donc la feature avec notre propre backend (Cloudflare Worker,
 * voir /rpc-backend). Le principe :
 *   1. On lit le token de session que Stoat a déjà stocké localement
 *      (via localforage / IndexedDB, clé "auth").
 *   2. Pour PUBLIER son activité : on l'envoie à notre backend avec ce
 *      token. Le backend vérifie lui-même auprès de l'API Stoat que le
 *      token est valide avant d'accepter l'écriture (jamais de confiance
 *      aveugle dans un user_id fourni côté client).
 *   3. Pour AFFICHER l'activité des autres : quand on croise un profil,
 *      on interroge notre backend en lecture (public, sans auth) pour ce
 *      user_id, et on injecte un petit badge sous le nom si une activité
 *      existe.
 *
 * Sans ce plugin actif chez l'observateur, rien n'est visible -- c'est
 * une metadata layer strictement additive, jamais poussée à Stoat lui-même.
 *
 * IMPORTANT (piège contextIsolation) : ce fichier tourne dans le contexte
 * du preload, qui a son PROPRE `window`, isolé de celui de la vraie page
 * (main world). Toute fonction qu'on veut rendre appelable depuis la
 * console DevTools de la page (ex: `window.stoatModdedSetActivity(...)`)
 * doit donc être définie ET assignée à `window` À L'INTÉRIEUR du script
 * injecté dans le main world -- jamais assignée depuis ce fichier
 * directement, sinon elle atterrit sur le mauvais `window` et reste
 * invisible côté page.
 */

// À adapter une fois le Worker déployé (wrangler deploy donnera l'URL réelle).
const BACKEND_URL = "https://stoat-modded-presence.stoattest123.workers.dev";

/**
 * Construit le script complet exécuté dans le main world. Toute la logique
 * (lecture de session, appel réseau) vit ici, dans le même monde JS que
 * la page -- pas de va-et-vient avec le preload pour la logique elle-même,
 * uniquement pour déclencher l'injection initiale.
 */
function buildMainWorldScript(): string {
  return `
    (function () {
      if (window.stoatModdedSetActivity) return; // évite double-définition

      const BACKEND_URL = ${JSON.stringify(BACKEND_URL)};

      function getStoredSession() {
        return new Promise((resolve) => {
          const req = indexedDB.open("localforage");
          req.onerror = () => resolve(null);
          req.onsuccess = () => {
            const db = req.result;
            try {
              const tx = db.transaction("keyvaluepairs", "readonly");
              const store = tx.objectStore("keyvaluepairs");
              const getReq = store.get("auth");
              getReq.onsuccess = () => {
                const auth = getReq.result;
                resolve(auth && auth.session ? auth.session : null);
              };
              getReq.onerror = () => resolve(null);
            } catch (e) {
              resolve(null);
            }
          };
        });
      }

      window.stoatModdedSetActivity = async function (activity) {
        const session = await getStoredSession();
        if (!session || !session.token) {
          console.log("[StoatModded/rich-presence] pas de session trouvée, connecte-toi d'abord");
          return { ok: false, error: "no session" };
        }

        try {
          const res = await fetch(BACKEND_URL + "/presence", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token: session.token, activity: activity }),
          });
          const data = await res.json();
          console.log("[StoatModded/rich-presence] statut mis à jour :", data);
          return data;
        } catch (e) {
          console.log("[StoatModded/rich-presence] erreur réseau :", e);
          return { ok: false, error: String(e) };
        }
      };

      window.stoatModdedGetActivity = async function (userId) {
        try {
          const res = await fetch(BACKEND_URL + "/presence/" + encodeURIComponent(userId));
          const data = await res.json();
          return data.activity ?? null;
        } catch (e) {
          console.log("[StoatModded/rich-presence] erreur réseau :", e);
          return null;
        }
      };

      console.log("[StoatModded/rich-presence] prêt -- utilise window.stoatModdedSetActivity({label, detail}) dans la console pour tester");
    })();
  `;
}

export const richPresencePlugin: Plugin = {
  id: "rich-presence",
  name: "Rich Presence",
  description:
    "Ajoute un statut d'activité personnalisé (façon Discord), visible par les autres utilisateurs du plugin.",

  setup(ctx) {
    ctx.log("activation du plugin Rich Presence");

    // Injecte tout le script (logique + exposition sur window) directement
    // dans le main world de la page, en une seule fois.
    const script = document.createElement("script");
    script.textContent = buildMainWorldScript();
    document.documentElement.appendChild(script);
    script.remove();
  },
};
