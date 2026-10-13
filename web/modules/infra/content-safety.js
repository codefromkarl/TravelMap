import { Lexer, marked } from 'marked';

/** Escape untrusted text for HTML text nodes and quoted attributes. */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

/** Only absolute HTTP(S) URLs without credentials or control characters are accepted. */
export function safeHttpUrl(value) {
  if (typeof value !== "string" || /[\x00-\x20\x7f]/.test(value)) return "";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

function linkLabel(token) {
  if (!Array.isArray(token.tokens)) return String(token.text ?? '');
  return token.tokens.map(child => Array.isArray(child.tokens)
    ? linkLabel(child) : String(child.text ?? child.raw ?? '')).join('');
}

function sanitizeMarkdownPass(text) {
  const replacements = [];
  const lexer = new Lexer();
  const tokenizeDefinition = lexer.tokenizer.def.bind(lexer.tokenizer);
  // Observe definitions only when the actual block lexer visits them. A line scanner
  // mistakes quoted definitions inside fenced code for active Markdown syntax.
  lexer.tokenizer.def = source => {
    const definition = tokenizeDefinition(source);
    if (definition) replacements.push([definition.raw, '']);
    return definition;
  };
  marked.walkTokens(lexer.lex(text), token => {
    if (token.type !== 'link' && token.type !== 'image') return;
    const url = safeHttpUrl(token.href);
    const plainLabel = linkLabel(token);
    const label = escapeMarkdownText(plainLabel);
    const safeLabel = plainLabel.replace(/[\\\[\]!()]/g, '\\$&');
    const replacement = url
      ? `${token.type === 'image' ? '!' : ''}[${safeLabel}](${url.replace(/[()]/g, char => char === '(' ? '%28' : '%29')})`
      : label;
    replacements.push([token.raw, replacement]);
  });
  for (const [raw, replacement] of replacements) text = text.split(raw).join(replacement);
  return text;
}

function escapeMarkdownText(text) {
  return text.replace(/[\\`*_{}\[\]()#+.!|<>~:-]/g, '\\$&');
}

/** Make arbitrary Markdown safe to open in renderers that support inline HTML and URLs. */
export function safeMarkdown(value) {
  let text = String(value ?? '').replace(/\r\n|\r/g, '\n').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Replacing nested links/definitions can change block structure. Verify the resulting
  // Markdown again, rather than trusting tokens from a different source string.
  for (let pass = 0; pass < 4; pass++) {
    const next = sanitizeMarkdownPass(text);
    if (next === text) {
      let safe = true;
      marked.walkTokens(marked.lexer(text), token => {
        if ((token.type === 'link' || token.type === 'image') && !safeHttpUrl(token.href)) safe = false;
        if (token.type === 'html') safe = false;
      });
      return safe ? text : escapeMarkdownText(text);
    }
    text = next;
  }
  // Fail closed for adversarial structures that do not settle in the bounded passes.
  return escapeMarkdownText(text);
}

/** Small print renderer: generated HTML consists solely of our own formatting tags. */
export function markdownToSafeHtml(value) {
  return String(value ?? "").split(/\r?\n/).map(line => {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const list = /^(?:-\s+|\d+\.\s+)(.+)$/.exec(line);
    const rawText = heading ? heading[2] : list ? list[1] : line;
    const readable = rawText
      .replace(/(!?)\[([^\]\n]*)\]\(([^\n]*?)\)/g, (_, _image, label, target) => {
        const url = safeHttpUrl(target);
        return url ? `${label} (${url})` : label;
      })
      .replace(/&(?:lt|gt);/g, entity => entity === "&lt;" ? "<" : ">");
    const text = escapeHtml(readable).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    if (heading) return `<h${heading[1].length}>${text}</h${heading[1].length}>`;
    if (list) return `<p>• ${text}</p>`;
    if (/^---\s*$/.test(line)) return "<hr>";
    return line.trim() ? `<p>${text}</p>` : "";
  }).join("\n");
}
