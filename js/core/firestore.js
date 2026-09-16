/* ==========================================================================
   DagoOS — Firestore Helpers
   --------------------------------------------------------------------------
   Generic CRUD wrappers over Firestore. Modules use these instead of the
   raw SDK, so:

     1. Every doc automatically gets `uid` (current user) and timestamps.
     2. Every query automatically filters by `uid` (multi-user safe).
     3. If we ever swap databases, only THIS file changes.

   Exports:
     listDocs(collectionName, { orderByField, orderDir, limit })
     addDoc(collectionName, data)
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
   --------------------------------------------------------------------------
   Every read/write requires a signed-in user. If somehow a module calls
   a helper before sign-in, fail loud and clear — not silently.
   -------------------------------------------------------------------------- */
function requireUser() {
  const user = getCurrentUser();
  if (!user) throw new Error("[DagoOS firestore] No signed-in user.");
  return user;
}


/* --------------------------------------------------------------------------
   2. LIST — fetch all docs for the current user
   --------------------------------------------------------------------------
   Options:
     orderByField (string, default "createdAt")
     orderDir     ("asc" | "desc", default "desc")
     limit        (number, optional)
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
   3. ADD — create a new doc, auto-stamping uid + timestamps
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
  return ref.id;
}


/* --------------------------------------------------------------------------
   4. UPDATE — patch an existing doc, bump updatedAt
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
   5. DELETE — remove a doc by id
   -------------------------------------------------------------------------- */
export async function deleteDoc(collectionName, id) {
  requireUser();
  await fsDeleteDoc(doc(db, collectionName, id));
}


/* --------------------------------------------------------------------------
   6. GET ONE — fetch a single doc
   -------------------------------------------------------------------------- */
export async function getDocById(collectionName, id) {
  requireUser();
  const snap = await getDoc(doc(db, collectionName, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}


/* --------------------------------------------------------------------------
   7. RE-EXPORT serverTimestamp for callers who need it
   -------------------------------------------------------------------------- */
export const serverTimestamp = fsServerTimestamp;
