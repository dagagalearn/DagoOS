/* ==========================================================================
   DagoOS — Backup: Export & Import
   --------------------------------------------------------------------------
   All collections the app uses. Add new collections here when we build new
   modules, and export/import automatically includes them.
   ========================================================================== */

import {
  collection, doc, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { getCurrentUser } from "./auth.js";


/* --------------------------------------------------------------------------
   1. COLLECTIONS LIST
   -------------------------------------------------------------------------- */
export const COLLECTIONS = [
  "transactions",
  "properties",
  "journal",
  "courses",
  "exams",
  "skills",
  "vaultFiles",
  "todos",
  "milestones",
  "activity"
];


/* --------------------------------------------------------------------------
   2. EXPORT — pull every doc for the current user from every collection
   -------------------------------------------------------------------------- */
export async function exportAllData() {
  const user = getCurrentUser();
  if (!user) throw new Error("Not signed in.");

  const output = {
    _meta: {
      app: "DagoOS",
      version: 1,
      exportedAt: new Date().toISOString(),
      uid: user.uid,
      displayName: user.displayName || "",
      email: user.email || ""
    },
    collections: {}
  };

  const { query, where } = await import(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
  );

  for (const name of COLLECTIONS) {
    const q = query(collection(db, name), where("uid", "==", user.uid));
    const snap = await getDocs(q);

    output.collections[name] = snap.docs.map(d => {
      const data = d.data();
      // Firestore Timestamps → ISO strings for readability + portability
      return {
        id: d.id,
        ...convertTimestamps(data)
      };
    });
  }

  return output;
}


/* --------------------------------------------------------------------------
   3. TRIGGER DOWNLOAD
   -------------------------------------------------------------------------- */
export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}


/* --------------------------------------------------------------------------
   4. IMPORT — write every doc back into Firestore
   --------------------------------------------------------------------------
   IMPORTANT: This uses .set() with the original doc IDs preserved when
   available. Docs without an id get a new auto-generated one.
   Existing docs with matching IDs are OVERWRITTEN.
   -------------------------------------------------------------------------- */
export async function importAllData(backup, options = {}) {
  const user = getCurrentUser();
  if (!user) throw new Error("Not signed in.");

  if (!backup || !backup.collections) {
    throw new Error("Invalid backup file: missing 'collections'.");
  }

  const report = {
    collection: {},
    totalWritten: 0,
    totalSkipped: 0,
    errors: []
  };

  // Firestore batches cap at 500 writes, so we process in chunks.
  const BATCH_LIMIT = 400;

  for (const name of Object.keys(backup.collections)) {
    const docs = backup.collections[name] || [];
    let written = 0;
    let skipped = 0;

    // Skip collections we don't recognize
    if (!COLLECTIONS.includes(name)) {
      report.collection[name] = { written: 0, skipped: docs.length, skippedReason: "unknown collection" };
      report.totalSkipped += docs.length;
      continue;
    }

    // Process in batches
    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
      const chunk = docs.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);

      for (const d of chunk) {
        try {
          // Force uid to the current user, so imports are always yours
          const data = restoreTimestamps({ ...d, uid: user.uid });
          delete data.id;   // id is stored separately

          const ref = d.id ? doc(db, name, d.id) : doc(collection(db, name));
          batch.set(ref, data, { merge: false });
          written++;
        } catch (err) {
          skipped++;
          report.errors.push({ collection: name, id: d.id, message: err.message });
        }
      }

      try {
        await batch.commit();
      } catch (err) {
        report.errors.push({
          collection: name,
          message: "Batch commit failed: " + err.message
        });
        skipped += chunk.length;
        written -= chunk.length;
      }
    }

    report.collection[name] = { written, skipped };
    report.totalWritten += written;
    report.totalSkipped += skipped;
  }

  return report;
}


/* --------------------------------------------------------------------------
   5. WIPE — delete every doc for the current user in every collection
   -------------------------------------------------------------------------- */
export async function wipeAllData() {
  const user = getCurrentUser();
  if (!user) throw new Error("Not signed in.");

  const { query, where } = await import(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
  );

  let deleted = 0;

  for (const name of COLLECTIONS) {
    const q = query(collection(db, name), where("uid", "==", user.uid));
    const snap = await getDocs(q);

    // Process in chunks of 400
    const ids = snap.docs.map(d => d.id);
    for (let i = 0; i < ids.length; i += 400) {
      const batch = writeBatch(db);
      ids.slice(i, i + 400).forEach(id => {
        batch.delete(doc(db, name, id));
      });
      await batch.commit();
      deleted += Math.min(400, ids.length - i);
    }
  }

  return { deleted };
}


/* --------------------------------------------------------------------------
   6. STATS — counts per collection (for the Settings page)
   -------------------------------------------------------------------------- */
export async function getStats() {
  const user = getCurrentUser();
  if (!user) throw new Error("Not signed in.");

  const { query, where } = await import(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
  );

  const stats = {};

  for (const name of COLLECTIONS) {
    try {
      const q = query(collection(db, name), where("uid", "==", user.uid));
      const snap = await getDocs(q);
      stats[name] = snap.size;
    } catch (err) {
      stats[name] = -1;   // -1 = error
    }
  }

  return stats;
}


/* --------------------------------------------------------------------------
   7. TIMESTAMP CONVERSION
   --------------------------------------------------------------------------
   Firestore Timestamps don't serialize to JSON cleanly. We convert them to
   a tagged object on export and back to Timestamps on import.
   -------------------------------------------------------------------------- */
function convertTimestamps(data) {
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && typeof v.toDate === "function") {
      // Firestore Timestamp
      out[k] = { __type: "timestamp", value: v.toDate().toISOString() };
    } else if (Array.isArray(v)) {
      out[k] = v.map(item =>
        item && typeof item === "object" && typeof item.toDate === "function"
          ? { __type: "timestamp", value: item.toDate().toISOString() }
          : item
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

function restoreTimestamps(data) {
  // We can't import Timestamp class synchronously, so on import we
  // convert tagged objects to plain ISO strings. Firestore accepts ISO
  // strings for date fields written via set() — but our data model uses
  // Timestamp type for createdAt/updatedAt.
  //
  // Simplest approach: convert to a Date object; Firestore will store it
  // as a Timestamp automatically.
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && v.__type === "timestamp") {
      out[k] = new Date(v.value);
    } else if (Array.isArray(v)) {
      out[k] = v.map(item =>
        item && typeof item === "object" && item.__type === "timestamp"
          ? new Date(item.value)
          : item
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}
