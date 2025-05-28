/**
 * Fonctionnement principal de l'extension pour la vérification des modules
 * et les insertions des indications dans le DOM
 */
(() => {
  // Compare deux versions de type "x.y.z"
  function isNewerVersion(lastVersion, currentVersion) {
    const lastParts = lastVersion.split('.').map(Number);
    const currentParts = currentVersion.split('.').map(Number);
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
  
  // Lancé à chaque traitement de module pour envoyer un
	// message au service worker une fois toutes les lignes traitées.
  const signalPluginProcessed = () => {
      completedFetches++;
      if (completedFetches === totalPlugins) {
          chrome.runtime.sendMessage({ type: "contentScriptFinished" });
        }
    };
    
	// Cellule d'entête
	const th = document.querySelector(".table-data > thead > tr");
	const thCell = document.createElement("th");
	const text = document.createTextNode('Rapport JPlugCheck');
	const imgURL = chrome.runtime.getURL('images/clear/icon_clear-16.png');
	const thImg = document.createElement("img");
	thImg.setAttribute('src', imgURL);
	thCell.appendChild(thImg);
	thCell.appendChild(document.createTextNode(" "));
	thCell.appendChild(text);
	th.appendChild(thCell);

  rows.forEach((row, index) => {
    // Nouvelle cellule pour cette ligne
    const cell = document.createElement("td");
    cell.classList.add("jplugcheck-indicator");

    const link = row.querySelector("td:nth-child(8) a");

    // Gère les différents cas de non-traitement ou d'erreur
    const handleNoData = (reason) => {
			console.debug(reason)
      signalPluginProcessed();
      // Ajoute la cellule vide
      row.appendChild(cell);
    };

    if (!link) {
      handleNoData("Pas de lien de module");
      return;
    }
    const url = link.getAttribute("href");
    if (!url) {
      handleNoData("URL de module manquante");
      return;
    }

    // Envoie l'URL au service worker (background.js) pour effectuer un fetch
    chrome.runtime.sendMessage(
      { type: "fetchRemoteData", url: url, rowIndex: index },
      (response) => { // Response représente la page html du module sur Community
        if (!response || !response.success) {
          handleNoData("Échec du fetch des données");
          return;
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(response.html, "text/html");

        // Si Community affiche sa page "Page introuvable"
        const metaOgTitle = doc.querySelector('meta[property="og:title"]');
        if (metaOgTitle && metaOgTitle.getAttribute('content') === "Page introuvable") {
          handleNoData("Page introuvable sur Community");
          return;
        }

        // Récupère la version distante
        const text = doc.querySelector(".header-title")?.textContent?.trim() || "";
        const parts = text.split(" ");
        const lastVersion = parts[parts.length - 1];
        if (!lastVersion) {
          handleNoData("Version distante non trouvée");
          return;
        }

        // Extraie la version actuelle
        const currentCellContent = row.querySelector("td:nth-child(4)");
        let currentText = "0.0.0";

        if (currentCellContent) {
          const textNode = Array.from(currentCellContent.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
          currentText = textNode?.textContent.trim() || "0.0.0";
        }

        // Nettoie basique : garde uniquement chiffres et points
        const clean = v => v.trim().replace(/[^0-9.]/g, '');
        const cleanCurrent = clean(currentText);
        const cleanLast = clean(lastVersion);

        // Compare les versions
        const toUpdate = isNewerVersion(cleanLast, cleanCurrent);

        // Remplis la cellule avec le statut et le style approprié
        cell.textContent = toUpdate ? `⚠️ Nouvelle version : ${cleanLast}` : `✅ À jour en version ${cleanLast}`;
        cell.style.backgroundColor = toUpdate ? "#ff000017" : "#00c80017";

        row.appendChild(cell);
        signalPluginProcessed();
      }
    );
  });
})();