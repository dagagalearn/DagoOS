/* ==========================================================================
   DagoOS — Authentication Layer
   --------------------------------------------------------------------------
   Wraps Firebase Auth so the rest of the app never imports firebase/auth
   directly. If we ever switch sign-in providers, only this file changes.

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
   1. GOOGLE PROVIDER — configured once, reused for every sign-in
   -------------------------------------------------------------------------- */
const googleProvider = new GoogleAuthProvider();

// Always show the account picker (otherwise Google silently reuses the last
// account, which is annoying if you have multiple Google logins).
googleProvider.setCustomParameters({ prompt: "select_account" });


/* --------------------------------------------------------------------------
   2. SIGN IN
   -------------------------------------------------------------------------- */
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result;                       // { user, credential, ... }
  } catch (err) {
    // Common codes we might hit:
    //   auth/popup-closed-by-user     → user closed the popup
    //   auth/popup-blocked            → browser blocked it
    //   auth/unauthorized-domain      → github.io not whitelisted
    console.error("[DagoOS auth] Sign-in failed:", err.code, err.message);
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
   --------------------------------------------------------------------------
   Pass a callback. It fires immediately with either the current user or
   null, then again on every sign-in / sign-out.

   Returns an "unsubscribe" function in case we ever need to detach.
   -------------------------------------------------------------------------- */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}


/* --------------------------------------------------------------------------
   5. SYNCHRONOUS GETTER — for convenience after boot
   -------------------------------------------------------------------------- */
export function getCurrentUser() {
  return auth.currentUser;
}
