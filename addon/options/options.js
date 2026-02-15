/**
 * options.js - Logique de la page d'administration
 * Gère les 2 onglets (Appliquer filtres / Gestion des filtres)
 */

// ─── État local ───
let filters = [];
let selectedFilterIndex = -1;
let accounts = [];
let addressBooks = [];

// ─── Utilitaire Smart Filter ───

/**
 * Génère le texte Smart Filter à partir des conditions d'un filtre
 */
function conditionsToSmartFilterText(filter) {
  if (!filter.conditions || filter.conditions.length === 0) return "";

  const fieldMap = {
    from: "FROM", to: "TO", cc: "CC", bcc: "BCC",
    subject: "SUBJECT", body: "BODY",
  };

  const connector = filter.matchMode === "any" ? " OR " : " AND ";

  return filter.conditions.map((c) => {
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

// ─── Initialisation ───
document.addEventListener("DOMContentLoaded", async () => {
  await i18nUpdateDocument();
  initTabs();
  await loadSettingsUI();
  await loadAccountsData();
  await loadFiltersUI();
  initToolbar();
  initFilterActions();
  initExecuteSection();
});

// ─── i18n ───
async function i18nUpdateDocument() {
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const key = el.getAttribute("data-i18n");
    const msg = messenger.i18n.getMessage(key);
    if (msg) el.textContent = msg;
  }
  for (const el of document.querySelectorAll("[data-i18n-title]")) {
    const key = el.getAttribute("data-i18n-title");
    const msg = messenger.i18n.getMessage(key);
    if (msg) el.title = msg;
  }
}

// ─── Onglets ───
function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });
}

// ─── TAB 1 : Préférences ───
async function loadSettingsUI() {
  const settings = await messenger.runtime.sendMessage({ command: "getSettings" });

  document.getElementById("opt-on-new-message").checked = settings.applyOnNewMessage;
  document.getElementById("opt-manual").checked = settings.applyManually;
  document.getElementById("opt-after-junk").checked = settings.applyAfterJunk;
  document.getElementById("opt-remove-own").checked = settings.removeOwnEmails;

  // Écouter les changements
  for (const id of ["opt-on-new-message", "opt-manual", "opt-after-junk", "opt-remove-own"]) {
    document.getElementById(id).addEventListener("change", saveSettingsFromUI);
  }
}

async function saveSettingsFromUI() {
  const settings = {
    applyOnNewMessage: document.getElementById("opt-on-new-message").checked,
    applyManually: document.getElementById("opt-manual").checked,
    applyAfterJunk: document.getElementById("opt-after-junk").checked,
    removeOwnEmails: document.getElementById("opt-remove-own").checked,
  };
  await messenger.runtime.sendMessage({ command: "saveSettings", settings });
}

// ─── Comptes (données uniquement, la sélection est dans chaque filtre) ───
async function loadAccountsData() {
  accounts = await messenger.runtime.sendMessage({ command: "getAccounts" });
  addressBooks = await messenger.runtime.sendMessage({ command: "getAddressBooks" });
}

// ─── Filtres ───
async function loadFiltersUI() {
  filters = await messenger.runtime.sendMessage({ command: "getFilters" });
  renderFilterList();
}

function renderFilterList() {
  const tbody = document.getElementById("filter-list-body");
  tbody.innerHTML = "";

  for (let i = 0; i < filters.length; i++) {
    const filter = filters[i];
    const tr = document.createElement("tr");
    tr.dataset.index = i;
    if (i === selectedFilterIndex) tr.classList.add("selected");

    const smartText = conditionsToSmartFilterText(filter);
    const destPath = filter.action && filter.action.destinationPath
      ? filter.action.destinationPath
      : "";
    tr.innerHTML = `
      <td class="td-name">${escapeHtml(filter.name || "(sans nom)")}</td>
      <td class="td-smart" title="${escapeHtml(smartText)}">${escapeHtml(smartText)}</td>
      <td class="td-destination" title="${escapeHtml(destPath)}">${escapeHtml(destPath)}</td>
      <td class="td-active">
        <input type="checkbox" class="filter-active-cb" data-index="${i}" ${filter.enabled ? "checked" : ""}>
      </td>
    `;

    tr.addEventListener("click", (e) => {
      if (e.target.type === "checkbox") return;
      selectFilter(i);
    });

    tr.addEventListener("dblclick", (e) => {
      if (e.target.type === "checkbox") return;
      openFilterEditor(i);
    });

    tbody.appendChild(tr);
  }

  // Écouter les changements d'activation
  tbody.querySelectorAll(".filter-active-cb").forEach((cb) => {
    cb.addEventListener("change", async (e) => {
      const idx = parseInt(e.target.dataset.index);
      filters[idx].enabled = e.target.checked;
      await saveFiltersToStorage();
    });
  });

  updateFilterActionButtons();
}

