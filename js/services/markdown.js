/* ==========================================================================
   DagoOS — Markdown Renderer
   --------------------------------------------------------------------------
   Minimal markdown → HTML converter. ~40 lines, no dependencies.

   Supports:
     # Heading 1  →  ## Heading 2  →  ### Heading 3
     **bold**  →  *italic*  →  `inline code`
     - list item  →  1. numbered item
     [link](url)  →  line breaks
     ---  →  horizontal rule

   Security: HTML is ESCAPED first, so raw <script> in entries can't run.
   ========================================================================== */


/* --------------------------------------------------------------------------
   1. HTML ESCAPE — always run this FIRST
   -------------------------------------------------------------------------- */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


/* --------------------------------------------------------------------------
   2. MAIN RENDERER
   -------------------------------------------------------------------------- */
export function renderMarkdown(input) {
  if (!input) return "";

  // Step 1: escape everything (safety)
  let html = escapeHtml(input);

  // Step 2: code blocks first so their content isn't mangled by other rules
  html = html.replace(/```([\s\S]*?)```/g, (_, code) =>
    `<pre><code>${code.trim()}</code></pre>`
  );

  // Step 3: inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Step 4: headings (### before ## before #)
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm,  "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm,   "<h1>$1</h1>");

  // Step 5: horizontal rule
  html = html.replace(/^---$/gm, "<hr />");

  // Step 6: bold + italic
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g,     "<em>$1</em>");

  // Step 7: links [text](url)
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>'
  );

  // Step 8: lists (group consecutive lines starting with "- " or "* ")
  html = renderLists(html);

  // Step 9: paragraphs — wrap remaining non-empty text blocks
  html = html.split(/\n{2,}/).map(block => {
    block = block.trim();
    if (!block) return "";
    // Don't wrap blocks that are already block-level elements
    if (/^<(h[1-3]|ul|ol|pre|hr|blockquote)/.test(block)) return block;
    return `<p>${block.replace(/\n/g, "<br />")}</p>`;
  }).join("\n");

  return html;
}


/* --------------------------------------------------------------------------
   3. LIST GROUPER — turns "- item\n- item" into a proper <ul>
   -------------------------------------------------------------------------- */
function renderLists(html) {
  // Unordered
  html = html.replace(
    /(?:^|\n)((?:[-*] .+\n?)+)/g,
    (match, block) => {
      const items = block.trim().split("\n")
        .map(line => line.replace(/^[-*]\s+/, ""))
        .map(item => `<li>${item}</li>`)
        .join("");
      return `\n<ul>${items}</ul>\n`;
    }
  );

  // Ordered
  html = html.replace(
    /(?:^|\n)((?:\d+\. .+\n?)+)/g,
    (match, block) => {
      const items = block.trim().split("\n")
        .map(line => line.replace(/^\d+\.\s+/, ""))
        .map(item => `<li>${item}</li>`)
        .join("");
      return `\n<ol>${items}</ol>\n`;
    }
  );

  return html;
}


/* --------------------------------------------------------------------------
   4. PLAIN TEXT EXCERPT — for list previews
   -------------------------------------------------------------------------- */
export function excerpt(markdown, maxLength = 120) {
  const plain = String(markdown || "")
    .replace(/```[\s\S]*?```/g, "")     // strip code blocks
    .replace(/[#*_`>\-]/g, "")           // strip common syntax chars
    .replace(/\s+/g, " ")                // collapse whitespace
    .trim();
  if (plain.length <= maxLength) return plain;
  return plain.slice(0, maxLength).trim() + "…";
}
