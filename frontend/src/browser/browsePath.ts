/** Turn an API browse path into a URL pathname (encoded segments). */
export function browsePathToUrl(path: string): string {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return '/';
  return `/${segments.map(encodeURIComponent).join('/')}`;
}

/** Turn a React Router splat (`*` param) into an API browse path. */
export function urlSplatToBrowsePath(splat: string | undefined): string {
  if (!splat) return '';
  return splat
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join('/');
}
