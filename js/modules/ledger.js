/* ==========================================================================
   DagoOS — Dago Ledger
   --------------------------------------------------------------------------
   Income / expense tracker. Uses Firestore collection: `transactions`.

   Data shape (see docs — no docs, but you get the idea):
     {
       type: "income" | "expense",
       amount: number,
       currency: "EUR",
       category: string,
       description: string,
       date: "YYYY-MM-DD",
       uid, createdAt, updatedAt   (added automatically by firestore.js)
     }
   ========================================================================== */

import { listDocs, addDoc, deleteDoc } from "../core/firestore.js";
import { formatCurrency, formatDate, todayISO, el, clear, toNumber }
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
      currency:    "EUR",
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
