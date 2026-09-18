/* ==========================================================================
   DagoOS — Command Center
   --------------------------------------------------------------------------
   The dashboard. Pulls live data from every module + the activity log.

   Sections:
     1. Stat cards (Ledger balance, Journal, Academy GPA, Vault count)
     2. Quick scratchpad → saves as Journal entry
     3. Recent transactions (5)
     4. Recent activity feed (10)
   ========================================================================== */

import { listDocs, addDoc } from "../core/firestore.js";
import { el, clear, formatCurrency, formatDate, toNumber, todayISO }
  from "../core/utils.js";


/* --------------------------------------------------------------------------
   1. STATE
   -------------------------------------------------------------------------- */
const state = {
  transactions: [],
  journal: [],
  courses: [],
  vault: [],
  activity: []
};

let refs = {};


/* --------------------------------------------------------------------------
   2. ENTRY POINT
   -------------------------------------------------------------------------- */
export async function initDashboard() {
  cacheRefs();
  bindScratchpad();
  await loadAll();
  renderStats();
  renderRecentTransactions();
  renderRecentActivity();
}


function cacheRefs() {
  refs = {
    // Stat cards
    balance:      document.getElementById("dash-balance"),
    journalCount: document.getElementById("dash-journal-count"),
    journalLast:  document.getElementById("dash-journal-last"),
    gpa:          document.getElementById("dash-gpa"),
    gpaCourses:   document.getElementById("dash-gpa-courses"),
    vaultCount:   document.getElementById("dash-vault-count"),
    vaultLast:    document.getElementById("dash-vault-last"),

    // Scratchpad
    scratch:      document.getElementById("dash-scratch"),
    scratchSave:  document.getElementById("dash-scratch-save"),
    scratchStatus:document.getElementById("dash-scratch-status"),

    // Lists
    txList:       document.getElementById("dash-tx-list"),
    txEmpty:      document.getElementById("dash-tx-empty"),
    activityList: document.getElementById("dash-activity-list"),
    activityEmpty:document.getElementById("dash-activity-empty")
  };
}


/* --------------------------------------------------------------------------
   3. LOAD ALL MODULES IN PARALLEL
   -------------------------------------------------------------------------- */
async function loadAll() {
  const safe = async (name, opts) => {
    try { return await listDocs(name, opts); }
    catch (err) {
      console.warn(`[Dashboard] Could not load ${name}:`, err.message);
      return [];
    }
  };

  const [transactions, journal, courses, vault, activity] = await Promise.all([
    safe("transactions", { orderByField: "date", orderDir: "desc", limit: 100 }),
    safe("journal",      { orderByField: "date", orderDir: "desc", limit: 100 }),
    safe("courses",      { orderByField: "semester", orderDir: "desc" }),
    safe("vaultFiles",   { orderByField: "date", orderDir: "desc", limit: 100 }),
    safe("activity",     { orderByField: "createdAt", orderDir: "desc", limit: 10 })
  ]);

  state.transactions = transactions;
  state.journal      = journal;
  state.courses      = courses;
  state.vault        = vault;
  state.activity     = activity;
}


/* --------------------------------------------------------------------------
   4. STAT CARDS
   -------------------------------------------------------------------------- */
function renderStats() {
  // Ledger balance
  let income = 0, expense = 0;
  for (const t of state.transactions) {
    const amt = toNumber(t.amount);
    if (t.type === "income") income += amt;
    else                     expense += amt;
  }
  const balance = income - expense;

  if (refs.balance) {
    refs.balance.textContent = formatCurrency(balance);
    refs.balance.classList.toggle("is-negative", balance < 0);
    refs.balance.classList.toggle("is-positive", balance > 0);
  }

  // Journal
  if (refs.journalCount) {
    refs.journalCount.textContent = state.journal.length;
  }
  if (refs.journalLast && state.journal.length > 0) {
    const latest = state.journal[0];
    refs.journalLast.textContent =
      `${latest.title || "(untitled)"} · ${formatDate(latest.date)}`;
  } else if (refs.journalLast) {
    refs.journalLast.textContent = "No entries yet";
  }

  // Academy GPA
  let totalCredits = 0, weightedSum = 0, completedCount = 0;
  for (const c of state.courses) {
    const credits = toNumber(c.credits);
    if (c.status === "completed" && c.grade != null && c.grade !== "") {
      const grade = toNumber(c.grade);
      totalCredits += credits;
      weightedSum  += grade * credits;
      completedCount++;
    }
  }
  const gpa = totalCredits > 0 ? (weightedSum / totalCredits) : 0;

  if (refs.gpa)        refs.gpa.textContent = gpa.toFixed(2);
  if (refs.gpaCourses) refs.gpaCourses.textContent = `${completedCount} completed`;

  // Vault
  if (refs.vaultCount) {
    refs.vaultCount.textContent = state.vault.length;
  }
  if (refs.vaultLast && state.vault.length > 0) {
    const latest = state.vault[0];
    refs.vaultLast.textContent =
      `${latest.title || "(untitled)"} · ${latest.category || "Others"}`;
  } else if (refs.vaultLast) {
    refs.vaultLast.textContent = "No files yet";
  }
}


