/**
 * background.js - Script principal en arrière-plan
 * Gère les événements, la communication avec les pages et l'exécution des filtres
 */
import {
  loadFilters,
  saveFilters,
  loadSettings,
  saveSettings,
  exportConfig,
  importConfig,
} from "../lib/storage.js";

import {
  executeFiltersOnFolder,
  evaluateFilter,
  parseSmartFilter,
} from "../lib/filter-engine.js";

import {
  getAccountsWithFolders,
  getFoldersForAccounts,
  getInboxFoldersForAccounts,
  getAddressBooks,
  getOwnEmails,
} from "../lib/account-manager.js";

// ─── Écouteur des messages entrants (listener pour nouveaux messages) ───
let newMessageListener = null;

/**
 * Active/désactive l'écoute des nouveaux messages selon les réglages
 */
async function updateNewMessageListener() {
  const settings = await loadSettings();

  if (settings.applyOnNewMessage) {
    if (!newMessageListener) {
      newMessageListener = async (folder, messageList) => {
        console.log("filterMoveMail: New messages detected in", folder.path);
        await runFiltersOnMessages(messageList.messages, folder);
      };
      messenger.messages.onNewMailReceived.addListener(newMessageListener);
      console.log("filterMoveMail: New message listener activated");
    }
  } else {
    if (newMessageListener) {
      messenger.messages.onNewMailReceived.removeListener(newMessageListener);
      newMessageListener = null;
      console.log("filterMoveMail: New message listener deactivated");
    }
  }
}

/**
 * Exécute les filtres actifs sur des messages donnés (premier filtre gagnant)
 */
async function runFiltersOnMessages(messages, sourceFolder) {
  const filters = await loadFilters();
  const activeFilters = filters.filter((f) => f.enabled && f.applyOnNewMessage);

  if (activeFilters.length === 0) return;

  // Regrouper les déplacements par destination
  const moveGroups = new Map();

  for (const message of messages) {
    for (const filter of activeFilters) {
      // Vérifier que la destination n'est pas la source
      if (
        filter.action.destinationAccountId === sourceFolder.accountId &&
        filter.action.destinationPath === sourceFolder.path
      ) {
        continue;
      }

      const matches = await evaluateFilter(filter, message);
      if (matches) {
        const destKey = `${filter.action.destinationAccountId}:${filter.action.destinationPath}`;
        if (!moveGroups.has(destKey)) {
          moveGroups.set(destKey, {
            destination: {
              accountId: filter.action.destinationAccountId,
              path: filter.action.destinationPath,
            },
            messageIds: [],
            filterName: filter.name,
          });
        }
        moveGroups.get(destKey).messageIds.push(message.id);
        break; // Premier filtre gagnant
      }
    }
  }

  // Déplacer par lot groupé par destination
  let totalNewMoved = 0;
  for (const [, group] of moveGroups) {
    try {
      await messenger.messages.move(group.messageIds, group.destination);
      totalNewMoved += group.messageIds.length;
    } catch (e) {
      console.error("filterMoveMail: Error moving messages:", e);
    }
  }
  if (totalNewMoved > 0) {
    console.log(`filterMoveMail: ${sourceFolder.path} → ${totalNewMoved} nouveau(x) message(s) déplacé(s)`);
  }
}

/**
 * Exécute tous les filtres sur les INBOX des comptes sélectionnés (optimisé)
 * Ne scanne QUE les boîtes de réception pour éviter les boucles de déplacement
 */
async function runAllFilters() {
  const [filters, settings] = await Promise.all([
    loadFilters(),
    loadSettings(),
  ]);

  const activeFilters = filters.filter((f) => f.enabled);
  if (activeFilters.length === 0) {
    return { totalMoved: 0, details: [], message: "No active filters" };
  }

  // Construire une map : folderKey → { folder, filters[] }
  // Ne récupérer que les INBOX des comptes ciblés par chaque filtre
  const folderMap = new Map();

  for (const filter of activeFilters) {
    const filterAccounts = filter.selectedAccounts || { allAccounts: true, accountIds: [] };
    const inboxes = await getInboxFoldersForAccounts(filterAccounts);

    for (const folder of inboxes) {
      const key = `${folder.accountId}:${folder.path}`;
      if (!folderMap.has(key)) {
        folderMap.set(key, { folder, filters: [] });
      }
      folderMap.get(key).filters.push(filter);
    }
  }

  let totalMoved = 0;
  const allDetails = [];

  // Pour chaque INBOX unique, exécuter TOUS les filtres applicables en un seul passage
  for (const [, { folder, filters: folderFilters }] of folderMap) {
    const result = await executeFiltersOnFolder(folderFilters, folder, {
      removeOwnEmails: settings.removeOwnEmails,
    });
    totalMoved += result.totalMoved;
    allDetails.push(...result.details.map((d) => ({
      ...d,
      folder: folder.displayLabel || folder.path,
    })));
  }

  return { totalMoved, details: allDetails };
}

