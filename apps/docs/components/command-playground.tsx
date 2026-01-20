"use client"

import * as React from "react"
import {
  IconCheck,
  IconCopy,
  IconPlayerPlay,
  IconRefresh,
  IconTerminal,
} from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { trackEvent } from "@/lib/analytics"
import { Button } from "@/registry/new-york-v4/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/registry/new-york-v4/ui/card"
import { Textarea } from "@/registry/new-york-v4/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/registry/new-york-v4/ui/tooltip"

/**
 * Simulated command outputs for the playground.
 * These provide realistic previews without actual execution.
 */
const COMMAND_OUTPUTS: Record<string, string> = {
  // Setup and installation
  "npx agileflow setup": `
✓ Installing AgileFlow v2.90.7...
✓ Creating .agileflow/ directory
✓ Installing 72 slash commands
✓ Installing 29 specialized agents
✓ Creating docs/ structure (15 directories)
✓ Configuring hooks system

AgileFlow is ready! Try these commands:
  /agileflow:status    - View project status
  /agileflow:babysit   - Start guided workflow
  /agileflow:epic      - Create a new epic
`.trim(),

  // Status command
  "/agileflow:status": `
╭──────────────────────────────────────────────────────────╮
│ agileflow v2.90.7  main (abc1234)                        │
├──────────────────────────────────────────────────────────┤
│ In Progress          │ 2                                 │
│ Blocked              │ 0                                 │
│ Ready                │ 5                                 │
│ Completed            │ 18                                │
├──────────────────────┼───────────────────────────────────┤
│ Current              │ US-0042: Add user authentication  │
│ Last commit          │ abc1234 feat: add login form      │
╰──────────────────────┴───────────────────────────────────╯
`.trim(),

  // Story command
  "/agileflow:story US-0001": `
US-0001: Implement user login page
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Epic: EP-0001 (User Authentication)
Status: in_progress
Priority: P0
Points: 3

Acceptance Criteria:
  ✓ Given a user visits /login
  ✓ When they enter valid credentials
  ✓ Then they are redirected to dashboard
  ○ And a session cookie is set

Files Modified: 4
  - app/login/page.tsx
  - lib/auth.ts
  - components/login-form.tsx
  - middleware.ts
`.trim(),

  // Epic command
  "/agileflow:epic EP-0001": `
EP-0001: User Authentication System
════════════════════════════════════

Status: in_progress
Stories: 8 total (5 completed, 2 in progress, 1 ready)
Progress: ████████░░ 62%

Stories:
  ✓ US-0001: Login page (P0, 3pts)
  ✓ US-0002: Registration form (P0, 5pts)
  ✓ US-0003: Password reset (P1, 3pts)
  ● US-0004: OAuth integration (P1, 5pts) [in_progress]
  ● US-0005: Session management (P1, 3pts) [in_progress]
  ○ US-0006: 2FA support (P2, 5pts) [ready]
  ✓ US-0007: Email verification (P1, 2pts)
  ✓ US-0008: Logout functionality (P0, 1pt)
`.trim(),

  // Babysit command
  "/agileflow:babysit": `
Starting AgileFlow Babysit Mode...

Current Context:
  Epic: EP-0001 (User Authentication)
  Story: US-0004 (OAuth integration)
  Branch: feature/oauth-integration

Loaded expertise from 5 agents:
  ✓ security (authentication patterns)
  ✓ api (OAuth flows)
  ✓ testing (auth test strategies)
  ✓ database (session storage)
  ✓ ui (login components)

Ready to assist with US-0004. What would you like to work on?
`.trim(),

  // Mentor command
  "/agileflow:mentor": `
AgileFlow Mentor activated for guided implementation.

I'll help you through the full development cycle:
  1. Requirements clarification
  2. Technical approach design
  3. Implementation guidance
  4. Testing strategy
  5. Code review preparation

Current state analysis:
  - 2 stories in progress
  - No blockers detected
  - Test coverage: 78%

What feature would you like to implement?
`.trim(),

  // Default output for unknown commands
  default: `
Command executed successfully.

Tip: Try these common AgileFlow commands:
  /agileflow:status   - View project overview
  /agileflow:story    - Work on a specific story
  /agileflow:epic     - View epic progress
  /agileflow:babysit  - Start guided workflow
  /agileflow:mentor   - Get implementation guidance
`.trim(),
}

/**
 * Gets simulated output for a command.
 * Matches against known commands or returns default output.
 */
function getCommandOutput(command: string): string {
  const trimmedCommand = command.trim()

  // Check for exact matches first
  if (COMMAND_OUTPUTS[trimmedCommand]) {
    return COMMAND_OUTPUTS[trimmedCommand]
  }

  // Check for partial matches (e.g., /agileflow:story with any argument)
  for (const [pattern, output] of Object.entries(COMMAND_OUTPUTS)) {
    if (trimmedCommand.startsWith(pattern.split(" ")[0])) {
      // If command has arguments but pattern doesn't, use the pattern's output
      const patternBase = pattern.split(" ")[0]
      if (
        trimmedCommand.startsWith(patternBase) &&
        COMMAND_OUTPUTS[patternBase]
      ) {
        return COMMAND_OUTPUTS[patternBase]
      }
    }
  }

  return COMMAND_OUTPUTS.default
}

interface CommandPlaygroundProps {
  /** Initial command to display */
  command?: string
  /** Title for the playground card */
  title?: string
  /** Description text */
  description?: string
  /** Whether the playground is read-only (no editing) */
  readOnly?: boolean
  /** Custom class name */
  className?: string
}