/* --------------------------------------------------------------------------
   5. RECENT TRANSACTIONS
   -------------------------------------------------------------------------- */
function renderRecentTransactions() {
  if (!refs.txList) return;
  clear(refs.txList);

  const recent = state.transactions.slice(0, 5);

  if (recent.length === 0) {
    refs.txEmpty?.classList.remove("hidden");
    return;
  }
  refs.txEmpty?.classList.add("hidden");

  for (const t of recent) {
    const isIncome = t.type === "income";
    const sign = isIncome ? "+" : "−";

    refs.txList.appendChild(
      el("div", { class: "dash-row" },
        el("div", { class: "dash-row__main" },
          el("div", { class: "dash-row__title",
            text: t.description || t.category || "(no description)" }),
          el("div", { class: "dash-row__meta",
            text: [t.category, formatDate(t.date)].filter(Boolean).join(" · ") })
        ),
        el("div", {
          class: `dash-row__value dash-row__value--${isIncome ? "income" : "expense"}`,
          text: `${sign} ${formatCurrency(t.amount)}`
        })
      )
    );
  }
}


/* --------------------------------------------------------------------------
   6. RECENT ACTIVITY
   -------------------------------------------------------------------------- */
function renderRecentActivity() {
  if (!refs.activityList) return;
  clear(refs.activityList);

  if (state.activity.length === 0) {
    refs.activityEmpty?.classList.remove("hidden");
    return;
  }
  refs.activityEmpty?.classList.add("hidden");

  for (const a of state.activity) {
    const when = a.createdAt?.toDate
      ? timeAgo(a.createdAt.toDate())
      : "";

    refs.activityList.appendChild(
      el("div", { class: "dash-activity" },
        el("div", { class: "dash-activity__dot" }),
        el("div", { class: "dash-activity__text" },
          el("div", { class: "dash-activity__label", text: a.label || "Action" }),
          el("div", { class: "dash-activity__title",
            text: a.title || "(untitled)" })
        ),
        el("div", { class: "dash-activity__when", text: when })
      )
    );
  }
}


function timeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60)     return "just now";
  if (seconds < 3600)   return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400)  return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}


/* --------------------------------------------------------------------------
   7. SCRATCHPAD — quick journal entry
   -------------------------------------------------------------------------- */
function bindScratchpad() {
  if (!refs.scratchSave) return;

  refs.scratchSave.addEventListener("click", async () => {
    const text = (refs.scratch.value || "").trim();
    if (!text) {
      setScratchStatus("Nothing to save.", "warning");
      return;
    }

    // First line becomes the title; rest becomes the body
    const lines = text.split("\n");
    const title = lines[0].slice(0, 80);
    const body  = lines.slice(1).join("\n").trim();

    try {
      await addDoc("journal", {
        title,
        body,
        mood: "",
        tags: ["scratchpad"],
        date: todayISO()
      });

      refs.scratch.value = "";
      setScratchStatus("Saved to Journal.", "success");
      // Refresh journal-related stats
      state.journal = await listDocs("journal", {
        orderByField: "date", orderDir: "desc", limit: 100
      });
      renderStats();
    } catch (err) {
      console.error("[Dashboard] Scratchpad save failed:", err);
      setScratchStatus("Could not save.", "danger");
    }
  });
}


function setScratchStatus(text, kind = "info") {
  if (!refs.scratchStatus) return;
  refs.scratchStatus.textContent = text;
  refs.scratchStatus.className = `scratch-status scratch-status--${kind}`;
  setTimeout(() => {
    refs.scratchStatus.textContent = "";
    refs.scratchStatus.className = "scratch-status";
  }, 2500);
}
