// Supported languages for i18n
// Separated from source.ts to avoid bundling fumadocs-mdx in client components
export const LANGUAGES = [
  { code: "en", name: "English", nativeName: "English", dir: "ltr" },
  { code: "es", name: "Spanish", nativeName: "Español", dir: "ltr" },
  { code: "zh", name: "Chinese", nativeName: "中文", dir: "ltr" },
  { code: "ar", name: "Arabic", nativeName: "العربية", dir: "rtl" },
  { code: "fr", name: "French", nativeName: "Français", dir: "ltr" },
  { code: "de", name: "German", nativeName: "Deutsch", dir: "ltr" },
  { code: "ja", name: "Japanese", nativeName: "日本語", dir: "ltr" },
  { code: "ko", name: "Korean", nativeName: "한국어", dir: "ltr" },
  { code: "pt", name: "Portuguese", nativeName: "Português", dir: "ltr" },
  { code: "he", name: "Hebrew", nativeName: "עברית", dir: "rtl" },
] as const

export type LanguageCode = (typeof LANGUAGES)[number]["code"]
