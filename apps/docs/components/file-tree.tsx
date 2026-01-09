"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { FileIcon, FolderIcon, ChevronRight } from "lucide-react"

interface FileTreeProps {
  className?: string
  children: React.ReactNode
}

interface FolderProps {
  name: string
  children?: React.ReactNode
  defaultOpen?: boolean
  comment?: string
}

interface FileProps {
  name: string
  comment?: string
}

interface MoreFilesProps {
  files: string[]
  totalRemaining: number
  batchSize?: number
}

export function FileTree({ className, children }: FileTreeProps) {
  return (
    <div
      className={cn(
        "not-prose group relative my-4 overflow-hidden rounded-xl border border-border/50 bg-zinc-950 text-sm dark:bg-zinc-900",
        className
      )}
    >
      <div className="border-b border-border/50 bg-zinc-900/50 px-4 py-2 text-xs text-zinc-400">
        <span>Project Structure</span>
      </div>
      <div className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
        <div className="flex flex-col gap-0.5 min-w-max">{children}</div>
      </div>
    </div>
  )
}

export function Folder({ name, children, comment }: FolderProps) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 py-px">
        <FolderIcon className="h-3.5 w-3.5 flex-shrink-0 text-[#e8683a]" />
        <span className="text-zinc-200 whitespace-nowrap">{name}</span>
        {comment && (
          <span className="text-zinc-500 text-xs whitespace-nowrap">— {comment}</span>
        )}
      </div>
      {children && (
        <div className="ml-3 flex flex-col gap-0 border-l border-zinc-700/50 pl-3">
          {children}
        </div>
      )}
    </div>
  )
}

export function File({ name, comment }: FileProps) {
  return (
    <div className="flex items-center gap-2 py-px">
      <FileIcon className="h-3.5 w-3.5 flex-shrink-0 text-zinc-500" />
      <span className="text-zinc-400 whitespace-nowrap">{name}</span>
      {comment && (
        <span className="text-zinc-600 text-xs whitespace-nowrap">— {comment}</span>
      )}
    </div>
  )
}

export function MoreFiles({ files, totalRemaining, batchSize = 10 }: MoreFilesProps) {
  const [revealedCount, setRevealedCount] = useState(0)

  const revealedFiles = files.slice(0, revealedCount)
  const remainingToReveal = files.length - revealedCount
  const actualRemaining = totalRemaining - revealedCount

  const handleExpand = () => {
    setRevealedCount(prev => Math.min(prev + batchSize, files.length))
  }

  return (
    <>
      {revealedFiles.map((file, index) => (
        <File key={index} name={file} />
      ))}
      {(remainingToReveal > 0 || actualRemaining > files.length) && (
        <button
          onClick={handleExpand}
          className="flex items-center gap-2 py-px text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer group"
        >
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
          <span className="whitespace-nowrap text-zinc-500">+{actualRemaining} more</span>
        </button>
      )}
    </>
  )
}
