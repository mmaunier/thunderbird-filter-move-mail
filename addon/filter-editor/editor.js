/**
 * editor.js - Logique de l'éditeur de filtres (fenêtre modale)
 * Gère les conditions, l'arbre de dossiers, le smart filter, etc.
 */

let currentFilter = null;
let currentAccounts = [];
let callbacks = {};
let addressBooks = [];
let selectedDestination = null;

/**
 * Initialise l'éditeur de filtres
 * @param {Object|null} filter - Filtre à éditer (null = nouveau)
 * @param {Array} accounts - Liste des comptes
 * @param {Object} cbs - { onSave, onCancel }
 */
export async function initEditor(filter, accounts, cbs) {
  currentAccounts = accounts;
  callbacks = cbs;

  // Charger les carnets d'adresses
  addressBooks = await messenger.runtime.sendMessage({ command: "getAddressBooks" });

  // Créer ou charger le filtre
  if (filter) {
    currentFilter = filter;
  } else {
    currentFilter = await createEmptyFilter();
  }

  // Traduire l'UI
  i18nUpdateEditorUI();

  // Remplir les champs
  populateEditor();

  // Initialiser les événements
  initEditorEvents();

  // Construire l'arbre des dossiers
  buildFolderTreeUI();
}

async function createEmptyFilter() {
  // Charger les préférences globales pour les appliquer par défaut
  const settings = await messenger.runtime.sendMessage({ command: "getSettings" });
  return {
    id: `filter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: "",
    enabled: true,
    applyOnNewMessage: settings.applyOnNewMessage || false,
    applyManually: settings.applyManually !== undefined ? settings.applyManually : true,
    applyAfterJunk: settings.applyAfterJunk || false,
    matchMode: "any",
    selectedAccounts: { allAccounts: true, accountIds: [] },
    conditions: [
      { field: "from", operator: "contains", value: "", addressBookId: null },
    ],
    action: {
      type: "move",
      destinationFolderId: null,
      destinationAccountId: null,
      destinationPath: null,
    },
  };
}

function i18nUpdateEditorUI() {
  const container = document.querySelector(".editor-container");
  if (!container) return;

  for (const el of container.querySelectorAll("[data-i18n]")) {
    const key = el.getAttribute("data-i18n");
    const msg = messenger.i18n.getMessage(key);
    if (msg) el.textContent = msg;
  }
  for (const el of container.querySelectorAll("[data-i18n-placeholder]")) {
    const key = el.getAttribute("data-i18n-placeholder");
    const msg = messenger.i18n.getMessage(key);
    if (msg) el.placeholder = msg;
  }
}

function populateEditor() {
  // Nom
  document.getElementById("filter-name").value = currentFilter.name || "";

  // Checkboxes d'application
  document.getElementById("editor-on-new").checked = currentFilter.applyOnNewMessage;
  document.getElementById("editor-manual").checked = currentFilter.applyManually;
  document.getElementById("editor-after-junk").checked = currentFilter.applyAfterJunk;

  // Mode de correspondance
  const matchRadios = document.querySelectorAll('input[name="match-mode"]');
  matchRadios.forEach((r) => {
    r.checked = r.value === currentFilter.matchMode;
  });

  // Sélection des comptes pour ce filtre
  populateEditorAccounts();

  // Conditions
  renderConditions();

  // Smart Filter textarea: refléter les conditions actuelles
  updateSmartFilterTextarea();

  // Destination : résoudre le nom du compte et du dossier depuis la liste des comptes
  if (currentFilter.action.destinationPath) {
    const destAccountId = currentFilter.action.destinationAccountId;
    const destPath = currentFilter.action.destinationPath;
    let accountName = destAccountId;
    let folderName = destPath;

    // Chercher le nom du compte dans la liste
    const account = currentAccounts.find((a) => a.id === destAccountId);
    if (account) {
      accountName = account.name;
      // Chercher le nom du dossier dans les dossiers aplatis
      const folder = (account.folders || []).find((f) => f.path === destPath);
      if (folder) {
        folderName = folder.name;
      } else {
        // Fallback : extraire le dernier segment du chemin
        const segments = destPath.split("/").filter(Boolean);
        folderName = segments.length > 0 ? segments[segments.length - 1] : destPath;
      }
    }

    selectedDestination = {
      accountId: destAccountId,
      path: destPath,
      accountName,
      folderName,
    };
    updateFolderDisplay();
  }
}

// ─── Comptes par filtre ───

function populateEditorAccounts() {
  const filterAccounts = currentFilter.selectedAccounts || { allAccounts: true, accountIds: [] };
  const allCb = document.getElementById("editor-account-all");
  allCb.checked = filterAccounts.allAccounts;

  const list = document.getElementById("editor-account-list");
  list.innerHTML = "";

  for (const account of currentAccounts) {
    const div = document.createElement("div");
    div.className = "editor-account-item";
    const isChecked = filterAccounts.allAccounts || filterAccounts.accountIds.includes(account.id);
    div.innerHTML = `
      <label>
        <input type="checkbox" class="editor-account-cb" data-account-id="${account.id}" 
               ${isChecked ? "checked" : ""} ${filterAccounts.allAccounts ? "disabled" : ""}>
        <span>${account.name} (${account.type})</span>
      </label>
    `;
    list.appendChild(div);
  }

  // Événement "Tous les comptes"
  allCb.addEventListener("change", () => {
    const checked = allCb.checked;
    list.querySelectorAll(".editor-account-cb").forEach((cb) => {
      cb.disabled = checked;
      if (checked) {
        cb.checked = true;
      } else {
        cb.checked = false;
      }
    });
  });
}

function getEditorSelectedAccounts() {
  const allChecked = document.getElementById("editor-account-all").checked;
  if (allChecked) {
    return { allAccounts: true, accountIds: [] };
  }
  const accountIds = [];
  document.querySelectorAll(".editor-account-cb:checked").forEach((cb) => {
    accountIds.push(cb.dataset.accountId);
  });
  return { allAccounts: false, accountIds };
}

// ─── Conditions ───

function renderConditions() {
  const list = document.getElementById("conditions-list");
  list.innerHTML = "";

  currentFilter.conditions.forEach((condition, index) => {
    const row = createConditionRow(condition, index);
    list.appendChild(row);
  });

  // Synchroniser le textarea Smart Filter
  updateSmartFilterTextarea();
}

// ─── Smart Filter synchronisation ───

/**
 * Génère le texte Smart Filter à partir des conditions courantes
 */
function conditionsToSmartFilter(conditions, matchMode) {
  const fieldMap = {
    from: "FROM", to: "TO", cc: "CC", bcc: "BCC",
    subject: "SUBJECT", body: "BODY",
  };

  const connector = matchMode === "any" ? " OR " : " AND ";

  return conditions.map((c) => {
    const field = fieldMap[c.field] || c.field.toUpperCase();
    const op = c.operator;
    const value = c.value || "";

    if (op === "in_addressbook" || op === "not_in_addressbook") {
      let abLabel = "*";
      if (c.addressBookId) {
        const book = addressBooks.find((b) => b.id === c.addressBookId);
        abLabel = book ? book.name : c.addressBookId;
      }
      return `${field} ${op} ${abLabel}`;
    }

    const needsBraces = value && (/\s/.test(value) ||
      /\b(AND|OR|contains|not_contains|is|is_not|in_addressbook|not_in_addressbook|FROM|TO|CC|BCC|SUBJECT|BODY)\b/i.test(value));
    const formatted = needsBraces ? `{${value}}` : value;

    return `${field} ${op} ${formatted}`;
  }).join(connector);
}

/**
 * Met à jour le textarea Smart Filter avec les conditions courantes
 */
function updateSmartFilterTextarea() {
  const textarea = document.getElementById("smart-filter-input");
  if (textarea && currentFilter) {
    textarea.value = conditionsToSmartFilter(currentFilter.conditions, currentFilter.matchMode);
  }
}

function createConditionRow(condition, index) {
  const row = document.createElement("div");
  row.className = "condition-row";
  row.dataset.index = index;

  // Champ (De, Pour, Cc, etc.)
  const fieldSelect = document.createElement("select");
  fieldSelect.className = "condition-field";
  const fields = [
    { value: "from", label: messenger.i18n.getMessage("fieldFrom") || "De" },
    { value: "to", label: messenger.i18n.getMessage("fieldTo") || "Pour" },
    { value: "cc", label: messenger.i18n.getMessage("fieldCc") || "Cc" },
    { value: "bcc", label: messenger.i18n.getMessage("fieldBcc") || "Bcc" },
    { value: "subject", label: messenger.i18n.getMessage("fieldSubject") || "Sujet" },
    { value: "body", label: messenger.i18n.getMessage("fieldBody") || "Corps" },
  ];
  fields.forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f.value;
    opt.textContent = f.label;
    opt.selected = f.value === condition.field;
    fieldSelect.appendChild(opt);
  });

  // Opérateur
  const opSelect = document.createElement("select");
  opSelect.className = "condition-operator";
  const operators = [
    { value: "contains", label: messenger.i18n.getMessage("opContains") || "contient" },
    { value: "not_contains", label: messenger.i18n.getMessage("opNotContains") || "ne contient pas" },
    { value: "is", label: messenger.i18n.getMessage("opIs") || "est" },
    { value: "is_not", label: messenger.i18n.getMessage("opIsNot") || "n'est pas" },
    { value: "in_addressbook", label: messenger.i18n.getMessage("opInAddressBook") || "dans carnet" },
    { value: "not_in_addressbook", label: messenger.i18n.getMessage("opNotInAddressBook") || "pas dans carnet" },
  ];
  operators.forEach((o) => {
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    opt.selected = o.value === condition.operator;
    opSelect.appendChild(opt);
  });

  // Valeur (texte ou sélection carnet d'adresses)
  const isAddressBookOp = ["in_addressbook", "not_in_addressbook"].includes(condition.operator);

  const valueInput = document.createElement("input");
  valueInput.type = "text";
  valueInput.className = "condition-value";
  valueInput.value = condition.value || "";
  valueInput.style.display = isAddressBookOp ? "none" : "";

  const abSelect = document.createElement("select");
  abSelect.className = "condition-addressbook";
  abSelect.style.display = isAddressBookOp ? "" : "none";
  const abAll = document.createElement("option");
  abAll.value = "";
  abAll.textContent = "— Tous les carnets —";
  abSelect.appendChild(abAll);
  addressBooks.forEach((book) => {
    const opt = document.createElement("option");
    opt.value = book.id;
    opt.textContent = book.name;
    opt.selected = book.id === condition.addressBookId;
    abSelect.appendChild(opt);
  });

  // Boutons + et -
  const btnAdd = document.createElement("button");
  btnAdd.className = "condition-btn btn-add";
  btnAdd.textContent = "+";
  btnAdd.title = "Ajouter une condition";

  const btnRemove = document.createElement("button");
  btnRemove.className = "condition-btn btn-remove";
  btnRemove.textContent = "−";
  btnRemove.title = "Supprimer cette condition";
  btnRemove.disabled = currentFilter.conditions.length <= 1;

  // Événements
  fieldSelect.addEventListener("change", () => {
    currentFilter.conditions[index].field = fieldSelect.value;
    updateSmartFilterTextarea();
  });

  opSelect.addEventListener("change", () => {
    const op = opSelect.value;
    currentFilter.conditions[index].operator = op;
    const isAB = ["in_addressbook", "not_in_addressbook"].includes(op);
    valueInput.style.display = isAB ? "none" : "";
    abSelect.style.display = isAB ? "" : "none";
    updateSmartFilterTextarea();
  });

  valueInput.addEventListener("input", () => {
    currentFilter.conditions[index].value = valueInput.value;
    updateSmartFilterTextarea();
  });

  abSelect.addEventListener("change", () => {
    currentFilter.conditions[index].addressBookId = abSelect.value || null;
    updateSmartFilterTextarea();
  });

  btnAdd.addEventListener("click", () => {
    currentFilter.conditions.splice(index + 1, 0, {
      field: "from",
      operator: "contains",
      value: "",
      addressBookId: null,
    });
    renderConditions();
  });

  btnRemove.addEventListener("click", () => {
    if (currentFilter.conditions.length > 1) {
      currentFilter.conditions.splice(index, 1);
      renderConditions();
    }
  });

  row.appendChild(fieldSelect);
  row.appendChild(opSelect);
  row.appendChild(valueInput);
  row.appendChild(abSelect);
  row.appendChild(btnAdd);
  row.appendChild(btnRemove);

  return row;
}

// ─── Arbre des dossiers ───

function buildFolderTreeUI() {
  const treeContainer = document.getElementById("folder-tree");
  treeContainer.innerHTML = "";

  for (const account of currentAccounts) {
    const node = createTreeNode(
      {
        label: account.name,
        type: "account",
        icon: "📧",
        children: buildSubFolderNodes(account.folderTree || [], account.id, account.name),
      },
      0
    );
    treeContainer.appendChild(node);
  }
}

function buildSubFolderNodes(folders, accountId, accountName) {
  return (folders || []).map((folder) => ({
    label: folder.name,
    type: "folder",
    path: folder.path,
    accountId,
    accountName,
    icon: getFolderIcon(folder.type),
    children: buildSubFolderNodes(folder.subFolders || [], accountId, accountName),
  }));
}

function getFolderIcon(type) {
  switch (type) {
    case "inbox":
      return "📥";
    case "sent":
      return "📤";
    case "drafts":
      return "📝";
    case "trash":
      return "🗑️";
    case "junk":
      return "⚠️";
    case "templates":
      return "📋";
    case "archives":
      return "📦";
    default:
      return "📁";
  }
}

function createTreeNode(nodeData, depth) {
  const container = document.createElement("div");
  container.className = "tree-node";

  const item = document.createElement("div");
  item.className = "tree-item";
  item.style.paddingLeft = `${depth * 16 + 4}px`;

  // Toggle
  const toggle = document.createElement("span");
  toggle.className = `tree-toggle ${nodeData.children && nodeData.children.length > 0 ? "collapsed" : "leaf"}`;

  // Icône
  const icon = document.createElement("span");
  icon.className = "tree-icon";
  icon.textContent = nodeData.icon || "📁";

  // Label
  const label = document.createElement("span");
  label.className = "tree-label";
  label.textContent = nodeData.label;

  // Label du compte (pour les dossiers)
  if (nodeData.type === "folder" && nodeData.accountName) {
    const accountLabel = document.createElement("span");
    accountLabel.className = "tree-account-label";
    accountLabel.textContent = `(${nodeData.accountName})`;
    label.appendChild(accountLabel);
  }

  item.appendChild(toggle);
  item.appendChild(icon);
  item.appendChild(label);

  // Enfants
  let childrenContainer = null;
  if (nodeData.children && nodeData.children.length > 0) {
    childrenContainer = document.createElement("div");
    childrenContainer.className = "tree-children hidden";
    for (const child of nodeData.children) {
      childrenContainer.appendChild(createTreeNode(child, depth + 1));
    }
  }

  // Événements
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    if (childrenContainer) {
      const isExpanded = toggle.classList.contains("expanded");
      toggle.classList.toggle("expanded", !isExpanded);
      toggle.classList.toggle("collapsed", isExpanded);
      childrenContainer.classList.toggle("hidden", isExpanded);
    }
  });

  item.addEventListener("click", () => {
    if (nodeData.type === "folder") {
      // Sélectionner le dossier comme destination
      document.querySelectorAll(".tree-item.selected").forEach((el) => {
        el.classList.remove("selected");
      });
      item.classList.add("selected");

      selectedDestination = {
        accountId: nodeData.accountId,
        path: nodeData.path,
        accountName: nodeData.accountName,
        folderName: nodeData.label,
      };
      updateFolderDisplay();
    } else if (nodeData.type === "account" && childrenContainer) {
      // Ouvrir/fermer le compte
      const isExpanded = toggle.classList.contains("expanded");
      toggle.classList.toggle("expanded", !isExpanded);
      toggle.classList.toggle("collapsed", isExpanded);
      childrenContainer.classList.toggle("hidden", isExpanded);
    }
  });

  // Double-clic pour ouvrir/fermer
  item.addEventListener("dblclick", () => {
    if (childrenContainer) {
      const isExpanded = toggle.classList.contains("expanded");
      toggle.classList.toggle("expanded", !isExpanded);
      toggle.classList.toggle("collapsed", isExpanded);
      childrenContainer.classList.toggle("hidden", isExpanded);
    }
  });

  container.appendChild(item);
  if (childrenContainer) {
    container.appendChild(childrenContainer);
  }

  return container;
}

function updateFolderDisplay() {
  const display = document.getElementById("selected-folder-display");
  if (selectedDestination) {
    const folderOn = messenger.i18n.getMessage("folderOn") || "sur";
    const name = selectedDestination.folderName || selectedDestination.path;
    const account = selectedDestination.accountName || selectedDestination.accountId;
    display.value = `${name} ${folderOn} ${account}`;
  } else {
    display.value = "";
  }
}

// ─── Recherche dans l'arbre ───

function initFolderSearch() {
  const searchInput = document.getElementById("folder-search");
  if (!searchInput) return;

  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    const tree = document.getElementById("folder-tree");
    const items = tree.querySelectorAll(".tree-item");

    if (!query) {
      // Afficher tout, refermer
      tree.querySelectorAll(".tree-node").forEach((n) => (n.style.display = ""));
      tree.querySelectorAll(".tree-children").forEach((c) => c.classList.add("hidden"));
      tree.querySelectorAll(".tree-toggle").forEach((t) => {
        if (!t.classList.contains("leaf")) {
          t.classList.add("collapsed");
          t.classList.remove("expanded");
        }
      });
      return;
    }

    // Filtrer et ouvrir les branches correspondantes
    items.forEach((item) => {
      const label = item.querySelector(".tree-label");
      const text = label ? label.textContent.toLowerCase() : "";
      const matches = text.includes(query);

      const node = item.closest(".tree-node");
      node.style.display = matches ? "" : "none";

      if (matches) {
        // Ouvrir les parents
        let parent = node.parentElement;
        while (parent) {
          if (parent.classList.contains("tree-children")) {
            parent.classList.remove("hidden");
            const toggle = parent.previousElementSibling?.querySelector(".tree-toggle");
            if (toggle) {
              toggle.classList.add("expanded");
              toggle.classList.remove("collapsed");
            }
          }
          if (parent.classList.contains("tree-node")) {
            parent.style.display = "";
          }
          parent = parent.parentElement;
        }
      }
    });
  });
}

// ─── Événements ───

function initEditorEvents() {
  // Toggle arbre de dossiers
  document.getElementById("btn-choose-folder").addEventListener("click", () => {
    const container = document.getElementById("folder-tree-container");
    container.classList.toggle("hidden");
    if (!container.classList.contains("hidden")) {
      initFolderSearch();
    }
  });

  // Clic sur le champ de dossier
  document.getElementById("selected-folder-display").addEventListener("click", () => {
    const container = document.getElementById("folder-tree-container");
    container.classList.toggle("hidden");
    if (!container.classList.contains("hidden")) {
      initFolderSearch();
    }
  });

  // Smart Filter
  document.getElementById("btn-parse-smart").addEventListener("click", () => {
    const input = document.getElementById("smart-filter-input");
    const expression = input.value.trim();
    if (!expression) return;

    const result = parseSmartFilterLocal(expression);
    if (result) {
      currentFilter.conditions = result.conditions;
      currentFilter.matchMode = result.matchMode;

      // Mettre à jour les radios
      document.querySelectorAll('input[name="match-mode"]').forEach((r) => {
        r.checked = r.value === result.matchMode;
      });

      renderConditions();
      // renderConditions met déjà à jour le textarea
    }
  });

  // Mode de correspondance (radios) → mettre à jour le smart filter
  document.querySelectorAll('input[name="match-mode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      currentFilter.matchMode = radio.value;
      updateSmartFilterTextarea();
    });
  });

  // Sauvegarder
  document.getElementById("btn-save-filter").addEventListener("click", () => {
    if (validateFilter()) {
      // Récupérer les valeurs
      currentFilter.name = document.getElementById("filter-name").value.trim();
      currentFilter.applyOnNewMessage = document.getElementById("editor-on-new").checked;
      currentFilter.applyManually = document.getElementById("editor-manual").checked;
      currentFilter.applyAfterJunk = document.getElementById("editor-after-junk").checked;
      currentFilter.selectedAccounts = getEditorSelectedAccounts();

      const matchMode = document.querySelector('input[name="match-mode"]:checked');
      currentFilter.matchMode = matchMode ? matchMode.value : "all";

      // Nettoyer les valeurs résiduelles des conditions addressbook
      for (const c of currentFilter.conditions) {
        if (c.operator === "in_addressbook" || c.operator === "not_in_addressbook") {
          c.value = "";
        }
      }

      if (selectedDestination) {
        currentFilter.action.destinationAccountId = selectedDestination.accountId;
        currentFilter.action.destinationPath = selectedDestination.path;
        currentFilter.action.destinationFolderId = `${selectedDestination.accountId}:${selectedDestination.path}`;
      }

      callbacks.onSave(currentFilter);
    }
  });

  // Annuler
  document.getElementById("btn-cancel-filter").addEventListener("click", () => {
    callbacks.onCancel();
  });
}

// ─── Validation ───

function validateFilter() {
  const name = document.getElementById("filter-name").value.trim();
  if (!name) {
    alert(messenger.i18n.getMessage("errorNoFilterName") || "Veuillez saisir un nom.");
    document.getElementById("filter-name").focus();
    return false;
  }

  // Vérifier les conditions
  const validConditions = currentFilter.conditions.filter((c) => {
    if (c.operator === "in_addressbook" || c.operator === "not_in_addressbook") {
      return true;
    }
    return c.value && c.value.trim() !== "";
  });

  if (validConditions.length === 0) {
    alert(messenger.i18n.getMessage("errorEmptyRule") || "Règle vide.");
    return false;
  }

  if (!selectedDestination) {
    alert(messenger.i18n.getMessage("errorNoDestination") || "Choisir un dossier.");
    return false;
  }

  return true;
}

// ─── Smart Filter local ───

function parseSmartFilterLocal(expression) {
  const fieldMap = {
    FROM: "from",
    TO: "to",
    CC: "cc",
    BCC: "bcc",
    SUBJECT: "subject",
    BODY: "body",
  };

  // Diviser par AND/OR en respectant les accolades { }
  const { parts, matchMode } = splitByConnectorsLocal(expression);
  const conditions = [];

  for (const part of parts) {
    if (!part) continue;
    const match = part.match(
      /^(FROM|TO|CC|BCC|SUBJECT|BODY)\s+(contains|not_contains|is|is_not|in_addressbook|not_in_addressbook)(?:\s+(?:\{([^}]*)\}|(.*)))?$/i
    );
    if (match) {
      conditions.push({
        field: fieldMap[match[1].toUpperCase()],
        operator: match[2].toLowerCase(),
        value: match[3] !== undefined ? match[3] : (match[4] ? match[4].trim() : ""),
        addressBookId: null,
      });
    }
  }

  return conditions.length > 0 ? { matchMode, conditions } : null;
}

function splitByConnectorsLocal(expression) {
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
