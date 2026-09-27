// Documentation languages. v5 docs are English only; add a language here
// together with its translated `*.<code>.mdx` pages.
// Separated from source.ts to avoid bundling fumadocs-mdx in client components
export const LANGUAGES = [
  { code: "en", name: "English", nativeName: "English", dir: "ltr" },
] as const

export type LanguageCode = (typeof LANGUAGES)[number]["code"]
