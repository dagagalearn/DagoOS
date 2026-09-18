/* ==========================================================================
   DagoOS — Dago Life Tree
   --------------------------------------------------------------------------
   Vertical timeline of life milestones. Firestore collection: `milestones`.

   Doc shape:
     {
       title, description, notes,
       date, category, status,
       uid, createdAt, updatedAt
     }

   Features:
     • Add / edit / delete milestones
     • Vertical timeline with curved SVG connectors
     • Categories with colored SVG icons
     • Statuses: completed / in-progress / planned
     • Filter by category, filter by status
     • Search across title / description / notes / category
     • Sort by date (asc / desc)
     • Detail modal with full markdown
   ========================================================================== */

import { listDocs, addDoc, updateDoc, deleteDoc } from "../core/firestore.js";
import { el, clear, formatDate, todayISO } from "../core/utils.js";
import { renderMarkdown } from "../services/markdown.js";


/* --------------------------------------------------------------------------
   1. CONSTANTS
   -------------------------------------------------------------------------- */
const CATEGORIES = [
  "Education", "Career", "Personal", "Health",
  "Relationships", "Achievement", "Travel", "Other"
];

const STATUSES = [
  { value: "completed",   label: "Completed" },
  { value: "in-progress", label: "In progress" },
  { value: "planned",     label: "Planned" }
];

const SORT_OPTIONS = [
  { value: "date-asc",  label: "Oldest first" },
  { value: "date-desc", label: "Newest first" }
];


/* --------------------------------------------------------------------------
   2. SVG ICONS per category
   -------------------------------------------------------------------------- */
const CATEGORY_ICONS = {
  Education: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2 9l10-5 10 5-10 5z"/>
    <path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>
  </svg>`,
  Career: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2"/>
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>`,
  Personal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>
  </svg>`,
  Health: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>`,
  Relationships: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>`,
  Achievement: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="8" r="6"/>
    <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>
  </svg>`,
  Travel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17.8 19.2L16 11l3.5-3.5a2.12 2.12 0 0 0-3-3L13 8 4.8 6.2a1 1 0 0 0-1 1.6l6.4 3.6-2.4 2.4-2.8-.7a1 1 0 0 0-1 1.7l3 2 2 3a1 1 0 0 0 1.7-1l-.7-2.8 2.4-2.4 3.6 6.4a1 1 0 0 0 1.6-1z"/>
  </svg>`,
  Other: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 8v4l3 3"/>
  </svg>`
};

function iconForCategory(cat) {
  return CATEGORY_ICONS[cat] || CATEGORY_ICONS.Other;
}

// Accent colors per category (subtle, harmonized with the theme)
const CATEGORY_COLORS = {
  Education:     "#6366f1",
  Career:        "#22c55e",
  Personal:      "#38bdf8",
  Health:        "#ef4444",
  Relationships: "#ec4899",
  Achievement:   "#f59e0b",
  Travel:        "#06b6d4",
  Other:         "#9aa3b8"
};

function colorForCategory(cat) {
  return CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other;
}


/* --------------------------------------------------------------------------
   3. STATE
   -------------------------------------------------------------------------- */
const state = {
  milestones: [],
  filterCategory: "All",
  filterStatus: "All",
  searchQuery: "",
  sort: "date-asc",
  editingId: null
};

let refs = {};


/* --------------------------------------------------------------------------
   4. ENTRY POINT
   -------------------------------------------------------------------------- */
export async function initLifeTree() {
  cacheRefs();
  bindControls();
  bindForm();
  bindModal();
  await loadAndRender();
}


