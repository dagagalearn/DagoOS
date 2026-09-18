/* ==========================================================================
   DagoOS — Dago Todo
   --------------------------------------------------------------------------
   Advanced task manager. Firestore collection: `todos`.

   Doc shape:
     {
       title, description, priority, tags[], dueDate,
       completed, completedAt, pinned, recurring,
       subtasks: [{ id, text, done }],
       uid, createdAt, updatedAt
     }

   Features:
     • Add / edit / delete tasks
     • Subtasks (optional checklist)
     • Recurring: none / daily / weekly / monthly
     • Priority: low / medium / high / urgent
     • Due date highlighting (overdue / today / future)
     • Pin, star, bulk actions
     • Filter: All / Today / Upcoming / Overdue / Done
     • Sort: priority / dueDate / created / title
     • Search across title / description / tags
     • Quick-add input
   ========================================================================== */

import { listDocs, addDoc, updateDoc, deleteDoc } from "../core/firestore.js";
import { el, clear, formatDate, todayISO } from "../core/utils.js";


/* --------------------------------------------------------------------------
   1. CONSTANTS
   -------------------------------------------------------------------------- */
const PRIORITIES = [
  { value: "urgent", label: "Urgent", weight: 4 },
  { value: "high",   label: "High",   weight: 3 },
  { value: "medium", label: "Medium", weight: 2 },
  { value: "low",    label: "Low",    weight: 1 }
];

const RECURRING = [
  { value: "none",    label: "Does not repeat" },
  { value: "daily",   label: "Daily" },
  { value: "weekly",  label: "Weekly" },
  { value: "monthly", label: "Monthly" }
];

const FILTERS = ["All", "Today", "Upcoming", "Overdue", "Done"];

const SORTS = [
  { value: "dueDate",  label: "Due date" },
  { value: "priority", label: "Priority" },
  { value: "created",  label: "Newest" },
  { value: "title",    label: "Title A–Z" }
];


/* --------------------------------------------------------------------------
   2. STATE
   -------------------------------------------------------------------------- */
const state = {
  todos: [],
  filter: "All",
  sort: "dueDate",
  searchQuery: "",
  selected: new Set(),
  editingId: null,
  expandedSubtasks: new Set()   // ids of todos whose subtasks are shown
};

let refs = {};


/* --------------------------------------------------------------------------
   3. ENTRY POINT
   -------------------------------------------------------------------------- */
export async function initTodo() {
  cacheRefs();
  bindControls();
  bindForm();
  bindModal();
  await loadAndRender();
}


function cacheRefs() {
  refs = {
    // Toolbar
    search:        document.getElementById("todo-search"),
    sort:          document.getElementById("todo-sort"),
    tabs:          document.getElementById("todo-tabs"),
    quickAdd:      document.getElementById("todo-quick-add"),
    quickAddForm:  document.getElementById("todo-quick-form"),

    // List
    list:          document.getElementById("todo-list"),
    empty:         document.getElementById("todo-empty"),

    // Bulk actions
    bulkBar:       document.getElementById("todo-bulk-bar"),
    bulkCount:     document.getElementById("todo-bulk-count"),
    bulkComplete:  document.getElementById("todo-bulk-complete"),
    bulkDelete:    document.getElementById("todo-bulk-delete"),
    bulkClear:     document.getElementById("todo-bulk-clear"),

    // FAB
    fab:           document.getElementById("todo-fab"),

    // Add/Edit modal
    addModal:      document.getElementById("todo-add-modal"),
    addClose:      document.getElementById("todo-add-close"),
    addTitle:      document.getElementById("todo-add-title"),
    form:          document.getElementById("todo-form"),
    title:         document.getElementById("todo-title"),
    description:   document.getElementById("todo-description"),
    priority:      document.getElementById("todo-priority"),
    tags:          document.getElementById("todo-tags"),
    dueDate:       document.getElementById("todo-due-date"),
    recurring:     document.getElementById("todo-recurring"),
    pinned:        document.getElementById("todo-pinned"),
    subtaskList:   document.getElementById("todo-subtasks"),
    subtaskAdd:    document.getElementById("todo-subtask-add"),
    subtaskInput:  document.getElementById("todo-subtask-input"),
    submit:        document.getElementById("todo-submit"),
    cancel:        document.getElementById("todo-cancel"),
    tagsList:      document.getElementById("todo-tags-list"),

    // Detail modal
    modal:         document.getElementById("todo-modal"),
    modalBody:     document.getElementById("todo-modal-body"),
    modalClose:    document.getElementById("todo-modal-close")
  };

  // Populate priority dropdown
  if (refs.priority) {
    for (const p of PRIORITIES) {
      refs.priority.appendChild(el("option", { value: p.value, text: p.label }));
    }
    refs.priority.value = "medium";
  }

  // Populate recurring dropdown
  if (refs.recurring) {
    for (const r of RECURRING) {
      refs.recurring.appendChild(el("option", { value: r.value, text: r.label }));
    }
    refs.recurring.value = "none";
  }

  // Populate sort dropdown
  if (refs.sort) {
    for (const s of SORTS) {
      refs.sort.appendChild(el("option", { value: s.value, text: s.label }));
    }
    refs.sort.value = "dueDate";
  }

  // Set today's date
  if (refs.dueDate && !refs.dueDate.value) refs.dueDate.value = todayISO();
}


