/* ==========================================================================
   DagoOS — App Lock (Second-Layer Security)
   --------------------------------------------------------------------------
   After Google sign-in succeeds, the user must also enter a passphrase.

   How it works:
     1. The plaintext passphrase NEVER touches this code, Firestore, or
        the network. Only its SHA-256 hash is stored (below).
     2. On unlock, we hash the user's input and compare to the stored hash.
     3. On success, we set a flag in sessionStorage so navigation between
        pages stays unlocked — cleared when the tab closes or when the
        user signs out of Google.

   Security notes:
     • SHA-256 is one-way. The stored hash cannot be reversed.
     • This is defense-in-depth, NOT the primary security. Firestore rules
       are the real wall. This layer is UX + discouragement.
     • The hash is public in this file (viewable in the browser). Keep the
       passphrase long — a full sentence is plenty.
   ========================================================================== */


/* --------------------------------------------------------------------------
   1. CONFIG
   -------------------------------------------------------------------------- */
// SHA-256 hash of the owner's passphrase. Changing the passphrase means
// updating this value via the console script.
const OWNER_PASSPHRASE_HASH = "5aca1934cb705e52c6dd52b9b571dc3f92b008178bfc8ac25a31492fd2adeaeb";

// Owner UID — only this Google account is allowed past the first wall.
const OWNER_UID = "RhND4STDS8WlRnezZjWHMFHWgVn1";

const SESSION_KEY = "dagoos_unlocked";


/* --------------------------------------------------------------------------
   2. OWNER CHECK
   -------------------------------------------------------------------------- */
export function isOwner(user) {
  return !!user && user.uid === OWNER_UID;
}


/* --------------------------------------------------------------------------
   3. UNLOCK STATE (sessionStorage — per tab, cleared on close)
   -------------------------------------------------------------------------- */
export function isUnlocked() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch (_) {
    return false;
  }
}

export function markUnlocked() {
  try { sessionStorage.setItem(SESSION_KEY, "1"); } catch (_) {}
}

export function clearUnlock() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
}


/* --------------------------------------------------------------------------
   4. HASH + VERIFY
   -------------------------------------------------------------------------- */
async function sha256Hex(text) {
  const buf = new TextEncoder().encode(text);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hashBuf)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Returns true if the input matches the stored passphrase hash.
 * Uses constant-ish-time comparison to reduce timing side channels.
 */
export async function checkPassphrase(input) {
  const inputHash = await sha256Hex(String(input || ""));
  if (inputHash.length !== OWNER_PASSPHRASE_HASH.length) return false;

  let diff = 0;
  for (let i = 0; i < inputHash.length; i++) {
    diff |= inputHash.charCodeAt(i) ^ OWNER_PASSPHRASE_HASH.charCodeAt(i);
  }
  return diff === 0;
}
