/**
 * filter-engine.js - Moteur de filtrage des messages
 * Contient la logique de matching et d'exécution des filtres
 */

/**
 * Champs supportés pour le filtrage
 */
const FIELD_EXTRACTORS = {
  from: (msg) => msg.author || "",
  to: (msg) => (msg.recipients || []).join(", "),
  cc: (msg) => (msg.ccList || []).join(", "),
  bcc: (msg) => (msg.bccList || []).join(", "),
  subject: (msg) => msg.subject || "",
};

/**
 * Extraire les adresses email d'un texte
 * @param {string} text
 * @returns {string[]}
 */
function extractEmails(text) {
  const emailRegex = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
  return (text.match(emailRegex) || []).map((e) => e.toLowerCase());
}

/**
 * Vérifie si une adresse est dans un carnet d'adresses
 * @param {string} email - Adresse email
 * @param {string|null} addressBookId - ID du carnet, null = tous
 * @returns {Promise<boolean>}
 */
async function isInAddressBook(email, addressBookId = null) {
  try {
    const emailLower = email.toLowerCase();
    const books = await messenger.addressBooks.list();
    const targetBooks = addressBookId
      ? books.filter((b) => b.id === addressBookId)
      : books;

    for (const book of targetBooks) {
      const contacts = await messenger.contacts.quickSearch(book.id, email);
      // quickSearch fait un match partiel — on doit vérifier l'email exact
      for (const contact of contacts) {
        const props = contact.properties || {};
        if (
          (props.PrimaryEmail && props.PrimaryEmail.toLowerCase() === emailLower) ||
          (props.SecondEmail && props.SecondEmail.toLowerCase() === emailLower)
        ) {
          return true;
        }
      }
    }
    return false;
  } catch (e) {
    console.error("filterMoveMail: Error checking address book:", e);
    return false;
  }
}

/**
 * Évalue une condition de filtre sur un message
 * @param {Object} condition - Condition à évaluer
 * @param {Object} message - Message Thunderbird
 * @param {string|null} bodyText - Corps du message (chargé à la demande)
 * @returns {Promise<boolean>}
 */
async function evaluateCondition(condition, message, bodyText) {
  const { field, operator, value } = condition;

  // Récupérer le texte du champ
  let fieldText;
  if (field === "body") {
    fieldText = bodyText || "";
  } else {
    const extractor = FIELD_EXTRACTORS[field];
    if (!extractor) return false;
    fieldText = extractor(message);
  }

  const fieldLower = fieldText.toLowerCase();
  const valueLower = (value || "").toLowerCase();

  switch (operator) {
    case "contains":
      return fieldLower.includes(valueLower);

    case "not_contains":
      return !fieldLower.includes(valueLower);

    case "is":
      // Pour les champs email, on compare les adresses extraites
      if (["from", "to", "cc", "bcc"].includes(field)) {
        const emails = extractEmails(fieldText);
        return emails.some((e) => e === valueLower);
      }
      return fieldLower === valueLower;

    case "is_not":
      if (["from", "to", "cc", "bcc"].includes(field)) {
        const emails = extractEmails(fieldText);
        return !emails.some((e) => e === valueLower);
      }
      return fieldLower !== valueLower;

    case "in_addressbook": {
      const emails = extractEmails(fieldText);
      for (const email of emails) {
        if (await isInAddressBook(email, condition.addressBookId)) {
          return true;
        }
      }
      return false;
    }

    case "not_in_addressbook": {
      const emails = extractEmails(fieldText);
      for (const email of emails) {
        if (await isInAddressBook(email, condition.addressBookId)) {
          return false;
        }
      }
      return emails.length > 0;
    }

    default:
      console.warn("filterMoveMail: Unknown operator:", operator);
      return false;
  }
}

/**
 * Évalue un filtre complet sur un message
 * @param {Object} filter - Filtre à évaluer
 * @param {Object} message - Message Thunderbird
 * @returns {Promise<boolean>}
 */
