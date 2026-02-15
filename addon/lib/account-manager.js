/**
 * account-manager.js - Gestionnaire des comptes et dossiers Thunderbird
 * Fournit des fonctions pour lister les comptes, construire l'arbre des dossiers, etc.
 */

/**
 * Récupère tous les comptes avec leurs dossiers
 * @returns {Promise<Array>} Liste des comptes avec dossiers
 */
export async function getAccountsWithFolders() {
  const accounts = await messenger.accounts.list(true); // inclure les dossiers
  return accounts.map((account) => ({
    id: account.id,
    name: account.name,
    type: account.type,
    identities: account.identities || [],
    folders: flattenFolders(account.folders || [], account.id, account.name),
    folderTree: account.folders || [],
  }));
}

/**
 * Aplatit l'arbre des dossiers en une liste
 * @param {Array} folders - Arbre des dossiers
 * @param {string} accountId - ID du compte
 * @param {string} accountName - Nom du compte
 * @param {string} parentPath - Chemin parent
 * @returns {Array}
 */
function flattenFolders(folders, accountId, accountName, parentPath = "") {
  const result = [];
  for (const folder of folders) {
    const displayPath = parentPath ? `${parentPath}/${folder.name}` : folder.name;
    result.push({
      id: folder.id,
      accountId,
      accountName,
      name: folder.name,
      path: folder.path,
      type: folder.type,
      displayPath,
      displayLabel: `${displayPath} sur ${accountName}`,
    });
    if (folder.subFolders && folder.subFolders.length > 0) {
      result.push(
        ...flattenFolders(folder.subFolders, accountId, accountName, displayPath)
      );
    }
  }
  return result;
}

/**
 * Construit un arbre de dossiers pour l'affichage
 * @param {Array} accounts - Comptes sélectionnés
 * @returns {Array} Arbre pour le composant folder-tree
 */
export function buildFolderTree(accounts) {
  return accounts.map((account) => ({
    id: account.id,
    label: account.name,
    type: "account",
    children: buildSubTree(account.folderTree || [], account.id, account.name),
    expanded: false,
  }));
}

/**
 * Construit les sous-arbres de dossiers
 * @param {Array} folders
 * @param {string} accountId
 * @param {string} accountName
 * @returns {Array}
 */
function buildSubTree(folders, accountId, accountName) {
  return folders.map((folder) => ({
    id: `${accountId}:${folder.path}`,
    label: folder.name,
    type: "folder",
    path: folder.path,
    accountId,
    accountName,
    folderType: folder.type,
    children:
      folder.subFolders && folder.subFolders.length > 0
        ? buildSubTree(folder.subFolders, accountId, accountName)
        : [],
    expanded: false,
  }));
}

/**
 * Récupère les adresses email de l'utilisateur depuis tous les comptes
 * @returns {Promise<Set<string>>}
 */
export async function getOwnEmails() {
  const accounts = await messenger.accounts.list();
  const emails = new Set();
  for (const account of accounts) {
    for (const identity of account.identities || []) {
      if (identity.email) {
        emails.add(identity.email.toLowerCase());
      }
    }
  }
  return emails;
}

/**
 * Récupère les carnets d'adresses
 * @returns {Promise<Array>}
 */
export async function getAddressBooks() {
  try {
    const books = await messenger.addressBooks.list();
    return books.map((book) => ({
      id: book.id,
      name: book.name,
      type: book.type,
    }));
  } catch (e) {
    console.error("filterMoveMail: Error listing address books:", e);
    return [];
  }
}

/**
 * Récupère les dossiers à traiter selon la sélection de comptes
 * @param {Object} selectedAccounts - { allAccounts: boolean, accountIds: string[] }
 * @returns {Promise<Array>} Liste de dossiers { accountId, path }
 */
export async function getFoldersForAccounts(selectedAccounts) {
  const accounts = await getAccountsWithFolders();
  let targetAccounts;

  if (selectedAccounts.allAccounts) {
    targetAccounts = accounts;
  } else {
    targetAccounts = accounts.filter((a) =>
      selectedAccounts.accountIds.includes(a.id)
    );
  }

  const folders = [];
  for (const account of targetAccounts) {
    for (const folder of account.folders) {
      // On ne filtre que les dossiers de type inbox ou les dossiers normaux
      // Exclure les dossiers spéciaux (trash, drafts, templates, outbox)
      if (!["trash", "drafts", "templates", "outbox", "junk"].includes(folder.type)) {
        folders.push({
          accountId: account.id,
          path: folder.path,
          name: folder.name,
          accountName: account.name,
          displayLabel: folder.displayLabel,
        });
      }
    }
  }

  return folders;
}

/**
 * Récupère uniquement les INBOX des comptes sélectionnés
 * Utilisé par "Lancer tous les filtres" pour ne scanner que les boîtes de réception
 * @param {Object} selectedAccounts - { allAccounts: boolean, accountIds: string[] }
 * @returns {Promise<Array>} Liste des INBOX { accountId, path, ... }
 */
export async function getInboxFoldersForAccounts(selectedAccounts) {
  const accounts = await getAccountsWithFolders();
  let targetAccounts;

  if (selectedAccounts.allAccounts) {
    targetAccounts = accounts;
  } else {
    targetAccounts = accounts.filter((a) =>
      selectedAccounts.accountIds.includes(a.id)
    );
  }

  const folders = [];
  for (const account of targetAccounts) {
    for (const folder of account.folders) {
      if (folder.type === "inbox") {
        folders.push({
          accountId: account.id,
          path: folder.path,
          name: folder.name,
          accountName: account.name,
          displayLabel: folder.displayLabel,
        });
      }
    }
  }

  return folders;
}