/* --------------------------------------------------------------------------
   4. LOAD + RENDER
   -------------------------------------------------------------------------- */
async function loadAndRender() {
  try {
    state.todos = await listDocs("todos", {
      orderByField: "createdAt",
      orderDir: "desc"
    });
  } catch (err) {
    console.error("[Todo] Load failed:", err);
    state.todos = [];
  }
  renderTabs();
  renderList();
  refreshTagSuggestions();
  updateBulkBar();
}


/* --------------------------------------------------------------------------
   5. FILTER / SORT / SEARCH
   -------------------------------------------------------------------------- */
function getVisibleTodos() {
  let todos = [...state.todos];

  // Filter
  const today = todayISO();
  switch (state.filter) {
    case "Today":
      todos = todos.filter(t => !t.completed && t.dueDate === today);
      break;
    case "Upcoming":
      todos = todos.filter(t => !t.completed && t.dueDate > today);
      break;
    case "Overdue":
      todos = todos.filter(t => !t.completed && t.dueDate && t.dueDate < today);
      break;
    case "Done":
      todos = todos.filter(t => t.completed);
      break;
    case "All":
    default:
      // "All" shows active (not completed) tasks
      todos = todos.filter(t => !t.completed);
  }

  // Search
  const q = state.searchQuery.trim().toLowerCase();
  if (q) {
    todos = todos.filter(t => {
      const haystack = [
        t.title, t.description, ...(t.tags || [])
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }

  // Sort
  todos.sort((a, b) => {
    // Pinned first
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;

    switch (state.sort) {
      case "priority": {
        const wa = priorityWeight(a.priority);
        const wb = priorityWeight(b.priority);
        return wb - wa;
      }
      case "created":
        return ((b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      case "title":
        return (a.title || "").localeCompare(b.title || "");
      case "dueDate":
      default:
        // Tasks with no due date go last
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
    }
  });

  return todos;
}


function priorityWeight(p) {
  const found = PRIORITIES.find(x => x.value === p);
  return found ? found.weight : 0;
}


/* --------------------------------------------------------------------------
   6. TABS
   -------------------------------------------------------------------------- */
function renderTabs() {
  if (!refs.tabs) return;
  clear(refs.tabs);

  const today = todayISO();

  const counts = {
    All:      state.todos.filter(t => !t.completed).length,
    Today:    state.todos.filter(t => !t.completed && t.dueDate === today).length,
    Upcoming: state.todos.filter(t => !t.completed && t.dueDate > today).length,
    Overdue:  state.todos.filter(t => !t.completed && t.dueDate && t.dueDate < today).length,
    Done:     state.todos.filter(t => t.completed).length
  };

  for (const f of FILTERS) {
    const btn = el("button", {
      class: "tab" + (state.filter === f ? " is-active" : ""),
      type: "button",
      onclick: () => {
        state.filter = f;
        renderTabs();
        renderList();
      }
    },
      el("span", { text: f }),
      el("span", { class: "tab__count", text: String(counts[f] || 0) })
    );
    refs.tabs.appendChild(btn);
  }
}


/* --------------------------------------------------------------------------
   7. LIST
   -------------------------------------------------------------------------- */
function renderList() {
  if (!refs.list) return;
  clear(refs.list);

  const todos = getVisibleTodos();

  if (todos.length === 0) {
    refs.empty?.classList.remove("hidden");
    return;
  }
  refs.empty?.classList.add("hidden");

  for (const t of todos) {
    refs.list.appendChild(buildTodoCard(t));
  }
}


function buildTodoCard(t) {
  const isSelected = state.selected.has(t.id);
  const isExpanded = state.expandedSubtasks.has(t.id);

  // Checkbox to toggle completion
  const check = el("button", {
    class: "todo-card__check" + (t.completed ? " is-checked" : ""),
    type: "button",
    onclick: (e) => { e.stopPropagation(); toggleComplete(t); }
  });
  check.innerHTML = t.completed
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
    : "";

  // Priority indicator
  const priority = el("span", {
    class: `todo-card__priority todo-card__priority--${t.priority || "medium"}`,
    text: (t.priority || "medium").toUpperCase()
  });

  // Pin
  const pinBtn = el("button", {
    class: "todo-card__pin" + (t.pinned ? " is-pinned" : ""),
    type: "button",
    title: t.pinned ? "Unpin" : "Pin",
    onclick: (e) => { e.stopPropagation(); togglePin(t); }
  });
  pinBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="${t.pinned ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 17v5M9 10.76V6a3 3 0 0 1 6 0v4.76l2 3.24H7l2-3.24z"/></svg>`;

  // Subtask progress
  const subtasks = t.subtasks || [];
  const doneCount = subtasks.filter(s => s.done).length;
  const subtaskBadge = subtasks.length > 0
    ? el("span", { class: "todo-card__subtask-badge",
        text: `${doneCount}/${subtasks.length}` })
    : null;

  // Subtask expand toggle
  const expandBtn = subtasks.length > 0
    ? el("button", {
        class: "todo-card__expand",
        type: "button",
        onclick: (e) => { e.stopPropagation(); toggleExpand(t.id); }
      }, isExpanded ? "▾" : "▸")
    : null;

  // Due date
  const dueMeta = buildDueMeta(t);

  // Recurring badge
  const recurringBadge = t.recurring && t.recurring !== "none"
    ? el("span", { class: "todo-card__recurring", text: `↻ ${t.recurring}` })
    : null;

  // Tags
  const tagChips = (t.tags || []).slice(0, 3).map(tag =>
    el("span", { class: "tag-chip", text: `#${tag}` })
  );
  const tagsRow = tagChips.length
    ? el("div", { class: "todo-card__tags" }, ...tagChips)
    : null;

  // Description preview
  const desc = t.description
    ? el("div", { class: "todo-card__desc", text: t.description })
    : null;

  // Select checkbox
  const selectCheck = el("input", {
    type: "checkbox",
    class: "todo-card__select",
    ...(isSelected ? { checked: "checked" } : {}),
    onclick: (e) => { e.stopPropagation(); toggleSelect(t.id); }
  });

  // Subtasks list (when expanded)
  const subtasksBlock = isExpanded && subtasks.length > 0
    ? el("div", { class: "todo-card__subtasks" },
        ...subtasks.map(s => buildSubtaskRow(t, s))
      )
    : null;

  return el("div", {
    class: "todo-card"
      + (t.completed ? " is-completed" : "")
      + (isSelected ? " is-selected" : "")
      + (t.pinned ? " is-pinned" : ""),
    onclick: () => openDetail(t)
  },
    el("div", { class: "todo-card__row" },
      selectCheck,
      check,
      expandBtn,
      el("div", { class: "todo-card__main" },
        el("div", { class: "todo-card__title-row" },
          el("span", { class: "todo-card__title", text: t.title || "(untitled)" }),
          pinBtn
        ),
        el("div", { class: "todo-card__meta" },
          priority,
          dueMeta,
          recurringBadge,
          subtaskBadge
        ),
        desc,
        tagsRow
      )
    ),
    subtasksBlock
  );
}


function buildDueMeta(t) {
  if (!t.dueDate) return null;

  const today = todayISO();
  let cls = "todo-card__due";
  let label = formatDate(t.dueDate);

  if (t.completed) {
    cls += " todo-card__due--done";
  } else if (t.dueDate < today) {
    cls += " todo-card__due--overdue";
    label = `Overdue · ${label}`;
  } else if (t.dueDate === today) {
    cls += " todo-card__due--today";
    label = `Today`;
  }

  return el("span", { class: cls, text: label });
}


function buildSubtaskRow(todo, sub) {
  const cb = el("input", {
    type: "checkbox",
    class: "todo-subtask__check",
    ...(sub.done ? { checked: "checked" } : {}),
    onclick: (e) => { e.stopPropagation(); toggleSubtask(todo, sub.id); }
  });
  return el("label", { class: "todo-subtask" + (sub.done ? " is-done" : "") },
    cb,
    el("span", { class: "todo-subtask__text", text: sub.text })
  );
}


/* --------------------------------------------------------------------------
   8. ACTIONS — complete / pin / subtasks
   -------------------------------------------------------------------------- */
async function toggleComplete(t) {
  const nowCompleted = !t.completed;
  const patch = {
    completed: nowCompleted,
    completedAt: nowCompleted ? new Date() : null
  };

  // If recurring and completed, bump the due date instead of staying done
  if (nowCompleted && t.recurring && t.recurring !== "none" && t.dueDate) {
    patch.dueDate = bumpRecurring(t.dueDate, t.recurring);
    patch.completed = false;
    patch.completedAt = null;
  }

  try {
    await updateDoc("todos", t.id, patch);
    await loadAndRender();
  } catch (err) {
    console.error("[Todo] Complete failed:", err);
  }
}


function bumpRecurring(isoDate, freq) {
  const d = new Date(isoDate + "T12:00:00");
  if (freq === "daily")   d.setDate(d.getDate() + 1);
  if (freq === "weekly")  d.setDate(d.getDate() + 7);
  if (freq === "monthly") d.setMonth(d.getMonth() + 1);

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}


async function togglePin(t) {
  try {
    await updateDoc("todos", t.id, { pinned: !t.pinned });
    await loadAndRender();
  } catch (err) {
    console.error("[Todo] Pin failed:", err);
  }
}


async function toggleSubtask(todo, subId) {
  const subtasks = (todo.subtasks || []).map(s =>
    s.id === subId ? { ...s, done: !s.done } : s
  );
  try {
    await updateDoc("todos", todo.id, { subtasks });
    await loadAndRender();
  } catch (err) {
    console.error("[Todo] Subtask toggle failed:", err);
  }
}


function toggleExpand(id) {
  if (state.expandedSubtasks.has(id)) state.expandedSubtasks.delete(id);
  else state.expandedSubtasks.add(id);
  renderList();
}


/* --------------------------------------------------------------------------
   9. ADD / EDIT FORM
   -------------------------------------------------------------------------- */
function bindForm() {
  if (!refs.form) return;

  refs.form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const subtasks = collectSubtasksFromForm();

    const data = {
      title:       (refs.title.value || "").trim(),
      description: (refs.description.value || "").trim(),
      priority:    refs.priority.value || "medium",
      tags:        parseTags(refs.tags.value),
      dueDate:     refs.dueDate.value || "",
      recurring:   refs.recurring.value || "none",
      pinned:      refs.pinned.checked,
      subtasks
    };

    if (!data.title) return alert("Title is required.");

    try {
      if (state.editingId) {
        await updateDoc("todos", state.editingId, data);
      } else {
        data.completed = false;
        data.completedAt = null;
        await addDoc("todos", data);
      }
      resetForm();
      closeAddModal();
      await loadAndRender();
    } catch (err) {
      console.error("[Todo] Save failed:", err);
      alert("Could not save. Check console.");
    }
  });

  refs.cancel?.addEventListener("click", () => {
    resetForm();
    closeAddModal();
  });

  refs.subtaskAdd?.addEventListener("click", addSubtaskRowFromInput);
  refs.subtaskInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addSubtaskRowFromInput(); }
  });

  // Quick add
  refs.quickAddForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = (refs.quickAdd.value || "").trim();
    if (!title) return;
    try {
      await addDoc("todos", {
        title,
        description: "",
        priority: "medium",
        tags: [],
        dueDate: "",
        recurring: "none",
        pinned: false,
        subtasks: [],
        completed: false,
        completedAt: null
      });
      refs.quickAdd.value = "";
      await loadAndRender();
    } catch (err) {
      console.error("[Todo] Quick add failed:", err);
    }
  });
}


