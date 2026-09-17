/* ==========================================================================
   DagoOS — Dago Ledger
   --------------------------------------------------------------------------
   Income / expense tracker. Uses Firestore collection: `transactions`.

   Data shape (see docs — no docs, but you get the idea):
     {
       type: "income" | "expense",
       amount: number,
       currency: "ETB",
       category: string,
       description: string,
       date: "YYYY-MM-DD",
       uid, createdAt, updatedAt   (added automatically by firestore.js)
     }
   ========================================================================== */

import { listDocs, addDoc, updateDoc as fsUpdateDoc, deleteDoc } from "../core/firestore.js";import { formatCurrency, formatDate, todayISO, el, clear, toNumber }
  from "../core/utils.js";


/* --------------------------------------------------------------------------
   1. STATE — everything we cache client-side
   -------------------------------------------------------------------------- */
const state = {
  transactions: [],
  filter: "all"     // "all" | "income" | "expense"
};


/* --------------------------------------------------------------------------
   2. DOM REFERENCES (cached after first paint)
   -------------------------------------------------------------------------- */
let refs = {};


/* --------------------------------------------------------------------------
   3. ENTRY POINT — called by main.js when the ledger page loads
   -------------------------------------------------------------------------- */
export async function initLedger() {
  cacheRefs();
  bindForm();
  bindFilters();
  await loadAndRender();
  await initProperties();
}


function cacheRefs() {
  refs = {
    // summary
    balance:    document.getElementById("ledger-balance"),
    income:     document.getElementById("ledger-income"),
    expense:    document.getElementById("ledger-expense"),

    // form
    form:       document.getElementById("tx-form"),
    type:       document.getElementById("tx-type"),
    amount:     document.getElementById("tx-amount"),
    category:   document.getElementById("tx-category"),
    description:document.getElementById("tx-description"),
    date:       document.getElementById("tx-date"),

    // list
    list:       document.getElementById("tx-list"),
    empty:      document.getElementById("tx-empty"),

    // filters
    filters:    document.querySelectorAll("[data-filter]")
  };

  // Pre-fill date with today so the user doesn't have to
  if (refs.date && !refs.date.value) refs.date.value = todayISO();
}


/* --------------------------------------------------------------------------
   4. LOAD FROM FIRESTORE + RENDER
   -------------------------------------------------------------------------- */
async function loadAndRender() {
  try {
    // We sort by `date` (the user-chosen date), not `createdAt`,
    // so back-dated entries appear in their correct place.
    state.transactions = await listDocs("transactions", {
      orderByField: "date",
      orderDir: "desc"
    });
  } catch (err) {
    console.error("[Ledger] Failed to load transactions:", err);
    state.transactions = [];
  }
  renderSummary();
  renderList();
}


/* --------------------------------------------------------------------------
   5. SUMMARY — balance, income, expense totals
   -------------------------------------------------------------------------- */
function renderSummary() {
  let income = 0, expense = 0;
  for (const t of state.transactions) {
    const amt = toNumber(t.amount);
    if (t.type === "income") income += amt;
    else                     expense += amt;
  }
  const balance = income - expense;

  if (refs.balance) refs.balance.textContent = formatCurrency(balance);
  if (refs.income)  refs.income.textContent  = formatCurrency(income);
  if (refs.expense) refs.expense.textContent = formatCurrency(expense);
}


/* --------------------------------------------------------------------------
   6. LIST — transaction rows
   -------------------------------------------------------------------------- */
function renderList() {
  if (!refs.list) return;
  clear(refs.list);

  const visible = state.filter === "all"
    ? state.transactions
    : state.transactions.filter(t => t.type === state.filter);

  if (visible.length === 0) {
    if (refs.empty) refs.empty.classList.remove("hidden");
    return;
  }
  if (refs.empty) refs.empty.classList.add("hidden");

  for (const t of visible) {
    refs.list.appendChild(buildRow(t));
  }
}


function buildRow(t) {
  const isIncome = t.type === "income";
  const sign     = isIncome ? "+" : "−";
  const amountEl = el("span", {
    class: `tx-row__amount tx-row__amount--${isIncome ? "income" : "expense"}`,
    text: `${sign} ${formatCurrency(t.amount)}`
  });

  const meta = [t.category, formatDate(t.date)].filter(Boolean).join(" · ");

  return el("div", { class: "tx-row" },
    el("div", { class: "tx-row__main" },
      el("div", { class: "tx-row__desc", text: t.description || "(no description)" }),
      el("div", { class: "tx-row__meta", text: meta })
    ),
    amountEl,
    el("button", {
      class: "tx-row__delete",
      type: "button",
      title: "Delete",
      onclick: () => handleDelete(t.id)
    }, "×")
  );
}


/* --------------------------------------------------------------------------
   7. FORM — add a new transaction
   -------------------------------------------------------------------------- */
function bindForm() {
  if (!refs.form) return;

  refs.form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const data = {
      type:        refs.type.value,
      amount:      toNumber(refs.amount.value),
      currency:    "ETB",
      category:    (refs.category.value || "").trim(),
      description: (refs.description.value || "").trim(),
      date:        refs.date.value || todayISO()
    };

    // Basic guard — amount must be > 0
    if (!(data.amount > 0)) {
      alert("Amount must be greater than zero.");
      return;
    }

    try {
      await addDoc("transactions", data);
      refs.form.reset();
      refs.date.value = todayISO();   // restore today's date
      await loadAndRender();
    } catch (err) {
      console.error("[Ledger] Add failed:", err);
      alert("Could not save. Check the console for details.");
    }
  });
}


