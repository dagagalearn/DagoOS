/* ==========================================================================
   DagoOS — Dago Vault
   --------------------------------------------------------------------------
   Document browser. Metadata-only view of Google Drive files.

   Firestore collection: `vaultFiles`
   Doc shape:
     {
       title, url, driveFileId, category, description, notes,
       tags[], date, starred, viewCount, lastViewedAt,
       uid, createdAt, updatedAt
     }

   Features:
     • Add / edit / delete files (metadata only)
     • Bulk paste import (title | url per line)
     • Smart search with scope selector
     • Tags + category autocomplete from history
     • Star / favorite
     • Recently viewed (localStorage)
     • Sort by date / title / category / updated
     • Grid / list view toggle
     • Bulk select actions
     • Export as JSON
     • Detail modal per file
     • Click-to-copy Drive link
     • Link validation on add
   ========================================================================== */

import { listDocs, addDoc, updateDoc, deleteDoc } from "../core/firestore.js";
import { el, clear, formatDate, todayISO } from "../core/utils.js";


/* --------------------------------------------------------------------------
   1. CONSTANTS
   -------------------------------------------------------------------------- */
const CATEGORIES = [
  "Education", "Memories", "Letters", "Certificates",
  "Finance", "Legal", "Travel", "Others"
];

const RECENT_KEY = "dagoos_vault_recent";
const RECENT_MAX = 10;

const SORT_OPTIONS = [
  { value: "date-desc",   label: "Newest first" },
  { value: "date-asc",    label: "Oldest first" },
  { value: "title-asc",   label: "Title A–Z" },
  { value: "title-desc",  label: "Title Z–A" },
  { value: "category",    label: "Category" },
  { value: "updated",     label: "Recently updated" }
];

const SEARCH_SCOPES = [
  { value: "all",    label: "All fields" },
  { value: "title",  label: "Title + tags" }
];


/* --------------------------------------------------------------------------
   2. SVG ICONS (per category)
   -------------------------------------------------------------------------- */
const CATEGORY_ICONS = {
  Education: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2 9l10-5 10 5-10 5z"/>
    <path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>
  </svg>`,
  Memories: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>`,
  Letters: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <path d="M22 6l-10 7L2 6"/>
  </svg>`,
  Certificates: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="8" r="5"/>
    <path d="M8.5 12.5L7 22l5-3 5 3-1.5-9.5"/>
  </svg>`,
  Finance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="6" width="20" height="12" rx="2"/>
    <circle cx="12" cy="12" r="2"/>
    <path d="M6 12h.01M18 12h.01"/>
  </svg>`,
  Legal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2v20"/>
    <path d="M4 6h16"/>
    <path d="M6 6l-3 7c0 1.5 2 2.5 4 2.5S11 14.5 11 13L8 6"/>
    <path d="M18 6l-3 7c0 1.5 2 2.5 4 2.5S23 14.5 23 13L20 6"/>
  </svg>`,
  Travel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17.8 19.2L16 11l3.5-3.5a2.12 2.12 0 0 0-3-3L13 8 4.8 6.2a1 1 0 0 0-1 1.6l6.4 3.6-2.4 2.4-2.8-.7a1 1 0 0 0-1 1.7l3 2 2 3a1 1 0 0 0 1.7-1l-.7-2.8 2.4-2.4 3.6 6.4a1 1 0 0 0 1.6-1z"/>
  </svg>`,
  Others: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
  </svg>`
};

function iconForCategory(cat) {
  return CATEGORY_ICONS[cat] || CATEGORY_ICONS.Others;
}


/* --------------------------------------------------------------------------
   3. STATE
   -------------------------------------------------------------------------- */
const state = {
  files: [],
  filterCategory: "All",
  filterStarred: false,
  searchQuery: "",
  searchScope: "all",
  sort: "date-desc",
  view: "grid",              // "grid" | "list"
  selected: new Set(),       // ids of bulk-selected files
  editingId: null,
  recent: []                 // from localStorage
};

