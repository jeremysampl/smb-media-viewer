import { marked, Renderer } from 'marked';
import DOMPurify from 'dompurify';
import { documentAssetUrl, escapeHtmlAttr } from '../documentAssets';

marked.setOptions({
  gfm: true,
  breaks: false,
});

export function renderMarkdown(source: string, documentToken: string): string {
  const renderer = new Renderer();
  renderer.image = ({ href, title, text }) => {
    const url = href ? documentAssetUrl(documentToken, href) : null;
    if (!url) {
      return text ? `<span class="doc-missing-image">${escapeHtmlAttr(text)}</span>` : '';
    }
    const titleAttr = title ? ` title="${escapeHtmlAttr(title)}"` : '';
    return `<img src="${escapeHtmlAttr(url)}" alt="${escapeHtmlAttr(text || '')}"${titleAttr} loading="lazy" />`;
  };

  const html = marked.parse(source, { async: false, renderer }) as string;
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['loading'],
  });
}