/**
 * Exécute les filtres sur un ou plusieurs dossiers spécifiques
 * @param {Array} folders - Liste de dossiers { accountId, path }
 */
async function runFiltersOnFolders(folders) {
  const [filters, settings] = await Promise.all([
    loadFilters(),
    loadSettings(),
  ]);

  const activeFilters = filters.filter((f) => f.enabled);
  if (activeFilters.length === 0) {
    return { totalMoved: 0, details: [] };
  }

  let totalMoved = 0;
  const allDetails = [];

  for (const folder of folders) {
    const result = await executeFiltersOnFolder(activeFilters, folder, {
      removeOwnEmails: settings.removeOwnEmails,
    });
    totalMoved += result.totalMoved;
    allDetails.push(...result.details.map((d) => ({
      ...d,
      folder: folder.path,
    })));
  }

  return { totalMoved, details: allDetails };
}

// ─── Gestion des messages depuis les pages popup/options ───

messenger.runtime.onMessage.addListener(async (message, sender) => {
  switch (message.command) {
    // ─── Filtres ───
    case "getFilters":
      return await loadFilters();

    case "saveFilters":
      await saveFilters(message.filters);
      return { success: true };

    // ─── Préférences ───
    case "getSettings":
      return await loadSettings();

    case "saveSettings":
      await saveSettings(message.settings);
      await updateNewMessageListener();
      return { success: true };

    // ─── Comptes ───
    case "getAccounts":
      return await getAccountsWithFolders();

    case "getAddressBooks":
      return await getAddressBooks();

    case "getOwnEmails":
      return [...(await getOwnEmails())];

    // ─── Exécution ───
    case "runAllFilters":
      return await runAllFilters();

    case "runFiltersOnFolders": {
      return await runFiltersOnFolders(message.folders);
    }

    case "runSelectedFilter": {
      const filters = await loadFilters();
      const filter = filters.find((f) => f.id === message.filterId);
      if (!filter) return { totalMoved: 0, error: "Filter not found" };

      const filterAccounts = filter.selectedAccounts || { allAccounts: true, accountIds: [] };
      const inboxes = await getInboxFoldersForAccounts(filterAccounts);
      let totalMoved = 0;
      for (const folder of inboxes) {
        const result = await executeFiltersOnFolder([filter], folder);
        totalMoved += result.totalMoved;
      }
      return { totalMoved };
    }

    // ─── Import/Export ───
    case "exportConfig":
      return await exportConfig();

    case "importConfig":
      await importConfig(message.config);
      await updateNewMessageListener();
      return { success: true };

    // ─── Smart Filter ───
    case "parseSmartFilter":
      return parseSmartFilter(message.expression);

    // ─── Dossiers sélectionnés ───
    case "getSelectedFolders": {
      try {
        const mailTabs = await messenger.mailTabs.query({ active: true, currentWindow: true });
        if (mailTabs.length > 0) {
          // API TB 128+ : récupère TOUS les dossiers sélectionnés (multi-sélection)
          const folders = await messenger.mailTabs.getSelectedFolders(mailTabs[0].tabId);
          if (folders && folders.length > 0) {
            return folders;
          }
        }
      } catch (e) {
        console.error("filterMoveMail: Error getting selected folders:", e);
      }
      return null;
    }

    default:
      console.warn("filterMoveMail: Unknown command:", message.command);
      return null;
  }
});

// ─── Initialisation ───
async function init() {
  console.log("filterMoveMail: Extension starting...");
  await updateNewMessageListener();
  console.log("filterMoveMail: Extension started successfully");
}

init();