let refs = {};


/* --------------------------------------------------------------------------
   4. ENTRY POINT
   -------------------------------------------------------------------------- */
export async function initVault() {
  cacheRefs();
  loadRecent();
  bindControls();
  bindForm();
  bindBulkForm();
  bindModal();
  await loadAndRender();
}


function cacheRefs() {
  refs = {
    // Toolbar
    search:        document.getElementById("vault-search"),
    searchScope:   document.getElementById("vault-search-scope"),
    sort:          document.getElementById("vault-sort"),
    viewToggle:    document.getElementById("vault-view-toggle"),
    exportBtn:     document.getElementById("vault-export"),
    tabsRow:       document.getElementById("vault-tabs"),
    starredTab:    document.getElementById("vault-starred-tab"),

    // Grid
    grid:          document.getElementById("vault-grid"),
    empty:         document.getElementById("vault-empty"),

    // Add form
    form:          document.getElementById("vault-form"),
    formTitle:     document.getElementById("vault-form-title"),
    title:         document.getElementById("vault-title"),
    url:           document.getElementById("vault-url"),
    category:      document.getElementById("vault-category"),
    description:   document.getElementById("vault-description"),
    notes:         document.getElementById("vault-notes"),
    tags:          document.getElementById("vault-tags"),
    date:          document.getElementById("vault-date"),
    submit:        document.getElementById("vault-submit"),
    cancel:        document.getElementById("vault-cancel"),
    categoryList:  document.getElementById("vault-category-list"),
    tagsList:      document.getElementById("vault-tags-list"),

    // Bulk paste
    bulkForm:      document.getElementById("vault-bulk-form"),
    bulkText:      document.getElementById("vault-bulk-text"),

    // Bulk actions bar
    bulkBar:       document.getElementById("vault-bulk-bar"),
    bulkCount:     document.getElementById("vault-bulk-count"),
    bulkCategory:  document.getElementById("vault-bulk-category"),
    bulkApply:     document.getElementById("vault-bulk-apply"),
    bulkDelete:    document.getElementById("vault-bulk-delete"),
    bulkClear:     document.getElementById("vault-bulk-clear"),

    // Modal
    modal:         document.getElementById("vault-modal"),
    modalBody:     document.getElementById("vault-modal-body"),
    modalClose:    document.getElementById("vault-modal-close")
  };

  // Populate category dropdown
  if (refs.category) {
    for (const cat of CATEGORIES) {
      refs.category.appendChild(el("option", { value: cat, text: cat }));
    }
  }

  // Populate bulk-category dropdown (for bulk actions)
  if (refs.bulkCategory) {
    for (const cat of CATEGORIES) {
      refs.bulkCategory.appendChild(el("option", { value: cat, text: cat }));
    }
  }

  // Populate search-scope dropdown
  if (refs.searchScope) {
    for (const s of SEARCH_SCOPES) {
      refs.searchScope.appendChild(el("option", { value: s.value, text: s.label }));
    }
    refs.searchScope.value = "all";
  }

  // Populate sort dropdown
  if (refs.sort) {
    for (const s of SORT_OPTIONS) {
      refs.sort.appendChild(el("option", { value: s.value, text: s.label }));
    }
    refs.sort.value = "date-desc";
  }

  // Set today's date
  if (refs.date && !refs.date.value) refs.date.value = todayISO();
}


/* --------------------------------------------------------------------------
   5. LOAD + RENDER
   -------------------------------------------------------------------------- */
async function loadAndRender() {
  try {
    state.files = await listDocs("vaultFiles", {
      orderByField: "date",
      orderDir: "desc"
    });
  } catch (err) {
    console.error("[Vault] Load failed:", err);
    state.files = [];
  }
  renderCategoryTabs();
  renderGrid();
  refreshAutocompleteLists();
  updateBulkBar();
}


