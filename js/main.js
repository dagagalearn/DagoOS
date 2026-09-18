/* ==========================================================================
   DagoOS — Main Entry Point
   --------------------------------------------------------------------------
   Loaded by every page. Responsibilities:
     1. Boot Firebase (side-effect of importing firebase-config)
     2. Watch auth state, update header UI + auth gate
     3. Highlight the active nav link
     4. Load the page-specific module based on <body data-page="...">
   ========================================================================== */

import "./core/firebase-config.js";        // side-effect: initializes Firebase
import { onAuthChange, signInWithGoogle, signOutUser } from "./core/auth.js";
import { renderAuthArea } from "./core/ui-helpers.js";


/* --------------------------------------------------------------------------
   1. NAV HIGHLIGHT
   -------------------------------------------------------------------------- */
function highlightActiveNav() {
  const page = document.body.dataset.page;
  if (!page) return;

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
   2. PAGE MODULE DISPATCH
   -------------------------------------------------------------------------- */
async function loadPageModule(page) {
  switch (page) {
    case "dashboard":
  const { initDashboard } = await import("./modules/dashboard.js");
      await initDashboard();
      break;

    case "ledger": {
      const { initLedger } = await import("./modules/ledger.js");
      await initLedger();
      break;
    }

    case "journal": {
      const { initJournal } = await import("./modules/journal.js");
      await initJournal();
      break;
    }

    case "academy": {
  const { initAcademy } = await import("./modules/academy.js");
  await initAcademy();
  break;
}

    case "vault":
const { initVault } = await import("./modules/vault.js");
      await initVault();
      break;
   case "todo": {
      const { initTodo } = await import("./modules/todo.js");
      await initTodo();
      break;
    }
    case "tree": {
      const { initLifeTree } = await import("./modules/life-tree.js");
      await initLifeTree();
      break;
    }

    default:
      console.warn("[DagoOS] Unknown page:", page);
  }
}


/* --------------------------------------------------------------------------
   3. HANDLERS
   -------------------------------------------------------------------------- */
async function handleSignIn() {
  try {
    await signInWithGoogle();
  } catch (err) {
    // Errors are already surfaced in auth.js with friendly messages.
    // Nothing more to do here.
  }
}

async function handleSignOut() {
  await signOutUser();
}


/* --------------------------------------------------------------------------
   4. AUTH GATE
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


/* --------------------------------------------------------------------------
   5. BOOT
   -------------------------------------------------------------------------- */
function boot() {
  console.log("[DagoOS] Booting…");

  highlightActiveNav();

  const page = document.body.dataset.page;

  onAuthChange(async (user) => {
    if (user) {
      console.log(`[DagoOS] Signed in as: ${user.displayName}  ·  UID: ${user.uid}`);
      document.body.dataset.auth = "in";
      setAuthGate(false);
      await loadPageModule(page);
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
