/* ==========================================================================
   DagoOS — Firebase Configuration
   --------------------------------------------------------------------------
   Single source of truth for Firebase init. Every module imports `db`
   (Firestore) and `auth` (Authentication) from here.

   ⚠️ The apiKey below is NOT a secret. Firebase is designed so this config
   is public — security comes from Firestore Rules (locked to your UID),
   not from hiding these values. Never put a Google Drive client secret
   here though — that IS sensitive and lives only on your machine.
   ========================================================================== */


/* --------------------------------------------------------------------------
   1. FIREBASE SDK IMPORTS (v10 modular, via CDN — no npm, no build step)
   -------------------------------------------------------------------------- */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


/* --------------------------------------------------------------------------
   2. YOUR FIREBASE CONFIG — paste the values from Firebase console here
   --------------------------------------------------------------------------
   Find these in: Firebase Console → Project settings (⚙️) → Your apps → SDK setup.
   -------------------------------------------------------------------------- */

const firebaseConfig = {
  apiKey: "AIzaSyC8sGVWr3c-nEyRHgpruZXRCGn1FE5Vw8E",
  authDomain: "dagoos-cfd86.firebaseapp.com",
  projectId: "dagoos-cfd86",
  storageBucket: "dagoos-cfd86.firebasestorage.app",
  messagingSenderId: "574064075617",
  appId: "1:574064075617:web:1e9a6f92f386729e7adb20"
};




/* --------------------------------------------------------------------------
   3. INITIALIZE AND EXPORT
   --------------------------------------------------------------------------
   `app`   — the Firebase application instance (rarely used directly)
   `db`    — Firestore database handle (read/write structured data)
   `auth`  — Authentication handle (Google sign-in, current user)
   -------------------------------------------------------------------------- */
export const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);


/* --------------------------------------------------------------------------
   4. OPTIONAL SANITY CHECK (development only)
   --------------------------------------------------------------------------
   This log helps you confirm the connection is alive while we build.
   Safe to leave in — it only runs in the browser console.
   -------------------------------------------------------------------------- */
console.log("[DagoOS] Firebase initialized →", app.options.projectId);