/* --------------------------------------------------------------------------
   6. FILTER + SORT + SEARCH HELPERS
   -------------------------------------------------------------------------- */
function getVisibleFiles() {
  let files = [...state.files];

  // Category filter
  if (state.filterCategory !== "All") {
    files = files.filter(f => f.category === state.filterCategory);
  }

  // Starred filter
  if (state.filterStarred) {
    files = files.filter(f => f.starred === true);
  }

  // Search
  const q = state.searchQuery.trim().toLowerCase();
  if (q) {
    files = files.filter(f => {
      if (state.searchScope === "title") {
        return (f.title || "").toLowerCase().includes(q)
            || (f.tags || []).some(t => t.toLowerCase().includes(q));
      }
      // all fields
      const haystack = [
        f.title, f.description, f.notes, f.category, f.date,
        ...(f.tags || [])
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }

  // Sort
  files.sort((a, b) => {
    switch (state.sort) {
      case "date-asc":   return (a.date || "").localeCompare(b.date || "");
      case "title-asc":  return (a.title || "").localeCompare(b.title || "");
      case "title-desc": return (b.title || "").localeCompare(a.title || "");
      case "category":   return (a.category || "").localeCompare(b.category || "");
      case "updated":
        return ((b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
      case "date-desc":
      default:           return (b.date || "").localeCompare(a.date || "");
    }
  });

  return files;
}


/* --------------------------------------------------------------------------
   7. CATEGORY TABS with counts
   -------------------------------------------------------------------------- */
function renderCategoryTabs() {
  if (!refs.tabsRow) return;
  clear(refs.tabsRow);

  const counts = { All: state.files.length };
  for (const f of state.files) {
    const c = f.category || "Others";
    counts[c] = (counts[c] || 0) + 1;
  }

  const tabs = ["All", ...CATEGORIES.filter(c => counts[c])];
  for (const cat of tabs) {
    const btn = el("button", {
      class: "tab" + (state.filterCategory === cat && !state.filterStarred ? " is-active" : ""),
      type: "button",
      "data-cat": cat,
      onclick: () => {
        state.filterCategory = cat;
        state.filterStarred = false;
        renderCategoryTabs();
        renderGrid();
      }
    },
      el("span", { text: cat }),
      el("span", { class: "tab__count", text: String(counts[cat] || 0) })
    );
    refs.tabsRow.appendChild(btn);
  }

  // Starred tab (special)
  if (refs.starredTab) {
    refs.starredTab.classList.toggle("is-active", state.filterStarred);
    const starredCount = state.files.filter(f => f.starred).length;
    refs.starredTab.innerHTML = "";
    refs.starredTab.appendChild(el("span", { text: "Starred" }));
    refs.starredTab.appendChild(el("span", { class: "tab__count", text: String(starredCount) }));
  }
}


/* --------------------------------------------------------------------------
   8. GRID / LIST RENDER
   -------------------------------------------------------------------------- */
function renderGrid() {
  if (!refs.grid) return;
  clear(refs.grid);

  refs.grid.classList.toggle("vault-grid--list", state.view === "list");

  const files = getVisibleFiles();

  if (files.length === 0) {
    refs.empty?.classList.remove("hidden");
    return;
  }
  refs.empty?.classList.add("hidden");

  for (const f of files) {
    refs.grid.appendChild(buildFileCard(f));
  }
}


function buildFileCard(f) {
  const isSelected = state.selected.has(f.id);

  const iconWrap = el("div", { class: "vault-card__icon" });
  iconWrap.innerHTML = iconForCategory(f.category);

  const title = el("div", { class: "vault-card__title", text: f.title || "(untitled)" });

  const metaParts = [f.category, formatDate(f.date)].filter(Boolean);
  const meta = el("div", { class: "vault-card__meta", text: metaParts.join(" · ") });

  const desc = f.description
    ? el("div", { class: "vault-card__desc", text: f.description })
    : null;

  const tags = (f.tags || []).slice(0, 3).map(t =>
    el("span", { class: "tag-chip", text: `#${t}` })
  );
  const tagsRow = tags.length
    ? el("div", { class: "vault-card__tags" }, ...tags)
    : null;

  const starBtn = el("button", {
    class: "vault-card__star" + (f.starred ? " is-starred" : ""),
    type: "button",
    title: f.starred ? "Unstar" : "Star",
    onclick: (e) => { e.stopPropagation(); toggleStar(f); }
  });
  starBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="${f.starred ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>`;

  const checkbox = el("input", {
    type: "checkbox",
    class: "vault-card__check",
    ...(isSelected ? { checked: "checked" } : {}),
    onclick: (e) => { e.stopPropagation(); toggleSelect(f.id); }
  });

  const actions = el("div", { class: "vault-card__actions" },
    el("button", {
      class: "prop-row__btn",
      type: "button",
      title: "Open in Drive",
      onclick: (e) => { e.stopPropagation(); openInDrive(f); }
    }, "Open"),
    el("button", {
      class: "prop-row__btn",
      type: "button",
      title: "Copy link",
      onclick: (e) => { e.stopPropagation(); copyLink(f); }
    }, "Copy"),
    el("button", {
      class: "prop-row__btn",
      type: "button",
      title: "Edit",
      onclick: (e) => { e.stopPropagation(); beginEdit(f); }
    }, "Edit"),
    el("button", {
      class: "prop-row__btn prop-row__btn--danger",
      type: "button",
      title: "Delete",
      onclick: (e) => { e.stopPropagation(); handleDelete(f.id, f.title); }
    }, "Delete")
  );

  return el("div", {
    class: "vault-card" + (isSelected ? " is-selected" : ""),
    onclick: () => openDetail(f)
  },
    el("div", { class: "vault-card__header" },
      checkbox,
      iconWrap,
      title,
      starBtn
    ),
    meta,
    desc,
    tagsRow,
    actions
  );
}


/* --------------------------------------------------------------------------
   9. ADD / EDIT FORM
   -------------------------------------------------------------------------- */
function bindForm() {
  if (!refs.form) return;

  refs.form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const url = (refs.url.value || "").trim();
    if (!url) return alert("Drive link is required.");
    if (!isDriveUrl(url)) {
      if (!confirm("That doesn't look like a Google Drive link. Save anyway?")) return;
    }

    const data = {
      title:       (refs.title.value || "").trim() || "(untitled)",
      url,
      driveFileId: extractDriveId(url) || "",
      category:    refs.category.value || "Others",
      description: (refs.description.value || "").trim(),
      notes:       (refs.notes.value || "").trim(),
      tags:        parseTags(refs.tags.value),
      date:        refs.date.value || todayISO(),
      starred:     false
    };

    try {
      if (state.editingId) {
        await updateDoc("vaultFiles", state.editingId, data);
      } else {
        data.viewCount = 0;
        await addDoc("vaultFiles", data);
      }
      resetForm();
      await loadAndRender();
    } catch (err) {
      console.error("[Vault] Save failed:", err);
      alert("Could not save. Check console.");
    }
  });

  refs.cancel?.addEventListener("click", resetForm);
}


function beginEdit(f) {
  state.editingId = f.id;
  refs.title.value       = f.title || "";
  refs.url.value         = f.url || "";
  refs.category.value    = f.category || "Others";
  refs.description.value = f.description || "";
  refs.notes.value       = f.notes || "";
  refs.tags.value        = (f.tags || []).join(", ");
  refs.date.value        = f.date || todayISO();

  refs.formTitle.textContent = "Edit file";
  refs.submit.textContent    = "Save changes";
  refs.cancel?.classList.remove("hidden");
  refs.form.scrollIntoView({ behavior: "smooth", block: "start" });
}


function resetForm() {
  state.editingId = null;
  refs.form.reset();
  refs.date.value = todayISO();
  refs.formTitle.textContent = "Add file";
  refs.submit.textContent    = "Add file";
  refs.cancel?.classList.add("hidden");
}


/* --------------------------------------------------------------------------
   10. BULK PASTE
   -------------------------------------------------------------------------- */
function bindBulkForm() {
  if (!refs.bulkForm) return;

  refs.bulkForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const raw = (refs.bulkText.value || "").trim();
    if (!raw) return alert("Nothing to import.");

    const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
    const parsed = [];

    for (const line of lines) {
      let title = "", url = "";
      if (line.includes("|")) {
        const [t, u] = line.split("|").map(x => x.trim());
        title = t; url = u;
      } else {
        url = line;
      }
      if (!url) continue;
      parsed.push({
        title: title || "(untitled)",
        url,
        driveFileId: extractDriveId(url) || "",
        category: guessCategory(url, title),
        description: "",
        notes: "",
        tags: [],
        date: todayISO(),
        starred: false,
        viewCount: 0
      });
    }

    if (parsed.length === 0) return alert("No valid lines found.");

    if (!confirm(`Import ${parsed.length} file(s)?`)) return;

    try {
      for (const p of parsed) {
        await addDoc("vaultFiles", p);
      }
      refs.bulkText.value = "";
      await loadAndRender();
      alert(`Imported ${parsed.length} file(s).`);
    } catch (err) {
      console.error("[Vault] Bulk import failed:", err);
      alert("Bulk import failed. Check console.");
    }
  });
}


/* --------------------------------------------------------------------------
   11. URL HELPERS
   -------------------------------------------------------------------------- */
function isDriveUrl(url) {
  return /^https?:\/\/drive\.google\.com\//i.test(url)
      || /^https?:\/\/docs\.google\.com\//i.test(url);
}

function extractDriveId(url) {
  // /file/d/FILE_ID/ or ?id=FILE_ID
  let m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return "";
}

function guessCategory(url, title = "") {
  const text = (title + " " + url).toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|heic)$/.test(text)) return "Memories";
  if (/\.(mp4|mov|avi|mkv|webm)$/.test(text))       return "Others";
  if (/\.(pdf|docx?|txt|rtf)$/.test(text))          return "Letters";
  if (/\.(xlsx?|csv)$/.test(text))                  return "Finance";
  if (/certificate|certificat/i.test(text))         return "Certificates";
  if (/invoice|receipt|tax/i.test(text))            return "Finance";
  if (/passport|license|contract/i.test(text))      return "Legal";
  if (/ticket|flight|visa/i.test(text))             return "Travel";
  return "Others";
}


