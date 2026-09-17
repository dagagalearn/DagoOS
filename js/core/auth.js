/* ==========================================================================
   DagoOS — Authentication Layer
   --------------------------------------------------------------------------
   Wraps Firebase Auth so the rest of the app never imports firebase/auth
   directly. If we ever switch sign-in providers, only this file changes.

   On desktop: uses signInWithPopup (smoother).
   On mobile:  uses signInWithRedirect (works with blocked third-party cookies,
               Safari iOS, private mode, etc).

   Exports:
     signInWithGoogle()   → Promise<UserCredential | void>
     signOutUser()        → Promise<void>
     onAuthChange(cb)     → unsubscribe function
     getCurrentUser()     → User | null
     handleRedirectResult() → Promise<UserCredential | null>
   ========================================================================== */

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { auth } from "./firebase-config.js";


/* --------------------------------------------------------------------------
   1. GOOGLE PROVIDER
   -------------------------------------------------------------------------- */
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });


/* --------------------------------------------------------------------------
   2. MOBILE DETECTION
   --------------------------------------------------------------------------
   We use popup on desktop, redirect on mobile + small tablets.
   The threshold matches our CSS breakpoint so behavior feels consistent.
   -------------------------------------------------------------------------- */
function isMobile() {
  // One rule, no guessing: touch-primary devices (phones, tablets) use
  // redirect sign-in. Mouse-primary devices (desktops, laptops) use popup.
  //
  // This is a browser-native CSS media query. It cannot be fooled by
  // "desktop mode", user-agent spoofing, or viewport resizing — a finger
  // is still coarse, a mouse is still fine.
  return window.matchMedia("(pointer: coarse)").matches;
}


/* --------------------------------------------------------------------------
   3. SIGN IN — popup on desktop, redirect on mobile
   -------------------------------------------------------------------------- */
export async function signInWithGoogle() {
  try {
    if (isMobile()) {
      // Redirect method — will leave the page and come back
      await signInWithRedirect(auth, googleProvider);
      return;   // execution stops here; page navigates away
    }
    // Desktop: popup
    return await signInWithPopup(auth, googleProvider);
  } catch (err) {
    console.error("[DagoOS auth] Sign-in failed:", err.code, err.message);
    throw err;
  }
}


/* --------------------------------------------------------------------------
   4. HANDLE REDIRECT RESULT
   --------------------------------------------------------------------------
   After the user signs in via redirect and lands back on the page,
   Firebase needs a moment to process the result. This function awaits it.
   Called once on boot.
   -------------------------------------------------------------------------- */
export async function handleRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      console.log("[DagoOS auth] Redirect sign-in complete:", result.user.displayName);
    }
    return result;
  } catch (err) {
    console.error("[DagoOS auth] Redirect result error:", err.code, err.message);
    return null;
  }
}


/* --------------------------------------------------------------------------
   5. SIGN OUT
   -------------------------------------------------------------------------- */
export async function signOutUser() {
  await signOut(auth);
}


/* --------------------------------------------------------------------------
   6. OBSERVE AUTH STATE
   -------------------------------------------------------------------------- */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}


/* --------------------------------------------------------------------------
   7. SYNCHRONOUS GETTER
   -------------------------------------------------------------------------- */
export function getCurrentUser() {
  return auth.currentUser;
}
