import { docs } from "@/.source"
import { loader } from "fumadocs-core/source"

// Supported languages for i18n
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

export const source = loader({
  baseUrl: "/",
  source: docs.toFumadocsSource(),
  // i18n configuration - languages will be available at /[lang]/...
  // English is default (no prefix), other languages use prefix
  languages: LANGUAGES.map((l) => l.code),
  defaultLanguage: "en",
})
