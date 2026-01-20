// Supported languages for i18n
// Limited to languages supported by Orama search
// Separated from source.ts to avoid bundling fumadocs-mdx in client components
export const LANGUAGES = [
  { code: "en", name: "English", nativeName: "English", dir: "ltr" },
  { code: "es", name: "Spanish", nativeName: "Español", dir: "ltr" },
  { code: "fr", name: "French", nativeName: "Français", dir: "ltr" },
  { code: "de", name: "German", nativeName: "Deutsch", dir: "ltr" },
  { code: "pt", name: "Portuguese", nativeName: "Português", dir: "ltr" },
  { code: "ar", name: "Arabic", nativeName: "العربية", dir: "rtl" },
] as const

export type LanguageCode = (typeof LANGUAGES)[number]["code"]
