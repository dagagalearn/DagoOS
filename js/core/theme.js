/* ==========================================================================
   DagoOS — Theme Manager
   --------------------------------------------------------------------------
   Handles light/dark preference. Persists to localStorage.
   Applies theme by setting `data-theme` on <html>.
   ========================================================================== */


const STORAGE_KEY = "dagoos_theme";   // "dark" | "light"
const DEFAULT_THEME = "dark";


/* --------------------------------------------------------------------------
   1. READ / WRITE PREFERENCE
   -------------------------------------------------------------------------- */
export function getSavedTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return (v === "light" || v === "dark") ? v : DEFAULT_THEME;
  } catch (_) {
    return DEFAULT_THEME;
  }
}

function saveTheme(theme) {
  try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) {}
}


/* --------------------------------------------------------------------------
   2. APPLY THEME TO <html>
   -------------------------------------------------------------------------- */
export function applyTheme(theme) {
  const t = (theme === "light") ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
  saveTheme(t);
  updateAllToggles(t);
}


/* --------------------------------------------------------------------------
   3. TOGGLE
   -------------------------------------------------------------------------- */
export function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || DEFAULT_THEME;
  const next = current === "light" ? "dark" : "light";
  applyTheme(next);
}


/* --------------------------------------------------------------------------
   4. BOOT — apply saved theme before first paint
   --------------------------------------------------------------------------
   Called once on app boot. Idempotent — safe to call multiple times.
   -------------------------------------------------------------------------- */
export function initTheme() {
  const saved = getSavedTheme();
  document.documentElement.setAttribute("data-theme", saved);
  updateAllToggles(saved);
}


/* --------------------------------------------------------------------------
   5. TOGGLE BUTTON MANAGEMENT
   --------------------------------------------------------------------------
   Injects a toggle button into the header's auth area if not already there.
   Works on every page since main.js calls this on boot.
   -------------------------------------------------------------------------- */
const SUN_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="4"/>
  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
</svg>`;

const MOON_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
</svg>`;

export function mountThemeToggle() {
  const slot = document.getElementById("auth-area");
  if (!slot) return;

  // Skip if already mounted
  if (document.getElementById("theme-toggle")) return;

  const btn = document.createElement("button");
  btn.id = "theme-toggle";
  btn.className = "theme-toggle";
  btn.type = "button";
  btn.setAttribute("aria-label", "Toggle theme");
  btn.addEventListener("click", toggleTheme);

  // Insert before the auth area's first child so it sits left of the user chip
  slot.insertBefore(btn, slot.firstChild);

  // Set initial icon
  const current = document.documentElement.getAttribute("data-theme") || DEFAULT_THEME;
  btn.innerHTML = current === "light" ? MOON_ICON : SUN_ICON;
}

function updateAllToggles(theme) {
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.innerHTML = theme === "light" ? MOON_ICON : SUN_ICON;
}