function cacheRefs() {
  refs = {
    // Toolbar
    search:        document.getElementById("tree-search"),
    sort:          document.getElementById("tree-sort"),
    filterCat:     document.getElementById("tree-filter-category"),
    filterStatus:  document.getElementById("tree-filter-status"),

    // Timeline
    timeline:      document.getElementById("tree-timeline"),
    empty:         document.getElementById("tree-empty"),

    // FAB
    fab:           document.getElementById("tree-fab"),

    // Add/Edit modal
    addModal:      document.getElementById("tree-add-modal"),
    addClose:      document.getElementById("tree-add-close"),
    addTitle:      document.getElementById("tree-add-title"),
    form:          document.getElementById("tree-form"),
    title:         document.getElementById("tree-title"),
    date:          document.getElementById("tree-date"),
    category:      document.getElementById("tree-category"),
    status:        document.getElementById("tree-status"),
    description:   document.getElementById("tree-description"),
    notes:         document.getElementById("tree-notes"),
    submit:        document.getElementById("tree-submit"),
    cancel:        document.getElementById("tree-cancel"),

    // Detail modal
    modal:         document.getElementById("tree-modal"),
    modalBody:     document.getElementById("tree-modal-body"),
    modalClose:    document.getElementById("tree-modal-close")
  };

  // Populate category dropdown
  if (refs.category) {
    for (const cat of CATEGORIES) {
      refs.category.appendChild(el("option", { value: cat, text: cat }));
    }
    refs.category.value = "Education";
  }

  // Populate status dropdown
  if (refs.status) {
    for (const s of STATUSES) {
      refs.status.appendChild(el("option", { value: s.value, text: s.label }));
    }
    refs.status.value = "completed";
  }

  // Populate sort dropdown
  if (refs.sort) {
    for (const s of SORT_OPTIONS) {
      refs.sort.appendChild(el("option", { value: s.value, text: s.label }));
    }
    refs.sort.value = "date-asc";
  }

  // Populate filter category dropdown
  if (refs.filterCat) {
    refs.filterCat.appendChild(el("option", { value: "All", text: "All categories" }));
    for (const cat of CATEGORIES) {
      refs.filterCat.appendChild(el("option", { value: cat, text: cat }));
    }
  }

  // Populate filter status dropdown
  if (refs.filterStatus) {
    refs.filterStatus.appendChild(el("option", { value: "All", text: "All statuses" }));
    for (const s of STATUSES) {
      refs.filterStatus.appendChild(el("option", { value: s.value, text: s.label }));
    }
  }

  if (refs.date && !refs.date.value) refs.date.value = todayISO();
}


/* --------------------------------------------------------------------------
   5. LOAD + RENDER
   -------------------------------------------------------------------------- */
async function loadAndRender() {
  try {
    state.milestones = await listDocs("milestones", {
      orderByField: "date",
      orderDir: "asc"
    });
  } catch (err) {
    console.error("[LifeTree] Load failed:", err);
    state.milestones = [];
  }
  renderTimeline();
}


/* --------------------------------------------------------------------------
   6. FILTER / SORT
   -------------------------------------------------------------------------- */
