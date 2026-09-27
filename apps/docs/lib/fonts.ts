import { Inter, JetBrains_Mono } from "next/font/google"

import { cn } from "@/lib/utils"

// Same fonts as the website: Inter for text and headings, JetBrains Mono for code.
const fontInter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

const fontJetBrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["400", "500", "600", "700"],
})

export const fontVariables = cn(fontInter.variable, fontJetBrains.variable)
