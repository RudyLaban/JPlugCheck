// Vérifie qu'on est bien sur la page de gestion des modules
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = tabs[0].url;

  if (url.includes("/admin/pluginManager.jsp")) {
    document.getElementById("error-msg").style.display = "none";
    document.getElementById("btn-container").style.display = "inline-block";
  } else {
    document.getElementById("error-msg").style.display = "block";
    document.getElementById("btn-container").style.display = "none";
  }
});


const loader = document.getElementById("loader");
const fetchBtn = document.getElementById("fetchBtn");

// Ecoute du clic sur le bouton de la popup
fetchBtn.addEventListener("click", () => {

  fetchBtn.setAttribute("disabled", "");
  loader.style.display = "inline-block";

  // Récupère l'onglet actif dans la fenêtre actuelle
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    // Injecte le script content.js dans la page de l'onglet actif
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      files: ["content.js"]
    }, () => {
      // Masque le loader après un court délai
      setTimeout(() => {
        loader.style.display = "none";
      }, 1800);
    });
  });
});

/**
 * Vérifie si la vérification a déjà été lancée
 */
document.addEventListener('DOMContentLoaded', () => {
  async function checkDomElementAndDisableButton() {
    try {
      const response = await chrome.runtime.sendMessage({ action: "getPageDomElement" });
      console.log("Réponse du service worker :", response);

      // Active ou désactive le bouton de la popup
      if (response && response.elementExists) {
        fetchBtn.setAttribute("disabled", "");
      } else {
        fetchBtn.removeAttribute("disabled");
      }
    } catch (e) {
      console.error("Erreur lors de la vérification de l'élément DOM :", e);
      fetchBtn.removeAttribute("disabled"); // En cas d'erreur, ne pas désactiver le bouton
    }
  }

  checkDomElementAndDisableButton();
});