/* --------------------------------------------------------------------------
   10. SUBTASK FORM HELPERS
   -------------------------------------------------------------------------- */
function collectSubtasksFromForm() {
  const rows = refs.subtaskList.querySelectorAll(".subtask-edit-row");
  const result = [];
  rows.forEach(row => {
    const text = row.querySelector("input[type=text]").value.trim();
    const cb = row.querySelector("input[type=checkbox]");
    if (text) {
      result.push({
        id: row.dataset.id || ("s" + Math.random().toString(36).slice(2, 8)),
        text,
        done: cb.checked
      });
    }
  });
  return result;
}


function addSubtaskRowFromInput() {
  const text = (refs.subtaskInput.value || "").trim();
  if (!text) return;
  appendSubtaskRow(text, false);
  refs.subtaskInput.value = "";
  refs.subtaskInput.focus();
}


function appendSubtaskRow(text, done, id) {
  const row = el("div", {
    class: "subtask-edit-row",
    "data-id": id || ("s" + Math.random().toString(36).slice(2, 8))
  },
    el("input", { type: "checkbox", ...(done ? { checked: "checked" } : {}) }),
    el("input", { type: "text", class: "field__input", value: text }),
    el("button", {
      class: "subtask-edit-row__remove",
      type: "button",
      onclick: () => row.remove()
    }, "×")
  );
  refs.subtaskList.appendChild(row);
}


