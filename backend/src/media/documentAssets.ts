import path from 'node:path';

/**
 * Resolve a document-relative asset path under the same share as the document.
 * Rejects URLs, absolute paths, and anything that escapes the share root.
 */
export function resolveDocumentAssetPath(
  documentAbsolutePath: string,
  relativeRef: string,
  shareRoot: string,
): string | null {
  const raw = relativeRef.trim();
  if (!raw) return null;

  // External / protocol-relative / absolute refs are not allowed.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//') || raw.startsWith('/')) {
    return null;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw.split(/[?#]/)[0] ?? '');
  } catch {
    return null;
  }

  if (!decoded || decoded.includes('\0')) return null;
  if (path.isAbsolute(decoded)) return null;

  const docDir = path.dirname(path.resolve(documentAbsolutePath));
  const share = path.resolve(shareRoot);
  const resolved = path.resolve(docDir, decoded);

  if (resolved !== share && !resolved.startsWith(`${share}${path.sep}`)) {
    return null;
  }

  return resolved;
}
