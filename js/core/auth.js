/* ==========================================================================
   DagoOS — Authentication Layer
   --------------------------------------------------------------------------
   Wraps Firebase Auth so the rest of the app never imports firebase/auth
   directly.

   Strategy: POPUP ONLY.
     - Works on desktop and mobile.
     - Bypasses mobile storage-partitioning issues that break redirect flow.
     - If popup is blocked, we tell the user how to allow it (one-time).

   Exports:
     signInWithGoogle()  → Promise<UserCredential>
     signOutUser()       → Promise<void>
     onAuthChange(cb)    → unsubscribe function
     getCurrentUser()    → User | null
   ========================================================================== */

import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { auth } from "./firebase-config.js";


/* --------------------------------------------------------------------------
   1. GOOGLE PROVIDER
   --------------------------------------------------------------------------
   "select_account" forces the account picker every sign-in so we never
   silently reuse a stale session.
   -------------------------------------------------------------------------- */
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });


/* --------------------------------------------------------------------------
   2. SIGN IN (popup only)
   -------------------------------------------------------------------------- */
export async function signInWithGoogle() {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (err) {
    // Map Firebase error codes to friendly messages
    switch (err.code) {
      case "auth/popup-blocked":
        alert(
          "Your browser blocked the sign-in popup.\n\n" +
          "Fix: tap the popup-blocked icon in the address bar, " +
          "choose 'Always allow', then try again."
        );
        break;
      case "auth/popup-closed-by-user":
        // User dismissed the popup — no need for an alert
        break;
      case "auth/unauthorized-domain":
        alert(
          "This domain isn't authorized for sign-in.\n\n" +
          "Add it in Firebase Console → Authentication → Settings → " +
          "Authorized domains."
        );
        break;
      case "auth/operation-not-allowed":
        alert(
          "Google sign-in is disabled in this Firebase project.\n\n" +
          "Enable it in Firebase Console → Authentication → Sign-in method."
        );
        break;
      default:
        alert("Sign-in failed.\n\nCode: " + (err.code || err.message));
    }
    console.error("[DagoOS auth] Sign-in error:", err.code, err.message);
    throw err;
  }
}


/* --------------------------------------------------------------------------
   3. SIGN OUT
   -------------------------------------------------------------------------- */
export async function signOutUser() {
  await signOut(auth);
}


/* --------------------------------------------------------------------------
   4. OBSERVE AUTH STATE
   -------------------------------------------------------------------------- */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}


/* --------------------------------------------------------------------------
   5. SYNCHRONOUS GETTER
   -------------------------------------------------------------------------- */
export function getCurrentUser() {
  return auth.currentUser;
}