/* --------------------------------------------------------------------------
   12. TAGS / AUTOCONNECT LISTS
   -------------------------------------------------------------------------- */
function parseTags(raw) {
  return String(raw || "")
    .split(/[,\s]+/)
    .map(t => t.replace(/^#/, "").trim())
    .filter(Boolean);
}


function refreshAutocompleteLists() {
  // Tags
  if (refs.tagsList) {
    clear(refs.tagsList);
    const allTags = new Set();
    for (const f of state.files) {
      for (const t of (f.tags || [])) allTags.add(t);
    }
    for (const t of [...allTags].sort()) {
      refs.tagsList.appendChild(el("option", { value: t }));
    }
  }

  // Custom categories (in case user typed new ones)
  if (refs.categoryList) {
    clear(refs.categoryList);
    const allCats = new Set(CATEGORIES);
    for (const f of state.files) {
      if (f.category) allCats.add(f.category);
    }
    for (const c of [...allCats].sort()) {
      refs.categoryList.appendChild(el("option", { value: c }));
    }
  }
}


/* --------------------------------------------------------------------------
   13. TOGGLE STAR
   -------------------------------------------------------------------------- */
async function toggleStar(f) {
  try {
    await updateDoc("vaultFiles", f.id, { starred: !f.starred });
    f.starred = !f.starred;
    renderCategoryTabs();
    renderGrid();
  } catch (err) {
    console.error("[Vault] Star failed:", err);
  }
}


/* --------------------------------------------------------------------------
   14. OPEN / COPY
   -------------------------------------------------------------------------- */
async function openInDrive(f) {
  window.open(f.url, "_blank", "noopener");
  markViewed(f);
}

async function copyLink(f) {
  try {
    await navigator.clipboard.writeText(f.url);
    // Micro-feedback via title attribute is unreliable; skip for now
  } catch (err) {
    prompt("Copy this link:", f.url);
  }
}

async function markViewed(f) {
  // Recently viewed (localStorage)
  const recent = state.recent.filter(r => r.id !== f.id);
  recent.unshift({ id: f.id, title: f.title, at: Date.now() });
  state.recent = recent.slice(0, RECENT_MAX);
  saveRecent();

  // Increment viewCount in Firestore (fire-and-forget)
  try {
    await updateDoc("vaultFiles", f.id, {
      viewCount: (f.viewCount || 0) + 1,
      lastViewedAt: new Date()
    });
  } catch (_) { /* non-critical */ }
}


/* --------------------------------------------------------------------------
   15. RECENT (localStorage)
   -------------------------------------------------------------------------- */
function loadRecent() {
  try {
    state.recent = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    state.recent = [];
  }
}

function saveRecent() {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(state.recent));
  } catch (_) { /* ignore quota errors */ }
}


