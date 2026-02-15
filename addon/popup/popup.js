/**
 * popup.js - Logique du popup de la barre d'outils
 * 3 actions : Lancer tous les filtres / Filtrer ce dossier / Gérer les filtres
 */

document.addEventListener("DOMContentLoaded", () => {
  i18nUpdate();

  document.getElementById("btn-run-all").addEventListener("click", runAllFilters);
  document.getElementById("btn-run-folder").addEventListener("click", runFolderFilters);
  document.getElementById("btn-manage").addEventListener("click", openManagePage);
});

function i18nUpdate() {
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const key = el.getAttribute("data-i18n");
    const msg = messenger.i18n.getMessage(key);
    if (msg) el.textContent = msg;
  }
}

async function runAllFilters() {
  showStatus("loading", "⏳ ...");

  try {
    const result = await messenger.runtime.sendMessage({ command: "runAllFilters" });
    const msg = messenger.i18n.getMessage("filtersExecuted") || "Done";
    showStatus("success", `✅ ${msg} (${result.totalMoved})`);
  } catch (e) {
    showStatus("error", `❌ ${e.message}`);
  }

  setTimeout(() => hideStatus(), 4000);
}

async function runFolderFilters() {
  showStatus("loading", "⏳ ...");

  try {
    const folders = await messenger.runtime.sendMessage({ command: "getSelectedFolders" });
    if (!folders || folders.length === 0) {
      showStatus("error", "❌ Aucun dossier sélectionné");
      return;
    }

    const result = await messenger.runtime.sendMessage({
      command: "runFiltersOnFolders",
      folders: folders.map((f) => ({ accountId: f.accountId, path: f.path })),
    });
    const msg = messenger.i18n.getMessage("filtersExecuted") || "Done";
    const folderCount = folders.length > 1 ? ` (${folders.length} dossiers)` : "";
    showStatus("success", `✅ ${msg} (${result.totalMoved})${folderCount}`);
  } catch (e) {
    showStatus("error", `❌ ${e.message}`);
  }

  setTimeout(() => hideStatus(), 4000);
}

async function openManagePage() {
  // Ouvrir la page d'administration dans un nouvel onglet TB
  await messenger.tabs.create({
    url: messenger.runtime.getURL("options/options.html"),
  });
  window.close();
}

function showStatus(type, message) {
  const el = document.getElementById("popup-status");
  el.className = `popup-status ${type}`;
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideStatus() {
  const el = document.getElementById("popup-status");
  el.classList.add("hidden");
}
