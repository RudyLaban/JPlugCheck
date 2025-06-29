// popup.js -> 
// Attend le déclenchement de l'exécution
// Permet de recevoir showDlLink de popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "startProcessing") {
    const showDlLink = message.showDlLink || false;
    startPluginCheck(showDlLink);
  }
});

/**
 * Fonctionnement principal de l'extension pour la vérification des modules
 * et les insertions des indications dans le DOM
 */
async function startPluginCheck(showDlLink) {
  // Compare deux versions de type "x.y.z" ou "x.y-z"
  function isNewerVersion(lastVersion, localVersion) {
    const lastParts = lastVersion.split(/[.-]/).map(Number);
    const currentParts = localVersion.split(/[.-]/).map(Number);
    const length = Math.max(lastParts.length, currentParts.length);

    for (let i = 0; i < length; i++) {
      const l = lastParts[i] || 0;
      const c = currentParts[i] || 0;

      if (l > c) return true;
      if (l < c) return false;
    }

    return false; // identiques ou déjà à jour
  }

  /**
   * Parse la string de compatibilité récupérée sur la page du module
   * @param str La version compatible (ex : JPlatform 10 SP8)
   * @returns La version parsée sous forme d'objet
   */  
  function parseCompatibility(str) {
    const parts = str.trim().split(/\s+/);
    // Gère le cas ou les versions mineur et corrective ne sont pas indiquées
    let major = 0, minor = null, fix = null;

    if (parts.length >= 2) {
      major = parseInt(parts[1], 10);
    }

    if (parts.length >= 3) {
      if (/^SP\d+$/i.test(parts[2])) {
        fix = parseInt(parts[2].slice(2), 10);
      } else if (!isNaN(parts[2])) {
        minor = parseInt(parts[2], 10);
      }
    }

    return { major, minor, fix };
  }

  /**
   * Parse la version de JPlatform locale
   * @param str La version, récupérée depuis le patch plugin
   * @returns La version parsée sous forme d'objet
   */  
  function parseLocalJPlatformVersionFromPatch(versionString) {
    const parts = versionString.split('.').map(n => parseInt(n, 10));
    return {
      major: parts[0] || 0,
      minor: parts[1] || 0,
      fix: parts[2] || 0
    };
  }

  /**
   * Récupère la version de JPlatform locale depuis la page "État du site"
   * @returns 
   */
  function fetchCurrentJPlatformVersion() {

    const currentUrl = window.location.href;
    const sitInfoUrl = currentUrl.replace(/[^/]+\.jsp$/, "siteInfo.jsp");
    
    return new Promise((resolve, reject) => {
      // Appel au service worker
      chrome.runtime.sendMessage(
        { type: "fetchCurrentSiteInfo", url: sitInfoUrl},
        (response) => {

          if (!response || !response.success) {
            handleNoData(`Échec du fetch de la page siteInfo du Jplatform courant`);
            resolve(null); 
            // TODO: ou resolve(reject) pour gérer l'erreur autrement
            return;
          }

          const parser = new DOMParser();
          const docSiteInfo = parser.parseFromString(response.html, "text/html");
          let versionElmt = docSiteInfo.querySelector('#server .table-data tr td:nth-child(2)');
          if (!versionElmt) {
            versionElmt = docSiteInfo.querySelector('.table-data tr td:nth-child(2)');
          }
          const match = versionElmt?.textContent?.match(/\d+\.\d+\.\d+/);
          resolve(match);
        }
      );
    });
  }

  // Chaque ligne de module
  const rows = document.querySelectorAll(".table-data > tbody > tr");


  const totalPlugins = rows.length;
	// Contruction de la version de JPlatform locale (string)
  const localJPlatformVersionMatch = await fetchCurrentJPlatformVersion();
	let localJPlatformVersion = {};

	if (!!localJPlatformVersionMatch) {
		localJPlatformVersion = parseLocalJPlatformVersionFromPatch(localJPlatformVersionMatch[0]);
	}

  let completedFetches = 0, nbPluginsCompared = 0, nbPluginUpTodate = 0, rate = 0;
  
  // Lancé à chaque traitement de module pour envoyer un
  const signalPluginProcessed = () => {
    completedFetches++;
    // Une fois toutes les lignes traitées.
    if (completedFetches === totalPlugins) {
      // Pourcentage de module à jour
      rate = Math.round((nbPluginUpTodate / nbPluginsCompared) * 100);
      let rateClass = "good"
      if (rate < 50) {
        rateClass = "bad";
      }
      else if (rate < 80) {
        rateClass = "medium";
      }

      document.querySelector(".jpc-th").innerHTML += `
        <span class="rate ${rateClass}" title="Pourcentage de modules à jours.">${rate}%</span>
      `;

      // message au service worker
      chrome.runtime.sendMessage({ type: "contentScriptFinished" });
    }
  };
    
  // Cellule d'entête
  document.querySelector(".table-data > thead > tr").innerHTML += `
    <th class="jpc jpc-th" title="Inclut uniquement les modules présents sur Community.">
      <span class="label-wrapper">
        <span>Dernière version</span>
      </span>
    </th>
  `;

  rows.forEach((row, index) => {
    // Nouvelle cellule pour cette ligne
    const cell = document.createElement("td");
    cell.classList.add("jpc", "jpc-indicator");

    const pluginName = row.querySelector("td:nth-child(5) a")?.textContent?.trim();
    const link = row.querySelector("td:nth-child(8) a");

    // Gère les différents cas de non-traitement ou d'erreur
    const handleNoData = (reason) => {
      console.debug(`[JPlugCheck] ${reason}`)
      signalPluginProcessed();
      // Ajoute la cellule vide
      row.appendChild(cell);
    };

    if (!link) {
      handleNoData(`Pas de lien pour le ${pluginName}`);
      return;
    }
    const url = link.getAttribute("href");
    if (!url) {
      handleNoData(`URL du ${pluginName} manquante`);
      return;
    }

    // Envoie l'URL au service worker (background.js) pour effectuer un fetch
    chrome.runtime.sendMessage(
      { type: "fetchRemoteData", url: url, rowIndex: index },
      (response) => { // Response représente la page html du module sur Community
        if (!response || !response.success) {
          handleNoData(`Échec du fetch des données pour le ${pluginName}`);
          return;
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(response.html, "text/html");

        // Si Community affiche sa page "Page introuvable"
        const metaOgTitle = doc.querySelector('meta[property="og:title"]');
        if (metaOgTitle && metaOgTitle.getAttribute('content') === "Page introuvable") {
          handleNoData(`Page introuvable sur Community pour le ${pluginName}`);
          return;
        }

        // Récupère la version distante
        let lastVersionContent = doc.querySelector(".header-title");
        let lastVersionTitle = "";
        let lastVersion = "";
        let isPatch = false;

        // On cherche le PatchPlugin
        if (!lastVersionContent) {
          lastVersionTitle = doc.querySelector('.publication-title')?.textContent?.trim() || "";
          lastVersion = lastVersionTitle.split(" - ").slice(1).join("-");
          isPatch = true;
        } else {// On cherche un Plugin normale
          lastVersionTitle = lastVersionContent?.textContent?.trim() || "";
          const parts = lastVersionTitle.split(" ");
          lastVersion = parts[parts.length - 1];
        }

        if (!lastVersion) {
          handleNoData(`Version distante du ${pluginName} non trouvée`);
          return;
        }

        // Récupération des compatibilitées
        // Récupère la version de JPlatform via le numéro de patch
        const propNameCompatibility = Array.from(doc.querySelectorAll('.property-name')).find(c => {
        	return c.textContent.trim() === "Compatibilité  :";
        });

				let isCompatible = false;
				if (!!propNameCompatibility && !!localJPlatformVersion) {

					const compatibilitiesContent = Array.from(propNameCompatibility.parentNode.children).filter(c => {
						return c !== propNameCompatibility;
					});
					let compatibilities = [];
					compatibilitiesContent.forEach((c) => {
						compatibilities.push(parseCompatibility(c.textContent));
					});
					
					// Gère le cas ou les versions mineur et corrective ne sont pas indiquées 
					isCompatible = compatibilities.some(compat => {
						if (compat.major !== localJPlatformVersion.major) {
							return false;
						}

						if (compat.minor !== null && compat.minor !== localJPlatformVersion.minor) {
							return false;
						}

						if (compat.fix !== null && compat.fix !== localJPlatformVersion.fix) {
							return false;
						}

						return true;
					});
				}

        // Récupération distante : lien de téléchargement
        let dlUrl = "";
        if (showDlLink) {
          const dlSelector = isPatch ? '.main-actions a' : '.header-button a'
          const dlElmnt = doc.querySelector(dlSelector);

          if (!!dlElmnt) {
            dlUrl = dlElmnt.href;
          }
        }

        // Extraie la version installée en locale
        const localCellContent = row.querySelector("td:nth-child(4)");
        let localVersion = "0.0.0";

        if (localCellContent) {
          const localVersionNode = Array.from(localCellContent.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
          localVersion = localVersionNode?.textContent.trim() || "0.0.0";
        }

        nbPluginsCompared++;

        // Nettoie basique : garde uniquement chiffres et points
        const clean = v => v.trim().replace(/[^0-9.-]/g, '');
        const cleanLocal = clean(localVersion);
        const cleanLast = clean(lastVersion);

        // Compare les versions
        const toUpdate = isNewerVersion(cleanLast, cleanLocal);

        // Remplis la cellule avec le statut
        if (toUpdate) {
          if (isPatch) {
            cell.classList.add("patch");
          } else {
						cell.setAttribute("title", isCompatible ? "" : "Possible incompatibilité avec votre version de JPlatform.")
            cell.classList.add(isCompatible ? 'to-update' : 'not-compatible');
          }
        } else {
          cell.classList.add("up-to-date");
          nbPluginUpTodate++;
        }
        cell.textContent = `${cleanLast}`;

        // Ajout du lien de téléchargement du module
        if(dlUrl.length !== 0) {
          const dlLink = document.createElement("a");
          dlLink.href = dlUrl;
          dlLink.classList.add("dl-link");
          dlLink.setAttribute("title", `Télécharger la version ${cleanLast +" du "+ pluginName}`);
          dlLink.textContent = "💾";
          cell.appendChild(dlLink);
        }
        
        row.appendChild(cell);
        signalPluginProcessed();
      }
    );
  });
}