function getVisibleMilestones() {
  let ms = [...state.milestones];

  // Filter by category
  if (state.filterCategory !== "All") {
    ms = ms.filter(m => m.category === state.filterCategory);
  }

  // Filter by status
  if (state.filterStatus !== "All") {
    ms = ms.filter(m => m.status === state.filterStatus);
  }

  // Search
  const q = state.searchQuery.trim().toLowerCase();
  if (q) {
    ms = ms.filter(m => {
      const hay = [
        m.title, m.description, m.notes, m.category
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  // Sort
  ms.sort((a, b) => {
    const da = a.date || "";
    const db = b.date || "";
    if (state.sort === "date-desc") return db.localeCompare(da);
    return da.localeCompare(db);
  });

  return ms;
}


/* --------------------------------------------------------------------------
   7. TIMELINE RENDER
   -------------------------------------------------------------------------- */
function renderTimeline() {
  if (!refs.timeline) return;
  clear(refs.timeline);

  const ms = getVisibleMilestones();

  if (ms.length === 0) {
    refs.empty?.classList.remove("hidden");
    return;
  }
  refs.empty?.classList.add("hidden");

  // Container holds the cards + SVG overlay
  const container = el("div", { class: "timeline" });

  // Build nodes
  ms.forEach((m, i) => {
    const isLast = i === ms.length - 1;
    container.appendChild(buildMilestoneCard(m, isLast));
  });

  refs.timeline.appendChild(container);

  // After cards are in the DOM, draw the SVG connectors
  requestAnimationFrame(() => drawConnectors(container));
}


function buildMilestoneCard(m, isLast) {
  const color = colorForCategory(m.category);
  const statusClass = `timeline-card--${m.status || "completed"}`;

  const iconWrap = el("div", { class: "timeline-card__icon" });
  iconWrap.style.color = color;
  iconWrap.style.background = color + "20"; // 12% alpha
  iconWrap.innerHTML = iconForCategory(m.category);

  const title = el("div", { class: "timeline-card__title", text: m.title || "(untitled)" });

  const meta = el("div", { class: "timeline-card__meta" },
    el("span", { class: "timeline-card__date", text: formatDate(m.date) }),
    el("span", { class: "timeline-card__category", text: m.category || "Other", style: `color:${color}` }),
    m.status && m.status !== "completed"
      ? el("span", { class: `timeline-card__status timeline-card__status--${m.status}`,
          text: m.status === "in-progress" ? "In progress" : "Planned" })
      : null
  );

  const desc = m.description
    ? el("div", { class: "timeline-card__desc", text: m.description })
    : null;

  const card = el("div", {
    class: `timeline-card ${statusClass}`,
    onclick: () => openDetail(m)
  },
    el("div", { class: "timeline-card__inner" },
      iconWrap,
      el("div", { class: "timeline-card__body" },
        title,
        meta,
        desc
      )
    ),
    // The "stem" that SVG lines will connect to
    !isLast ? el("div", { class: "timeline-card__stem-bottom" }) : null,
    el("div", { class: "timeline-card__stem-top" })
  );

  return el("div", { class: "timeline-node" },
    el("div", { class: "timeline-node__card-wrap" }, card),
    !isLast ? el("div", { class: "timeline-node__gap" }) : null
  );
}


/* --------------------------------------------------------------------------
   8. SVG CONNECTORS
   --------------------------------------------------------------------------
   Between every pair of cards, draw a smooth S-curve SVG path.
   Runs after DOM is laid out so we can measure positions.
   -------------------------------------------------------------------------- */
function drawConnectors(container) {
  // Remove any previous SVG
  const oldSvg = container.querySelector(".timeline-svg");
  if (oldSvg) oldSvg.remove();

  const nodes = container.querySelectorAll(".timeline-node");
  if (nodes.length < 2) return;

  const containerRect = container.getBoundingClientRect();

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "timeline-svg");
  svg.setAttribute("width", containerRect.width);
  svg.setAttribute("height", containerRect.height);
  svg.style.position = "absolute";
  svg.style.top = "0";
  svg.style.left = "0";
  svg.style.pointerEvents = "none";
  svg.style.zIndex = "0";

  const color = "var(--color-border)";

  for (let i = 0; i < nodes.length - 1; i++) {
    const currentCard = nodes[i].querySelector(".timeline-card");
    const nextCard = nodes[i + 1].querySelector(".timeline-card");
    if (!currentCard || !nextCard) continue;

    const curRect = currentCard.getBoundingClientRect();
    const nxtRect = nextCard.getBoundingClientRect();

    // Start: bottom-center of current card
    const x1 = curRect.left - containerRect.left + curRect.width / 2;
    const y1 = curRect.bottom - containerRect.top;

    // End: top-center of next card
    const x2 = nxtRect.left - containerRect.left + nxtRect.width / 2;
    const y2 = nxtRect.top - containerRect.top;

    // Control points: extend straight down then curve across
    const gap = y2 - y1;
    const c1y = y1 + gap * 0.5;
    const c2y = y2 - gap * 0.5;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${c1y}, ${x2} ${c2y}, ${x2} ${y2}`);
    path.setAttribute("stroke", color);
    path.setAttribute("stroke-width", "2");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "round");
    svg.appendChild(path);
  }

  container.style.position = "relative";
  container.insertBefore(svg, container.firstChild);
}


/* --------------------------------------------------------------------------
   9. ADD / EDIT
   -------------------------------------------------------------------------- */
function bindForm() {
  if (!refs.form) return;

  refs.form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const data = {
      title:       (refs.title.value || "").trim(),
      date:        refs.date.value || todayISO(),
      category:    refs.category.value || "Other",
      status:      refs.status.value || "completed",
      description: (refs.description.value || "").trim(),
      notes:       (refs.notes.value || "").trim()
    };

    if (!data.title) return alert("Title is required.");

    try {
      if (state.editingId) {
        await updateDoc("milestones", state.editingId, data);
      } else {
        await addDoc("milestones", data);
      }
      resetForm();
      closeAddModal();
      await loadAndRender();
    } catch (err) {
      console.error("[LifeTree] Save failed:", err);
      alert("Could not save. Check console.");
    }
  });

  refs.cancel?.addEventListener("click", () => {
    resetForm();
    closeAddModal();
  });
}


function beginEdit(m) {
  state.editingId = m.id;
  refs.title.value       = m.title || "";
  refs.date.value        = m.date || todayISO();
  refs.category.value    = m.category || "Other";
  refs.status.value      = m.status || "completed";
  refs.description.value = m.description || "";
  refs.notes.value       = m.notes || "";

  refs.addTitle.textContent = "Edit milestone";
  refs.submit.textContent   = "Save changes";
  refs.addModal.classList.remove("hidden");
}


function resetForm() {
  state.editingId = null;
  refs.form.reset();
  refs.date.value     = todayISO();
  refs.category.value = "Education";
  refs.status.value   = "completed";
}


/* --------------------------------------------------------------------------
   10. DELETE
   -------------------------------------------------------------------------- */
async function handleDelete(id, title) {
  if (!confirm(`Delete "${title || "this milestone"}"?`)) return;
  try {
    await deleteDoc("milestones", id);
    await loadAndRender();
  } catch (err) {
    console.error("[LifeTree] Delete failed:", err);
  }
}


/* --------------------------------------------------------------------------
   11. CONTROLS
   -------------------------------------------------------------------------- */
function bindControls() {
  let searchTimer = null;
  refs.search?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.searchQuery = refs.search.value || "";
      renderTimeline();
    }, 150);
  });

  refs.sort?.addEventListener("change", () => {
    state.sort = refs.sort.value;
    renderTimeline();
  });

  refs.filterCat?.addEventListener("change", () => {
    state.filterCategory = refs.filterCat.value;
    renderTimeline();
  });

  refs.filterStatus?.addEventListener("change", () => {
    state.filterStatus = refs.filterStatus.value;
    renderTimeline();
  });

  refs.fab?.addEventListener("click", () => openAddModal());
}


/* --------------------------------------------------------------------------
   12. MODALS
   -------------------------------------------------------------------------- */
function bindModal() {
  refs.addClose?.addEventListener("click", closeAddModal);
  refs.addModal?.addEventListener("click", (e) => {
    if (e.target === refs.addModal) closeAddModal();
  });

  refs.modalClose?.addEventListener("click", closeDetailModal);
  refs.modal?.addEventListener("click", (e) => {
    if (e.target === refs.modal) closeDetailModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!refs.addModal?.classList.contains("hidden")) closeAddModal();
      if (!refs.modal?.classList.contains("hidden")) closeDetailModal();
    }
  });

  // Redraw connectors on resize
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const container = refs.timeline?.querySelector(".timeline");
      if (container) drawConnectors(container);
    }, 200);
  });
}


function openAddModal(m = null) {
  if (m) beginEdit(m);
  else {
    resetForm();
    refs.addTitle.textContent = "Add milestone";
    refs.submit.textContent   = "Add milestone";
  }
  refs.addModal.classList.remove("hidden");
}


function closeAddModal() {
  refs.addModal?.classList.add("hidden");
  state.editingId = null;
}


/* --------------------------------------------------------------------------
   13. DETAIL MODAL
   -------------------------------------------------------------------------- */
function openDetail(m) {
  if (!refs.modal || !refs.modalBody) return;
  clear(refs.modalBody);

  const color = colorForCategory(m.category);

  const iconWrap = el("div", { class: "timeline-card__icon" });
  iconWrap.style.color = color;
  iconWrap.style.background = color + "20";
  iconWrap.innerHTML = iconForCategory(m.category);

  refs.modalBody.appendChild(
    el("div", { class: "tree-modal__header" },
      iconWrap,
      el("div", {},
        el("div", { class: "tree-modal__title", text: m.title || "(untitled)" }),
        el("div", { class: "tree-modal__meta" },
          el("span", { text: formatDate(m.date) }),
          el("span", { text: " · " }),
          el("span", { text: m.category || "Other", style: `color:${color}` }),
          m.status && m.status !== "completed"
            ? el("span", { class: `timeline-card__status timeline-card__status--${m.status}`,
                text: m.status === "in-progress" ? "In progress" : "Planned" })
            : null
        )
      )
    )
  );

  if (m.description) {
    refs.modalBody.appendChild(
      el("div", { class: "tree-modal__section" },
        el("div", { class: "vault-modal__label", text: "Description" }),
        el("div", { class: "markdown", html: renderMarkdown(m.description) })
      )
    );
  }

  if (m.notes) {
    refs.modalBody.appendChild(
      el("div", { class: "tree-modal__section" },
        el("div", { class: "vault-modal__label", text: "Notes" }),
        el("div", { class: "markdown", html: renderMarkdown(m.notes) })
      )
    );
  }

  refs.modalBody.appendChild(
    el("div", { class: "vault-modal__actions" },
      el("button", {
        class: "btn btn--ghost",
        type: "button",
        onclick: () => { openAddModal(m); closeDetailModal(); }
      }, "Edit"),
      el("button", {
        class: "btn btn--danger",
        type: "button",
        onclick: () => { handleDelete(m.id, m.title); closeDetailModal(); }
      }, "Delete")
    )
  );

  refs.modal.classList.remove("hidden");
}


function closeDetailModal() {
  refs.modal?.classList.add("hidden");
}