function selectFilter(index) {
  selectedFilterIndex = index;
  document.querySelectorAll("#filter-list-body tr").forEach((tr) => {
    tr.classList.toggle("selected", parseInt(tr.dataset.index) === index);
  });
  updateFilterActionButtons();
}

function updateFilterActionButtons() {
  const hasSelection = selectedFilterIndex >= 0 && selectedFilterIndex < filters.length;
  document.getElementById("btn-edit").disabled = !hasSelection;
  document.getElementById("btn-delete").disabled = !hasSelection;
  document.getElementById("btn-toolbar-delete").disabled = !hasSelection;
  document.getElementById("btn-toolbar-edit").disabled = !hasSelection;
  document.getElementById("btn-clone").disabled = !hasSelection;
  document.getElementById("btn-move-top").disabled = !hasSelection || selectedFilterIndex === 0;
  document.getElementById("btn-move-up").disabled = !hasSelection || selectedFilterIndex === 0;
  document.getElementById("btn-move-down").disabled = !hasSelection || selectedFilterIndex >= filters.length - 1;
  document.getElementById("btn-move-bottom").disabled = !hasSelection || selectedFilterIndex >= filters.length - 1;
}

async function saveFiltersToStorage() {
  await messenger.runtime.sendMessage({ command: "saveFilters", filters });
}

// ─── Actions filtres ───
function initFilterActions() {
  document.getElementById("btn-new").addEventListener("click", () => openFilterEditor(-1));
  document.getElementById("btn-edit").addEventListener("click", () => {
    if (selectedFilterIndex >= 0) openFilterEditor(selectedFilterIndex);
  });
  document.getElementById("btn-delete").addEventListener("click", deleteSelectedFilter);
  document.getElementById("btn-move-top").addEventListener("click", () => moveFilter("top"));
  document.getElementById("btn-move-up").addEventListener("click", () => moveFilter("up"));
  document.getElementById("btn-move-down").addEventListener("click", () => moveFilter("down"));
  document.getElementById("btn-move-bottom").addEventListener("click", () => moveFilter("bottom"));
}

async function deleteSelectedFilter() {
  if (selectedFilterIndex < 0) return;

  const msg = messenger.i18n.getMessage("confirmDelete");
  if (!confirm(msg)) return;

  filters.splice(selectedFilterIndex, 1);
  selectedFilterIndex = Math.min(selectedFilterIndex, filters.length - 1);
  await saveFiltersToStorage();
  renderFilterList();
}

async function moveFilter(direction) {
  if (selectedFilterIndex < 0) return;
  const idx = selectedFilterIndex;
  let newIdx;

  switch (direction) {
    case "top":
      newIdx = 0;
      break;
    case "up":
      newIdx = idx - 1;
      break;
    case "down":
      newIdx = idx + 1;
      break;
    case "bottom":
      newIdx = filters.length - 1;
      break;
    default:
      return;
  }

  if (newIdx < 0 || newIdx >= filters.length) return;

  const [filter] = filters.splice(idx, 1);
  filters.splice(newIdx, 0, filter);
  selectedFilterIndex = newIdx;

  await saveFiltersToStorage();
  renderFilterList();
}

// ─── Toolbar (Nouveau/Supprimer/Cloner/Sauvegarder/Restaurer) ───
function initToolbar() {
  document.getElementById("btn-toolbar-new").addEventListener("click", () => openFilterEditor(-1));
  document.getElementById("btn-toolbar-delete").addEventListener("click", deleteSelectedFilter);
  document.getElementById("btn-toolbar-edit").addEventListener("click", () => {
    if (selectedFilterIndex >= 0) openFilterEditor(selectedFilterIndex);
  });
  document.getElementById("btn-clone").addEventListener("click", cloneFilter);
  document.getElementById("btn-save-config").addEventListener("click", saveConfig);
  document.getElementById("btn-restore-config").addEventListener("click", restoreConfig);
}

