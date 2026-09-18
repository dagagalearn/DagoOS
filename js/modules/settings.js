/* ==========================================================================
   DagoOS — Settings
   --------------------------------------------------------------------------
   Backup, restore, danger zone, and account info.
   ========================================================================== */

import {
  exportAllData, downloadJSON, importAllData, wipeAllData, getStats, COLLECTIONS
} from "../core/backup.js";
import { getCurrentUser, signOutUser } from "../core/auth.js";
import { el, clear, todayISO } from "../core/utils.js";


/* --------------------------------------------------------------------------
   1. STATE
   -------------------------------------------------------------------------- */
let refs = {};


/* --------------------------------------------------------------------------
   2. ENTRY POINT
   -------------------------------------------------------------------------- */
export async function initSettings() {
  cacheRefs();
  bindAccount();
  bindExport();
  bindImport();
  bindWipe();
  await loadAccount();
  await loadStats();
}


function cacheRefs() {
  refs = {
    // Account
    name:        document.getElementById("settings-name"),
    email:       document.getElementById("settings-email"),
    uid:         document.getElementById("settings-uid"),
    signOutBtn:  document.getElementById("settings-signout"),

    // Stats
    statsList:   document.getElementById("settings-stats"),

    // Export
    exportBtn:   document.getElementById("settings-export"),
    exportStatus:document.getElementById("settings-export-status"),

    // Import
    importInput: document.getElementById("settings-import-input"),
    importBtn:   document.getElementById("settings-import"),
    importStatus:document.getElementById("settings-import-status"),

    // Wipe
    wipeBtn:     document.getElementById("settings-wipe"),
    wipeStatus:  document.getElementById("settings-wipe-status")
  };
}


/* --------------------------------------------------------------------------
   3. ACCOUNT
   -------------------------------------------------------------------------- */
async function loadAccount() {
  const user = getCurrentUser();
  if (!user) return;

  if (refs.name)  refs.name.textContent  = user.displayName || "(no name)";
  if (refs.email) refs.email.textContent = user.email || "(no email)";
  if (refs.uid)   refs.uid.textContent   = user.uid;
}


function bindAccount() {
  refs.signOutBtn?.addEventListener("click", async () => {
    await signOutUser();
    // main.js will handle the auth state change and show the gate
  });
}


/* --------------------------------------------------------------------------
   4. STATS
   -------------------------------------------------------------------------- */
async function loadStats() {
  if (!refs.statsList) return;
  clear(refs.statsList);
  refs.statsList.appendChild(el("div", { class: "settings-stats__row", text: "Loading…" }));

  try {
    const stats = await getStats();
    clear(refs.statsList);

    for (const name of COLLECTIONS) {
      const count = stats[name];
      const label = prettyName(name);

      refs.statsList.appendChild(
        el("div", { class: "settings-stats__row" },
          el("span", { class: "settings-stats__label", text: label }),
          el("span", { class: "settings-stats__count",
            text: count === -1 ? "error" : String(count) })
        )
      );
    }
  } catch (err) {
    clear(refs.statsList);
    refs.statsList.appendChild(el("div", { text: "Could not load stats." }));
    console.error("[Settings] Stats failed:", err);
  }
}


function prettyName(name) {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, c => c.toUpperCase())
    .replace(/ Files$/, " files");
}


/* --------------------------------------------------------------------------
   5. EXPORT
   -------------------------------------------------------------------------- */
function bindExport() {
  refs.exportBtn?.addEventListener("click", async () => {
    setStatus(refs.exportStatus, "Preparing export…", "info");
    try {
      const data = await exportAllData();
      const filename = `dagoos-backup-${todayISO()}.json`;
      downloadJSON(data, filename);
      const total = Object.values(data.collections)
        .reduce((sum, arr) => sum + arr.length, 0);
      setStatus(refs.exportStatus, `Exported ${total} documents.`, "success");
    } catch (err) {
      console.error("[Settings] Export failed:", err);
      setStatus(refs.exportStatus, "Export failed: " + err.message, "danger");
    }
  });
}


/* --------------------------------------------------------------------------
   6. IMPORT
   -------------------------------------------------------------------------- */
function bindImport() {
  refs.importBtn?.addEventListener("click", async () => {
    const file = refs.importInput?.files?.[0];
    if (!file) {
      setStatus(refs.importStatus, "Choose a JSON file first.", "warning");
      return;
    }

    if (!confirm(
      "Import will OVERWRITE existing documents with the same IDs.\n\n" +
      "Recommended: export your current data first as a backup.\n\n" +
      "Continue?"
    )) return;

    setStatus(refs.importStatus, "Reading file…", "info");

    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (!backup.collections) {
        throw new Error("Not a valid DagoOS backup file.");
      }

      setStatus(refs.importStatus, "Importing…", "info");

      const report = await importAllData(backup);

      let msg = `Imported ${report.totalWritten} documents.`;
      if (report.totalSkipped > 0) msg += ` Skipped ${report.totalSkipped}.`;
      if (report.errors.length > 0) msg += ` ${report.errors.length} errors.`;
      setStatus(refs.importStatus, msg, report.errors.length ? "warning" : "success");

      // Reload stats after import
      await loadStats();
    } catch (err) {
      console.error("[Settings] Import failed:", err);
      setStatus(refs.importStatus, "Import failed: " + err.message, "danger");
    }
  });
}


/* --------------------------------------------------------------------------
   7. WIPE
   -------------------------------------------------------------------------- */
function bindWipe() {
  refs.wipeBtn?.addEventListener("click", async () => {
    const doubleConfirm = prompt(
      "⚠️ This permanently deletes ALL your DagoOS data from Firestore.\n\n" +
      "Type DELETE (all caps) to confirm."
    );
    if (doubleConfirm !== "DELETE") {
      setStatus(refs.wipeStatus, "Cancelled.", "info");
      return;
    }

    setStatus(refs.wipeStatus, "Deleting…", "info");
    try {
      const { deleted } = await wipeAllData();
      setStatus(refs.wipeStatus, `Deleted ${deleted} documents.`, "success");
      await loadStats();
    } catch (err) {
      console.error("[Settings] Wipe failed:", err);
      setStatus(refs.wipeStatus, "Wipe failed: " + err.message, "danger");
    }
  });
}


/* --------------------------------------------------------------------------
   8. STATUS HELPER
   -------------------------------------------------------------------------- */
function setStatus(node, text, kind = "info") {
  if (!node) return;
  node.textContent = text;
  node.className = `settings-status settings-status--${kind}`;
  if (kind === "success" || kind === "warning") {
    setTimeout(() => {
      if (node.textContent === text) {
        node.textContent = "";
        node.className = "settings-status";
      }
    }, 4000);
  }
}
