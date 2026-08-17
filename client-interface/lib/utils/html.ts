/** Helpers for working with the rich-text editor's HTML output. */

/** True when HTML has no real content — tiptap emits `<p></p>` for an empty
 *  editor, so a naive `.trim()` would wrongly treat it as filled. Strips tags +
 *  &nbsp; + whitespace and checks what's left. */
export function isBlankHtml(html: string | null | undefined): boolean {
  if (!html) return true;
  return !html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, '')
    .replace(/\s+/g, '')
    .trim();
}

/** Normalize editor HTML for saving: blank → empty string, else trimmed HTML. */
export function cleanHtml(html: string | null | undefined): string {
  return isBlankHtml(html) ? '' : (html as string).trim();
}

/** Detects whether a string contains HTML markup (rich-editor output). */
export function looksLikeHtml(s: string | null | undefined): boolean {
  return !!s && /<[a-z][\s\S]*>/i.test(s);
}

/** Flatten HTML to a plain-text snippet for list previews — strips tags, decodes
 *  common entities, collapses whitespace. Safe for line-clamped previews where
 *  rendering block HTML would break the layout. */
export function stripHtml(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/<\/(p|div|li|h[1-6]|br)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when stored description is blank, a generic placeholder, or a silent copy of the title. */
export function isMissingDescription(description: string | null | undefined, title?: string | null): boolean {
  const plain = stripHtml(description);
  if (!plain) return true;
  if (/^no description provided\.?$/i.test(plain)) return true;
  if (title && plain === title.trim()) return true;
  return false;
}
