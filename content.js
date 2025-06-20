/**
 * Fonctionnement principal de l'extension pour la vérification des modules
 * et les insertions des indications dans le DOM
 */
(() => {
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

  // Chaque ligne de module
  const rows = document.querySelectorAll(".table-data > tbody > tr");
  
  const totalPlugins = rows.length;
  let completedFetches = 0;
  let nbPluginsCompared = 0;
  let nbPluginUpTodate = 0;
  let rate = 0;
  
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
      const thRate = document.querySelector(".jpc-th .rate");
      thRate.setAttribute("title", "Pourcentage de modules à jours.")
      thRate.classList.add(rateClass);
      thRate.append(rate + '%');

      // message au service worker
      chrome.runtime.sendMessage({ type: "contentScriptFinished" });
    }
  };
    
	// Cellule d'entête
  const thead = document.querySelector(".table-data > thead > tr");
  const th = document.createElement("th");
  const labelWrapper = document.createElement("span");
  const thImg = document.createElement("img");
  const spanRate = document.createElement("span");
  
  thImg.src = chrome.runtime.getURL('images/clear/icon_clear-16.png');
  labelWrapper.classList.add('label-wrapper')
  labelWrapper.append(thImg, " Rapport");
  spanRate.classList.add('rate');
  th.classList.add('jpc-th')
  th.append(labelWrapper, spanRate);
  thead.appendChild(th);

  rows.forEach((row, index) => {
    // Nouvelle cellule pour cette ligne
    const cell = document.createElement("td");
    cell.classList.add("jplugcheck-indicator");

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

        // Remplis la cellule avec le statut et le style approprié
        if (toUpdate) {
          if (isPatch) {
            cell.textContent = `🩹 Nouveau Patch : ${cleanLast}`;
            cell.style.backgroundColor = "#009ef517";
          } else {
            cell.textContent = `⚠️ Nouvelle version : ${cleanLast}`;
            cell.style.backgroundColor = "#ff000017";
          }
        } else {
          nbPluginUpTodate++;
          cell.textContent = `✅ À jour en version ${cleanLast}`;
          cell.style.backgroundColor = "#00c80017";
        }

        row.appendChild(cell);
        signalPluginProcessed();
      }
    );
  });
})();