/* ==========================================================================
   DagoOS — Main Entry Point
   --------------------------------------------------------------------------
   Loaded by every page. Responsibilities:
     1. Boot Firebase (side-effect of importing firebase-config)
     2. Watch auth state, update header UI
     3. Highlight the active nav link
     4. Load the page-specific module based on <body data-page="...">

   Future pages will load the SAME file. Nothing here is dashboard-specific.
   ========================================================================== */

import "./core/firebase-config.js";        // side-effect: initializes Firebase
import { onAuthChange, signInWithGoogle, signOutUser, handleRedirectResult } from "./core/auth.js";
import { renderAuthArea } from "./core/ui-helpers.js";


/* --------------------------------------------------------------------------
   1. NAV HIGHLIGHT — matches <body data-page="X"> to nav-link href="X.html"
   -------------------------------------------------------------------------- */
function highlightActiveNav() {
  const page = document.body.dataset.page;         // e.g. "dashboard"
  if (!page) return;

  // The nav uses href="index.html" for the dashboard, others match the page id.
  const targetHref = page === "dashboard" ? "index.html" : `${page}.html`;

  document.querySelectorAll(".nav-link").forEach(link => {
    const href = link.getAttribute("href");
    if (href === targetHref) {
      link.classList.add("nav-link--active");
    } else {
      link.classList.remove("nav-link--active");
    }
  });
}


/* --------------------------------------------------------------------------
   2. PAGE MODULE DISPATCH — will grow as we add modules
   -------------------------------------------------------------------------- */
async function loadPageModule(page) {
  switch (page) {
    case "dashboard":
      // await import("./modules/dashboard.js");
      console.log("[DagoOS] Dashboard module not built yet — Phase 7.");
      break;
    case "ledger":
        const { initLedger } = await import("./modules/ledger.js");
      await initLedger();
      break;
    case "journal":
           const { initJournal } = await import("./modules/journal.js");
      await initJournal();
      break;
    case "academy":
      // await import("./modules/academy.js");
      break;
    case "vault":
      // await import("./modules/vault.js");
      break;
    default:
      console.warn("[DagoOS] Unknown page:", page);
  }
}


/* --------------------------------------------------------------------------
   3. HANDLERS passed to the UI helpers
   -------------------------------------------------------------------------- */
async function handleSignIn() {
  try {
    await signInWithGoogle();
  } catch (err) {
    alert(
      "Sign-in failed.\n\n" +
      "Most common cause: the domain isn't authorized in Firebase.\n" +
      "Check: Authentication → Settings → Authorized domains.\n\n" +
      "Error code: " + (err.code || err.message)
    );
  }
}

async function handleSignOut() {
  await signOutUser();
}


/* --------------------------------------------------------------------------
   4. BOOT
   -------------------------------------------------------------------------- */
async function boot() {
  console.log("[DagoOS] Booting…");
await handleRedirectResult();

  highlightActiveNav();

  const page = document.body.dataset.page;

  // Watch auth. Callback fires immediately (with user or null),
  // then again on every sign-in / sign-out.
  onAuthChange(async (user) => {
    if (user) {
      console.log(`[DagoOS] Signed in as: ${user.displayName}  ·  UID: ${user.uid}`);
      document.body.dataset.auth = "in";
      setAuthGate(false);
      await loadPageModule(page);      // load module ONLY when signed in
    } else {
      console.log("[DagoOS] Signed out");
      document.body.dataset.auth = "out";
      setAuthGate(true);
    }

    renderAuthArea(user, {
      onSignIn:  handleSignIn,
      onSignOut: handleSignOut
    });
  });
}


/* --------------------------------------------------------------------------
   AUTH GATE — show a "please sign in" panel when logged out
   --------------------------------------------------------------------------
   The gate is injected into .main on demand. When active, it covers the
   content area. When inactive, it's removed and page modules render freely.
   -------------------------------------------------------------------------- */
function setAuthGate(active) {
  const main = document.querySelector(".main");
  if (!main) return;

  let gate = document.getElementById("auth-gate");

  if (active) {
    if (!gate) {
      gate = document.createElement("div");
      gate.id = "auth-gate";
      gate.className = "auth-gate";
      gate.innerHTML = `
        <div class="auth-gate__inner">
          <div class="auth-gate__icon">🔒</div>
          <h2 class="auth-gate__title">Sign in to DagoOS</h2>
          <p class="auth-gate__text">
            This is a private dashboard. Please sign in with your authorized
            Google account to continue.
          </p>
          <button id="auth-gate-btn" class="btn btn--primary" type="button">
            Sign in with Google
          </button>
        </div>
      `;
      main.prepend(gate);
      gate.querySelector("#auth-gate-btn")
          .addEventListener("click", handleSignIn);
    }
    gate.classList.remove("hidden");
  } else if (gate) {
    gate.remove();
  }
}

// DOM might not be ready if the module loads before parsing finishes.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
