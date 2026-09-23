import type { Highlighter, ThemeRegistration, BundledLanguage } from 'shiki';
import { bundledLanguages, createHighlighter } from 'shiki';

let highlighterPromise: Promise<Highlighter> | null = null;

const grayscaleTheme: ThemeRegistration = {
  name: 'agileflow-grayscale',
  type: 'light',
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#0B0D10',
  },
  tokenColors: [
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#6B7280' } },
    { scope: ['keyword', 'storage.type'], settings: { foreground: '#111827', fontStyle: 'bold' } },
    { scope: ['string'], settings: { foreground: '#374151' } },
    { scope: ['number', 'constant.numeric'], settings: { foreground: '#111827' } },
    { scope: ['entity.name.function', 'support.function'], settings: { foreground: '#111827' } },
    { scope: ['variable', 'meta.object-literal.key'], settings: { foreground: '#111827' } },
    { scope: ['punctuation', 'meta.brace'], settings: { foreground: '#9CA3AF' } },
  ],
};

async function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [grayscaleTheme],
      langs: ['bash', 'markdown', 'json', 'text', 'diff', 'yaml'],
    });
  }
  return highlighterPromise;
}

export async function codeToHtml(code: string, lang: string) {
  const highlighter = await getHighlighter();
  const language = (lang in bundledLanguages ? (lang as BundledLanguage) : 'bash') as BundledLanguage;
  return highlighter.codeToHtml(code.trimEnd(), {
    lang: language,
    theme: grayscaleTheme,
    transformers: [
      {
        pre(node) {
          node.properties.class = [
            ...(Array.isArray(node.properties.class) ? node.properties.class : []),
            'shiki',
          ];
          node.properties.style =
            'margin:0;background:transparent;line-height:1.65;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;';
          return node;
        },
        code(node) {
          node.properties.style = 'display:block;';
          return node;
        },
      },
    ],
  });
}
