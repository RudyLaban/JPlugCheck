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

  const rows = document.querySelectorAll(".table-data > tbody > tr");

  rows.forEach((row, index) => {
    const link = row.querySelector("td:nth-child(8) > a:nth-child(1)");
    if (!link) return;
    const url = link.getAttribute("href");
    if (!url) return;

    // Envoie l'URL au service worker (background.js) pour effectuer un fetch
    chrome.runtime.sendMessage(
      { type: "fetchRemoteData", url: url, rowIndex: index },
      (response) => {
        if (!response || !response.success) return;

        const parser = new DOMParser();
        const doc = parser.parseFromString(response.html, "text/html");

        // Récupération de la version distante
        const text = doc.querySelector(".header-title")?.textContent?.trim() || "";
        const parts = text.split(" ");
        const lastVersion = parts[parts.length - 1];
        if (!lastVersion) return;

        // Extraction de la version actuelle
        const currentCell = row.querySelector("td:nth-child(4)");
        let currentText = "0.0.0";

        if (currentCell) {
          // Ne garde que le texte brut visible avant les éléments HTML internes
          const textNode = Array.from(currentCell.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
          currentText = textNode?.textContent.trim() || "0.0.0";
        }

        // Nettoyage basique : garde uniquement chiffres et points
        const clean = v => v.trim().replace(/[^0-9.]/g, '');
        const cleanCurrent = clean(currentText);
        const cleanLast = clean(lastVersion);

        // Compare les versions
        const toUpdate = isNewerVersion(cleanLast, cleanCurrent);

        // Ajout d'une nouvelle cellule à droite avec le statut
        const cell = document.createElement("td");
        cell.classList.add("jplugcheck-indicator");
        cell.textContent = toUpdate ? `⚠️ Nouvelle version : ${cleanLast}` : `✅ À jour en version ${cleanLast}`;
        cell.style.backgroundColor = toUpdate ? "#ff000017" : "#00c80017";
        row.appendChild(cell);
      }
    );
  });
})();