/* --------------------------------------------------------------------------
   16. DELETE + BULK ACTIONS
   -------------------------------------------------------------------------- */
async function handleDelete(id, title) {
  if (!confirm(`Delete "${title || "this file"}"?`)) return;
  try {
    await deleteDoc("vaultFiles", id);
    state.selected.delete(id);
    await loadAndRender();
  } catch (err) {
    console.error("[Vault] Delete failed:", err);
  }
}


function toggleSelect(id) {
  if (state.selected.has(id)) state.selected.delete(id);
  else state.selected.add(id);
  renderGrid();
  updateBulkBar();
}


function updateBulkBar() {
  if (!refs.bulkBar) return;
  const n = state.selected.size;
  refs.bulkBar.classList.toggle("hidden", n === 0);
  if (refs.bulkCount) refs.bulkCount.textContent = `${n} selected`;
}


function bindBulkActions() {
  refs.bulkApply?.addEventListener("click", async () => {
    const cat = refs.bulkCategory.value;
    if (!cat) return;
    if (!confirm(`Set category "${cat}" for ${state.selected.size} file(s)?`)) return;

    try {
      for (const id of state.selected) {
        await updateDoc("vaultFiles", id, { category: cat });
      }
      state.selected.clear();
      await loadAndRender();
    } catch (err) {
      console.error("[Vault] Bulk category failed:", err);
    }
  });

  refs.bulkDelete?.addEventListener("click", async () => {
    const n = state.selected.size;
    if (!n) return;
    if (!confirm(`Delete ${n} file(s)? This cannot be undone.`)) return;

    try {
      for (const id of state.selected) {
        await deleteDoc("vaultFiles", id);
      }
      state.selected.clear();
      await loadAndRender();
    } catch (err) {
      console.error("[Vault] Bulk delete failed:", err);
    }
  });

  refs.bulkClear?.addEventListener("click", () => {
    state.selected.clear();
    renderGrid();
    updateBulkBar();
  });
}


