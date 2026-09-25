import type { BundledLanguage, Highlighter } from 'shiki';
import { createHighlighter } from 'shiki';

const LANG_BY_EXT: Record<string, BundledLanguage> = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.jsx': 'jsx',
  '.py': 'python',
  '.pyw': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hh': 'cpp',
  '.cs': 'csharp',
  '.sh': 'shellscript',
  '.bash': 'shellscript',
  '.zsh': 'shellscript',
  '.fish': 'shellscript',
  '.ps1': 'powershell',
  '.psm1': 'powershell',
  '.json': 'json',
  '.jsonc': 'jsonc',
  '.json5': 'json5',
  '.xml': 'xml',
  '.xsl': 'xml',
  '.xslt': 'xml',
  '.svg': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.sql': 'sql',
  '.toml': 'toml',
  '.ini': 'ini',
  '.cfg': 'ini',
  '.conf': 'ini',
  '.properties': 'ini',
  '.env': 'dotenv',
  '.php': 'php',
  '.phtml': 'php',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.swift': 'swift',
  '.scala': 'scala',
  '.sc': 'scala',
  '.lua': 'lua',
  '.r': 'r',
  '.pl': 'perl',
  '.pm': 'perl',
  '.dart': 'dart',
  '.zig': 'zig',
  '.hs': 'haskell',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.hrl': 'erlang',
  '.clj': 'clojure',
  '.cljs': 'clojure',
  '.edn': 'clojure',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.astro': 'astro',
  '.mdx': 'mdx',
  '.cmake': 'cmake',
  '.diff': 'diff',
  '.patch': 'diff',
  '.m': 'objective-c',
  '.mm': 'objective-c',
  '.f90': 'fortran-free-form',
  '.f95': 'fortran-free-form',
  '.f03': 'fortran-free-form',
  '.f': 'fortran-fixed-form',
  '.for': 'fortran-fixed-form',
  '.jl': 'julia',
  '.nim': 'nim',
  '.ml': 'ocaml',
  '.mli': 'ocaml',
  '.fs': 'fsharp',
  '.fsx': 'fsharp',
  '.fsi': 'fsharp',
  '.vb': 'vb',
  '.proto': 'proto',
  '.prisma': 'prisma',
  '.tf': 'terraform',
  '.tfvars': 'terraform',
  '.hcl': 'hcl',
  '.bicep': 'bicep',
  '.sol': 'solidity',
  '.vy': 'vyper',
  '.glsl': 'glsl',
  '.frag': 'glsl',
  '.vert': 'glsl',
  '.hlsl': 'hlsl',
  '.wgsl': 'wgsl',
  '.asm': 'asm',
  '.s': 'asm',
  '.bat': 'bat',
  '.cmd': 'bat',
  '.coffee': 'coffee',
  '.lisp': 'common-lisp',
  '.cl': 'common-lisp',
  '.scm': 'scheme',
  '.rkt': 'racket',
  '.groovy': 'groovy',
  '.gradle': 'groovy',
  '.jinja': 'jinja',
  '.j2': 'jinja',
  '.bib': 'bibtex',
  '.nginx': 'nginx',
  '.makefile': 'make',
  '.mk': 'make',
  '.dockerfile': 'docker',
  '.gitignore': 'ini',
  '.dockerignore': 'ini',
  '.editorconfig': 'ini',
};

const LANG_BY_BASENAME: Record<string, BundledLanguage> = {
  dockerfile: 'docker',
  makefile: 'make',
  gnumakefile: 'make',
  'cmakelists.txt': 'cmake',
  '.gitignore': 'ini',
  '.dockerignore': 'ini',
  '.editorconfig': 'ini',
  '.env': 'dotenv',
};

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark-default'],
      langs: [],
    });
  }
  return highlighterPromise;
}

export function resolveCodeLanguage(filename: string): BundledLanguage | null {
  const base = filename.includes('/')
    ? filename.slice(filename.lastIndexOf('/') + 1)
    : filename;
  const lowerBase = base.toLowerCase();

  const byName = LANG_BY_BASENAME[lowerBase];
  if (byName) return byName;

  if (lowerBase.startsWith('.') && lowerBase.indexOf('.', 1) === -1) {
    return LANG_BY_EXT[lowerBase] ?? null;
  }

  const index = lowerBase.lastIndexOf('.');
  if (index <= 0) return null;
  return LANG_BY_EXT[lowerBase.slice(index)] ?? null;
}

export async function highlightCode(
  source: string,
  filename: string,
): Promise<string> {
  const lang = resolveCodeLanguage(filename) ?? 'plaintext';
  const highlighter = await getHighlighter();
  const loaded = highlighter.getLoadedLanguages();
  if (!loaded.includes(lang)) {
    try {
      await highlighter.loadLanguage(lang);
    } catch {
      if (!loaded.includes('plaintext')) {
        await highlighter.loadLanguage('plaintext');
      }
      return highlighter.codeToHtml(source, {
        lang: 'plaintext',
        theme: 'github-dark-default',
      });
    }
  }
  return highlighter.codeToHtml(source, {
    lang,
    theme: 'github-dark-default',
  });
}