async function cloneFilter() {
  if (selectedFilterIndex < 0) return;
  const source = filters[selectedFilterIndex];
  const clone = JSON.parse(JSON.stringify(source));
  clone.id = `filter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  clone.name = source.name + " (clone)";
  filters.splice(selectedFilterIndex + 1, 0, clone);
  selectedFilterIndex = selectedFilterIndex + 1;
  await saveFiltersToStorage();
  renderFilterList();
}

async function saveConfig() {
  const config = await messenger.runtime.sendMessage({ command: "exportConfig" });
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `filter-move-mail-config-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showStatus(messenger.i18n.getMessage("exportSuccess"));
}

function restoreConfig() {
  const input = document.getElementById("import-file-input");
  input.value = "";
  input.addEventListener(
    "change",
    async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const config = JSON.parse(text);
        await messenger.runtime.sendMessage({ command: "importConfig", config });
        await loadSettingsUI();
        await loadFiltersUI();
        showStatus(messenger.i18n.getMessage("importSuccess"));
      } catch (err) {
        alert(messenger.i18n.getMessage("importError"));
        console.error("filterMoveMail: Import error:", err);
      }
    },
    { once: true }
  );
  input.click();
}

// ─── Exécution ───
function initExecuteSection() {
  document.getElementById("btn-execute").addEventListener("click", executeFilters);
}

async function executeFilters() {
  const scope = document.getElementById("execute-scope").value;
  const btn = document.getElementById("btn-execute");
  const statusEl = document.getElementById("execute-status");

  btn.disabled = true;
  statusEl.textContent = "⏳ ...";

  try {
    let result;
    if (scope === "all") {
      result = await messenger.runtime.sendMessage({ command: "runAllFilters" });
    } else {
      if (selectedFilterIndex < 0) {
        statusEl.textContent = messenger.i18n.getMessage("noFilterSelected");
        btn.disabled = false;
        return;
      }
      result = await messenger.runtime.sendMessage({
        command: "runSelectedFilter",
        filterId: filters[selectedFilterIndex].id,
      });
    }

    const msg = messenger.i18n.getMessage("filtersExecuted");
    statusEl.textContent = `✅ ${msg} (${result.totalMoved} message(s))`;
  } catch (e) {
    statusEl.textContent = `❌ Error: ${e.message}`;
    console.error("filterMoveMail: Execution error:", e);
  }

  btn.disabled = false;
  setTimeout(() => {
    statusEl.textContent = "";
  }, 5000);
}

// ─── Éditeur de filtres (modal) ───
async function openFilterEditor(filterIndex) {
  const overlay = document.getElementById("filter-editor-overlay");
  const content = overlay.querySelector(".modal-content");

  // Recharger les comptes et carnets d'adresses (pour refléter les changements dans TB)
  await loadAccountsData();

  // Charger le HTML de l'éditeur
  const response = await fetch("../filter-editor/editor.html");
  const html = await response.text();
  content.innerHTML = html;

  // Charger le CSS si pas déjà chargé
  if (!document.querySelector('link[href="../filter-editor/editor.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "../filter-editor/editor.css";
    document.head.appendChild(link);
  }

  overlay.classList.remove("hidden");

  // Charger et initialiser le script de l'éditeur
  const { initEditor } = await import("../filter-editor/editor.js");
  const filter = filterIndex >= 0 ? JSON.parse(JSON.stringify(filters[filterIndex])) : null;

  initEditor(filter, accounts, {
    onSave: async (savedFilter) => {
      if (filterIndex >= 0) {
        filters[filterIndex] = savedFilter;
      } else {
        filters.push(savedFilter);
        selectedFilterIndex = filters.length - 1;
      }
      await saveFiltersToStorage();
      renderFilterList();
      overlay.classList.add("hidden");
    },
    onCancel: () => {
      overlay.classList.add("hidden");
    },
  });
}

// ─── Utilitaires ───
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showStatus(message) {
  const statusEl = document.getElementById("execute-status");
  if (statusEl) {
    statusEl.textContent = message;
    setTimeout(() => {
      statusEl.textContent = "";
    }, 3000);
  }
}
