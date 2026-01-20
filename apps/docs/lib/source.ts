import { docs } from "@/.source"
import { loader } from "fumadocs-core/source"
import { LANGUAGES } from "./languages"

// Re-export LANGUAGES for backward compatibility
export { LANGUAGES, type LanguageCode } from "./languages"

export const source = loader({
  baseUrl: "/",
  source: docs.toFumadocsSource(),
  // i18n configuration - languages will be available at /[lang]/...
  // English is default (no prefix), other languages use prefix
  languages: LANGUAGES.map((l) => l.code),
  defaultLanguage: "en",
})
