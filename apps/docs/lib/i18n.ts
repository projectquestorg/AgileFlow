import { defineI18n } from "fumadocs-core/i18n"
import { LANGUAGES } from "./languages"

export const i18n = defineI18n({
  defaultLanguage: "en",
  languages: LANGUAGES.map((l) => l.code),
  // Hide locale prefix for default language (en)
  // /page instead of /en/page, but /es/page for Spanish
  hideLocale: "default-locale",
})

// Re-export for convenience
export { LANGUAGES, type LanguageCode } from "./languages"

// Helper to get language data by code
export function getLanguage(code: string) {
  return LANGUAGES.find((l) => l.code === code) || LANGUAGES[0]
}
