"use client"

import * as React from "react"
import { Check, Copy, Accessibility, AlertTriangle, Info } from "lucide-react"

import { cn } from "@/lib/utils"
import { trackEvent } from "@/lib/events"
import { Button } from "@/registry/new-york-v4/ui/button"
import { Badge } from "@/registry/new-york-v4/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/registry/new-york-v4/ui/collapsible"

// Types for component specs
interface PropDefinition {
  name: string
  type: string
  description: string
  required?: boolean
  default?: string
}

interface AccessibilityItem {
  label: string
  status: "pass" | "warn" | "info"
  description?: string
}

interface ComponentSpecProps {
  name: string
  description?: string
  props?: PropDefinition[]
  accessibility?: AccessibilityItem[]
  importStatement?: string
  usageExample?: string
  children?: React.ReactNode
}

export function ComponentSpec({
  name,
  description,
  props,
  accessibility,
  importStatement,
  usageExample,
  children,
}: ComponentSpecProps) {
  return (
    <div className="flex flex-col gap-6">
      {description && (
        <p className="text-muted-foreground">{description}</p>
      )}

      {importStatement && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Import</h3>
          <CopyableCode code={importStatement} language="tsx" />
        </div>
      )}

      {props && props.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Props</h3>
          <PropsTable props={props} />
        </div>
      )}

      {usageExample && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Usage Example</h3>
          <CopyableCode code={usageExample} language="tsx" />
        </div>
      )}

      {accessibility && accessibility.length > 0 && (
        <AccessibilityChecklist items={accessibility} componentName={name} />
      )}

      {children}
    </div>
  )
}

// Props Table Component
function PropsTable({ props }: { props: PropDefinition[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-2 text-left font-medium">Prop</th>
            <th className="px-4 py-2 text-left font-medium">Type</th>
            <th className="px-4 py-2 text-left font-medium">Default</th>
            <th className="px-4 py-2 text-left font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {props.map((prop) => (
            <tr key={prop.name} className="border-b last:border-0">
              <td className="px-4 py-2">
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  {prop.name}
                </code>
                {prop.required && (
                  <Badge variant="secondary" className="ml-1 text-[10px]">
                    required
                  </Badge>
                )}
              </td>
              <td className="px-4 py-2">
                <code className="text-xs text-muted-foreground">{prop.type}</code>
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {prop.default ? (
                  <code className="text-xs">{prop.default}</code>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {prop.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Accessibility Checklist Component
function AccessibilityChecklist({
  items,
  componentName,
}: {
  items: AccessibilityItem[]
  componentName: string
}) {
  const [isOpen, setIsOpen] = React.useState(false)

  const passCount = items.filter((i) => i.status === "pass").length
  const warnCount = items.filter((i) => i.status === "warn").length

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between"
        >
          <span className="flex items-center gap-2">
            <Accessibility className="size-4" />
            Accessibility Checklist
          </span>
          <span className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {passCount}/{items.length} passed
            </Badge>
            {warnCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {warnCount} warnings
              </Badge>
            )}
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <div className="rounded-lg border p-4 space-y-3">
          {items.map((item, index) => (
            <div key={index} className="flex items-start gap-3">
              {item.status === "pass" && (
                <Check className="size-4 text-green-500 mt-0.5 shrink-0" />
              )}
              {item.status === "warn" && (
                <AlertTriangle className="size-4 text-yellow-500 mt-0.5 shrink-0" />
              )}
              {item.status === "info" && (
                <Info className="size-4 text-blue-500 mt-0.5 shrink-0" />
              )}
              <div className="space-y-1">
                <p className="text-sm font-medium">{item.label}</p>
                {item.description && (
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// Copyable Code Block Component
function CopyableCode({
  code,
  language = "tsx",
}: {
  code: string
  language?: string
}) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      trackEvent({ name: "copy_usage_code", properties: { language } })
    } catch {
      // Ignore clipboard errors
    }
  }

  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm">
        <code>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 size-7"
        onClick={handleCopy}
      >
        {copied ? (
          <Check className="size-3.5 text-green-500" />
        ) : (
          <Copy className="size-3.5" />
        )}
        <span className="sr-only">Copy code</span>
      </Button>
    </div>
  )
}

// One-Click Copy Component Feature
export function CopyComponent({
  name,
  code,
  className,
}: {
  name: string
  code: string
  className?: string
}) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      trackEvent({
        name: "copy_primitive_code",
        properties: { component: name },
      })
    } catch {
      // Ignore clipboard errors
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className={cn("gap-2", className)}
    >
      {copied ? (
        <>
          <Check className="size-3.5 text-green-500" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="size-3.5" />
          Copy {name} Component
        </>
      )}
    </Button>
  )
}

// Export types for MDX usage
export type { PropDefinition, AccessibilityItem, ComponentSpecProps }
