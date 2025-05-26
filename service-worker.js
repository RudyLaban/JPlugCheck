/**
 * Vérifie si le controle des versions a déjà été lancée 
 * en verifiant l'existance d'un élément ayant la classe .jplugcheck-indicator 
 * 
 * Fonction injectée et exécutée dans le contexte du content script
 * 
 * @returns true si l'élément existe, sinon false
 */
function checkIfElementExists() {
  // On accède ici au DOM de la page courante
  const element = document.querySelector(".table-data > tbody > tr td.jplugcheck-indicator");
  return !!element;
}

// Écoute les messages reçus depuis content.js ou popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // content.js -> Si le message demande un fetch distant et contient une URL valide
  if (request.type === "fetchRemoteData" && request.url) {
    // Effectue une requête fetch avec les cookies (credentials: 'include')
    fetch(request.url, { method: "GET", credentials: "include" })
      .then(res => res.text())
      .then(html => sendResponse({ success: true, html }))
      .catch(err => sendResponse({ success: false, error: err.message }));

    return true; // Nécessaire pour permettre une réponse asynchrone avec sendResponse()
  }

  // popup.js -> Si le messages demande de recuperer un élément du DOM
  if (request.action === "getPageDomElement") {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs.length > 0) {
        const activeTabId = tabs[0].id;

        chrome.scripting.executeScript({
          target: { tabId: activeTabId },
          function: checkIfElementExists
        }, (injectionResults) => {
          if (chrome.runtime.lastError) {
            console.error("Erreur d'injection du script :", chrome.runtime.lastError.message);
            sendResponse({ elementExists: false, error: chrome.runtime.lastError.message });
            return;
          }
          if (injectionResults && injectionResults[0] && injectionResults[0].result !== undefined) {
            // S'il est OK, récupère le résultat et l'envoyer à la popup
            sendResponse({ elementExists: injectionResults[0].result });
          } else {
            // Cas où le résultat est inattendu
            sendResponse({ elementExists: false }); 
          }
        });
      }
    });

    // Réponse envoyée de manière asynchrone
    return true;
  }

  // content.js -> Écoute le message de fin de traitement du content script
  if(request.type === "contentScriptFinished") {
    chrome.runtime.sendMessage({ type: "processingCompleted" });
    return false;
  }
});
