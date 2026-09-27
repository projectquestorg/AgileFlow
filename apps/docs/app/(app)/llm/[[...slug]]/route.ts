import { notFound } from "next/navigation"
import { NextResponse, type NextRequest } from "next/server"

import { source } from "@/lib/source"

export const revalidate = false

/** Raw markdown of a docs page, for LLMs and "copy page". */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug?: string[] }> }
) {
  const { slug } = await params
  const page = source.getPage(slug)
  if (!page) notFound()

  return new NextResponse(await page.data.getText("raw"), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  })
}

export function generateStaticParams() {
  return source.generateParams()
}