function clearSubtaskRows() {
  if (refs.subtaskList) clear(refs.subtaskList);
}


/* --------------------------------------------------------------------------
   11. EDIT / RESET
   -------------------------------------------------------------------------- */
function beginEdit(t) {
  state.editingId = t.id;
  refs.title.value       = t.title || "";
  refs.description.value = t.description || "";
  refs.priority.value    = t.priority || "medium";
  refs.tags.value        = (t.tags || []).join(", ");
  refs.dueDate.value     = t.dueDate || "";
  refs.recurring.value   = t.recurring || "none";
  refs.pinned.checked    = !!t.pinned;

  clearSubtaskRows();
  for (const s of (t.subtasks || [])) {
    appendSubtaskRow(s.text, s.done, s.id);
  }

  refs.addTitle.textContent = "Edit task";
  refs.submit.textContent   = "Save changes";
  refs.addModal.classList.remove("hidden");
}


function resetForm() {
  state.editingId = null;
  refs.form.reset();
  refs.dueDate.value = todayISO();
  refs.priority.value = "medium";
  refs.recurring.value = "none";
  refs.pinned.checked = false;
  clearSubtaskRows();
}


/* --------------------------------------------------------------------------
   12. TAG HELPERS
   -------------------------------------------------------------------------- */
function parseTags(raw) {
  return String(raw || "")
    .split(/[,\s]+/)
    .map(t => t.replace(/^#/, "").trim())
    .filter(Boolean);
}


function refreshTagSuggestions() {
  if (!refs.tagsList) return;
  clear(refs.tagsList);
  const all = new Set();
  for (const t of state.todos) {
    for (const tag of (t.tags || [])) all.add(tag);
  }
  for (const tag of [...all].sort()) {
    refs.tagsList.appendChild(el("option", { value: tag }));
  }
}


/* --------------------------------------------------------------------------
   13. DELETE + BULK
   -------------------------------------------------------------------------- */
async function handleDelete(id, title) {
  if (!confirm(`Delete "${title || "this task"}"?`)) return;
  try {
    await deleteDoc("todos", id);
    state.selected.delete(id);
    await loadAndRender();
  } catch (err) {
    console.error("[Todo] Delete failed:", err);
  }
}


function toggleSelect(id) {
  if (state.selected.has(id)) state.selected.delete(id);
  else state.selected.add(id);
  renderList();
  updateBulkBar();
}


function updateBulkBar() {
  if (!refs.bulkBar) return;
  const n = state.selected.size;
  refs.bulkBar.classList.toggle("hidden", n === 0);
  if (refs.bulkCount) refs.bulkCount.textContent = `${n} selected`;
}


function bindBulkActions() {
  refs.bulkComplete?.addEventListener("click", async () => {
    if (!state.selected.size) return;
    try {
      for (const id of state.selected) {
        await updateDoc("todos", id, { completed: true, completedAt: new Date() });
      }
      state.selected.clear();
      await loadAndRender();
    } catch (err) {
      console.error("[Todo] Bulk complete failed:", err);
    }
  });

  refs.bulkDelete?.addEventListener("click", async () => {
    const n = state.selected.size;
    if (!n) return;
    if (!confirm(`Delete ${n} task(s)? This cannot be undone.`)) return;
    try {
      for (const id of state.selected) {
        await deleteDoc("todos", id);
      }
      state.selected.clear();
      await loadAndRender();
    } catch (err) {
      console.error("[Todo] Bulk delete failed:", err);
    }
  });

  refs.bulkClear?.addEventListener("click", () => {
    state.selected.clear();
    renderList();
    updateBulkBar();
  });
}


/* --------------------------------------------------------------------------
   14. CONTROLS
   -------------------------------------------------------------------------- */
function bindControls() {
  let searchTimer = null;
  refs.search?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.searchQuery = refs.search.value || "";
      renderList();
    }, 150);
  });

  refs.sort?.addEventListener("change", () => {
    state.sort = refs.sort.value;
    renderList();
  });

  refs.fab?.addEventListener("click", () => openAddModal());

  bindBulkActions();
}


