/* ==========================================================================
   DagoOS — Utilities
   --------------------------------------------------------------------------
   Pure functions. No DOM, no Firebase, no side effects. Easy to test,
   easy to reuse across every module.
   ========================================================================== */


/* --------------------------------------------------------------------------
   1. CURRENCY — format a number as EUR (change base currency in one place)
   -------------------------------------------------------------------------- */
const BASE_CURRENCY = "ETB";
const LOCALE        = "en-ET";    // affects thousand separators + symbol

export function formatCurrency(amount) {
  const n = Number(amount) || 0;
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: BASE_CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(n);
}


/* --------------------------------------------------------------------------
   2. DATE — friendly display + today's ISO date
   -------------------------------------------------------------------------- */

// "2025-03-21" → "Mar 21, 2025"
export function formatDate(isoDate) {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  if (isNaN(d)) return isoDate;
  return d.toLocaleDateString(LOCALE, {
    year:  "numeric",
    month: "short",
    day:   "numeric"
  });
}

// Returns today's date as "YYYY-MM-DD" (for <input type="date"> defaults)
export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}


/* --------------------------------------------------------------------------
   3. DOM — tiny helpers so modules stay readable
   -------------------------------------------------------------------------- */

// Create an element with attributes and children in one call.
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key === "class")      node.className = value;
    else if (key === "text")  node.textContent = value;
    else if (key === "html")  node.innerHTML = value;    // use only with trusted content
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    node.append(child);
  }
  return node;
}

// Safe innerHTML clear + append
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}


/* --------------------------------------------------------------------------
   4. NUMBER — safe parse
   -------------------------------------------------------------------------- */
export function toNumber(value, fallback = 0) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}
