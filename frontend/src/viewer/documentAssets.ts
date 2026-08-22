/** Build a same-origin URL for a document-relative image under the share. */
export function documentAssetUrl(documentToken: string, relativeRef: string): string | null {
  const raw = relativeRef.trim();
  if (!raw) return null;

  // Block external / absolute / protocol-relative URLs.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//') || raw.startsWith('/')) {
    return null;
  }

  let pathOnly: string;
  try {
    pathOnly = decodeURIComponent(raw.split(/[?#]/)[0] ?? '');
  } catch {
    return null;
  }
  if (!pathOnly || pathOnly.includes('\0')) return null;

  // Normalize ./ and redundant segments without allowing escape past document dir
  // (server re-validates against the share root).
  const parts = pathOnly.replace(/\\/g, '/').split('/');
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (normalized.length === 0) return null;
      normalized.pop();
      continue;
    }
    normalized.push(part);
  }

  const rel = normalized.join('/');
  if (!rel) return null;
  return `/api/media/${documentToken}/asset?rel=${encodeURIComponent(rel)}`;
}

export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
