/* ==========================================================================
   DagoOS — Firestore Helpers
   --------------------------------------------------------------------------
   Generic CRUD wrappers over Firestore. Modules use these instead of the
   raw SDK, so:

     1. Every doc automatically gets `uid` (current user) and timestamps.
     2. Every query automatically filters by `uid` (multi-user safe).
     3. Every create also logs to the `activity` collection.
     4. If we ever swap databases, only THIS file changes.

   Exports:
     listDocs(collectionName, { orderByField, orderDir, limit })
     addDoc(collectionName, data, { label })     ← label used for activity
     updateDoc(collectionName, id, patch)
     deleteDoc(collectionName, id)
     getDocById(collectionName, id)
     serverTimestamp()   → for manual timestamp needs
   ========================================================================== */

import {
  collection, doc,
  getDocs, getDoc,
  addDoc as fsAddDoc,
  updateDoc as fsUpdateDoc,
  deleteDoc as fsDeleteDoc,
  query, where, orderBy, limit as fsLimit,
  serverTimestamp as fsServerTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { db } from "./firebase-config.js";
import { getCurrentUser } from "./auth.js";


/* --------------------------------------------------------------------------
   1. INTERNAL: current UID or throw
   -------------------------------------------------------------------------- */
function requireUser() {
  const user = getCurrentUser();
  if (!user) throw new Error("[DagoOS firestore] No signed-in user.");
  return user;
}


/* --------------------------------------------------------------------------
   2. ACTIVITY LOGGING
   --------------------------------------------------------------------------
   Every create logs one row to `activity`. Fire-and-forget — a failure to
   log never blocks the actual write.
   -------------------------------------------------------------------------- */
const ACTIVITY_LABELS = {
  transactions: "Ledger entry",
  properties:   "Property",
  journal:      "Journal entry",
  courses:      "Course",
  skills:       "Skill",
  exams:        "Exam",
  vaultFiles:   "Vault file"
};

async function logActivity(user, collectionName, docId, title) {
  try {
    await fsAddDoc(collection(db, "activity"), {
      uid: user.uid,
      collection: collectionName,
      docId,
      label: ACTIVITY_LABELS[collectionName] || collectionName,
      title: String(title || "").slice(0, 120),
      createdAt: fsServerTimestamp()
    });
  } catch (_) {
    // Never let activity logging break the real write
  }
}


/* --------------------------------------------------------------------------
   3. LIST — fetch all docs for the current user
   -------------------------------------------------------------------------- */
export async function listDocs(collectionName, options = {}) {
  const user = requireUser();
  const {
    orderByField = "createdAt",
    orderDir     = "desc",
    limit
  } = options;

  const constraints = [
    where("uid", "==", user.uid),
    orderBy(orderByField, orderDir)
  ];
  if (limit) constraints.push(fsLimit(limit));

  const q = query(collection(db, collectionName), ...constraints);
  const snap = await getDocs(q);

  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}


/* --------------------------------------------------------------------------
   4. ADD — create a new doc, auto-stamping uid + timestamps + activity
   -------------------------------------------------------------------------- */
export async function addDoc(collectionName, data) {
  const user = requireUser();
  const payload = {
    ...data,
    uid: user.uid,
    createdAt: fsServerTimestamp(),
    updatedAt: fsServerTimestamp()
  };
  const ref = await fsAddDoc(collection(db, collectionName), payload);

  // Extract a title for the activity feed (works for any collection shape)
  const title =
    data.title ||
    data.name ||
    data.description ||
    data.body?.slice(0, 60) ||
    "";

  // Fire-and-forget activity log
  logActivity(user, collectionName, ref.id, title);

  return ref.id;
}


/* --------------------------------------------------------------------------
   5. UPDATE — patch an existing doc, bump updatedAt
   -------------------------------------------------------------------------- */
export async function updateDoc(collectionName, id, patch) {
  requireUser();
  const ref = doc(db, collectionName, id);
  await fsUpdateDoc(ref, {
    ...patch,
    updatedAt: fsServerTimestamp()
  });
}


/* --------------------------------------------------------------------------
   6. DELETE — remove a doc by id
   -------------------------------------------------------------------------- */
export async function deleteDoc(collectionName, id) {
  requireUser();
  await fsDeleteDoc(doc(db, collectionName, id));
}


/* --------------------------------------------------------------------------
   7. GET ONE — fetch a single doc
   -------------------------------------------------------------------------- */
export async function getDocById(collectionName, id) {
  requireUser();
  const snap = await getDoc(doc(db, collectionName, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}


/* --------------------------------------------------------------------------
   8. RE-EXPORT serverTimestamp for callers who need it
   -------------------------------------------------------------------------- */
export const serverTimestamp = fsServerTimestamp;