/* --------------------------------------------------------------------------
   17. CONTROLS (search, sort, view)
   -------------------------------------------------------------------------- */
function bindControls() {
  // Search (debounced)
  let searchTimer = null;
  refs.search?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.searchQuery = refs.search.value || "";
      renderGrid();
    }, 150);
  });

  refs.searchScope?.addEventListener("change", () => {
    state.searchScope = refs.searchScope.value;
    renderGrid();
  });

  refs.sort?.addEventListener("change", () => {
    state.sort = refs.sort.value;
    renderGrid();
  });

  refs.viewToggle?.addEventListener("click", () => {
    state.view = state.view === "grid" ? "list" : "grid";
    refs.viewToggle.textContent = state.view === "grid" ? "List view" : "Grid view";
    renderGrid();
  });

  refs.starredTab?.addEventListener("click", () => {
    state.filterStarred = !state.filterStarred;
    state.filterCategory = "All";
    renderCategoryTabs();
    renderGrid();
  });

  refs.exportBtn?.addEventListener("click", exportJSON);

  bindBulkActions();
}


/* --------------------------------------------------------------------------
   18. EXPORT AS JSON
   -------------------------------------------------------------------------- */
function exportJSON() {
  const data = {
    exportedAt: new Date().toISOString(),
    count: state.files.length,
    files: state.files
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dagoos-vault-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}


/* --------------------------------------------------------------------------
   19. DETAIL MODAL
   -------------------------------------------------------------------------- */
function bindModal() {
  refs.modalClose?.addEventListener("click", closeModal);
  refs.modal?.addEventListener("click", (e) => {
    if (e.target === refs.modal) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}


function openDetail(f) {
  if (!refs.modal || !refs.modalBody) return;
  clear(refs.modalBody);

  const iconWrap = el("div", { class: "vault-modal__icon" });
  iconWrap.innerHTML = iconForCategory(f.category);

  refs.modalBody.appendChild(el("div", { class: "vault-modal__header" },
    iconWrap,
    el("div", {},
      el("div", { class: "vault-modal__title", text: f.title || "(untitled)" }),
      el("div", { class: "vault-modal__meta",
        text: [f.category, formatDate(f.date)].filter(Boolean).join(" · ") })
    )
  ));

  if (f.description) {
    refs.modalBody.appendChild(
      el("div", { class: "vault-modal__section" },
        el("div", { class: "vault-modal__label", text: "Description" }),
        el("div", { text: f.description })
      )
    );
  }

  if (f.notes) {
    refs.modalBody.appendChild(
      el("div", { class: "vault-modal__section" },
        el("div", { class: "vault-modal__label", text: "Notes" }),
        el("div", { class: "vault-modal__notes", text: f.notes })
      )
    );
  }

  if ((f.tags || []).length) {
    refs.modalBody.appendChild(
      el("div", { class: "vault-modal__section" },
        el("div", { class: "vault-modal__label", text: "Tags" }),
        el("div", { class: "vault-modal__tags" },
          ...f.tags.map(t => el("span", { class: "tag-chip", text: `#${t}` }))
        )
      )
    );
  }

  refs.modalBody.appendChild(
    el("div", { class: "vault-modal__actions" },
      el("button", {
        class: "btn btn--primary",
        type: "button",
        onclick: () => { openInDrive(f); closeModal(); }
      }, "Open in Drive"),
      el("button", {
        class: "btn btn--ghost",
        type: "button",
        onclick: () => { copyLink(f); }
      }, "Copy link"),
      el("button", {
        class: "btn btn--ghost",
        type: "button",
        onclick: () => { beginEdit(f); closeModal(); }
      }, "Edit"),
      el("button", {
        class: "btn btn--danger",
        type: "button",
        onclick: () => { handleDelete(f.id, f.title); closeModal(); }
      }, "Delete")
    )
  );

  refs.modal.classList.remove("hidden");
  markViewed(f);
}


function closeModal() {
  refs.modal?.classList.add("hidden");
}


/* --------------------------------------------------------------------------
   20. HELPERS
   -------------------------------------------------------------------------- */
// no-op placeholder for future helpers
