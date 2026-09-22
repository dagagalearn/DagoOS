/* ==========================================================================
   DagoOS — UI Helpers
   --------------------------------------------------------------------------
   Tiny functions that create reusable DOM fragments. No framework, no magic.
   Each helper returns a DOM element the caller can insert anywhere.

   Currently:
     renderAuthArea(user, { onSignIn, onSignOut })
       → swaps the header's auth slot between "Sign in" and "user chip".
   ========================================================================== */


/* --------------------------------------------------------------------------
   1. HELPER: create an element with attributes and children in one call
   -------------------------------------------------------------------------- */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of children) {
    if (child == null) continue;
    node.append(child);
  }
  return node;
}


/* --------------------------------------------------------------------------
   2. SIGN-IN BUTTON (visible when logged out)
   -------------------------------------------------------------------------- */
function buildSignInButton(onClick) {
  const btn = el("button", {
    class: "btn btn--primary",
    type: "button",
    onclick: onClick
  },
    el("span", { class: "btn__icon", text: "→" }),
    el("span", { text: "Sign in with Google" })
  );
  return btn;
}


/* --------------------------------------------------------------------------
   3. USER CHIP (visible when logged in)
   --------------------------------------------------------------------------
   Shows the user's Google avatar, first name, and a sign-out button.
   -------------------------------------------------------------------------- */
function buildUserChip(user, onSignOut) {
  const displayName = user.displayName || user.email || "Signed in";
  const firstName   = displayName.split(" ")[0];
  const photoURL    = user.photoURL;

  const avatar = photoURL
    ? el("img", { class: "user-chip__avatar", src: photoURL, alt: "" })
    : el("div", { class: "user-chip__avatar user-chip__avatar--fallback",
                  text: firstName.charAt(0).toUpperCase() });

  return el("div", { class: "user-chip" },
    avatar,
    el("span", { class: "user-chip__name", text: firstName }),
    el("button", {
      class: "btn btn--ghost btn--sm",
      type: "button",
      title: "Sign out",
      onclick: onSignOut
    }, "Sign out")
  );
}


/* --------------------------------------------------------------------------
   4. MAIN ENTRY: render the auth area based on current state
   -------------------------------------------------------------------------- */
export function renderAuthArea(user, { onSignIn, onSignOut }) {
  const slot = document.getElementById("auth-area");
  if (!slot) return;                    // header not on this page — nothing to do

  slot.innerHTML = "";                  // clear whatever was there

  if (user) {
    slot.appendChild(buildUserChip(user, onSignOut));
  } else {
    slot.appendChild(buildSignInButton(onSignIn));
  }
}

/* --------------------------------------------------------------------------
   SKELETON LOADERS
   --------------------------------------------------------------------------
   Shimmering placeholder cards shown while Firestore is fetching.
   Call showSkeletons(container, count, type) before your fetch, and the
   skeleton disappears automatically when clear(container) is called.
   -------------------------------------------------------------------------- */

const SKELETON_TYPES = {
  card: `
    <div class="skeleton-card">
      <div class="skeleton-line skeleton-line--lg"></div>
      <div class="skeleton-line skeleton-line--sm"></div>
      <div class="skeleton-line skeleton-line--md"></div>
    </div>`,
  row: `
    <div class="skeleton-row">
      <div class="skeleton-circle"></div>
      <div class="skeleton-row__body">
        <div class="skeleton-line skeleton-line--md"></div>
        <div class="skeleton-line skeleton-line--sm"></div>
      </div>
      <div class="skeleton-line skeleton-line--xs"></div>
    </div>`,
  stat: `
    <div class="skeleton-stat">
      <div class="skeleton-line skeleton-line--xs"></div>
      <div class="skeleton-line skeleton-line--lg"></div>
    </div>`,
  milestone: `
    <div class="skeleton-milestone">
      <div class="skeleton-circle skeleton-circle--lg"></div>
      <div class="skeleton-milestone__body">
        <div class="skeleton-line skeleton-line--lg"></div>
        <div class="skeleton-line skeleton-line--sm"></div>
        <div class="skeleton-line skeleton-line--md"></div>
      </div>
    </div>`
};

/**
 * Fill a container with skeleton placeholders.
 * @param {HTMLElement|string} target   element or element id
 * @param {number}             count    how many skeletons to render
 * @param {"card"|"row"|"stat"|"milestone"} type
 */
export function showSkeletons(target, count = 3, type = "row") {
  const node = typeof target === "string"
    ? document.getElementById(target)
    : target;
  if (!node) return;

  const html = SKELETON_TYPES[type] || SKELETON_TYPES.row;
  node.innerHTML = Array.from({ length: count }, () => html).join("");
  node.classList.add("is-loading");
}