/* --------------------------------------------------------------------------
   15. ADD MODAL
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
}


function openAddModal(t = null) {
  if (t) beginEdit(t);
  else {
    resetForm();
    refs.addTitle.textContent = "Add task";
    refs.submit.textContent   = "Add task";
  }
  refs.addModal.classList.remove("hidden");
}


function closeAddModal() {
  refs.addModal?.classList.add("hidden");
  state.editingId = null;
}


/* --------------------------------------------------------------------------
   16. DETAIL MODAL
   -------------------------------------------------------------------------- */
function openDetail(t) {
  if (!refs.modal || !refs.modalBody) return;
  clear(refs.modalBody);

  refs.modalBody.appendChild(el("div", { class: "todo-modal__title-row" },
    el("div", { class: "todo-modal__title", text: t.title || "(untitled)" }),
    el("span", {
      class: `todo-card__priority todo-card__priority--${t.priority || "medium"}`,
      text: (t.priority || "medium").toUpperCase()
    })
  ));

  if (t.dueDate) {
    refs.modalBody.appendChild(
      el("div", { class: "todo-modal__meta" },
        el("span", { text: "Due: " + formatDate(t.dueDate) }),
        t.recurring && t.recurring !== "none"
          ? el("span", { text: " ↻ " + t.recurring })
          : null
      )
    );
  }

  if (t.description) {
    refs.modalBody.appendChild(
      el("div", { class: "todo-modal__section" },
        el("div", { class: "vault-modal__label", text: "Description" }),
        el("div", { text: t.description })
      )
    );
  }

  if ((t.subtasks || []).length) {
    refs.modalBody.appendChild(
      el("div", { class: "todo-modal__section" },
        el("div", { class: "vault-modal__label",
          text: `Subtasks (${t.subtasks.filter(s => s.done).length}/${t.subtasks.length})` }),
        el("div", { class: "todo-modal__subtasks" },
          ...t.subtasks.map(s => buildSubtaskRow(t, s))
        )
      )
    );
  }

  if ((t.tags || []).length) {
    refs.modalBody.appendChild(
      el("div", { class: "todo-modal__section" },
        el("div", { class: "vault-modal__label", text: "Tags" }),
        el("div", { class: "vault-modal__tags" },
          ...t.tags.map(tag => el("span", { class: "tag-chip", text: `#${tag}` }))
        )
      )
    );
  }

  refs.modalBody.appendChild(
    el("div", { class: "vault-modal__actions" },
      el("button", {
        class: "btn btn--primary",
        type: "button",
        onclick: () => { toggleComplete(t); closeDetailModal(); }
      }, t.completed ? "Mark as active" : "Mark complete"),
      el("button", {
        class: "btn btn--ghost",
        type: "button",
        onclick: () => { openAddModal(t); closeDetailModal(); }
      }, "Edit"),
      el("button", {
        class: "btn btn--danger",
        type: "button",
        onclick: () => { handleDelete(t.id, t.title); closeDetailModal(); }
      }, "Delete")
    )
  );

  refs.modal.classList.remove("hidden");
}


function closeDetailModal() {
  refs.modal?.classList.add("hidden");
}