/* --------------------------------------------------------------------------
   8. DELETE
   -------------------------------------------------------------------------- */
async function handleDelete(id) {
  if (!confirm("Delete this transaction?")) return;
  try {
    await deleteDoc("transactions", id);
    await loadAndRender();
  } catch (err) {
    console.error("[Ledger] Delete failed:", err);
  }
}


/* --------------------------------------------------------------------------
   9. FILTERS — All / Income / Expense tabs
   -------------------------------------------------------------------------- */
function bindFilters() {
  refs.filters.forEach(btn => {
    btn.addEventListener("click", () => {
      state.filter = btn.dataset.filter;
      refs.filters.forEach(b =>
        b.classList.toggle("is-active", b === btn));
      renderList();
    });
  });
}

/* ==========================================================================
   PROPERTIES — possessions tracker (shoes, socks, anything countable)
   --------------------------------------------------------------------------
   Firestore collection: `properties`
   Doc shape: { name, category, quantity, notes, uid, createdAt, updatedAt }
   Categories are user-created — nothing is hardcoded.
   ========================================================================== */



const propertyState = {
  items: []
};

let propertyRefs = {};

async function initProperties() {
  cachePropertyRefs();
  bindPropertyForm();
  await loadProperties();
}

function cachePropertyRefs() {
  propertyRefs = {
    form:      document.getElementById("prop-form"),
    name:      document.getElementById("prop-name"),
    category:  document.getElementById("prop-category"),
    quantity:  document.getElementById("prop-quantity"),
    notes:     document.getElementById("prop-notes"),
    list:      document.getElementById("prop-list"),
    empty:     document.getElementById("prop-empty"),
    datalist:  document.getElementById("prop-category-list")
  };
}

async function loadProperties() {
  try {
    propertyState.items = await listDocs("properties", {
      orderByField: "category",
      orderDir: "asc"
    });
  } catch (err) {
    console.error("[Properties] Load failed:", err);
    propertyState.items = [];
  }
  renderProperties();
  renderCategorySuggestions();
}

function renderCategorySuggestions() {
  if (!propertyRefs.datalist) return;
  clear(propertyRefs.datalist);

  const categories = [...new Set(propertyState.items.map(p => p.category))]
    .filter(Boolean)
    .sort();

  for (const cat of categories) {
    propertyRefs.datalist.appendChild(
      el("option", { value: cat })
    );
  }
}

function renderProperties() {
  if (!propertyRefs.list) return;
  clear(propertyRefs.list);

  if (propertyState.items.length === 0) {
    propertyRefs.empty?.classList.remove("hidden");
    return;
  }
  propertyRefs.empty?.classList.add("hidden");

  // Group by category
  const grouped = {};
  for (const p of propertyState.items) {
    const cat = p.category || "Uncategorized";
    (grouped[cat] ||= []).push(p);
  }

  for (const [cat, items] of Object.entries(grouped)) {
    propertyRefs.list.appendChild(
      el("div", { class: "prop-group" },
        el("div", { class: "prop-group__title", text: cat }),
        ...items.map(buildPropertyRow)
      )
    );
  }
}

function buildPropertyRow(p) {
  return el("div", { class: "prop-row" },
    el("div", { class: "prop-row__main" },
      el("div", { class: "prop-row__name", text: p.name }),
      p.notes ? el("div", { class: "prop-row__notes", text: p.notes }) : null
    ),
    el("div", { class: "prop-row__qty", text: `× ${p.quantity}` }),
    el("button", {
      class: "prop-row__btn",
      type: "button",
      title: "Edit",
      onclick: () => handleEditProperty(p)
    }, "Edit"),
    el("button", {
      class: "prop-row__btn prop-row__btn--danger",
      type: "button",
      title: "Delete",
      onclick: () => handleDeleteProperty(p.id, p.name)
    }, "Delete")
  );
}

function bindPropertyForm() {
  if (!propertyRefs.form) return;

  propertyRefs.form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const data = {
      name:     (propertyRefs.name.value || "").trim(),
      category: (propertyRefs.category.value || "").trim() || "Uncategorized",
      quantity: toNumber(propertyRefs.quantity.value, 0),
      notes:    (propertyRefs.notes.value || "").trim()
    };

    if (!data.name) return alert("Name is required.");
    if (data.quantity < 0) return alert("Quantity can't be negative.");

    try {
      await addDoc("properties", data);
      propertyRefs.form.reset();
      await loadProperties();
    } catch (err) {
      console.error("[Properties] Add failed:", err);
      alert("Could not save. Check console.");
    }
  });
}

async function handleEditProperty(p) {
  const newQty = prompt(`New quantity for "${p.name}":`, p.quantity);
  if (newQty === null) return;
  const qty = toNumber(newQty, NaN);
  if (!Number.isFinite(qty) || qty < 0) return alert("Invalid number.");

  try {
    await fsUpdateDoc("properties", p.id, { quantity: qty });
    await loadProperties();
  } catch (err) {
    console.error("[Properties] Update failed:", err);
  }
}

async function handleDeleteProperty(id, name) {
  if (!confirm(`Delete "${name}"?`)) return;
  try {
    await deleteDoc("properties", id);
    await loadProperties();
  } catch (err) {
    console.error("[Properties] Delete failed:", err);
  }
}