export async function evaluateFilter(filter, message) {
  if (!filter.enabled || !filter.conditions || filter.conditions.length === 0) {
    return false;
  }

  // Filtrer les conditions valides (avec valeur non vide sauf pour addressbook)
  const validConditions = filter.conditions.filter(
    (c) =>
      c.operator === "in_addressbook" ||
      c.operator === "not_in_addressbook" ||
      (c.value && c.value.trim() !== "")
  );

  if (validConditions.length === 0) return false;

  // Charger le corps du message si nécessaire
  let bodyText = null;
  const needsBody = validConditions.some((c) => c.field === "body");
  if (needsBody) {
    try {
      const fullMsg = await messenger.messages.getFull(message.id);
      bodyText = extractBodyFromParts(fullMsg.parts);
    } catch (e) {
      console.error("filterMoveMail: Error reading message body:", e);
      bodyText = "";
    }
  }

  // Évaluer toutes les conditions
  const results = [];
  for (const c of validConditions) {
    const result = await evaluateCondition(c, message, bodyText);
    results.push(result);
  }

  const finalResult = filter.matchMode === "all"
    ? results.every((r) => r === true)
    : results.some((r) => r === true);

  return finalResult;
}

/**
 * Extrait le texte du corps depuis les parties MIME
 * @param {Array} parts - Parties MIME
 * @returns {string}
 */
function extractBodyFromParts(parts) {
  if (!parts) return "";
  let text = "";
  for (const part of parts) {
    if (part.contentType === "text/plain" && part.body) {
      text += part.body;
    } else if (part.contentType === "text/html" && part.body) {
      // Enlever les tags HTML basiquement
      text += part.body.replace(/<[^>]*>/g, " ");
    }
    if (part.parts) {
      text += extractBodyFromParts(part.parts);
    }
  }
  return text;
}

/**
 * Exécute tous les filtres sur les messages d'un dossier (version optimisée)
 * - Charge les messages UNE SEULE FOIS
 * - Évalue tous les filtres sur chaque message (premier filtre gagnant)
 * - Regroupe les déplacements par destination → un seul move() par destination
 * @param {Array} filters - Filtres ordonnés
 * @param {Object} folder - Dossier source { accountId, path }
 * @param {Object} options - Options { removeOwnEmails: boolean }
 * @returns {Promise<{ totalMoved: number, details: Array }>}
 */
export async function executeFiltersOnFolder(filters, folder, options = {}) {
  const details = [];
  let totalMoved = 0;

  // Charger les messages du dossier UNE SEULE FOIS
  const folderRef = { accountId: folder.accountId, path: folder.path };
  let page = await messenger.messages.list(folderRef);
  let allMessages = [...page.messages];

  while (page.id) {
    page = await messenger.messages.continueList(page.id);
    allMessages.push(...page.messages);
  }

  if (allMessages.length === 0) {
    return { totalMoved: 0, details: [] };
  }

  // Filtrer les filtres actifs et applicables (destination ≠ source)
  const applicableFilters = filters.filter((f) => {
    if (!f.enabled) return false;
    if (!f.action || !f.action.destinationFolderId) return false;
    if (
      f.action.destinationAccountId === folder.accountId &&
      f.action.destinationPath === folder.path
    ) {
      return false;
    }
    return true;
  });

  if (applicableFilters.length === 0) {
    return { totalMoved: 0, details: [] };
  }

  // Initialiser les compteurs par filtre et les groupements par destination
  // Clé = "accountId:path", Valeur = { destination, messageIds }
  const moveGroups = new Map();
  const filterCounts = new Map();
  // Stocker les infos des messages matchés pour le log détaillé
  // filterName → [ { author, subject } ]
  const filterMatchedMessages = new Map();
  for (const f of applicableFilters) {
    filterCounts.set(f.id, 0);
    filterMatchedMessages.set(f.id, []);
  }

  // Pour chaque message, trouver le PREMIER filtre qui matche (priorité par ordre)
  const assignedMessageIds = new Set();

  for (const message of allMessages) {
    for (const filter of applicableFilters) {
      const matches = await evaluateFilter(filter, message);
      if (matches) {
        // Premier filtre gagnant → on arrête pour ce message
        const destKey = `${filter.action.destinationAccountId}:${filter.action.destinationPath}`;

        if (!moveGroups.has(destKey)) {
          moveGroups.set(destKey, {
            destination: {
              accountId: filter.action.destinationAccountId,
              path: filter.action.destinationPath,
            },
            messageIds: [],
          });
        }
        moveGroups.get(destKey).messageIds.push(message.id);
        filterCounts.set(filter.id, filterCounts.get(filter.id) + 1);
        filterMatchedMessages.get(filter.id).push({
          author: message.author || "(inconnu)",
          subject: message.subject || "(sans sujet)",
        });
        assignedMessageIds.add(message.id);
        break; // Premier filtre gagnant
      }
    }
  }

  // Effectuer les déplacements groupés par destination (un seul move() par destination)
  for (const [destKey, group] of moveGroups) {
    if (group.messageIds.length === 0) continue;
    try {
      await messenger.messages.move(group.messageIds, group.destination);
      totalMoved += group.messageIds.length;
    } catch (e) {
      console.error(`filterMoveMail: Error moving ${group.messageIds.length} messages to ${destKey}:`, e);
    }
  }

  // Résumé détaillé par dossier
  const folderLabel = folder.accountName
    ? `${folder.accountName}${folder.path}`
    : folder.path;

  if (totalMoved > 0) {
    const lines = [`filterMoveMail: ${folderLabel} → ${totalMoved} message(s) déplacé(s)`];
    for (const filter of applicableFilters) {
      const count = filterCounts.get(filter.id);
      if (count > 0) {
        lines.push(`  ▸ Filtre "${filter.name}" (${count}) → ${filter.action.destinationPath}`);
        for (const msg of filterMatchedMessages.get(filter.id)) {
          lines.push(`      • ${msg.author} — ${msg.subject}`);
        }
      }
    }
    console.log(lines.join("\n"));
  }

  // Construire les détails par filtre
  for (const filter of applicableFilters) {
    const count = filterCounts.get(filter.id);
    details.push({ filterName: filter.name, movedCount: count });
  }

  return { totalMoved, details };
}

