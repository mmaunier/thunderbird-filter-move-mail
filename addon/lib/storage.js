/**
 * storage.js - Gestionnaire de stockage pour les filtres et préférences
 * Utilise browser.storage.local pour persister les données
 */

const DEFAULT_SETTINGS = {
  applyOnNewMessage: false,
  applyManually: true,
  applyAfterJunk: false,
  removeOwnEmails: true,
};

const STORAGE_KEYS = {
  FILTERS: "filters",
  SETTINGS: "settings",
  SELECTED_ACCOUNTS: "selectedAccounts",
};

/**
 * Charge tous les filtres depuis le stockage
 * @returns {Promise<Array>} Liste des filtres
 */
export async function loadFilters() {
  const result = await messenger.storage.local.get(STORAGE_KEYS.FILTERS);
  return result[STORAGE_KEYS.FILTERS] || [];
}

/**
 * Sauvegarde tous les filtres dans le stockage
 * @param {Array} filters - Liste des filtres
 */
export async function saveFilters(filters) {
  await messenger.storage.local.set({ [STORAGE_KEYS.FILTERS]: filters });
}

/**
 * Charge les préférences depuis le stockage
 * @returns {Promise<Object>} Préférences
 */
export async function loadSettings() {
  const result = await messenger.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
}

/**
 * Sauvegarde les préférences
 * @param {Object} settings
 */
export async function saveSettings(settings) {
  await messenger.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

/**
 * Charge la sélection des comptes
 * @returns {Promise<Object>} { allAccounts: boolean, accountIds: string[] }
 */
export async function loadSelectedAccounts() {
  const result = await messenger.storage.local.get(STORAGE_KEYS.SELECTED_ACCOUNTS);
  return result[STORAGE_KEYS.SELECTED_ACCOUNTS] || { allAccounts: true, accountIds: [] };
}

/**
 * Sauvegarde la sélection des comptes
 * @param {Object} selection
 */
export async function saveSelectedAccounts(selection) {
  await messenger.storage.local.set({ [STORAGE_KEYS.SELECTED_ACCOUNTS]: selection });
}

/**
 * Exporte toute la configuration (filtres + préférences)
 * @returns {Promise<Object>} Configuration complète
 */
export async function exportConfig() {
  const [filters, settings, selectedAccounts] = await Promise.all([
    loadFilters(),
    loadSettings(),
    loadSelectedAccounts(),
  ]);
  return {
    version: "1.0.0",
    exportDate: new Date().toISOString(),
    filters,
    settings,
    selectedAccounts,
  };
}

/**
 * Importe une configuration complète
 * @param {Object} config - Configuration à importer
 */
export async function importConfig(config) {
  if (!config || !config.version) {
    throw new Error("Invalid configuration format");
  }
  await Promise.all([
    saveFilters(config.filters || []),
    saveSettings(config.settings || DEFAULT_SETTINGS),
    saveSelectedAccounts(config.selectedAccounts || { allAccounts: true, accountIds: [] }),
  ]);
}

/**
 * Génère un ID unique pour un filtre
 * @returns {string}
 */
export function generateFilterId() {
  return `filter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Crée un filtre vide avec des valeurs par défaut
 * @returns {Object}
 */
export function createEmptyFilter() {
  return {
    id: generateFilterId(),
    name: "",
    enabled: true,
    applyOnNewMessage: false,
    applyManually: true,
    applyAfterJunk: false,
    matchMode: "any", // "all" ou "any"
    selectedAccounts: { allAccounts: true, accountIds: [] },
    conditions: [
      {
        field: "from",
        operator: "contains",
        value: "",
        addressBookId: null,
      },
    ],
    action: {
      type: "move",
      destinationFolderId: null,
      destinationAccountId: null,
    },
  };
}
