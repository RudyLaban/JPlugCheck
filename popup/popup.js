const blocMain = document.querySelector(".jpc-bloc#main");
const blocError = document.querySelector(".jpc-bloc#error");
const blocDone = document.querySelector(".jpc-bloc#check-is-done");
const loader = document.getElementById("loader");
const fetchBtn = document.getElementById("fetch-btn");

// URL de la page de gestion des modules Jalios
const JALIOS_PLUGIN_MANAGER_URL_PART = "/admin/pluginManager.jsp";

/**
 * Masque tous les blocs pour éviter les conflits d'affichage
 */
function hideAllBlocks() {
  blocMain.style.display = "none";
  blocError.style.display = "none";
  blocDone.style.display = "none";
  loader.style.display = "none";
}

/**
 * Orchestre l'initialisation de l'interface utilisateur de la popup.
 * Gère l'affichage basé sur l'URL et l'état de l'indicateur dans la page.
 */
async function initializePopupUI() {
  hideAllBlocks();

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tabs[0].url;

    // Affichage initial en fonction de l'URL
    if (url.includes(JALIOS_PLUGIN_MANAGER_URL_PART)) {
      // Vérifie le DOM pour décider quel bloc afficher
      await checkDomElementAndDisplayBlocs();
    } else {
      // Si l'URL n'est pas correcte, afficher le message d'erreur
      blocError.style.display = "block";
    }
  } catch (error) {
    console.error("Erreur lors de l'initialisation de la popup :", error);
    blocError.style.display = "block";
    blocError.textContent = "Une erreur est survenue lors du chargement de la popup.";
  }
}

/**
 * Vérifie l'existence de l'élément indicateur sur la page courante
 * affiche le bloc principal ou le bloc "check-is-done" en conséquence.
 */
async function checkDomElementAndDisplayBlocs() {
  try {
    const response = await chrome.runtime.sendMessage({ action: "getPageDomElement" });
    console.log("Réponse du service worker (checkDomElementAndDisplayBlocs):", response);

    if (response && response.elementExists) {
      // Si l'élément existe, c'est que la vérification a déjà été faite
      blocDone.style.display = "block";
      blocMain.style.display = "none";
      fetchBtn.removeAttribute("disabled");
      fetchBtn.classList.remove("disabled");
    } else {
      // Sinon, on affiche le bloc principal pour lancer la vérification
      blocMain.style.display = "block";
      blocDone.style.display = "none";
      fetchBtn.removeAttribute("disabled");
      fetchBtn.classList.remove("disabled");
    }
  } catch (e) {
    console.error("Erreur lors de la vérification de l'élément DOM :", e);
    // pour permettre une tentative de relance en cas d'erreur
    blocMain.style.display = "block";
    blocDone.style.display = "none";
    blocError.style.display = "none";
    fetchBtn.removeAttribute("disabled");
    fetchBtn.classList.remove("disabled");
  }
}

// Écoute du clic sur le bouton de la popup
fetchBtn.addEventListener("click", () => {
  fetchBtn.setAttribute("disabled", "true");
  fetchBtn.classList.add("disabled");
  loader.style.display = "inline-block";

  // Récupère l'onglet actif dans la fenêtre actuelle
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0].id;
    // Injecte le script content.js dans la page de l'onglet actif
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content.js"]
    });
    // Injecter le CSS
    chrome.scripting.insertCSS({
      target: { tabId: tabId },
      files: ["/style/jPlugCheck.css"]
    })
  });
});

// Écoute les messages venant de n'importe quel script de l'extension (y compris le service worker)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "processingCompleted") {
    blocDone.style.display = "block";
    blocMain.style.display = "none";
    loader.style.display = "none";
    fetchBtn.removeAttribute("disabled");
    fetchBtn.classList.remove("disabled");
  }
});

// Lance l'initialisation de l'UI lorsque le DOM de la popup est entièrement chargé
document.addEventListener('DOMContentLoaded', initializePopupUI);