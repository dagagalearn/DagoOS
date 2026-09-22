/* ==========================================================================
   DagoOS — Dago Journal
   --------------------------------------------------------------------------
   Markdown-friendly journal. Firestore collection: `journal`.

   Supports:
     • Create / read / update / delete entries
     • Live markdown preview while typing
     • Mood tag (bad / ok / good / great)
     • Free-form tags
     • Chronological archive

   Uses:
     listDocs, addDoc, updateDoc, deleteDoc  → firestore.js
     renderMarkdown, excerpt                 → services/markdown.js
     formatDate, todayISO, el, clear         → utils.js
   ========================================================================== */

import { listDocs, addDoc, updateDoc, deleteDoc } from "../core/firestore.js";
import { renderMarkdown, excerpt } from "../services/markdown.js";
import { formatDate, todayISO, el, clear } from "../core/utils.js";
import { showSkeletons } from "../core/ui-helpers.js";



/* --------------------------------------------------------------------------
   1. STATE
   -------------------------------------------------------------------------- */
const state = {
  entries: [],
  editingId: null     // null = new entry, string = editing existing doc
};

let refs = {};


/* --------------------------------------------------------------------------
   2. ENTRY POINT
   -------------------------------------------------------------------------- */
export async function initJournal() {
  cacheRefs();
  bindForm();
  bindPreview();
  await loadAndRender();
}


function cacheRefs() {
  refs = {
    form:        document.getElementById("entry-form"),
    title:       document.getElementById("entry-title"),
    body:        document.getElementById("entry-body"),
    mood:        document.getElementById("entry-mood"),
    tags:        document.getElementById("entry-tags"),
    date:        document.getElementById("entry-date"),
    preview:     document.getElementById("entry-preview"),
    submitBtn:   document.getElementById("entry-submit"),
    cancelBtn:   document.getElementById("entry-cancel"),
    formTitle:   document.getElementById("entry-form-title"),

    list:        document.getElementById("entry-list"),
    empty:       document.getElementById("entry-empty")
  };

  if (refs.date && !refs.date.value) refs.date.value = todayISO();
}


/* --------------------------------------------------------------------------
   3. LOAD + RENDER
   -------------------------------------------------------------------------- */
async function loadAndRender() {
     showSkeletons(refs.list, 3, "card");
  try {
    state.entries = await listDocs("journal", {
      orderByField: "date",
      orderDir: "desc"
    });
  } catch (err) {
    console.error("[Journal] Load failed:", err);
    state.entries = [];
  }
  renderList();
}


/* --------------------------------------------------------------------------
   4. LIST RENDERING
   -------------------------------------------------------------------------- */
function renderList() {
  if (!refs.list) return;
  clear(refs.list);

  if (state.entries.length === 0) {
    refs.empty?.classList.remove("hidden");
    return;
  }
  refs.empty?.classList.add("hidden");

  for (const entry of state.entries) {
    refs.list.appendChild(buildEntryCard(entry));
  }
}


function buildEntryCard(entry) {
  const moodBadge = entry.mood
    ? el("span", { class: `mood mood--${entry.mood}`, text: entry.mood })
    : null;

  const tagChips = (entry.tags || []).map(tag =>
    el("span", { class: "tag-chip", text: `#${tag}` })
  );

  const card = el("article", { class: "entry-card" },
    el("header", { class: "entry-card__header" },
      el("h3", { class: "entry-card__title", text: entry.title || "(untitled)" }),
      el("div", { class: "entry-card__meta" },
        el("span", { text: formatDate(entry.date) }),
        moodBadge
      )
    ),
    el("div", {
      class: "entry-card__body markdown",
      html: renderMarkdown(entry.body || "")
    }),
    tagChips.length
      ? el("div", { class: "entry-card__tags" }, ...tagChips)
      : null,
    el("div", { class: "entry-card__actions" },
      el("button", {
        class: "prop-row__btn",
        type: "button",
        onclick: () => beginEdit(entry)
      }, "Edit"),
      el("button", {
        class: "prop-row__btn prop-row__btn--danger",
        type: "button",
        onclick: () => handleDelete(entry.id, entry.title)
      }, "Delete")
    )
  );

  return card;
}


/* --------------------------------------------------------------------------
   5. FORM — create OR update
   -------------------------------------------------------------------------- */
function bindForm() {
  if (!refs.form) return;

  refs.form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const tags = parseTags(refs.tags.value);

    const data = {
      title: (refs.title.value || "").trim() || "(untitled)",
      body:  refs.body.value || "",
      mood:  refs.mood.value || "",
      tags,
      date:  refs.date.value || todayISO()
    };

    if (!data.body.trim() && !data.title.trim()) {
      return alert("Add a title or some body text.");
    }

    try {
      if (state.editingId) {
        await updateDoc("journal", state.editingId, data);
      } else {
        await addDoc("journal", data);
      }
      resetForm();
      await loadAndRender();
    } catch (err) {
      console.error("[Journal] Save failed:", err);
      alert("Could not save. Check console.");
    }
  });

  refs.cancelBtn?.addEventListener("click", () => resetForm());
}


function parseTags(raw) {
  return String(raw || "")
    .split(/[,\s]+/)
    .map(t => t.replace(/^#/, "").trim())
    .filter(Boolean);
}


/* --------------------------------------------------------------------------
   6. EDIT MODE
   -------------------------------------------------------------------------- */
function beginEdit(entry) {
  state.editingId = entry.id;
  refs.title.value = entry.title || "";
  refs.body.value  = entry.body || "";
  refs.mood.value  = entry.mood || "";
  refs.tags.value  = (entry.tags || []).join(", ");
  refs.date.value  = entry.date || todayISO();

  refs.formTitle.textContent = "Edit entry";
  refs.submitBtn.textContent = "Save changes";
  refs.cancelBtn?.classList.remove("hidden");

  updatePreview();

  // Scroll to form
  refs.form.scrollIntoView({ behavior: "smooth", block: "start" });
}


function resetForm() {
  state.editingId = null;
  refs.form.reset();
  refs.date.value = todayISO();
  refs.formTitle.textContent = "New entry";
  refs.submitBtn.textContent = "Add entry";
  refs.cancelBtn?.classList.add("hidden");
  updatePreview();
}


/* --------------------------------------------------------------------------
   7. LIVE MARKDOWN PREVIEW
   -------------------------------------------------------------------------- */
function bindPreview() {
  if (!refs.body) return;
  refs.body.addEventListener("input", updatePreview);
  updatePreview();     // initial render
}


function updatePreview() {
  if (!refs.preview) return;
  const raw = refs.body.value || "";
  if (!raw.trim()) {
    refs.preview.innerHTML = '<p class="preview-empty">Preview appears here as you type…</p>';
    return;
  }
  refs.preview.innerHTML = renderMarkdown(raw);
}


/* --------------------------------------------------------------------------
   8. DELETE
   -------------------------------------------------------------------------- */
async function handleDelete(id, title) {
  const label = title ? `"${title}"` : "this entry";
  if (!confirm(`Delete ${label}?`)) return;
  try {
    await deleteDoc("journal", id);
    if (state.editingId === id) resetForm();
    await loadAndRender();
  } catch (err) {
    console.error("[Journal] Delete failed:", err);
  }
}
