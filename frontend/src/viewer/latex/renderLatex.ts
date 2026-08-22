import DOMPurify from 'dompurify';
import katex from 'katex';
import { documentAssetUrl, escapeHtmlAttr } from '../documentAssets';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMath(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
    });
  } catch {
    return `<code class="latex-math-error">${escapeHtml(tex)}</code>`;
  }
}

function extractDocumentBody(source: string): string {
  const begin = source.match(/\\begin\s*\{\s*document\s*\}/i);
  const end = source.match(/\\end\s*\{\s*document\s*\}/i);
  if (begin && end && end.index != null && begin.index != null) {
    return source.slice(begin.index + begin[0].length, end.index);
  }
  return source;
}

function protectMath(source: string): { text: string; slots: string[] } {
  const slots: string[] = [];
  const stash = (html: string) => {
    const key = `@@MATH${slots.length}@@`;
    slots.push(html);
    return key;
  };

  let text = source;
  text = text.replace(/\\begin\{(equation\*?|align\*?|gather\*?|multline\*?)\}([\s\S]*?)\\end\{\1\}/g, (_m, _env, body: string) =>
    stash(renderMath(body.trim(), true)),
  );
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_m, body: string) => stash(renderMath(body.trim(), true)));
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_m, body: string) => stash(renderMath(body.trim(), true)));
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_m, body: string) => stash(renderMath(body.trim(), false)));
  text = text.replace(/\$([^$\n]+?)\$/g, (_m, body: string) => stash(renderMath(body.trim(), false)));
  return { text, slots };
}

function restoreMath(text: string, slots: string[]): string {
  return text.replace(/@@MATH(\d+)@@/g, (_m, index) => slots[Number(index)] ?? '');
}

function protectImages(source: string, documentToken: string): { text: string; slots: string[] } {
  const slots: string[] = [];
  const stash = (html: string) => {
    const key = `@@IMG${slots.length}@@`;
    slots.push(html);
    return key;
  };

  // \includegraphics[options]{path} or \includegraphics{path}
  const text = source.replace(
    /\\includegraphics\s*(?:\[[^\]]*\])?\s*\{([^{}]+)\}/g,
    (_m, fileRef: string) => {
      const cleaned = fileRef.trim().replace(/^"|"$/g, '');
      const url = documentAssetUrl(documentToken, cleaned);
      if (!url) {
        return stash(`<span class="doc-missing-image">${escapeHtml(cleaned)}</span>`);
      }
      return stash(
        `<img src="${escapeHtmlAttr(url)}" alt="${escapeHtmlAttr(cleaned)}" loading="lazy" class="latex-image" />`,
      );
    },
  );

  return { text, slots };
}

function restoreImages(text: string, slots: string[]): string {
  return text.replace(/@@IMG(\d+)@@/g, (_m, index) => slots[Number(index)] ?? '');
}

/** Lightweight LaTeX-to-HTML preview (structure + KaTeX math + images). */
export function renderLatexPreview(source: string, documentToken: string): string {
  let body = extractDocumentBody(source);
  body = body.replace(/%.*$/gm, '');

  const { text: withImages, slots: imageSlots } = protectImages(body, documentToken);
  const { text: withSlots, slots: mathSlots } = protectMath(withImages);
  let text = withSlots;

  text = text.replace(/\\title\s*\{([^{}]*)\}/g, '<h1 class="latex-title">$1</h1>');
  text = text.replace(/\\author\s*\{([^{}]*)\}/g, '<p class="latex-author">$1</p>');
  text = text.replace(/\\date\s*\{([^{}]*)\}/g, '<p class="latex-date">$1</p>');
  text = text.replace(/\\maketitle\b/g, '');
  text = text.replace(/\\section\s*\*?\s*\{([^{}]*)\}/g, '<h2>$1</h2>');
  text = text.replace(/\\subsection\s*\*?\s*\{([^{}]*)\}/g, '<h3>$1</h3>');
  text = text.replace(/\\subsubsection\s*\*?\s*\{([^{}]*)\}/g, '<h4>$1</h4>');
  text = text.replace(/\\textbf\s*\{([^{}]*)\}/g, '<strong>$1</strong>');
  text = text.replace(/\\textit\s*\{([^{}]*)\}/g, '<em>$1</em>');
  text = text.replace(/\\emph\s*\{([^{}]*)\}/g, '<em>$1</em>');
  text = text.replace(/\\underline\s*\{([^{}]*)\}/g, '<u>$1</u>');
  text = text.replace(/\\texttt\s*\{([^{}]*)\}/g, '<code>$1</code>');
  text = text.replace(/\\newline\b|\\\\/g, '<br />');
  text = text.replace(/\\par\b/g, '</p><p>');
  text = text.replace(/\\item\b/g, '<li>');
  text = text.replace(/\\begin\{itemize\}/g, '<ul>');
  text = text.replace(/\\end\{itemize\}/g, '</ul>');
  text = text.replace(/\\begin\{enumerate\}/g, '<ol>');
  text = text.replace(/\\end\{enumerate\}/g, '</ol>');
  text = text.replace(/\\begin\{quote\}/g, '<blockquote>');
  text = text.replace(/\\end\{quote\}/g, '</blockquote>');
  text = text.replace(/\\begin\{figure\*?\}/g, '<figure class="latex-figure">');
  text = text.replace(/\\end\{figure\*?\}/g, '</figure>');
  text = text.replace(/\\caption\s*\{([^{}]*)\}/g, '<figcaption>$1</figcaption>');
  text = text.replace(/\\begin\{verbatim\}([\s\S]*?)\\end\{verbatim\}/g, (_m, code: string) =>
    `<pre><code>${escapeHtml(code.replace(/^\n|\n$/g, ''))}</code></pre>`,
  );

  // Drop remaining simple commands like \usepackage[...]{...}
  text = text.replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{([^{}]*)\})?/g, (_m, _opt, _grp, inner?: string) =>
    inner ?? '',
  );
  text = text.replace(/[{}]/g, '');

  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (/^<(h[1-4]|ul|ol|pre|blockquote|p|div|figure|img)/i.test(block)) return block;
      if (block.includes('@@IMG') || block.includes('<img ')) return block;
      return `<p>${block.replace(/\n/g, '<br />')}</p>`;
    })
    .join('\n');

  const withMath = restoreMath(paragraphs, mathSlots);
  const withRestoredImages = restoreImages(withMath, imageSlots);

  return DOMPurify.sanitize(withRestoredImages, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac', 'msqrt', 'mtable', 'mtr', 'mtd', 'annotation'],
    ADD_ATTR: ['xmlns', 'encoding', 'class', 'style', 'loading'],
  });
}
