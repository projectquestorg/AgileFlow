import { createI18nMiddleware } from "fumadocs-core/i18n/middleware"
import { i18n } from "@/lib/i18n"

export default createI18nMiddleware(i18n)

export const config = {
  // Match all paths except static files, API routes, etc.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|og|.*\\..*).*)"],
}
