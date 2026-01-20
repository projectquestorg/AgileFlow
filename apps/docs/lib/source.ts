import { docs } from "@/.source"
import { loader } from "fumadocs-core/source"
import { i18n, LANGUAGES, type LanguageCode } from "./i18n"

// Re-export for backward compatibility
export { LANGUAGES, type LanguageCode, i18n }

export const source = loader({
  baseUrl: "/",
  source: docs.toFumadocsSource(),
  i18n,
})