/**
 * Interactive Command Playground
 *
 * Allows users to:
 * - View and edit AgileFlow commands
 * - See simulated output
 * - Copy commands to clipboard
 * - Reset to original example
 *
 * @example
 * <CommandPlayground
 *   command="/agileflow:status"
 *   title="Check Project Status"
 *   description="View your current project overview"
 * />
 */
export function CommandPlayground({
  command: initialCommand = "/agileflow:status",
  title = "Command Playground",
  description = "Try AgileFlow commands interactively",
  readOnly = false,
  className,
}: CommandPlaygroundProps) {
  const [command, setCommand] = React.useState(initialCommand)
  const [output, setOutput] = React.useState<string | null>(null)
  const [isRunning, setIsRunning] = React.useState(false)
  const [hasCopied, setHasCopied] = React.useState(false)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  // Reset copy state after 2 seconds
  React.useEffect(() => {
    if (hasCopied) {
      const timer = setTimeout(() => setHasCopied(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [hasCopied])

  // Simulate command execution with realistic delay
  const runCommand = React.useCallback(() => {
    if (!command.trim()) return

    setIsRunning(true)
    setOutput(null)

    // Track the event
    trackEvent({
      name: "copy_command",
      props: { command: command.trim() },
    })

    // Simulate execution delay (200-600ms)
    const delay = 200 + Math.random() * 400
    setTimeout(() => {
      setOutput(getCommandOutput(command))
      setIsRunning(false)
    }, delay)
  }, [command])

  // Copy command to clipboard
  const copyCommand = React.useCallback(() => {
    navigator.clipboard.writeText(command)
    setHasCopied(true)
    trackEvent({
      name: "copy_command",
      props: { command: command.trim() },
    })
  }, [command])

  // Reset to initial command
  const resetCommand = React.useCallback(() => {
    setCommand(initialCommand)
    setOutput(null)
    textareaRef.current?.focus()
  }, [initialCommand])

  // Handle keyboard shortcuts
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Cmd/Ctrl + Enter to run
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault()
        runCommand()
      }
    },
    [runCommand]
  )

  const hasChanges = command !== initialCommand

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="border-b pb-4">
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-md">
            <IconTerminal className="size-4" />
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="text-xs">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Command Input */}
        <div className="border-b">
          <div className="bg-muted/30 flex items-center justify-between border-b px-3 py-1.5">
            <span className="text-muted-foreground text-xs font-medium">
              Command
            </span>
            <div className="flex items-center gap-1">
              {hasChanges && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={resetCommand}
                    >
                      <IconRefresh className="size-3.5" />
                      <span className="sr-only">Reset</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reset to original</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={copyCommand}
                  >
                    {hasCopied ? (
                      <IconCheck className="size-3.5" />
                    ) : (
                      <IconCopy className="size-3.5" />
                    )}
                    <span className="sr-only">Copy</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {hasCopied ? "Copied!" : "Copy command"}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              readOnly={readOnly}
              className={cn(
                "min-h-[60px] resize-none rounded-none border-0 font-mono text-sm shadow-none focus-visible:ring-0",
                readOnly && "cursor-default"
              )}
              placeholder="Enter a command..."
            />
            <div className="text-muted-foreground absolute right-2 bottom-2 text-[10px]">
              {readOnly ? "Read-only" : "⌘↵ to run"}
            </div>
          </div>
        </div>

        {/* Run Button */}
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-muted-foreground text-xs">
            {output
              ? "Output"
              : isRunning
                ? "Executing..."
                : "Click Run to see output"}
          </span>
          <Button
            size="sm"
            onClick={runCommand}
            disabled={isRunning || !command.trim()}
            className="h-7 gap-1.5 px-2.5"
          >
            <IconPlayerPlay className="size-3.5" />
            {isRunning ? "Running..." : "Run"}
          </Button>
        </div>

        {/* Output Display */}
        <div
          className={cn(
            "bg-muted/20 max-h-[300px] min-h-[100px] overflow-auto p-4 font-mono text-xs",
            !output && !isRunning && "text-muted-foreground"
          )}
        >
          {isRunning ? (
            <div className="flex items-center gap-2">
              <div className="bg-primary size-2 animate-pulse rounded-full" />
              <span>Executing command...</span>
            </div>
          ) : output ? (
            <pre className="whitespace-pre-wrap">{output}</pre>
          ) : (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <IconTerminal className="text-muted-foreground/50 mb-2 size-8" />
              <p>No output yet</p>
              <p className="text-muted-foreground/70 mt-1 text-[10px]">
                Click &quot;Run&quot; or press ⌘↵ to execute
              </p>
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <div className="bg-muted/50 border-t px-3 py-2">
          <p className="text-muted-foreground text-[10px]">
            This is a simulated environment. Actual output may vary based on
            your project state.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Pre-configured playground examples for common use cases
 */
export const PlaygroundExamples = {
  setup: {
    command: "npx agileflow setup",
    title: "Quick Setup",
    description: "Install AgileFlow in your project",
  },
  status: {
    command: "/agileflow:status",
    title: "Project Status",
    description: "View your current project overview",
  },
  story: {
    command: "/agileflow:story US-0001",
    title: "Story Details",
    description: "View and work on a specific story",
  },
  epic: {
    command: "/agileflow:epic EP-0001",
    title: "Epic Progress",
    description: "Track epic completion and stories",
  },
  babysit: {
    command: "/agileflow:babysit",
    title: "Guided Workflow",
    description: "Start assisted development mode",
  },
  mentor: {
    command: "/agileflow:mentor",
    title: "Implementation Guide",
    description: "Get step-by-step guidance",
  },
} as const