/**
 * Parse une expression de filtre intelligent (syntaxe Gmail-like)
 * Syntaxe : {CHAMP} {OPÉRATEUR} {valeur} [AND|OR ...]
 * Exemple : "FROM contains john@mail.com AND SUBJECT contains facture"
 * @param {string} expression
 * @returns {{ matchMode: string, conditions: Array }|null}
 */
export function parseSmartFilter(expression) {
  if (!expression || expression.trim() === "") return null;

  const fieldMap = {
    FROM: "from",
    TO: "to",
    CC: "cc",
    BCC: "bcc",
    SUBJECT: "subject",
    BODY: "body",
  };

  const operatorMap = {
    contains: "contains",
    not_contains: "not_contains",
    is: "is",
    is_not: "is_not",
    in_addressbook: "in_addressbook",
    not_in_addressbook: "not_in_addressbook",
  };

  // Diviser par AND/OR en respectant les accolades { }
  const { parts, matchMode } = splitByConnectors(expression);

  const conditions = [];
  for (const part of parts) {
    if (!part) continue;

    // Essayer de parser : FIELD operator {value} ou FIELD operator value
    const match = part.match(
      /^(FROM|TO|CC|BCC|SUBJECT|BODY)\s+(contains|not_contains|is|is_not|in_addressbook|not_in_addressbook)(?:\s+(?:\{([^}]*)\}|(.*)))?$/i
    );

    if (match) {
      const field = fieldMap[match[1].toUpperCase()];
      const operator = operatorMap[match[2].toLowerCase()];
      const value = match[3] !== undefined ? match[3] : (match[4] ? match[4].trim() : "");

      conditions.push({
        field,
        operator,
        value,
        addressBookId: null,
      });
    }
  }

  if (conditions.length === 0) return null;

  return { matchMode, conditions };
}

/**
 * Divise une expression Smart Filter par AND/OR sans découper à l'intérieur des accolades { }
 */
function splitByConnectors(expression) {
  const parts = [];
  let current = "";
  let depth = 0;
  const connectors = [];

  for (let i = 0; i < expression.length; i++) {
    const ch = expression[i];
    if (ch === "{") { depth++; current += ch; continue; }
    if (ch === "}") { depth--; current += ch; continue; }

    if (depth === 0) {
      const rest = expression.substring(i);
      let m;
      if ((m = rest.match(/^\s+OR\s+/i))) {
        parts.push(current.trim());
        connectors.push("OR");
        current = "";
        i += m[0].length - 1;
        continue;
      }
      if ((m = rest.match(/^\s+AND\s+/i))) {
        parts.push(current.trim());
        connectors.push("AND");
        current = "";
        i += m[0].length - 1;
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());

  const hasOr = connectors.includes("OR");
  const hasAnd = connectors.includes("AND");
  const matchMode = hasOr && !hasAnd ? "any" : "all";

  return { parts, matchMode };
}
